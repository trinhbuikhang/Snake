// Moonlit Garden Lullaby scheduler — look-ahead, capped, gentle.
// Renders composeLoop() notes into Web Audio voices on the M02 music bus.
// The scheduler owns one sub-bus at a fixed 0.25 gain (the "music ceiling"
// the plan caps) which feeds musicGain, so the user's volume slider still
// scales the whole garden.
//
// Rules the code keeps, with the test that pins each:
// - Look-ahead tick every 200ms, horizon 1.2s. Notes whose time has passed
//   are DROPPED, never scheduled in the past — the planPhrases clamp: after
//   a 30s tab sleep the garden resumes from now, it never bursts.
// - At most 10 oscillators sound at once; the 11th gently cuts the oldest
//   (a 50ms ramp to silence, then stop) instead of piling on.
// - start() after stop() restores the bus with the M01 pattern
//   (cancelScheduledValues -> setValueAtTime -> target): a stop fade's
//   ramp must never outlive the restart and stick the bus at 0.
// - stop(fadeS) fades the bus, then stops every voice and clears the
//   timer. With no context attached, start/stop only record intent.
// - M04 applyMusic(target) is the engine's only music path: 'off' fades
//   0.6s and stops the scheduler, an arrangement change crossfades
//   1.5s (the new loop starts immediately on its own play gain ramping
//   0 -> 1 while the old loop's play gain ramps 1 -> 0, then the old
//   generation disconnects — never a dip to silence), the same
//   arrangement is a no-op except a gain-only ceiling ramp, and
//   resuming the arrangement that just stopped re-enters at its next
//   bar (stop() records it; a different arrangement starts at bar 0).

import { composeLoop, LOOP_SECONDS, SEC_PER_BEAT, BEATS_PER_BAR } from './lullaby.js'

const TICK_MS = 200
const HORIZON_S = 1.2
const MAX_OSC = 10
const BUS_GAIN = 0.25
// M04 round-1 crossfade: both play gains ramp over the full 1.5s (old
// 1 -> 0, new 0 -> 1); a gain-only change ramps the ceiling over 0.75s.
const CROSS_FADE_S = 1.5
const CROSS_GAIN_S = 0.75
// Resuming into the same arrangement after a pause re-enters at the
// start of the NEXT bar, never mid-bar (M04 spec).
const BARS_IN_LOOP = 16
const SEC_PER_BAR = SEC_PER_BEAT * BEATS_PER_BAR
// Pad brightness by moon, as the old setAmbientPhase "air" was — but the
// M03 spec caps the pad lowpass at 900 Hz (a new moon is soft and dark,
// a full moon bright and open, never harsh).
const BRIGHTNESS = { new: 500, crescent: 600, half: 700, gibbous: 800, full: 900 }

const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12)

let ctx = null
let bus = null // the M02 musicGain this scheduler feeds
let schedBus = null // the ceiling bus: BUS_GAIN x arrangement gain -> musicGain
let padFilter = null
let playBus = null // per-generation gain: the current loop's voices ride this
let generation = 0
let retiring = [] // generations fading out: { gain, filter, gen, timer }
let timer = null
let running = false
let arrangement = 'play'
let seed = 1
let loopIndex = 0
let loopStart = 0
let notes = []
let nextIdx = 0
let pendingStart = null
let brightness = BRIGHTNESS.half
// M04: the last mode applyMusic() settled on ('off' while silent), the
// ceiling the bus is currently aimed at, and the resume point a stop()
// records — the bar AFTER the one sounding at stop time, for the same
// arrangement only.
let currentMode = 'off'
let currentCeiling = BUS_GAIN
let stoppedBar = null
let stoppedArr = null
let currentStartBar = 0
// AUDIT L5 gate: the scheduler must not create oscillators while the
// game is muted or music is off (the old planPhrases kept this rule).
// sound.js owns the flags and pushes them here from setMuted/setMusicOn;
// tick() skips gated passes, and the loop pointer jumps forward on
// re-enable, so no backed-up notes burst out.
let gateMuted = false
let gateMusicOn = true
let created = 0
const active = [] // { osc, gain, stopAt }

function attach(audioCtx, musicBus) {
  ctx = audioCtx
  bus = musicBus
  if (schedBus) {
    try {
      schedBus.disconnect()
    } catch {
      /* already disconnected */
    }
  }
  schedBus = ctx.createGain()
  schedBus.gain.value = BUS_GAIN
  schedBus.connect(bus)
  if (pendingStart) {
    const { arrangement: a, seed: s, gain: g } = pendingStart
    pendingStart = null
    start(a, s, g ?? 1)
  }
}

function setGate({ muted = gateMuted, musicOn = gateMusicOn } = {}) {
  gateMuted = muted
  gateMusicOn = musicOn
}

function setBrightness(phaseId) {
  brightness = BRIGHTNESS[phaseId] || BRIGHTNESS.half
  if (padFilter && ctx) {
    padFilter.frequency.setTargetAtTime(brightness, ctx.currentTime, 0.5)
  }
}

// One voice: an oscillator through its own gain envelope into the bus
// (pad voices through the shared brightness filter). Returns the entry
// so the cap can cut it.
function voice(note, at) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.frequency.setValueAtTime(midiToFreq(note.midi), at)
  const durS = note.dur * SEC_PER_BEAT
  let peak
  let stopAt
  if (note.voice === 'pad') {
    o.type = 'triangle'
    peak = 0.35 * note.vel
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + 0.4)
    g.gain.setValueAtTime(peak, at + Math.max(0.4, durS - 0.3))
    g.gain.linearRampToValueAtTime(0.0001, at + durS)
    stopAt = at + durS + 0.1
    o.connect(g)
    g.connect(padFilter)
  } else if (note.voice === 'box') {
    // Music box: one oscillator carrying a very light x3 harmonic via
    // a periodic wave (a second oscillator per box note would push the
    // creation rate toward the 160/min ceiling), with a ~1.2s tail
    // that outlasts the note's written duration.
    o.setPeriodicWave(ctx.createPeriodicWave([0, 1, 0, 0.15], [0, 0, 0, 0]))
    peak = 0.6 * note.vel
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2)
    stopAt = at + 1.3
    o.connect(g)
    g.connect(playBus || schedBus)
  } else {
    // Bass and sparkle stay plain sine with a duration-bound decay.
    peak = note.voice === 'bass' ? 0.5 * note.vel : 0.3 * note.vel
    const attack = note.voice === 'bass' ? 0.01 : 0.005
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + durS)
    stopAt = at + durS + 0.1
    o.connect(g)
    g.connect(playBus || schedBus)
  }
  o.start(at)
  o.stop(stopAt)
  created++
  const entry = { osc: o, gain: g, stopAt, gen: generation }
  active.push(entry)
  // Cap: the oldest voice is cut gently, never left to pile up.
  if (active.length > MAX_OSC) {
    const oldest = active.shift()
    const now = ctx.currentTime
    oldest.gain.gain.cancelScheduledValues(now)
    oldest.gain.gain.setValueAtTime(oldest.gain.gain.value, now)
    oldest.gain.gain.linearRampToValueAtTime(0.0001, now + 0.05)
    oldest.osc.stop(now + 0.1)
  }
  return entry
}

function tick() {
  if (!running || !ctx || !schedBus) return
  // Gated (muted or music off): schedule nothing. The loop pointer is
  // left behind on purpose — the advance below jumps it forward on the
  // first live pass after re-enable, so no backed-up notes burst out.
  if (gateMuted || !gateMusicOn) return
  // A suspended/interrupted context schedules nothing while its timer
  // keeps firing hidden (M01 guard, same as planPhrases).
  if (ctx.state !== undefined && ctx.state !== 'running') return
  const now = ctx.currentTime
  // Prune finished voices, then drop whole loops that ended in the past
  // (a slept tab jumps forward instead of bursting the backlog).
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].stopAt <= now) active.splice(i, 1)
  }
  while (loopStart + LOOP_SECONDS <= now) {
    loopStart += LOOP_SECONDS
    loopIndex++
    notes = composeLoop(seed + loopIndex, arrangement)
    nextIdx = 0
  }
  const horizon = now + HORIZON_S
  for (;;) {
    if (nextIdx >= notes.length) {
      // The rest of this loop is beyond the horizon — but if the next
      // loop already starts inside it, roll over and keep scheduling.
      if (loopStart + LOOP_SECONDS <= horizon) {
        loopStart += LOOP_SECONDS
        loopIndex++
        notes = composeLoop(seed + loopIndex, arrangement)
        nextIdx = 0
      } else break
    }
    const note = notes[nextIdx]
    const at = loopStart + note.t * SEC_PER_BEAT
    if (at < now) {
      nextIdx++ // overdue: dropped, never scheduled in the past
      continue
    }
    if (at > horizon) break
    voice(note, at)
    nextIdx++
  }
}

function start(nextArrangement, nextSeed = 1, nextGain = 1) {
  if (running && nextArrangement === arrangement) return
  if (running) stop(0) // a new arrangement restarts the loop cleanly
  begin(nextArrangement, nextSeed, 0, { playGainStart: 1, setCeiling: true, gain: nextGain, disconnectPrevious: true })
}

// Shared loop begin: creates the per-generation pad filter + play gain,
// restores the ceiling bus, and aligns the loop so its first sounding
// bar is startBar (0 for a fresh start, the resume bar after a pause).
//   playGainStart: 1 for a fresh start (full immediately), 0 when a
//     crossfade ramps this generation in.
//   setCeiling: fresh starts set the ceiling immediately (M01 pattern);
//     a crossfade leaves the ceiling to the crossfade's own 1.5s ramp.
//   disconnectPrevious: fresh starts disconnect the previous
//     generation's bus + filter at once — otherwise restoring the
//     ceiling would let the old loop burst at full gain until the
//     stop teardown lands (the <0.65s pause/resume click).
function begin(nextArrangement, nextSeed, startBar, { playGainStart, setCeiling, gain, disconnectPrevious }) {
  arrangement = nextArrangement
  seed = nextSeed
  stoppedBar = null
  stoppedArr = null
  if (!ctx || !bus) {
    pendingStart = { arrangement, seed, gain }
    return
  }
  if (disconnectPrevious) {
    if (playBus) {
      try {
        playBus.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    if (padFilter) {
      try {
        padFilter.disconnect()
      } catch {
        /* already disconnected */
      }
    }
  }
  // Fresh bus per generation: the pad filter feeds this generation's
  // play gain, which feeds the ceiling bus. A crossfade keeps the old
  // generation's pair alive under its own fading gain (see
  // crossfadeTo), so two loops never share one gain node.
  padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = brightness
  playBus = ctx.createGain()
  playBus.gain.value = playGainStart
  padFilter.connect(playBus)
  playBus.connect(schedBus)
  const now = ctx.currentTime
  currentCeiling = BUS_GAIN * gain
  if (setCeiling) {
    // M01 cancel -> set pattern so a stop fade cannot stick the bus at 0.
    schedBus.gain.cancelScheduledValues(now)
    schedBus.gain.setValueAtTime(currentCeiling, now)
  }
  loopIndex = 0
  loopStart = now + 0.1 - startBar * SEC_PER_BAR
  notes = composeLoop(seed, arrangement)
  nextIdx = 0
  while (nextIdx < notes.length && Math.floor(notes[nextIdx].t / BEATS_PER_BAR) < startBar) nextIdx++
  currentStartBar = startBar
  running = true
  if (timer) clearInterval(timer)
  timer = setInterval(tick, TICK_MS)
  tick()
}

// Disconnect one generation's pair + stop its still-live voices. Used
// by the crossfade teardown (old generation only) and by stop()'s
// delayed teardown via its captured snapshot — never by begin(), which
// must not touch a generation that restarted inside a fade.
function teardownGeneration(gainNode, filterNode, gen) {
  for (let i = active.length - 1; i >= 0; i--) {
    if (active[i].gen !== gen) continue
    const entry = active.splice(i, 1)[0]
    try {
      entry.osc.stop()
    } catch {
      /* already stopped */
    }
    try {
      entry.gain.disconnect()
    } catch {
      /* already disconnected */
    }
  }
  if (filterNode) {
    try {
      filterNode.disconnect()
    } catch {
      /* already disconnected */
    }
  }
  if (gainNode) {
    try {
      gainNode.disconnect()
    } catch {
      /* already disconnected */
    }
  }
}

function stop(fadeS = 0.6) {
  pendingStart = null
  if (!running) return
  running = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (!ctx || !schedBus) return
  const now = ctx.currentTime
  // Record the resume point: the bar AFTER the one sounding now, for
  // this arrangement only. A crossfade keeps running true throughout,
  // so this is always the current generation's bar.
  const bar = Math.max(0, Math.floor((now - loopStart) / SEC_PER_BAR))
  stoppedBar = (bar + 1) % BARS_IN_LOOP
  stoppedArr = arrangement
  // Fade the ceiling bus with the M01 pattern, then silence every
  // voice and disconnect every generation (current + retiring) the
  // stop captured. A loop that restarts inside the fade builds a fresh
  // generation, so the snapshot below can never touch it.
  schedBus.gain.cancelScheduledValues(now)
  schedBus.gain.setValueAtTime(schedBus.gain.value, now)
  schedBus.gain.linearRampToValueAtTime(0, now + fadeS)
  const live = active.splice(0, active.length)
  const filter = padFilter
  const play = playBus
  const oldGens = retiring.splice(0, retiring.length)
  for (const entry of oldGens) clearTimeout(entry.timer)
  setTimeout(() => {
    for (const entry of live) {
      try {
        entry.osc.stop()
      } catch {
        /* already stopped */
      }
      try {
        entry.gain.disconnect()
      } catch {
        /* already disconnected */
      }
    }
    if (filter) {
      try {
        filter.disconnect()
      } catch {
        /* already disconnected */
      }
      if (padFilter === filter) padFilter = null
    }
    if (play) {
      try {
        play.disconnect()
      } catch {
        /* already disconnected */
      }
      if (playBus === play) playBus = null
    }
    for (const entry of oldGens) teardownGeneration(entry.gain, entry.filter, entry.gen)
  }, fadeS * 1000 + 50)
}

// M04 round-1 review: a true crossfade, not fade-out -> silence ->
// fade-in. The new loop starts immediately on its own play gain,
// ramping 0 -> 1 over 1.5s, while the old loop's play gain ramps
// 1 -> 0 over the same 1.5s and then disconnects. The two gains sum to
// 1 throughout (the old one starts from its current value when a
// crossfade supersedes another), so the combined output never hits
// silence; the ceiling ramps to the new arrangement's level alongside.
// Already-sounding old voices bridge the new loop's first 0.1s.
function crossfadeTo(mode, ceiling) {
  const now = ctx.currentTime
  const oldGain = playBus
  const oldFilter = padFilter
  const oldGen = generation
  generation++
  begin(mode, 1, 0, { playGainStart: 0, setCeiling: false, gain: ceiling / BUS_GAIN, disconnectPrevious: false })
  const newGain = playBus
  newGain.gain.setValueAtTime(0, now)
  newGain.gain.linearRampToValueAtTime(1, now + CROSS_FADE_S)
  if (oldGain) {
    oldGain.gain.cancelScheduledValues(now)
    oldGain.gain.setValueAtTime(oldGain.gain.value, now)
    oldGain.gain.linearRampToValueAtTime(0, now + CROSS_FADE_S)
  }
  schedBus.gain.cancelScheduledValues(now)
  schedBus.gain.setValueAtTime(schedBus.gain.value, now)
  schedBus.gain.linearRampToValueAtTime(ceiling, now + CROSS_FADE_S)
  currentCeiling = ceiling
  const entry = { gain: oldGain, filter: oldFilter, gen: oldGen, timer: null }
  entry.timer = setTimeout(() => {
    const idx = retiring.indexOf(entry)
    if (idx >= 0) retiring.splice(idx, 1)
    teardownGeneration(entry.gain, entry.filter, entry.gen)
  }, CROSS_FADE_S * 1000)
  retiring.push(entry)
}

// M04: the engine's single music path. The target is musicTarget()'s
// { mode, gain } — off fades 0.6s and stops the scheduler, a new
// arrangement crossfades 1.5s, the same arrangement is a no-op except
// a gain-only change (which ramps the ceiling without restarting the
// loop), and resuming the arrangement that just stopped re-enters at
// its next bar.
function applyMusic(target) {
  const mode = target && target.mode ? target.mode : 'off'
  if (mode === 'off' || (mode !== 'menu' && mode !== 'play' && mode !== 'moonrise')) {
    if (running) stop(0.6)
    else pendingStart = null
    currentMode = 'off'
    return
  }
  const gain = target.gain ?? 1
  const ceiling = BUS_GAIN * gain
  if (!ctx || !bus) {
    pendingStart = { arrangement: mode, seed: 1, gain }
    currentMode = mode
    return
  }
  if (running && arrangement === mode) {
    // Gain-only change (menu 0.7 vs play 1.0 never coincides with a
    // mode change, but the API must not restart the loop for it):
    // ramp the ceiling, keep the loop and its voices untouched.
    if (ceiling !== currentCeiling) {
      const now = ctx.currentTime
      schedBus.gain.cancelScheduledValues(now)
      schedBus.gain.setValueAtTime(schedBus.gain.value, now)
      schedBus.gain.linearRampToValueAtTime(ceiling, now + CROSS_GAIN_S)
      currentCeiling = ceiling
    }
    currentMode = mode
    return
  }
  if (running) {
    crossfadeTo(mode, ceiling)
    currentMode = mode
    return
  }
  const resume = stoppedArr === mode ? stoppedBar : null
  begin(mode, 1, resume ?? 0, { playGainStart: 1, setCeiling: true, gain, disconnectPrevious: true })
  currentMode = mode
}

export const music = { attach, start, stop, setBrightness, setGate, tick, applyMusic }

export const __test__ = {
  tick,
  voice(note, at) {
    return voice(note, at)
  },
  reset() {
    if (timer) clearInterval(timer)
    timer = null
    for (const entry of retiring) clearTimeout(entry.timer)
    retiring = []
    running = false
    ctx = null
    bus = null
    schedBus = null
    padFilter = null
    playBus = null
    generation = 0
    pendingStart = null
    arrangement = 'play'
    seed = 1
    loopIndex = 0
    loopStart = 0
    notes = []
    nextIdx = 0
    brightness = BRIGHTNESS.half
    gateMuted = false
    gateMusicOn = true
    created = 0
    active.length = 0
    currentMode = 'off'
    currentCeiling = BUS_GAIN
    stoppedBar = null
    stoppedArr = null
    currentStartBar = 0
  },
  state: () => ({
    running,
    arrangement,
    mode: currentMode,
    ceiling: currentCeiling,
    retiring: retiring.length,
    startBar: currentStartBar,
    resumeBar: stoppedBar,
    timer: timer !== null,
    activeCount: active.length,
    created,
    gated: gateMuted || !gateMusicOn,
    schedBusGain: schedBus ? schedBus.gain.value : null,
    padFilterCutoff: padFilter ? padFilter.frequency.value : null,
  }),
}

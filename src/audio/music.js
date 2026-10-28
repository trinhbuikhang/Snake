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
//   1.5s (0.75s out, 0.75s in), the same arrangement is a no-op, and
//   resuming the arrangement that just stopped re-enters at its next
//   bar (stop() records it; a different arrangement starts at bar 0).

import { composeLoop, LOOP_SECONDS, SEC_PER_BEAT, BEATS_PER_BAR } from './lullaby.js'

const TICK_MS = 200
const HORIZON_S = 1.2
const MAX_OSC = 10
const BUS_GAIN = 0.25
// M04 crossfade: 0.75s out + 0.75s in = 1.5s total on arrangement change.
const CROSS_OUT_S = 0.75
const CROSS_IN_S = 0.75
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
let schedBus = null
let padFilter = null
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
// crossfade in flight, and the resume point a stop() records — the bar
// AFTER the one sounding at stop time, for the same arrangement only.
let currentMode = 'off'
let crossTimer = null
let crossfading = false
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
    const { arrangement: a, seed: s } = pendingStart
    pendingStart = null
    start(a, s)
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
    g.connect(schedBus)
  } else {
    // Bass and sparkle stay plain sine with a duration-bound decay.
    peak = note.voice === 'bass' ? 0.5 * note.vel : 0.3 * note.vel
    const attack = note.voice === 'bass' ? 0.01 : 0.005
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + durS)
    stopAt = at + durS + 0.1
    o.connect(g)
    g.connect(schedBus)
  }
  o.start(at)
  o.stop(stopAt)
  created++
  const entry = { osc: o, gain: g, stopAt }
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

function start(nextArrangement, nextSeed = 1) {
  if (running && nextArrangement === arrangement) return
  if (running) stop(0) // a new arrangement restarts the loop cleanly
  if (crossTimer) {
    // A direct start() supersedes a crossfade in flight: drop it and
    // clear the old voices now, so begin() never layers over them.
    clearTimeout(crossTimer)
    crossTimer = null
    crossfading = false
    teardownVoicesAndFilter()
  }
  begin(nextArrangement, nextSeed, 0, 0)
}

// Shared loop begin: creates the per-start pad filter, restores the
// ceiling bus with the M01 cancel -> set pattern (or a fade-in when
// arriving from a crossfade), and aligns the loop so its first sounding
// bar is startBar (0 for a fresh start, the resume bar after a pause).
function begin(nextArrangement, nextSeed, startBar, fadeInS) {
  arrangement = nextArrangement
  seed = nextSeed
  stoppedBar = null
  stoppedArr = null
  if (!ctx || !bus) {
    pendingStart = { arrangement, seed }
    return
  }
  // Fresh bus: the pad filter per start, connected once to the ceiling
  // bus (connecting it per pad voice would sum the filter output once
  // per voice).
  padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = brightness
  padFilter.connect(schedBus)
  const now = ctx.currentTime
  schedBus.gain.cancelScheduledValues(now)
  if (fadeInS > 0) {
    schedBus.gain.setValueAtTime(0, now)
    schedBus.gain.linearRampToValueAtTime(BUS_GAIN, now + fadeInS)
  } else {
    schedBus.gain.setValueAtTime(BUS_GAIN, now)
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

// Immediate teardown for crossfade switches and superseded crossfades:
// every live voice stops and disconnects, the per-start filter goes.
// stop()'s delayed teardown stays separate — it must only release the
// generation it captured, never a loop that restarted inside the fade.
function teardownVoicesAndFilter() {
  const live = active.splice(0, active.length)
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
  if (padFilter) {
    try {
      padFilter.disconnect()
    } catch {
      /* already disconnected */
    }
    padFilter = null
  }
}

function stop(fadeS = 0.6) {
  pendingStart = null
  if (crossTimer) {
    clearTimeout(crossTimer)
    crossTimer = null
  }
  const wasCrossfading = crossfading
  crossfading = false
  if (!running && !wasCrossfading) return
  const wasRunning = running
  running = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (!ctx || !schedBus) return
  const now = ctx.currentTime
  if (wasRunning) {
    // Record the resume point: the bar AFTER the one sounding now, for
    // this arrangement only. A stop mid-crossfade records nothing — a
    // loop that never finished fading in has no bar to resume at.
    const bar = Math.max(0, Math.floor((now - loopStart) / SEC_PER_BAR))
    stoppedBar = (bar + 1) % BARS_IN_LOOP
    stoppedArr = arrangement
  } else {
    stoppedBar = null
    stoppedArr = null
  }
  // Fade the bus with the M01 pattern, then silence every voice and
  // disconnect the per-start pad filter (round-1 review: every start()
  // built a filter that stop() never released).
  schedBus.gain.cancelScheduledValues(now)
  schedBus.gain.setValueAtTime(schedBus.gain.value, now)
  schedBus.gain.linearRampToValueAtTime(0, now + fadeS)
  const live = active.splice(0, active.length)
  const filter = padFilter
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
  }, fadeS * 1000 + 50)
}

// M04 crossfade: the bus dips to silence over 0.75s while the old loop
// rings out, then the new loop begins and fades back in over 0.75s —
// 1.5s total, no step, no overlap of two loops on one bus.
function crossfadeTo(mode) {
  const now = ctx.currentTime
  schedBus.gain.cancelScheduledValues(now)
  schedBus.gain.setValueAtTime(schedBus.gain.value, now)
  schedBus.gain.linearRampToValueAtTime(0, now + CROSS_OUT_S)
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  running = false
  crossfading = true
  crossTimer = setTimeout(() => {
    crossTimer = null
    crossfading = false
    teardownVoicesAndFilter()
    begin(mode, 1, 0, CROSS_IN_S)
    currentMode = mode
  }, CROSS_OUT_S * 1000)
}

// M04: the engine's single music path. The target is musicTarget()'s
// { mode, gain } — off fades 0.6s and stops the scheduler, a new
// arrangement crossfades 1.5s, the same arrangement is a no-op (the
// loop must never restart on an unrelated store change), and resuming
// the arrangement that just stopped re-enters at its next bar.
function applyMusic(target) {
  const mode = target && target.mode ? target.mode : 'off'
  if (mode === 'off') {
    if (running || crossfading) stop(0.6)
    else pendingStart = null
    currentMode = 'off'
    return
  }
  if (mode !== 'menu' && mode !== 'play' && mode !== 'moonrise') {
    if (running || crossfading) stop(0.6)
    else pendingStart = null
    currentMode = 'off'
    return
  }
  if (!ctx || !bus) {
    pendingStart = { arrangement: mode, seed: 1 }
    currentMode = mode
    return
  }
  if (crossTimer) {
    // Superseded crossfade: drop it, clear the old voices, and start
    // the newly requested mode with a short fade-in so the bus never
    // steps from a half-faded value straight to full.
    clearTimeout(crossTimer)
    crossTimer = null
    crossfading = false
    teardownVoicesAndFilter()
    begin(mode, 1, 0, 0.3)
    currentMode = mode
    return
  }
  if (running && arrangement === mode) {
    currentMode = mode
    return
  }
  if (running) {
    crossfadeTo(mode)
    currentMode = mode
    return
  }
  const resume = stoppedArr === mode ? stoppedBar : null
  begin(mode, 1, resume ?? 0, 0)
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
    if (crossTimer) clearTimeout(crossTimer)
    crossTimer = null
    crossfading = false
    running = false
    ctx = null
    bus = null
    schedBus = null
    padFilter = null
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
    stoppedBar = null
    stoppedArr = null
    currentStartBar = 0
  },
  state: () => ({
    running,
    arrangement,
    mode: currentMode,
    crossfading,
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

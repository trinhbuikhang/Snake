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

import { composeLoop, LOOP_SECONDS, SEC_PER_BEAT } from './lullaby.js'

const TICK_MS = 200
const HORIZON_S = 1.2
const MAX_OSC = 10
const BUS_GAIN = 0.25
// Pad brightness by moon, as the old setAmbientPhase "air" was: a new
// moon is soft and dark, a full moon bright and open.
const BRIGHTNESS = { new: 1200, crescent: 1800, half: 2400, gibbous: 3200, full: 4200 }

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
    peak = 0.35 * note.vel
    g.gain.setValueAtTime(0.0001, at)
    g.gain.linearRampToValueAtTime(peak, at + 0.3)
    g.gain.setValueAtTime(peak, at + Math.max(0.3, durS - 0.3))
    g.gain.linearRampToValueAtTime(0.0001, at + durS)
    stopAt = at + durS + 0.1
    o.connect(g)
    g.connect(padFilter)
  } else {
    peak = note.voice === 'box' ? 0.6 * note.vel : note.voice === 'bass' ? 0.5 * note.vel : 0.3 * note.vel
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
  arrangement = nextArrangement
  seed = nextSeed
  if (!ctx || !bus) {
    pendingStart = { arrangement, seed }
    return
  }
  // Fresh bus: the pad filter per start, connected once to the ceiling
  // bus (connecting it per pad voice would sum the filter output once
  // per voice). The ceiling is restored with the M01 cancel -> set
  // pattern so a stop fade cannot stick it at 0.
  padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = brightness
  padFilter.connect(schedBus)
  schedBus.gain.cancelScheduledValues(ctx.currentTime)
  schedBus.gain.setValueAtTime(BUS_GAIN, ctx.currentTime)
  loopIndex = 0
  loopStart = ctx.currentTime + 0.1
  notes = composeLoop(seed, arrangement)
  nextIdx = 0
  running = true
  if (timer) clearInterval(timer)
  timer = setInterval(tick, TICK_MS)
  tick()
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
  // Fade the bus with the M01 pattern, then silence every voice.
  schedBus.gain.cancelScheduledValues(now)
  schedBus.gain.setValueAtTime(schedBus.gain.value, now)
  schedBus.gain.linearRampToValueAtTime(0, now + fadeS)
  const live = active.splice(0, active.length)
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
  }, fadeS * 1000 + 50)
}

export const music = { attach, start, stop, setBrightness, tick }

export const __test__ = {
  tick,
  voice(note, at) {
    return voice(note, at)
  },
  reset() {
    if (timer) clearInterval(timer)
    timer = null
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
    created = 0
    active.length = 0
  },
  state: () => ({
    running,
    arrangement,
    timer: timer !== null,
    activeCount: active.length,
    created,
    schedBusGain: schedBus ? schedBus.gain.value : null,
    padFilterCutoff: padFilter ? padFilter.frequency.value : null,
  }),
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __test__, unlockAudio, setMuted, setPadOn, setWaterOn, setAmbientOn } from './sound.js'

// Minimal mock AudioContext: records every oscillator start time so a
// test can see exactly what one planning pass scheduled. Gain/filter
// nodes are inert stubs — the scheduler only connects through them.
function fakeAudioContext(now) {
  const starts = []
  return {
    currentTime: now,
    starts,
    createOscillator() {
      return {
        type: '',
        frequency: { value: 0 },
        connect() {},
        start(at) {
          starts.push(at)
        },
        stop() {},
      }
    },
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
          setTargetAtTime() {},
        },
        connect() {},
        disconnect() {},
      }
    },
    createBiquadFilter() {
      return {
        type: '',
        frequency: { value: 0, setTargetAtTime() {} },
        connect() {},
        disconnect() {},
      }
    },
  }
}

describe('ambient phrase scheduler (planPhrases)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('drops overdue phrases after a long tab-hidden gap instead of bursting', () => {
    // Deterministic randomness: every phrase plays, 2 notes per phrase.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const now = 1000
    const fake = fakeAudioContext(now)
    // A throttled background tab: the next phrase fell due 60s ago while
    // the audio clock kept running.
    __test__.mockAmbient(fake, { nextAt: now - 60 })
    __test__.planPhrases()
    // Only what fits the 2s horizon may be scheduled: one phrase
    // (2 notes x 2 oscillators = 4 starts) — not the ~14 overdue phrases
    // the unclamped loop would have dumped into the past.
    expect(fake.starts.length).toBeLessThanOrEqual(8)
    // Nothing sounds in the past; the schedule resumes from now.
    expect(Math.min(...fake.starts)).toBeGreaterThanOrEqual(now + 0.1 - 1e-9)
    expect(__test__.nextPhraseAt()).toBeGreaterThan(now)
  })

  it('plans at most one phrase per pass in normal operation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const now = 500
    const fake = fakeAudioContext(now)
    __test__.mockAmbient(fake, { nextAt: now + 0.5 })
    __test__.planPhrases()
    expect(fake.starts.length).toBe(4) // one phrase, two notes, two oscillators each
    expect(__test__.nextPhraseAt()).toBeGreaterThan(now + 2.0) // pushed past the horizon
  })

  it('does nothing while the ambient score is off', () => {
    const fake = fakeAudioContext(100)
    __test__.mockAmbient(fake, { on: false, nextAt: 0 })
    __test__.planPhrases()
    expect(fake.starts).toEqual([])
  })
})

// ---- T10d: voice toggle edge cases (AUDIT L5) ----------------------------

class MockParam {
  constructor(value = 0) {
    this.value = value
    this.targets = []
  }
  setValueAtTime(v) {
    this.value = v
  }
  linearRampToValueAtTime(v) {
    this.value = v
  }
  exponentialRampToValueAtTime(v) {
    this.value = v
  }
  setTargetAtTime(v) {
    this.targets.push(v)
    this.value = v
  }
}

// A fuller mock AudioContext than the scheduler's above: every created
// node is recorded and remembers whether it was stopped/disconnected, so
// a test can prove exactly which generation a teardown disposed of.
function trackedCtx(now = 0) {
  const created = { oscillators: [], gains: [], filters: [], sources: [] }
  const node = (extra) =>
    Object.assign(
      {
        disconnected: false,
        stopped: false,
        connect() {},
        disconnect() {
          this.disconnected = true
        },
        start() {},
        stop() {
          this.stopped = true
        },
      },
      extra,
    )
  return {
    currentTime: now,
    sampleRate: 44100,
    state: 'running',
    destination: {},
    created,
    resume: () => Promise.resolve(),
    createGain() {
      const n = node({ gain: new MockParam(0) })
      created.gains.push(n)
      return n
    },
    createOscillator() {
      const n = node({ type: '', frequency: new MockParam(0) })
      created.oscillators.push(n)
      return n
    },
    createBiquadFilter() {
      const n = node({ type: '', frequency: new MockParam(0), Q: new MockParam(0.5) })
      created.filters.push(n)
      return n
    },
    createBufferSource() {
      const n = node({ buffer: null, loop: false, playbackRate: new MockParam(1) })
      created.sources.push(n)
      return n
    },
    createDynamicsCompressor() {
      return node({ threshold: new MockParam(0), ratio: new MockParam(0) })
    },
    createBuffer: (channels, len) => ({ getChannelData: () => new Float32Array(len) }),
  }
}

describe('voice toggles (AUDIT L5)', () => {
  // Boot the module the way the browser does: a window with an
  // AudioContext appears, then unlockAudio() creates the real context.
  function boot(now = 0) {
    const fake = trackedCtx(now)
    globalThis.window = {
      AudioContext: function () {
        return fake
      },
    }
    unlockAudio()
    return fake
  }

  beforeEach(() => {
    vi.useFakeTimers()
    __test__.reset()
  })

  afterEach(() => {
    delete globalThis.window
    __test__.reset()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('rapid ambient on/off/on disconnects the first voice and keeps the second live', () => {
    const fake = boot(0)
    setAmbientOn(true)
    const gen1Gain = fake.created.gains[1] // gains[0] is the master bus
    const gen1Filter = fake.created.filters[0]
    setAmbientOn(false)
    setAmbientOn(true) // 0ms later — deep inside the 1600ms teardown window
    const gen2Gain = fake.created.gains[2]
    const gen2Filter = fake.created.filters[1]
    expect(gen2Gain).toBeDefined()
    vi.advanceTimersByTime(2000)
    // The first generation was torn down even though the voice is on
    // again — the old teardown checked the flag, saw "on", and leaked
    // both nodes into the graph instead.
    expect(gen1Gain.disconnected).toBe(true)
    expect(gen1Filter.disconnected).toBe(true)
    // The live second generation is untouched and still the module's voice.
    expect(gen2Gain.disconnected).toBe(false)
    expect(gen2Filter.disconnected).toBe(false)
    expect(__test__.state().ambientGain).toBe(gen2Gain)
    expect(__test__.state().ambientTimer).not.toBe(null)
  })

  it('rapid pad on/off/on builds a fresh voice instead of wedging the fading one silent', () => {
    const fake = boot(0)
    setPadOn(true)
    const gen1Oscs = fake.created.oscillators.slice()
    const gen1Src = fake.created.sources[0]
    expect(gen1Oscs.length).toBe(4) // o1, o2, o3 + the LFO
    setPadOn(false)
    setPadOn(true) // inside the 1200ms teardown window
    // A whole fresh voice was built — the old code created nothing here
    // (the fading pad object was still referenced) and left the pad
    // flagged on but silent until a later slow off/on cycle.
    expect(fake.created.oscillators.length).toBe(8)
    const gen2Oscs = fake.created.oscillators.slice(4)
    vi.advanceTimersByTime(1300)
    expect(gen1Oscs.every((o) => o.stopped)).toBe(true)
    expect(gen1Src.stopped).toBe(true) // the pad's noise loop stops too
    expect(gen2Oscs.every((o) => !o.stopped)).toBe(true)
    expect(__test__.state().pad).not.toBe(null)
  })

  it('rapid water on/off/on restarts the voice instead of reviving the fading one', () => {
    const fake = boot(0)
    setWaterOn(true)
    const gen1Gain = fake.created.gains[1] // [0] master, [1] water gain
    const gen1Src = fake.created.sources[0]
    setWaterOn(false)
    setWaterOn(true) // inside the 1500ms teardown window
    expect(fake.created.sources.length).toBe(2) // a fresh source was built
    vi.advanceTimersByTime(1600)
    expect(gen1Src.stopped).toBe(true)
    expect(gen1Gain.disconnected).toBe(true)
    expect(fake.created.sources[1].stopped).toBe(false)
    expect(__test__.state().waterNodes).not.toBe(null)
  })

  it('setAmbientOn(true) before the context exists starts the voice once audio unlocks', () => {
    delete globalThis.window // no AudioContext anywhere yet
    setAmbientOn(true)
    // Intent recorded, nothing started — and not wedged: the flag alone
    // used to make every later setAmbientOn(true) a no-op.
    expect(__test__.state().ambientOn).toBe(true)
    expect(__test__.state().ambientTimer).toBe(null)
    const fake = boot(5)
    expect(__test__.state().ambientTimer).not.toBe(null)
    expect(fake.created.filters.length).toBe(1)
    expect(__test__.state().ambientGain).toBe(fake.created.gains[1])
  })

  it('enabling voices while muted creates no oscillators; they start on unmute', () => {
    const fake = boot(0)
    setMuted(true)
    setPadOn(true)
    setWaterOn(true)
    setAmbientOn(true)
    expect(fake.created.oscillators.length).toBe(0)
    expect(fake.created.sources.length).toBe(0)
    expect(__test__.state().padOn).toBe(true) // intent recorded for all three
    setMuted(false)
    // Pad (3 oscs + LFO) and water (LFO) start now; ambient runs its timer.
    expect(fake.created.oscillators.length).toBe(5)
    expect(fake.created.sources.length).toBe(2)
    expect(__test__.state().ambientTimer).not.toBe(null)
  })

  it('schedules no phrases while muted, then resumes without a burst on unmute', () => {
    // Deterministic phrases: every pass plays, one note (2 oscillators).
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fake = boot(0)
    setAmbientOn(true)
    setMuted(true)
    // ~14s of scheduler ticks, the audio clock tracking real time. The
    // pre-fix scheduler kept building a phrase's oscillators every
    // ~2.5s here even though the master bus was silent (AUDIT L5).
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(700)
      fake.currentTime += 0.7
    }
    expect(fake.created.oscillators.length).toBe(0)
    setMuted(false)
    const before = fake.created.oscillators.length
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(700)
      fake.currentTime += 0.7
    }
    const resumed = fake.created.oscillators.length - before
    expect(resumed).toBeGreaterThan(0) // singing again…
    expect(resumed).toBeLessThanOrEqual(4) // …not a burst of backed-up phrases
  })

  it('turning a voice off while muted still tears it down', () => {
    const fake = boot(0)
    setPadOn(true)
    const oscs = fake.created.oscillators.slice()
    setMuted(true)
    setPadOn(false)
    vi.advanceTimersByTime(1300)
    expect(oscs.every((o) => o.stopped)).toBe(true)
    expect(__test__.state().pad).toBe(null)
  })
})

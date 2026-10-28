import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __test__, unlockAudio, fadeOutAudio, suspendAudio, restoreAudio, setMuted, setMusicOn, setMusicVolume, setWaterOn, duckMusic, playEat, playBloom, playVerse, playDeath, playTurn } from './sound.js'

// ---- T10d: voice toggle edge cases (AUDIT L5) ----------------------------

class MockParam {
  constructor(value = 0) {
    this.value = value
    this.targets = []
    this.ramps = []
    this.cancelled = false
    // Round-2 regression: the order automation methods run in. A plain
    // mock cannot model the AudioParam timeline, but the bug was
    // exactly an ordering bug (setTarget inserted before an existing
    // ramp), so pinning the call order pins the fix.
    this.calls = []
  }
  setValueAtTime(v) {
    this.value = v
    this.calls.push('set')
  }
  linearRampToValueAtTime(v, t) {
    this.value = v
    this.ramps.push([v, t])
    this.calls.push('ramp')
  }
  exponentialRampToValueAtTime(v) {
    this.value = v
    this.calls.push('expramp')
  }
  setTargetAtTime(v) {
    this.targets.push(v)
    this.value = v
    this.calls.push('target')
  }
  cancelScheduledValues() {
    this.cancelled = true
    this.calls.push('cancel')
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
        connectedTo: null,
        connect(target) {
          this.connectedTo = target
        },
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
    suspend: () => Promise.resolve(),
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

  it('rapid water on/off/on restarts the voice instead of reviving the fading one', () => {
    const fake = boot(0)
    setWaterOn(true)
    const gen1Gain = fake.created.gains[3] // [0] master, [1] music bus, [2] scheduler bus, [3] water gain
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

  it('enabling the water voice while muted creates no droplets; it starts on unmute', () => {
    const fake = boot(0)
    setMuted(true)
    setWaterOn(true)
    expect(fake.created.oscillators.length).toBe(0)
    expect(fake.created.sources.length).toBe(0)
    expect(__test__.state().waterOn).toBe(true) // intent recorded
    setMuted(false)
    // The water voice itself starts now: one swell LFO oscillator.
    expect(fake.created.oscillators.length).toBe(1)
    expect(fake.created.sources.length).toBe(1)
    expect(__test__.state().waterNodes).not.toBe(null)
  })

  it('water droplets stop while muted, then resume on unmute', () => {
    // Pinned randomness: every droplet tick fires (0.5 < 0.75).
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fake = boot(0)
    setWaterOn(true)
    setMuted(true)
    // ~13s of droplet ticks (2.6s each), the audio clock tracking real
    // time. Pre-fix, every tick built a droplet's oscillator even though
    // the master bus was silent (Codex P2 on the T10d review: 5 new
    // oscillators over ~14s).
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(2600)
      fake.currentTime += 2.6
    }
    // The water voice itself is one LFO oscillator; no droplets were built.
    expect(fake.created.oscillators.length).toBe(1)
    setMuted(false)
    vi.advanceTimersByTime(2600)
    fake.currentTime += 2.6
    vi.advanceTimersByTime(2600)
    fake.currentTime += 2.6
    expect(fake.created.oscillators.length).toBe(3) // LFO + 2 droplets
  })
})

// ---- M01: unlock lifecycle (no context before gesture, interrupted,
// hide fade + suspend, scheduler skip while suspended) ------------------
describe('M01 unlock lifecycle (sound.js)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __test__.reset()
  })

  afterEach(() => {
    setWaterOn(false)
    delete globalThis.window
    __test__.reset()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates no AudioContext before the first unlock; unlock creates exactly one', () => {
    const AC = vi.fn(function () {
      return trackedCtx(0)
    })
    globalThis.window = { AudioContext: AC }
    // Intent recorded, no context: the voice must not exist yet.
    setWaterOn(true)
    expect(AC).not.toHaveBeenCalled()
    unlockAudio()
    expect(AC).toHaveBeenCalledTimes(1)
    unlockAudio()
    expect(AC).toHaveBeenCalledTimes(1)
  })

  it("resume() is called for 'interrupted' and 'suspended', not for 'running'", () => {
    for (const state of ['interrupted', 'suspended']) {
      __test__.reset()
      const fake = trackedCtx(0)
      fake.state = state
      fake.resume = vi.fn(() => Promise.resolve())
      __test__.mockCtx(fake)
      unlockAudio()
      expect(fake.resume).toHaveBeenCalledTimes(1)
    }
    __test__.reset()
    const fake = trackedCtx(0)
    fake.state = 'running'
    fake.resume = vi.fn(() => Promise.resolve())
    __test__.mockCtx(fake)
    unlockAudio()
    expect(fake.resume).not.toHaveBeenCalled()
  })

  it('fadeOut ramps the master bus to 0 over 0.2s; suspend fires after the fade', () => {
    const fake = trackedCtx(10)
    fake.suspend = vi.fn(() => Promise.resolve())
    __test__.mockCtx(fake)
    const masterGain = fake.created.gains[0].gain
    fadeOutAudio()
    expect(masterGain.cancelled).toBe(true)
    expect(masterGain.ramps).toEqual([[0, 10.2]])
    suspendAudio()
    expect(fake.suspend).not.toHaveBeenCalled()
    vi.advanceTimersByTime(249)
    expect(fake.suspend).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fake.suspend).toHaveBeenCalledTimes(1)
    // A second suspend while one is still pending schedules nothing new.
    suspendAudio()
    suspendAudio()
    vi.advanceTimersByTime(1000)
    expect(fake.suspend).toHaveBeenCalledTimes(2)
  })

  it('a gesture during the fade cancels the pending suspend', () => {
    const fake = trackedCtx(0)
    fake.suspend = vi.fn(() => Promise.resolve())
    __test__.mockCtx(fake)
    fadeOutAudio()
    suspendAudio()
    unlockAudio() // the returning gesture wins over the pending suspend
    vi.advanceTimersByTime(500)
    expect(fake.suspend).not.toHaveBeenCalled()
  })

  it('restoreAudio restores the bus gain without creating a context', () => {
    // No context at all: a no-op, never a creation.
    expect(() => restoreAudio()).not.toThrow()
    const fake = trackedCtx(5)
    __test__.mockCtx(fake)
    const masterGain = fake.created.gains[0].gain
    fadeOutAudio()
    expect(masterGain.ramps).toEqual([[0, 5.2]])
    restoreAudio()
    expect(masterGain.targets).toContain(1)
  })

  it('restoreAudio cancels scheduled automation before restoring (round-2 regression)', () => {
    const fake = trackedCtx(5)
    __test__.mockCtx(fake)
    const masterGain = fake.created.gains[0].gain
    fadeOutAudio() // schedules cancel, set, ramp-to-0
    restoreAudio() // must cancel that ramp BEFORE setting the target,
    // or the ramp wins at its end time and the bus sticks at 0.
    expect(masterGain.calls).toEqual(['cancel', 'set', 'ramp', 'cancel', 'set', 'target'])
  })

  it('unlockAudio during a fade cancels the ramp before restoring', () => {
    const fake = trackedCtx(5) // running: no resume, just the gain path
    __test__.mockCtx(fake)
    const masterGain = fake.created.gains[0].gain
    fadeOutAudio()
    unlockAudio() // a gesture landing mid-fade hit the same bug
    expect(masterGain.calls).toEqual(['cancel', 'set', 'ramp', 'cancel', 'set', 'target'])
  })

  it('water droplets are skipped while suspended, resume when running', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const fake = trackedCtx(0)
    fake.state = 'suspended'
    __test__.mockCtx(fake)
    setWaterOn(true)
    const lfoCount = fake.created.oscillators.length // the swell LFO only
    expect(lfoCount).toBe(1)
    vi.advanceTimersByTime(2600 * 3)
    expect(fake.created.oscillators.length).toBe(lfoCount)
    fake.state = 'running'
    vi.advanceTimersByTime(2600)
    expect(fake.created.oscillators.length).toBeGreaterThan(lfoCount)
  })
})

// ---- M02: music bus (musicGain child of master) -----------------------
describe('M02 music bus (sound.js)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __test__.reset()
  })

  afterEach(() => {
    setWaterOn(false)
    __test__.reset()
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('musicGain gets the volume when on, 0 when off', () => {
    const fake = trackedCtx(0)
    __test__.mockCtx(fake)
    const bus = __test__.state().musicGain
    expect(bus).toBe(fake.created.gains[1]) // [0] master, [1] music bus
    expect(bus.gain.value).toBe(0.6) // default volume, music on
    setMusicVolume(0.8)
    expect(bus.gain.targets).toContain(0.8)
    setMusicOn(false)
    expect(bus.gain.targets).toContain(0)
    setMusicOn(true)
    expect(bus.gain.targets).toContain(0.8)
  })

  it('volume changes create no new nodes', () => {
    const fake = trackedCtx(0)
    __test__.mockCtx(fake)
    const before = fake.created.gains.length
    for (let i = 0; i < 10; i++) setMusicVolume(i / 10)
    expect(fake.created.gains.length).toBe(before)
  })

  it('water routes through the music bus, not master (pad/ambient now live in music.js)', () => {
    const fake = trackedCtx(0)
    __test__.mockCtx(fake)
    const bus = __test__.state().musicGain
    setWaterOn(true)
    const waterGain = fake.created.gains.find((g) => g !== bus && g.connectedTo === bus)
    expect(waterGain).toBeDefined()
  })
})

// ---- M04: SFX ducking -------------------------------------------------------
describe('ducking (M04)', () => {
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

  // [0] master, [1] music bus, [2] scheduler bus, [3] water gain.
  const musicParam = (fake) => fake.created.gains[1].gain

  it('duckMusic dips the music bus exactly -6 dB and returns within 0.6s', () => {
    const fake = boot(10)
    duckMusic()
    const p = musicParam(fake)
    expect(p.calls[0]).toBe('cancel') // cancel first, then set, then ramp
    expect(p.ramps).toContainEqual([0.3, 10.02]) // 0.6 * 0.5, 20ms attack
    expect(p.ramps).toContainEqual([0.6, 10.57]) // hold 0.15s + release 0.4s
  })

  it('three ducks in 100ms never dip below -6 dB and return after the last one', () => {
    const fake = boot(10)
    duckMusic()
    fake.currentTime = 10.05
    duckMusic()
    fake.currentTime = 10.09
    duckMusic()
    const ramps = musicParam(fake).ramps
    expect(Math.min(...ramps.map(([v]) => v))).toBeGreaterThanOrEqual(0.3)
    const lastReturn = ramps[ramps.length - 1]
    expect(lastReturn).toEqual([0.6, 10.66]) // 0.57s after the last duck
    expect(lastReturn[1] - 10.09).toBeLessThanOrEqual(0.6)
  })

  it('eat/bloom/verse/death duck the music bus; turn does not', () => {
    const fake = boot(10)
    const p = musicParam(fake)
    playEat()
    expect(p.ramps).toContainEqual([0.3, 10.02])
    playBloom()
    playVerse()
    playDeath()
    expect(p.ramps.filter(([v]) => v === 0.3).length).toBe(4)
    const before = p.calls.length
    playTurn()
    expect(p.calls.length).toBe(before) // turn swish rides the master bus untouched
  })

  it('ducking while music is off stays at 0', () => {
    const fake = boot(10)
    setMusicOn(false)
    duckMusic()
    expect(musicParam(fake).ramps).toEqual([
      [0, 10.02],
      [0, 10.57],
    ])
  })

  it('duckMusic with no context is a no-op', () => {
    expect(() => duckMusic()).not.toThrow()
  })
})

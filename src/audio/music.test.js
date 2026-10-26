import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { music, __test__ } from './music.js'
import { LOOP_SECONDS } from './lullaby.js'

// Minimal mock AudioContext: a manual clock, recording nodes.
class MockParam {
  constructor(value = 0) {
    this.value = value
    this.targets = []
    this.ramps = []
    this.cancelled = false
  }
  setValueAtTime(v) {
    this.value = v
  }
  linearRampToValueAtTime(v, t) {
    this.ramps.push({ v, t })
    this.value = v
  }
  exponentialRampToValueAtTime(v, t) {
    this.ramps.push({ v, t })
    this.value = v
  }
  setTargetAtTime(v) {
    this.targets.push(v)
    this.value = v
  }
  cancelScheduledValues() {
    this.cancelled = true
  }
}

class MockNode {
  constructor() {
    this.connectedTo = []
    this.disconnected = false
    this.startedAt = null
    this.stoppedAt = null
    this.type = ''
    this.periodicWave = null
  }
  connect(target) {
    this.connectedTo.push(target)
  }
  disconnect() {
    this.disconnected = true
  }
  start(at) {
    this.startedAt = at
  }
  stop(at) {
    this.stoppedAt = at
  }
  setPeriodicWave(wave) {
    this.periodicWave = wave
  }
}

class MockCtx {
  constructor() {
    this.currentTime = 0
    this.state = 'running'
    this.oscillators = []
    this.gains = []
    this.filters = []
  }
  createOscillator() {
    const o = new MockNode()
    o.frequency = new MockParam(440)
    o.type = 'sine'
    this.oscillators.push(o)
    return o
  }
  createGain() {
    const g = new MockNode()
    g.gain = new MockParam(0)
    this.gains.push(g)
    return g
  }
  createBiquadFilter() {
    const f = new MockNode()
    f.frequency = new MockParam(2400)
    this.filters.push(f)
    return f
  }
  createPeriodicWave(real, imag) {
    return { real, imag }
  }
}

function setup() {
  const fake = new MockCtx()
  const bus = fake.createGain()
  music.attach(fake, bus)
  return { fake, bus }
}

describe('music scheduler (M03)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    __test__.reset()
  })

  afterEach(() => {
    music.stop(0)
    __test__.reset()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('caps the scheduler bus at 0.25 and feeds it into musicGain', () => {
    const { fake, bus } = setup()
    const schedBus = fake.gains.find((g) => g !== bus)
    expect(schedBus.gain.value).toBe(0.25)
    expect(schedBus.connectedTo).toContain(bus)
    expect(__test__.state().schedBusGain).toBe(0.25)
  })

  it('10 simulated minutes: <= 10 concurrent oscillators, <= 160 created/min, no past scheduling after a 30s sleep', () => {
    const { fake } = setup()
    music.start('play', 1)
    let peak = 0
    for (let step = 0; step < 3000; step++) {
      fake.currentTime += 0.2
      if (step === 1500) fake.currentTime += 30 // the tab "sleeps" 30s
      const before = fake.oscillators.length
      __test__.tick()
      peak = Math.max(peak, __test__.state().activeCount)
      if (step >= 1500) {
        // After the sleep, nothing may be scheduled in the past.
        for (let i = before; i < fake.oscillators.length; i++) {
          expect(fake.oscillators[i].startedAt).toBeGreaterThanOrEqual(fake.currentTime)
        }
      }
    }
    expect(peak).toBeLessThanOrEqual(10)
    expect(fake.oscillators.length / 10).toBeLessThanOrEqual(160)
  })

  it('stop() clears the timer and silences voices after the fade', () => {
    const { fake } = setup()
    music.start('play', 1)
    expect(__test__.state().timer).toBe(true)
    music.stop(0.6)
    expect(__test__.state().timer).toBe(false)
    expect(__test__.state().running).toBe(false)
    vi.advanceTimersByTime(700)
    // The fade teardown stopped every voice created before stop.
    expect(fake.oscillators.length).toBeGreaterThan(0)
    expect(fake.oscillators.every((o) => o.stoppedAt !== null)).toBe(true)
    expect(__test__.state().activeCount).toBe(0)
  })

  it('the 11th simultaneous voice gently cuts the oldest', () => {
    const { fake } = setup()
    music.start('play', 1)
    const note = { t: 0, dur: 10, midi: 65, voice: 'box', vel: 0.8 }
    for (let i = 0; i < 11; i++) __test__.voice(note, fake.currentTime)
    expect(__test__.state().activeCount).toBe(10)
    const first = fake.oscillators[0]
    expect(first.stoppedAt).not.toBeNull()
    expect(first.stoppedAt).toBeLessThanOrEqual(fake.currentTime + 0.1)
  })

  it('setBrightness maps moon phases to pad cutoff, unknown phases fall back to half', () => {
    const { fake } = setup()
    music.start('play', 1)
    const filter = fake.filters[0]
    expect(filter.frequency.value).toBe(700) // half, the default
    music.setBrightness('full')
    expect(filter.frequency.targets).toContain(900)
    music.setBrightness('new')
    expect(filter.frequency.targets).toContain(500)
    music.setBrightness('bogus-phase')
    expect(filter.frequency.targets).toContain(700)
    // Every phase stays at or under the 900 Hz spec cap.
    for (const phase of ['new', 'crescent', 'half', 'gibbous', 'full']) {
      music.setBrightness(phase)
      expect(__test__.state().padFilterCutoff).toBeLessThanOrEqual(900)
    }
  })

  it('one scheduler tick costs <= 0.5ms (p95 over 1000 ticks)', () => {
    const { fake } = setup()
    music.start('play', 1)
    const times = []
    for (let i = 0; i < 1000; i++) {
      fake.currentTime += 0.2
      const t0 = performance.now()
      __test__.tick()
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    const p95 = times[Math.floor(times.length * 0.95)]
    expect(p95).toBeLessThanOrEqual(0.5)
  })

  it('start() without a context records intent and starts on attach', () => {
    music.start('play', 3)
    expect(__test__.state().running).toBe(false)
    setup()
    expect(__test__.state().running).toBe(true)
    expect(__test__.state().arrangement).toBe('play')
  })

  it('start() after stop() restores the bus ceiling (cancel -> set pattern)', () => {
    const { fake } = setup()
    music.start('play', 1)
    music.stop(0.6)
    music.start('play', 1)
    const schedBus = fake.gains.find((g) => g.gain.value === 0.25)
    expect(schedBus).toBeDefined()
    expect(schedBus.gain.cancelled).toBe(true)
  })

  it('timbre (round-1 review): pad is triangle with >=0.4s attack, box carries a light x3 harmonic with a ~1.2s tail', () => {
    const { fake } = setup()
    music.start('play', 1)
    const pad = __test__.voice({ t: 0, dur: 3, midi: 53, voice: 'pad', vel: 0.5 }, 10)
    expect(pad.osc.type).toBe('triangle')
    const padAttack = pad.gain.gain.ramps.find((r) => r.v > 0)
    expect(padAttack.t - 10).toBeGreaterThanOrEqual(0.4)
    const box = __test__.voice({ t: 0, dur: 0.9, midi: 65, voice: 'box', vel: 0.8 }, 20)
    expect(box.osc.periodicWave.real[1]).toBe(1) // fundamental
    expect(box.osc.periodicWave.real[3]).toBe(0.15) // very light x3
    const tail = box.gain.gain.ramps[box.gain.gain.ramps.length - 1]
    expect(Math.abs(tail.t - 20 - 1.2)).toBeLessThan(0.01)
    expect(box.osc.stoppedAt).toBe(21.3)
    void fake
  })

  it('gate (round-1 review): muted or music-off schedules 0 oscillators; re-enable resumes from now with no burst', () => {
    const { fake } = setup()
    music.start('play', 1)
    for (const gate of [{ muted: true }, { musicOn: false }]) {
      const before = fake.oscillators.length
      music.setGate(gate)
      for (let i = 0; i < 150; i++) {
        fake.currentTime += 0.2
        __test__.tick()
      }
      expect(fake.oscillators.length).toBe(before) // 30 simulated seconds, nothing
      const resumeAt = fake.currentTime
      music.setGate({ muted: false, musicOn: true })
      for (let i = 0; i < 10; i++) {
        fake.currentTime += 0.2
        __test__.tick()
      }
      const fresh = fake.oscillators.slice(before)
      expect(fresh.every((o) => o.startedAt >= resumeAt)).toBe(true) // no past notes
      expect(fresh.length).toBeLessThanOrEqual(10) // no burst
    }
  })

  it('filter leak (round-1 review): 5 start/stop cycles leave at most 1 filter connected', () => {
    const { fake } = setup()
    for (let i = 0; i < 5; i++) {
      music.start('play', 1)
      music.stop(0.1)
      vi.advanceTimersByTime(200) // past the 100ms fade + 50ms teardown
    }
    expect(fake.filters.length).toBe(5)
    expect(fake.filters.filter((f) => !f.disconnected).length).toBeLessThanOrEqual(1)
  })
})

import { describe, it, expect } from 'vitest'
import { rescaleAccum, runTicks } from './tickClock.js'
import { speedInterval } from '../game/logic.js'

describe('rescaleAccum (P01)', () => {
  it('preserves the tick progress ratio when the interval shrinks (boost on)', () => {
    // Half-way through a 0.165s tick; boost cuts the interval to 0.0858.
    expect(rescaleAccum(0.0825, 0.165, 0.0858)).toBeCloseTo(0.0429, 12)
  })

  it('preserves the ratio when the interval grows (boost off)', () => {
    expect(rescaleAccum(0.0429, 0.0858, 0.165)).toBeCloseTo(0.0825, 12)
  })

  it('leaves accum untouched when the interval does not change', () => {
    expect(rescaleAccum(0.05, 0.165, 0.165)).toBe(0.05)
    expect(rescaleAccum(0, 0.165, 0.165)).toBe(0)
    expect(rescaleAccum(0.164, 0.0858, 0.0858)).toBe(0.164)
  })

  it('never returns a full tick or more, even from an over-full accumulator', () => {
    // Ratio exactly 1 (accum == oldInterval) and beyond must stay < 1 tick.
    expect(rescaleAccum(0.165, 0.165, 0.0858)).toBeLessThan(0.0858)
    expect(rescaleAccum(0.165, 0.165, 0.0858)).toBeGreaterThan(0.0857)
    expect(rescaleAccum(0.4, 0.165, 0.0858)).toBeLessThan(0.0858)
    expect(rescaleAccum(0.164, 0.165, 0.32)).toBeLessThan(0.32)
    expect(rescaleAccum(0, 0.165, 0.0858)).toBe(0)
  })

  it('ignores degenerate intervals instead of producing NaN/negative time', () => {
    expect(rescaleAccum(0.05, 0, 0.0858)).toBe(0.05)
    expect(rescaleAccum(0.05, 0.165, 0)).toBe(0.05)
    expect(rescaleAccum(0.05, -0.165, 0.0858)).toBe(0.05)
  })
})

// Model of the engine's per-frame tick math around a boost toggle:
// accum advances by dt each frame, whole ticks are consumed, and the
// painted progress is ticks + accum / interval (unwrapped, so a tick
// wrap is continuous). At the toggle frame the interval swaps; the
// fixed engine rescales accum (setBoost), the pre-P01 engine did not.
function simulateBoostToggle(rescale) {
  const dt = 1 / 60
  const base = speedInterval(0, false) // 0.165
  const boosted = speedInterval(0, true) // 0.0858 (× 0.52)
  let interval = base
  let accum = 0.5 * base // start mid-tick
  let ticks = 0
  const steps = []
  let prevProgress = ticks + accum / interval
  for (let frame = 0; frame < 60; frame++) {
    if (frame === 10) {
      if (rescale) accum = rescaleAccum(accum, interval, boosted)
      interval = boosted
    }
    accum += dt
    while (accum >= interval) {
      accum -= interval
      ticks += 1
    }
    const progress = ticks + accum / interval
    steps.push({ advance: progress - prevProgress, maxAdvance: dt / interval })
    prevProgress = progress
  }
  return steps
}

describe('boost toggle mid-tick (P01)', () => {
  it('with rescaleAccum, progress never advances more than one frame worth', () => {
    for (const { advance, maxAdvance } of simulateBoostToggle(true)) {
      expect(advance).toBeLessThanOrEqual(maxAdvance + 1e-9)
      expect(advance).toBeGreaterThan(0)
    }
  })

  it('control: without rescaling, the toggle frame jumps (the old bug)', () => {
    const steps = simulateBoostToggle(false)
    const worst = Math.max(...steps.map((s) => s.advance - s.maxAdvance))
    expect(worst).toBeGreaterThan(0.1) // ~0.47 of a tick lurch on boost
  })
})

describe('runTicks (C01) — the engine tick block', () => {
  // A step callback with a constant interval that just counts ticks.
  const counter = (clock, next = null) => {
    const state = { ticks: 0 }
    const step = (tickDt) => {
      state.ticks++
      return { dead: false, nextInterval: next ?? tickDt }
    }
    return { state, step }
  }

  it('runs exactly the whole ticks a frame contains (dt 0.1 @ interval 0.0308 → 3)', () => {
    const clock = { accum: 0, interval: 0.0308 }
    const { state, step } = counter(clock)
    runTicks(clock, 0.1, step)
    expect(state.ticks).toBe(3)
    expect(clock.accum).toBeCloseTo(0.1 - 3 * 0.0308, 12)
    expect(clock.interval).toBe(0.0308)
  })

  it('consumes each tick at its own span and rescales the leftover to the next interval', () => {
    // One tick at 0.1s; the step speeds up to 0.05s: the 0.05s leftover is
    // half a tick of progress → 0.025s of the new interval (AUDIT L6 + P01).
    const clock = { accum: 0, interval: 0.1 }
    const { state, step } = counter(clock, 0.05)
    runTicks(clock, 0.15, step)
    expect(state.ticks).toBe(1)
    expect(clock.interval).toBe(0.05)
    expect(clock.accum).toBeCloseTo(0.025, 12)
  })

  it('a dead tick consumes nothing and stops the loop', () => {
    const clock = { accum: 0, interval: 0.05 }
    let calls = 0
    const step = (tickDt) => {
      calls++
      return calls === 2 ? { dead: true, nextInterval: tickDt } : { dead: false, nextInterval: tickDt }
    }
    runTicks(clock, 0.12, step)
    expect(calls).toBe(2)
    // First tick consumed 0.05; the dead tick left the remaining 0.07 alone.
    expect(clock.accum).toBeCloseTo(0.07, 12)
  })

  it('guard: a runaway frame runs at most 7 ticks and drops the leftover', () => {
    const clock = { accum: 0, interval: 0.1 }
    const { state, step } = counter(clock)
    runTicks(clock, 10, step)
    expect(state.ticks).toBe(7)
    expect(clock.accum).toBe(0)
  })

  it('syncInterval: a between-frames speed change rescales before any tick runs', () => {
    const clock = { accum: 0.1, interval: 0.2 }
    const { state, step } = counter(clock)
    // dt lands first (0.1 + 0.05), then the sync halves the interval:
    // 0.15 / 0.2 = 0.75 of a tick → 0.075s at the new 0.1s interval, no tick yet.
    runTicks(clock, 0.05, step, () => 0.1)
    expect(state.ticks).toBe(0)
    expect(clock.interval).toBe(0.1)
    expect(clock.accum).toBeCloseTo(0.075, 12)
  })

  it('without syncInterval the interval only changes via step results', () => {
    const clock = { accum: 0, interval: 0.1 }
    const { state, step } = counter(clock, 0.04)
    runTicks(clock, 0.09, step)
    expect(state.ticks).toBe(0)
    expect(clock.interval).toBe(0.1)
    runTicks(clock, 0.02, step)
    expect(state.ticks).toBe(1)
    expect(clock.interval).toBe(0.04)
  })
})

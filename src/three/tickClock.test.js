import { describe, it, expect } from 'vitest'
import { rescaleAccum } from './tickClock.js'
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

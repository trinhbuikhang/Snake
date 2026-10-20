import { describe, it, expect } from 'vitest'
import {
  createGovernor,
  observeWarmupFrame,
  settleWarmup,
  nextQualityIdx,
  msaaRetargetNeeded,
  DOWN_RATIO,
  UP_RATIO,
  BAD_WINDOWS_TO_STEP_DOWN,
  GOOD_WINDOWS_TO_STEP_UP,
} from './qualityGovernor.js'

const MAX_IDX = 5

// Run a warmup at a steady frame rate, then settle it.
function warmedGovernor(fps) {
  let s = createGovernor(MAX_IDX)
  for (let i = 0; i < 120; i += 1) s = observeWarmupFrame(s, 1 / fps)
  return settleWarmup(s)
}

function feedWindows(state, avgFps, count) {
  let s = state
  for (let i = 0; i < count; i += 1) s = nextQualityIdx(s, avgFps)
  return s
}

describe('warmup', () => {
  it('measures the rAF ceiling from the median interval, ignoring hitches', () => {
    let s = createGovernor(MAX_IDX)
    for (let i = 0; i < 60; i += 1) s = observeWarmupFrame(s, 1 / 60)
    s = observeWarmupFrame(s, 0.4) // one long hitch: must not skew the median
    s = settleWarmup(s)
    expect(s.targetFps).toBeCloseTo(60, 5)
  })

  it('ignores stalled frames during warmup', () => {
    let s = createGovernor(MAX_IDX)
    s = observeWarmupFrame(s, 0.9)
    expect(s.warmIntervals).toEqual([])
  })

  it('does not settle before enough samples arrive', () => {
    let s = createGovernor(MAX_IDX)
    for (let i = 0; i < 5; i += 1) s = observeWarmupFrame(s, 1 / 60)
    s = settleWarmup(s)
    expect(s.targetFps).toBeNull()
  })

  it('makes no quality decision before the warmup settles', () => {
    const s = createGovernor(MAX_IDX)
    expect(nextQualityIdx(s, 5).idx).toBe(0)
  })
})

describe('nextQualityIdx()', () => {
  it('never steps down on a stable 30fps device', () => {
    // The AUDIT M2 case: rAF is capped at 30 (Low Power Mode, 30Hz
    // panel). 30fps is this device's ceiling, not a struggle.
    let s = warmedGovernor(30)
    expect(s.targetFps).toBeCloseTo(30, 5)
    s = feedWindows(s, 30, 12)
    expect(s.idx).toBe(0)
  })

  it('steps down exactly one step after 2 consecutive bad windows', () => {
    let s = warmedGovernor(60)
    const bad = 60 * DOWN_RATIO - 5 // 40fps on a 60Hz device
    s = nextQualityIdx(s, bad)
    expect(s.idx).toBe(0)
    expect(s.badWindows).toBe(1)
    s = nextQualityIdx(s, bad)
    expect(s.idx).toBe(1)
    expect(s.badWindows).toBe(0)
    // One more bad window is only the start of a new streak.
    s = nextQualityIdx(s, bad)
    expect(s.idx).toBe(1)
  })

  it('a single hitch between good windows does not step down', () => {
    let s = warmedGovernor(60)
    s = nextQualityIdx(s, 40) // bad #1
    s = nextQualityIdx(s, 59) // good: streak resets
    s = nextQualityIdx(s, 40) // bad #1 again
    expect(s.idx).toBe(0)
  })

  it('steps back up only after a sustained run of good windows (~10s)', () => {
    let s = warmedGovernor(60)
    s = feedWindows(s, 40, BAD_WINDOWS_TO_STEP_DOWN) // -> idx 1
    expect(s.idx).toBe(1)
    const good = 60 * UP_RATIO + 3 // 58.2fps
    s = feedWindows(s, good, GOOD_WINDOWS_TO_STEP_UP - 1)
    expect(s.idx).toBe(1) // not yet: recovery must be sustained
    s = nextQualityIdx(s, good)
    expect(s.idx).toBe(0)
    // And never above the top step.
    s = feedWindows(s, good, GOOD_WINDOWS_TO_STEP_UP)
    expect(s.idx).toBe(0)
  })

  it('does not oscillate when fps hovers near the thresholds', () => {
    let s = warmedGovernor(60)
    s = feedWindows(s, 40, BAD_WINDOWS_TO_STEP_DOWN) // -> idx 1
    expect(s.idx).toBe(1)
    // Alternate bad / in-band / good windows: no streak ever completes,
    // so the step must not move for a long stretch.
    const pattern = [40, 48, 58, 44, 48, 58]
    for (let r = 0; r < 5; r += 1) {
      for (const fps of pattern) s = nextQualityIdx(s, fps)
      expect(s.idx).toBe(1)
    }
    // Parked in the hysteresis band (0.75..0.92 of target) forever:
    // neither streak grows at all.
    s = feedWindows(s, 60 * 0.83, 20)
    expect(s.idx).toBe(1)
    expect(s.badWindows).toBe(0)
    expect(s.goodWindows).toBe(0)
  })

  it('clamps at the lowest quality step', () => {
    let s = warmedGovernor(60)
    s = feedWindows(s, 10, BAD_WINDOWS_TO_STEP_DOWN * (MAX_IDX + 2))
    expect(s.idx).toBe(MAX_IDX)
  })

  it('judges relative to the ceiling, not an absolute number', () => {
    // 40fps is "bad" on a 60Hz device but perfectly healthy on a 45Hz one.
    let s45 = warmedGovernor(45)
    s45 = feedWindows(s45, 40, 10)
    expect(s45.idx).toBe(0)
  })
})

describe('two-step oscillation (review fix: failed-step memory)', () => {
  // The pathological pair: step 0 renders at 30fps (bad on a 60Hz
  // device), step 1 renders at 58fps (good). Naive thresholds bounce
  // 0 -> 1 -> 0 -> 1 ... forever; the governor must settle.
  const fpsAt = (idx) => (idx === 0 ? 30 : 58)

  it('bounds the number of step changes over ~100 windows', () => {
    let s = warmedGovernor(60)
    let changes = 0
    for (let w = 0; w < 100; w += 1) {
      const next = nextQualityIdx(s, fpsAt(s.idx))
      if (next.idx !== s.idx) changes += 1
      s = next
    }
    expect(changes).toBeLessThanOrEqual(3) // down, up, down — then settled
    expect(s.idx).toBe(1)
    expect(s.failedSteps).toContain(0)
  })

  it('never steps up into a failed step again, however long the good run', () => {
    let s = warmedGovernor(60)
    s = feedWindows(s, 30, BAD_WINDOWS_TO_STEP_DOWN) // -> idx 1 (from start: no failure marked)
    s = feedWindows(s, 58, GOOD_WINDOWS_TO_STEP_UP) // -> idx 0 (stepped up into)
    s = feedWindows(s, 30, BAD_WINDOWS_TO_STEP_DOWN) // -> idx 1, step 0 now failed
    expect(s.failedSteps).toContain(0)
    s = feedWindows(s, 58, 25)
    expect(s.idx).toBe(1)
  })

  it('blocks only the failed step; other steps stay reachable', () => {
    let s = warmedGovernor(60)
    s = feedWindows(s, 30, BAD_WINDOWS_TO_STEP_DOWN) // -> 1
    s = feedWindows(s, 58, GOOD_WINDOWS_TO_STEP_UP) // -> 0
    s = feedWindows(s, 30, BAD_WINDOWS_TO_STEP_DOWN) // -> 1, 0 failed
    s = feedWindows(s, 30, BAD_WINDOWS_TO_STEP_DOWN) // -> 2
    expect(s.idx).toBe(2)
    s = feedWindows(s, 58, GOOD_WINDOWS_TO_STEP_UP) // -> 1 (not failed: allowed)
    expect(s.idx).toBe(1)
    s = feedWindows(s, 58, GOOD_WINDOWS_TO_STEP_UP * 2) // 0 is failed: holds at 1
    expect(s.idx).toBe(1)
  })
})

describe('msaaRetargetNeeded()', () => {
  it('is needed exactly once at startup, when nothing is applied yet', () => {
    expect(msaaRetargetNeeded(null, 4)).toBe(true)
    expect(msaaRetargetNeeded(4, 4)).toBe(false)
  })

  it('is not needed again while the step keeps the same sample count', () => {
    // Resizes and same-msaa step changes must never retarget/dispose.
    expect(msaaRetargetNeeded(4, 4)).toBe(false)
    expect(msaaRetargetNeeded(0, 0)).toBe(false)
  })

  it('is needed when the step changes the sample count', () => {
    expect(msaaRetargetNeeded(4, 0)).toBe(true)
    expect(msaaRetargetNeeded(0, 4)).toBe(true)
  })
})

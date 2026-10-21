import { describe, it, expect } from 'vitest'
import {
  createGovernor,
  observeWarmupFrame,
  settleWarmup,
  nextQualityIdx,
  msaaRetargetNeeded,
  msaaFor,
  snapRefresh,
  QUALITY_STEPS,
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

function feedWindows(state, avgFps, count, spikeRatio = 0) {
  let s = state
  for (let i = 0; i < count; i += 1) s = nextQualityIdx(s, avgFps, spikeRatio)
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

  it('judges relative to the snapped target, not an absolute number', () => {
    // P04 changed this test's premise deliberately: there is no
    // 45Hz standard refresh rate, so a 45fps warmup median now means
    // a 60Hz panel whose GPU is struggling — the target snaps to 60
    // and a steady 40fps IS bad. (Under T06 the target stayed 45 and
    // 40fps counted as healthy; that is exactly the never-steps-down
    // failure P04 exists to fix.)
    let s45 = warmedGovernor(45)
    expect(s45.targetFps).toBe(60)
    s45 = feedWindows(s45, 40, BAD_WINDOWS_TO_STEP_DOWN)
    expect(s45.idx).toBe(1)
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

describe('msaaFor()', () => {
  it('drops MSAA at DPR >= 1.5, where density and bloom hide aliasing (P03)', () => {
    expect(msaaFor(1.5)).toBe(0)
    expect(msaaFor(2)).toBe(0)
    expect(msaaFor(3)).toBe(0)
  })

  it('keeps 4x MSAA below 1.5, where geometry edges would alias (P03)', () => {
    expect(msaaFor(1)).toBe(4)
    expect(msaaFor(1.25)).toBe(4)
    expect(msaaFor(1.49)).toBe(4)
  })
})

describe('QUALITY_STEPS ladder (P03)', () => {
  it('starts at DPR 1.5', () => {
    expect(QUALITY_STEPS[0].dpr).toBe(1.5)
  })

  it('keeps the shadow map at 1024 on every step except possibly the last', () => {
    // The owner's rule: shadow drops to 512 only at the lowest step.
    // This is the guard the P03 review asked for — retuning a middle
    // step to 512 must fail here, not slip through.
    for (let i = 0; i < QUALITY_STEPS.length - 1; i += 1) {
      expect(QUALITY_STEPS[i].shadow).toBe(1024)
    }
    expect([1024, 512]).toContain(QUALITY_STEPS.at(-1).shadow)
  })

  it('never raises the pixel ratio on the way down', () => {
    for (let i = 1; i < QUALITY_STEPS.length; i += 1) {
      expect(QUALITY_STEPS[i].dpr).toBeLessThanOrEqual(QUALITY_STEPS[i - 1].dpr)
    }
  })

  it('has no two identical adjacent steps (a no-op step wastes a governor window)', () => {
    for (let i = 1; i < QUALITY_STEPS.length; i += 1) {
      expect(QUALITY_STEPS[i]).not.toEqual(QUALITY_STEPS[i - 1])
    }
  })
})

describe('snapRefresh() (P04)', () => {
  it('snaps a struggling median up to the panel rate', () => {
    // The plan's examples: the median is the achieved rate, the
    // target must be the display's.
    expect(snapRefresh(35)).toBe(60)
    expect(snapRefresh(58)).toBe(60)
    expect(snapRefresh(118)).toBe(120)
  })

  it('keeps a genuine low-rate panel at its own standard', () => {
    expect(snapRefresh(29.7)).toBe(30)
    expect(snapRefresh(29.8)).toBe(30)
    expect(snapRefresh(30)).toBe(30)
  })

  it('passes standard rates through and clamps outside the table', () => {
    expect(snapRefresh(60)).toBe(60)
    expect(snapRefresh(144)).toBe(144)
    expect(snapRefresh(250)).toBe(240) // above the top standard: clamp
    expect(snapRefresh(20)).toBe(30) // below the lowest: the floor standard
  })

  it('moves up only once the median clears standard / 0.95', () => {
    // 63 * 0.95 = 59.85 <= 60, so 60 still qualifies; past
    // 60 / 0.95 ≈ 63.2 the estimate moves to the next standard.
    expect(snapRefresh(63)).toBe(60)
    expect(snapRefresh(64)).toBe(75)
  })
})

describe('governor against the snapped target (P04)', () => {
  it('steps down after 2 windows when a weak GPU renders 35fps on a 60Hz panel', () => {
    // The P04 headline case: under T06 this governor learned
    // targetFps ≈ 35 from its own output and never stepped down.
    let s = warmedGovernor(35)
    expect(s.targetFps).toBe(60)
    s = nextQualityIdx(s, 35)
    expect(s.idx).toBe(0)
    expect(s.badWindows).toBe(1)
    s = nextQualityIdx(s, 35)
    expect(s.idx).toBe(1)
  })

  it('never steps down on a stable ~30Hz device (warmup median 29.8)', () => {
    let s = warmedGovernor(29.8)
    expect(s.targetFps).toBe(30)
    s = feedWindows(s, 29.8, 12)
    expect(s.idx).toBe(0)
    expect(s.badWindows).toBe(0)
  })

  it('marks a window bad on spikes even when average FPS is fine', () => {
    let s = warmedGovernor(60)
    // 58fps average alone would be a "good" window; with 15% of
    // frames past 2x the target interval it must count as bad.
    s = nextQualityIdx(s, 58, 0.15)
    expect(s.badWindows).toBe(1)
    expect(s.goodWindows).toBe(0)
    expect(s.idx).toBe(0)
    s = nextQualityIdx(s, 58, 0.15)
    expect(s.idx).toBe(1)
  })

  it('treats the spike threshold as inclusive, and a few spikes as fine', () => {
    const s = warmedGovernor(60)
    expect(nextQualityIdx(s, 58, 0.1).badWindows).toBe(1) // exactly 10%: bad
    const ok = nextQualityIdx(s, 58, 0.09)
    expect(ok.badWindows).toBe(0)
    expect(ok.goodWindows).toBe(1) // 58 > 0.92 * 60: a good window
  })
})

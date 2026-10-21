// Adaptive-quality decisions, as pure functions (T06).
//
// The old governor compared FPS against a hard-coded 45: on a device
// whose display or power mode caps requestAnimationFrame at 30fps, the
// game could never reach 45, so quality sank to the floor even when the
// GPU had headroom to spare — and it never climbed back. This module
// instead measures the device's own rAF ceiling during a warmup
// (median frame interval while playing) and judges every later FPS
// window relative to that ceiling:
//
//   avgFps < 0.75 * targetFps  -> a "bad" window; 2 in a row step DOWN
//   avgFps > 0.92 * targetFps  -> a "good" window; 4 in a row (~10s of
//                                 2.5s windows) step back UP
//   in between                 -> the hysteresis band: hold position
//                                 and reset both streaks, so a frame
//                                 rate hovering near a threshold can
//                                 never make quality oscillate.
//
// One more guard, against a subtler oscillation: if step N renders
// badly while step N+1 renders well (a step boundary that toggles MSAA
// or bloom can do exactly this), plain thresholds would bounce between
// the two steps forever — down in ~5s, up in ~10s, repeat. So the
// governor remembers any step it stepped UP into that then failed: it
// will not step up into that step again this session. The first
// descent from the starting step marks nothing (nothing was retried
// yet), so ordinary recovery is unaffected.
//
// Known, accepted limitation: the ceiling is measured from frame
// intervals while playing at the top quality step, so on a machine
// that is GPU-bound from the very first frame the measured ceiling is
// the achieved rate, not the panel's refresh rate, and the governor
// judges relative to that. Accepted for this design (see FIX_PLAN
// T06 review notes); the absolute floor it protects is that a stable
// capped display is never punished.
//
// No DOM, no Three, no clocks: the engine feeds it numbers, tests feed
// it numbers. State is a plain object; every function returns a new
// state instead of mutating.

// The quality ladder the governor walks (P03). The garden is a
// heavy frame — UnrealBloom over composer targets plus a PCF-soft
// shadow map, all scaled by the pixel ratio — and fill-rate is the
// bottleneck, so the ladder starts at DPR 1.5 with a 1024px shadow
// map and sacrifices in this order: pixel ratio first, then bloom;
// the shadow map drops to 512 only at the very last step (owner's
// call: shadow softness is worth more than the fill it saves until
// every other sacrifice is spent). MSAA is deliberately NOT a
// ladder field: it follows the effective pixel ratio via msaaFor()
// below. Exported (rather than private to the engine) so the ladder
// itself is unit-tested — a middle step silently dropping to 512
// must fail a test, not just a review.
export const QUALITY_STEPS = [
  { dpr: 1.5,  shadow: 1024, bloom: true  },
  { dpr: 1.25, shadow: 1024, bloom: true  },
  { dpr: 1,    shadow: 1024, bloom: true  },
  { dpr: 1,    shadow: 1024, bloom: false },
  { dpr: 1,    shadow: 512,  bloom: false },
]

export const DOWN_RATIO = 0.75
export const UP_RATIO = 0.92
export const BAD_WINDOWS_TO_STEP_DOWN = 2
export const GOOD_WINDOWS_TO_STEP_UP = 4
export const MIN_WARMUP_SAMPLES = 30

export function createGovernor(maxIdx) {
  return {
    idx: 0,
    maxIdx,
    targetFps: null, // unknown until the warmup settles
    badWindows: 0,
    goodWindows: 0,
    warmIntervals: [],
    failedSteps: [], // idx values stepped up into, then failed (see header)
    reachedBy: 'start', // how the current idx was arrived at: start | up | down
  }
}

// The engine's MSAA bookkeeping, kept pure so it is testable: the
// composer's render targets must be retargeted (and disposed) exactly
// when the applied sample count differs from the step's — at startup
// (appliedMsaa still null) that means exactly once.
export function msaaRetargetNeeded(appliedMsaa, stepMsaa) {
  return appliedMsaa !== stepMsaa
}

// How many MSAA samples the composer's scene targets get (P03): a
// pure function of the EFFECTIVE pixel ratio. At DPR >= 1.5 the
// pixel density — helped by bloom softening edges — makes aliasing
// invisible, so samples drop to 0 and the fill/bandwidth goes back
// to the frame; below 1.5 geometry edges need the classic 4x.
export function msaaFor(dpr) {
  return dpr >= 1.5 ? 0 : 4
}

// Feed one frame interval (seconds) during warmup. Intervals from a
// stalled frame (tab switch, GC pause) are ignored so they cannot drag
// the measured ceiling down.
export function observeWarmupFrame(state, dtSeconds) {
  if (state.targetFps !== null) return state
  if (!(dtSeconds > 0) || dtSeconds >= 0.5) return state
  const warmIntervals = [...state.warmIntervals, dtSeconds].slice(-300)
  return { ...state, warmIntervals }
}

// Settle the warmup: the rAF ceiling is the MEDIAN interval, so a few
// hitches during warmup do not lower the bar for the whole session.
// Needs at least MIN_WARMUP_SAMPLES samples; before that the state is
// returned unchanged.
export function settleWarmup(state) {
  if (state.targetFps !== null) return state
  if (state.warmIntervals.length < MIN_WARMUP_SAMPLES) return state
  const sorted = [...state.warmIntervals].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  return { ...state, targetFps: 1 / median, warmIntervals: [] }
}

// Judge one FPS window (the engine uses ~2.5s windows) and return the
// new state; `idx` in the result is the quality step to apply.
export function nextQualityIdx(state, avgFps) {
  if (state.targetFps === null) return state
  if (avgFps < DOWN_RATIO * state.targetFps) {
    const badWindows = state.badWindows + 1
    if (badWindows >= BAD_WINDOWS_TO_STEP_DOWN && state.idx < state.maxIdx) {
      // Stepping down. If this step was reached by stepping UP into it,
      // it has now failed its audition: remember it, and never step up
      // into it again this session (anti-oscillation, see header).
      const failedSteps =
        state.reachedBy === 'up' && !state.failedSteps.includes(state.idx)
          ? [...state.failedSteps, state.idx]
          : state.failedSteps
      return {
        ...state,
        idx: state.idx + 1,
        badWindows: 0,
        goodWindows: 0,
        failedSteps,
        reachedBy: 'down',
      }
    }
    return { ...state, badWindows, goodWindows: 0 }
  }
  if (avgFps > UP_RATIO * state.targetFps) {
    const goodWindows = state.goodWindows + 1
    if (goodWindows >= GOOD_WINDOWS_TO_STEP_UP && state.idx > 0) {
      if (state.failedSteps.includes(state.idx - 1)) {
        // The step above already failed once after being stepped into;
        // hold here instead of bouncing back into it.
        return { ...state, badWindows: 0, goodWindows: 0 }
      }
      return { ...state, idx: state.idx - 1, badWindows: 0, goodWindows: 0, reachedBy: 'up' }
    }
    return { ...state, badWindows: 0, goodWindows }
  }
  // Hysteresis band: neither struggling nor coasting — hold position.
  return { ...state, badWindows: 0, goodWindows: 0 }
}

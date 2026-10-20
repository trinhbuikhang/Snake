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
// No DOM, no Three, no clocks: the engine feeds it numbers, tests feed
// it numbers. State is a plain object; every function returns a new
// state instead of mutating.

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
  }
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
      return { ...state, idx: state.idx + 1, badWindows: 0, goodWindows: 0 }
    }
    return { ...state, badWindows, goodWindows: 0 }
  }
  if (avgFps > UP_RATIO * state.targetFps) {
    const goodWindows = state.goodWindows + 1
    if (goodWindows >= GOOD_WINDOWS_TO_STEP_UP && state.idx > 0) {
      return { ...state, idx: state.idx - 1, badWindows: 0, goodWindows: 0 }
    }
    return { ...state, badWindows: 0, goodWindows }
  }
  // Hysteresis band: neither struggling nor coasting — hold position.
  return { ...state, badWindows: 0, goodWindows: 0 }
}

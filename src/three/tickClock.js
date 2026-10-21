// Pure tick-clock helpers for the render loop (SKINS_PERF_PLAN P01).
//
// The snake's position within the current tick is the ratio
// accum / interval. When the interval changes mid-tick — boost toggled,
// or the speed recomputed after eating — the accumulator is rescaled by
// the same factor so the ratio, and therefore the painted position,
// does not jump. Only the speed changes; the progress does not.

// Rescale `accum` from `oldInterval` to `newInterval`, preserving the
// progress ratio accum / oldInterval. The result is always strictly
// below one full new tick: a ratio at (or beyond) the end of the old
// tick clamps to just under 1, so paintT can never reach 1 early.
// Degenerate intervals (non-positive) leave `accum` untouched.
export function rescaleAccum(accum, oldInterval, newInterval) {
  if (!(oldInterval > 0) || !(newInterval > 0)) return accum
  if (newInterval === oldInterval) return accum
  const ratio = accum / oldInterval
  const clamped = Math.min(Math.max(ratio, 0), 1 - 1e-9)
  return clamped * newInterval
}

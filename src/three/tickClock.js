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

// Advance the tick clock by `dt` seconds, running whole ticks through the
// `step(tickDt, clock)` callback. This is the engine frame loop's tick
// block, extracted unchanged (POLISH_PLAN C01) so tests and tooling drive
// the exact code the game runs:
//
// - `clock` is the persistent `{ accum, interval }` state (mutated).
// - Optional `syncInterval()` runs right after `dt` lands: it returns the
//   interval currently in force (speed can change between ticks — boost,
//   moon phase, …) and the accumulator is rescaled onto it first (P01).
// - Each tick consumes exactly its own span: `step` is called with the
//   interval in force at the tick's start and returns
//   `{ dead, nextInterval }`; the leftover is rescaled from the consumed
//   span to `nextInterval` (AUDIT L6 + P01), never just subtracted raw.
// - A dead tick consumes nothing and stops the loop, like the engine.
// - A runaway frame (guard > 6 ticks) drops the leftover instead of
//   spiralling.
//
// The callback reuses its result object — nothing here allocates.
export function runTicks(clock, dt, step, syncInterval) {
  clock.accum += dt
  if (syncInterval) {
    const oldInterval = clock.interval
    clock.interval = syncInterval()
    clock.accum = rescaleAccum(clock.accum, oldInterval, clock.interval)
  }
  let guard = 0
  while (clock.accum >= clock.interval) {
    const tickDt = clock.interval // seconds this tick consumes
    const r = step(tickDt, clock)
    if (r.dead) break
    clock.accum -= tickDt
    clock.accum = rescaleAccum(clock.accum, tickDt, r.nextInterval)
    clock.interval = r.nextInterval
    if (++guard > 6) {
      clock.accum = 0
      break
    }
  }
}

// Reusable cell-snapshot buffers (P06).
//
// The engine hands the rig a (prev, cur) pair of world-cell arrays
// per tick, and the rig interpolates between them until the next
// tick. Cloning both arrays — and every cell object in them — on
// every tick fed the GC for no benefit, so each stream (game,
// title demo) now owns TWO buffers and alternates: a tick writes
// the new state into the buffer that is not the current `cur`,
// then the pair variables are re-pointed. The write and the
// re-pointing happen inside the same synchronous tick handler,
// before the frame loop reads the pair again, so the rig never
// observes a half-written buffer and the contents it is
// interpolating between are never mutated mid-interval.

// Fill dst[0..count) with world cells, reusing the cell objects
// already in dst (allocating only when growing past dst's current
// length) and truncating dst to exactly `count`. `write(i, out)`
// must set out.x / out.z for index i. Returns dst.
export function writeCellsInto(dst, count, write) {
  for (let i = 0; i < count; i += 1) {
    let o = dst[i]
    if (!o) {
      o = { x: 0, z: 0 }
      dst[i] = o
    }
    write(i, o)
  }
  dst.length = count
  return dst
}

// REFERENCE PROTOTYPE for docs/plan/POLISH_PLAN.md task C02 — NOT game code.
// Nothing in src/ imports this file. Muse ports the idea into
// src/game/swipe.js with its own tests; do not copy it blindly.
//
// A swipe tracker that follows ONE finger (the one that went down on the
// canvas) by touch identifier, so a thumb resting on Dash never hijacks
// the swipe (master @ f9d1dd6 reads e.touches[0], which is the Dash thumb).
// First turn of a gesture: dominant axis past `threshold` (diagonals still
// turn, as today). Later turns in the same gesture need `nextThreshold`
// of travel AND a clear axis (major >= axisRatio * minor), so a flick that
// curls at the end does not add a second, unintended turn. Travel in the
// direction already chosen just moves the origin (a long straight swipe
// is still one turn).
export function createSwipeTracker({ threshold = 18, nextThreshold = 32, axisRatio = 1.5 } = {}) {
  let id = null
  let sx = 0
  let sy = 0
  let last = null
  const find = (list) => {
    if (!list) return null
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]
    return null
  }
  return {
    start(e) {
      if (id !== null) return // a second finger on the lake is ignored
      const t = e.changedTouches[0]
      id = t.identifier
      sx = t.clientX
      sy = t.clientY
      last = null
    },
    // Returns the direction to request, or null.
    move(e) {
      if (id === null) return null
      const t = find(e.changedTouches) || find(e.touches)
      if (!t) return null
      const dx = t.clientX - sx
      const dy = t.clientY - sy
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const major = Math.max(ax, ay)
      const minor = Math.min(ax, ay)
      const key = ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
      if (key === last) {
        if (major >= threshold) { sx = t.clientX; sy = t.clientY }
        return null
      }
      if (last === null ? major < threshold : major < nextThreshold || major < axisRatio * minor) return null
      sx = t.clientX
      sy = t.clientY
      last = key
      return key
    },
    end(e) {
      if (find(e.changedTouches)) id = null
    },
    cancel() {
      id = null
    },
  }
}

// Adapter with the same shape as the engine's handlers (for swipe-sim.mjs --reference).
export function referenceSwipe(requestTurn) {
  const tr = createSwipeTracker()
  return {
    onTouchStart: (e) => tr.start(e),
    onTouchMove: (e) => { const k = tr.move(e); if (k) requestTurn(k) },
    onTouchEnd: (e) => tr.end(e),
  }
}

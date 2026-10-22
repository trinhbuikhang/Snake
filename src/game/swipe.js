// One-finger swipe tracker (POLISH_PLAN C02) — pure, no DOM.
//
// The engine used to read `e.touches[0]` (whichever finger landed first
// anywhere on screen), so holding Dash with one thumb broke swiping with
// the other: the canvas tracked the Dash thumb's position and turns were
// lost or wrong. This tracker follows ONE finger by touch identifier —
// the one that went down on the canvas — and ignores every other finger.
//
// Turn rules within one gesture:
// - The first turn fires when the dominant axis passes `threshold`
//   (18px, unchanged from the old handler; diagonals still turn).
// - A further turn in the same gesture needs `nextThreshold` (32px) of
//   travel AND a clear axis (major >= axisRatio × minor, 1.5×), so a
//   flick that curls at the end does not add an unintended turn.
// - Continuing in the direction already chosen just moves the origin,
//   so a long straight swipe stays a single turn.
//
// Events are read structurally: only `identifier` / `clientX` / `clientY`
// of `changedTouches` (falling back to `touches`) — tests feed plain
// objects with the same shape.
export function createSwipeTracker({ threshold = 18, nextThreshold = 32, axisRatio = 1.5 } = {}) {
  let id = null // identifier of the tracked finger, null when idle
  let sx = 0 // origin of the current leg of the gesture
  let sy = 0
  let last = null // last direction this gesture produced

  const find = (list) => {
    if (!list) return null
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]
    return null
  }

  return {
    start(e) {
      if (id !== null) return // a second finger on the canvas is ignored
      const t = e.changedTouches && e.changedTouches[0]
      if (!t) return
      id = t.identifier
      sx = t.clientX
      sy = t.clientY
      last = null
    },

    // Returns the direction key to request ('up'|'down'|'left'|'right'),
    // or null when this move produces no turn.
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
        // Same direction again: not a new turn — just re-base the origin
        // once the finger has travelled a threshold from it.
        if (major >= threshold) {
          sx = t.clientX
          sy = t.clientY
        }
        return null
      }
      const blocked =
        last === null ? major < threshold : major < nextThreshold || major < axisRatio * minor
      if (blocked) return null
      sx = t.clientX
      sy = t.clientY
      last = key
      return key
    },

    end(e) {
      // Only the tracked finger ending clears the tracker; another
      // finger lifting (e.g. Dash released mid-swipe) changes nothing.
      if (find(e.changedTouches)) id = null
    },

    cancel() {
      id = null
    },
  }
}

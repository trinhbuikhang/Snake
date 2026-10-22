// Direction for the on-screen d-pad (POLISH_PLAN C03) — pure.
//
// The whole 190×190 pad square is the steering surface: given the
// finger's offset from the pad's centre, the dominant axis decides the
// direction. Inside the dead zone around the centre (16px, Chebyshev —
// |dx| and |dy| both below it) there is no direction: a finger resting
// in the middle steers nothing. Ties go to the vertical axis, matching
// the swipe tracker's tie-break.
export function padDirection(dx, dy, dead = 16) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.max(ax, ay) < dead) return null
  return ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
}

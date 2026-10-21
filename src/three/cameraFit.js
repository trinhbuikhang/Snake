// Perspective-correct camera fit for the 'aligned' preset (S05).
//
// The old fit was ortho-style: it sized the view for a board of
// ±FIT_HALF around the origin, which perspective punishes twice —
// the near edge crowds the bottom while the far edge leaves ~1/3
// of the screen empty, and the serpent reads tiny. fitAligned
// instead searches for the CLOSEST camera distance at which all
// four board corners (at ±boardHalf, rim included) still project
// inside the given NDC margins, letting the look point slide
// toward the near edge (lookZ) so the board centres vertically:
// the top margin is tighter (0.80) to leave room for the HUD
// pills, the bottom looser (0.93).
//
// margins = { x, right?, top, bottom }: x is the LEFT limit
// (|NDC x| on the left side), right the right-side limit (defaults
// to x). An asymmetric right limit — used on touch landscape so
// the board's right edge stays left of the Dash/d-pad cluster —
// also lets the look point slide sideways (lookX): the board
// shifts left on screen at no extra distance. With symmetric
// margins lookX is always 0 and the search is the plain one.
//
// Pure math, no three.js: the camera basis for az = 0 is
//   viewDir = (0, sin el, cos el)   (look point -> camera)
//   right   = (1, 0, 0)             (screen right = world +x)
//   up      = (0, cos el, -sin el)
// and a corner's NDC is (p·right, p·up) / (depth · tanHalf),
// depth = -(p·viewDir), p = corner - cameraPosition. The test
// re-projects the corners with a real THREE.PerspectiveCamera so
// this convention is verified end to end.

export function fitAligned({ el, fov, aspect, boardHalf, margins }) {
  const sinEl = Math.sin(el)
  const cosEl = Math.cos(el)
  const tanHalf = Math.tan((fov * Math.PI) / 360)
  const left = margins.x
  const right = margins.right ?? margins.x

  const fitsAt = (dist, lookZ, lookX) => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // p = corner - (viewDir * dist + (lookX, 0, lookZ))
        const px = sx * boardHalf - lookX
        const py = -sinEl * dist
        const pz = sz * boardHalf - lookZ - cosEl * dist
        const depth = -(py * sinEl + pz * cosEl)
        if (depth <= 0) return false
        const x = px / (depth * tanHalf * aspect)
        if (x > right || x < -left) return false
        const y = (py * cosEl - pz * sinEl) / (depth * tanHalf)
        if (y > margins.top || -y > margins.bottom) return false
      }
    }
    return true
  }

  // The look point slides toward the near edge (positive z is the
  // camera side at az = 0); pick the slide needing least distance.
  // The sideways slide is only searched when the right margin is
  // tighter than the left — the case that needs the board shifted.
  const lookXs = right < left ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8] : [0]
  let best = Infinity
  let bestZ = 0
  let bestX = 0
  for (let lz = -1; lz <= 4; lz += 0.25) {
    for (const lx of lookXs) {
      let lo = 4
      let hi = 120
      for (let i = 0; i < 26; i += 1) {
        const mid = (lo + hi) / 2
        if (fitsAt(mid, lz, lx)) hi = mid
        else lo = mid
      }
      if (hi < best - 1e-3) {
        best = hi
        bestZ = lz
        bestX = lx
      }
    }
  }
  return { dist: best, lookZ: bestZ, lookX: bestX }
}

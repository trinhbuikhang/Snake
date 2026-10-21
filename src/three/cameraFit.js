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
// Pure math, no three.js: the camera basis for az = 0 is
//   viewDir = (0, sin el, cos el)   (look point -> camera)
//   right   = (-1, 0, 0)            (mirrored X; only |x| matters)
//   up      = (0, cos el, -sin el)
// and a corner's NDC is (p·right, p·up) / (depth · tanHalf),
// depth = -(p·viewDir), p = corner - cameraPosition. The test
// re-projects the corners with a real THREE.PerspectiveCamera so
// this convention is verified end to end.

export function fitAligned({ el, fov, aspect, boardHalf, margins }) {
  const sinEl = Math.sin(el)
  const cosEl = Math.cos(el)
  const tanHalf = Math.tan((fov * Math.PI) / 360)

  const fitsAt = (dist, lookZ) => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // p = corner - (viewDir * dist + (0, 0, lookZ))
        const px = sx * boardHalf
        const py = -sinEl * dist
        const pz = sz * boardHalf - lookZ - cosEl * dist
        const depth = -(py * sinEl + pz * cosEl)
        if (depth <= 0) return false
        if (Math.abs(px) / (depth * tanHalf * aspect) > margins.x) return false
        const y = (py * cosEl - pz * sinEl) / (depth * tanHalf)
        if (y > margins.top || -y > margins.bottom) return false
      }
    }
    return true
  }

  // The look point slides toward the near edge (positive z is the
  // camera side at az = 0); pick the slide needing least distance.
  let best = Infinity
  let bestZ = 0
  for (let lz = -1; lz <= 4; lz += 0.25) {
    let lo = 4
    let hi = 120
    for (let i = 0; i < 26; i += 1) {
      const mid = (lo + hi) / 2
      if (fitsAt(mid, lz)) hi = mid
      else lo = mid
    }
    if (hi < best - 1e-3) {
      best = hi
      bestZ = lz
    }
  }
  return { dist: best, lookZ: bestZ }
}

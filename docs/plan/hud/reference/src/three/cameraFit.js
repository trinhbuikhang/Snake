// REFERENCE PROTOTYPE (docs/plan/HUD_PLAN.md) — copy of the prototype's src/three/cameraFit.js; not imported by the game.
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

// HUD plan (REFERENCE PROTOTYPE): margins derived from the HUD bands
// hudReserve() reports, so the board never sits under the bar, the
// touch cluster or a safe-area inset. base = preset caps (tall screens).
export function fitMargins(res, base, gap = 8) {
  const { w, h } = res
  const ndcX = (px) => 1 - (2 * px) / w
  const ndcY = (px) => 1 - (2 * px) / h
  const m = {
    x: Math.min(base.x, ndcX(res.left + (res.left ? gap : 0))),
    right: Math.min(base.x, ndcX(res.right + (res.right ? gap : 0))),
    top: Math.min(base.top, ndcY(res.top + gap)),
    bottom: Math.min(base.bottom, ndcY(res.bottom + (res.bottom ? gap : 0))),
    anchor: w / h > 1 ? 'min' : 'middle',
  }
  if (res.cluster) {
    // Landscape: keep the board left of the cluster (board slides
    // sideways). Portrait: keep it above the cluster.
    if (w / h > 1) m.right = Math.min(m.right, ndcX(res.cluster.w + gap))
    else m.bottom = Math.min(m.bottom, ndcY(res.cluster.h + gap))
    // Soft reserve: centre the board above the coach strip when it fits.
    if (res.coachStrip) m.softBottom = Math.min(m.bottom, ndcY(res.cluster.h + res.coachStrip + gap))
  }
  return m
}

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
  let bestDist = Infinity
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
  // anchor 'middle' (portrait): the fit is width-limited, so the
  // board can slide vertically at (almost) the same distance. Centre it
  // in the free band between the HUD bar and the touch cluster instead
  // of wherever the coarse search stopped.
  if (margins.anchor === 'middle') {
    const edgeY = (d, lz, sz) => {
      const py = -sinEl * d
      const pz = sz * boardHalf - lz - cosEl * d
      const depth = -(py * sinEl + pz * cosEl)
      return (py * cosEl - pz * sinEl) / (depth * tanHalf)
    }
    const softBottom = margins.softBottom ?? margins.bottom
    let bestErr = Infinity
    for (let lz = -2; lz <= 14; lz += 0.1) {
      let lo = 4
      let hi = 120
      for (let i = 0; i < 26; i += 1) {
        const mid = (lo + hi) / 2
        if (fitsAt(mid, lz, bestX)) hi = mid
        else lo = mid
      }
      if (!fitsAt(hi, lz, bestX)) continue
      // only slide while the board keeps (about) its on-screen width
      if (hi > best * 1.02) continue
      const err = Math.abs((margins.top - edgeY(hi, lz, -1)) - (softBottom + edgeY(hi, lz, 1)))
      if (err < bestErr) {
        bestErr = err
        bestZ = lz
        bestDist = hi
      }
    }
    if (bestErr < Infinity) best = bestDist
  }
  return { dist: best, lookZ: bestZ, lookX: bestX }
}

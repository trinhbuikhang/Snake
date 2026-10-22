// Camera model of the REFERENCE PROTOTYPE (needs fitMargins + hudReserve in src/).
// After H04, replace with a one-liner that calls the exported pure function the
// engine itself uses (see H04), so the harness can never drift from the engine.
import { fitAligned, fitMargins } from '../../../../src/three/cameraFit.js'
import { hudReserve, HUD } from '../../../../src/game/hudLayout.js'
export function cameraFor({ w, h, safe }) {
  const el = 1.0, fov = 42
  const margins = fitMargins(hudReserve({ w, h, safe: safe || {}, showControls: false }), { x: 0.97, top: 0.8, bottom: 0.93 }, HUD.fitGap)
  const { dist, lookZ, lookX } = fitAligned({ el, fov, aspect: w / h, boardHalf: 10.25, margins })
  const v = [0, Math.sin(el), Math.cos(el)]
  return { fov, look: [lookX, 0, lookZ], pos: [lookX + v[0] * dist, v[1] * dist, lookZ + v[2] * dist], dist, lookZ, lookX, margins }
}

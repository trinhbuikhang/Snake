// Baseline camera model: replica of master @ aabe5b7 engine.js updateCameraTarget() for 'aligned'.
import { fitAligned } from '../../../../src/three/cameraFit.js'
export function cameraFor({ w, h, coarse }) {
  const el = 1.0, fov = 42
  let top = 0.8; const hudReserve = 74 + 8
  if (h > hudReserve * 2) top = Math.min(top, 1 - (2 * hudReserve) / h)
  let right = 0.97
  if (w / h > 1 && coarse) right = Math.min(right, 1 - (2 * (288 + 8)) / w)
  const { dist, lookZ, lookX } = fitAligned({ el, fov, aspect: w / h, boardHalf: 10.25, margins: { x: 0.97, right, top, bottom: 0.93 } })
  const v = [0, Math.sin(el), Math.cos(el)]
  return { fov, look: [lookX, 0, lookZ], pos: [lookX + v[0] * dist, v[1] * dist, lookZ + v[2] * dist], dist, lookZ, lookX, margins: { top, right } }
}

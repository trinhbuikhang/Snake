// Camera model for the harness: the engine's own pure fit (H04).
// This file used to replicate the reference prototype; it now calls
// alignedCamera() from src/ so the harness can never drift from the
// engine. showControls is false: the harness measures the default
// store, where the cluster follows controlsVisible(w, false).
import { alignedCamera } from '../../../../src/three/cameraFit.js'

const PRESET = { el: 1.0, fov: 42, perspFit: { x: 0.97, top: 0.8, bottom: 0.93 } }

export function cameraFor({ w, h, safe }) {
  const { dist, lookZ, lookX, margins } = alignedCamera({
    w, h, safe: safe || {}, showControls: false, preset: PRESET, boardHalf: 10.25,
  })
  const v = [0, Math.sin(PRESET.el), Math.cos(PRESET.el)]
  return { fov: PRESET.fov, look: [lookX, 0, lookZ], pos: [lookX + v[0] * dist, v[1] * dist, lookZ + v[2] * dist], dist, lookZ, lookX, margins }
}

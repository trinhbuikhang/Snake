// Camera model for the harness: the engine's own pure fit (H04).
// This file used to replicate the reference prototype; it now calls
// alignedCamera() from src/ so the harness can never drift from the
// engine. showControls is false: the harness measures the default
// store, where the cluster follows controlsVisible(w, false).
// V03: the preset goes through presetFor() exactly like the engine,
// and coachVisible follows the run (the harness's coach=off pass
// seeds ran-xinh-onboarded=1, so the coach never shows).
import { alignedCamera, presetFor } from '../../../../src/three/cameraFit.js'

const PRESET = { el: 1.0, fov: 42, perspFit: { x: 0.97, top: 0.8, bottom: 0.93 } }

export function cameraFor({ w, h, safe, coachVisible = true }) {
  const preset = presetFor(PRESET, { w, h, coachVisible })
  const { dist, lookZ, lookX, margins } = alignedCamera({
    w, h, safe: safe || {}, showControls: false, preset, boardHalf: 10.25, coachVisible,
  })
  const v = [0, Math.sin(preset.el), Math.cos(preset.el)]
  return { fov: preset.fov, look: [lookX, 0, lookZ], pos: [lookX + v[0] * dist, v[1] * dist, lookZ + v[2] * dist], dist, lookZ, lookX, margins }
}

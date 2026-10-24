// Portrait board-size explorer for docs/plan/POLISH_PLAN.md (V03, carries HUD_PLAN H07).
// Tooling only — not part of the game build, not part of `npm test`.
// Calls the engine's own chain exactly as the engine does (V03):
// presetFor() picks the elevation, alignedCamera() runs
// hudReserve -> fitMargins -> fitAligned with the coach state, and the
// board is projected with a real THREE.PerspectiveCamera. The coach
// card only shows on the first night; with it gone the portrait board
// uses the full height (no coach strip reserved, el 1.2).
// usage (repo root): node docs/plan/polish/tooling/portrait-fit.mjs
import * as THREE from 'three'
import { hudReserve } from '../../../../src/game/hudLayout.js'
import { alignedCamera, presetFor } from '../../../../src/three/cameraFit.js'

const VPS = [
  { id: 'p390', w: 390, h: 844 }, { id: 'p375', w: 375, h: 667 }, { id: 'p414', w: 414, h: 896 },
  { id: 'teams375', w: 375, h: 640 }, { id: 'p390safe', w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
]
const BASE = { el: 1.0, fov: 42, perspFit: { x: 0.97, top: 0.8, bottom: 0.93 } } // engine.js CAM_PRESETS.aligned
const B = 10.25

function measure(vp, coachVisible) {
  const preset = presetFor(BASE, { w: vp.w, h: vp.h, coachVisible })
  const { dist, lookX, lookZ } = alignedCamera({
    w: vp.w, h: vp.h, safe: vp.safe || {}, showControls: false, preset, boardHalf: B, coachVisible,
  })
  const res = hudReserve({ w: vp.w, h: vp.h, safe: vp.safe || {}, showControls: false, coachVisible })
  const el = preset.el
  const cam = new THREE.PerspectiveCamera(BASE.fov, vp.w / vp.h, 0.1, 500)
  cam.position.set(lookX, Math.sin(el) * dist, lookZ + Math.cos(el) * dist)
  cam.lookAt(lookX, 0, lookZ); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
  const P = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(cam); return [(v.x + 1) / 2 * vp.w, (1 - v.y) / 2 * vp.h] }
  const c = [P(-B, -B), P(B, -B), P(B, B), P(-B, B)]
  const top = Math.min(...c.map((p) => p[1])), bot = Math.max(...c.map((p) => p[1]))
  const padTop = res.cluster ? vp.h - res.cluster.h : vp.h
  return { el, strip: !!res.coachStrip, top: Math.round(top), bot: Math.round(bot), h: Math.round(bot - top), farW: Math.round(c[1][0] - c[0][0]), nearW: Math.round(c[2][0] - c[3][0]), gapToPad: Math.round(padTop - bot), barBottom: res.top }
}

console.log('viewport  el    coachStrip  board y (h)        far/near width  gap board->pad')
for (const vp of VPS) for (const coachVisible of [true, false]) {
  const m = measure(vp, coachVisible)
  console.log(`${vp.id.padEnd(9)} ${m.el.toFixed(2)}  ${String(m.strip).padEnd(10)}  ${m.top}..${m.bot} (${m.h})`.padEnd(48) + `${m.farW}/${m.nearW}`.padEnd(16) + `${m.gapToPad}`)
}

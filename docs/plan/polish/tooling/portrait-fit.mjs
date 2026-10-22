// Portrait board-size explorer for docs/plan/POLISH_PLAN.md (V03, carries HUD_PLAN H07).
// Tooling only — not part of the game build, not part of `npm test`.
// Calls the engine's own pure fit (hudReserve -> fitMargins -> fitAligned,
// the same chain alignedCamera() uses) and projects the board with a real
// THREE.PerspectiveCamera, for a few camera elevations and with / without
// the coach strip reserve (the coach card only shows on the first night).
// usage (repo root): node docs/plan/polish/tooling/portrait-fit.mjs
import * as THREE from 'three'
import { hudReserve, HUD } from '../../../../src/game/hudLayout.js'
import { fitMargins, fitAligned } from '../../../../src/three/cameraFit.js'

const VPS = [
  { id: 'p390', w: 390, h: 844 }, { id: 'p375', w: 375, h: 667 }, { id: 'p414', w: 414, h: 896 },
  { id: 'teams375', w: 375, h: 640 }, { id: 'p390safe', w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
]
const BASE = { fov: 42, perspFit: { x: 0.97, top: 0.8, bottom: 0.93 } } // engine.js PRESETS.aligned @ f9d1dd6
const B = 10.25

function measure(vp, el, coachStrip) {
  const res = hudReserve({ w: vp.w, h: vp.h, safe: vp.safe || {}, showControls: false })
  if (!coachStrip) delete res.coachStrip
  const margins = fitMargins(res, BASE.perspFit, HUD.fitGap)
  const { dist, lookX, lookZ } = fitAligned({ el, fov: BASE.fov, aspect: vp.w / vp.h, boardHalf: B, margins })
  const cam = new THREE.PerspectiveCamera(BASE.fov, vp.w / vp.h, 0.1, 500)
  cam.position.set(lookX, Math.sin(el) * dist, lookZ + Math.cos(el) * dist)
  cam.lookAt(lookX, 0, lookZ); cam.updateMatrixWorld(); cam.updateProjectionMatrix()
  const P = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(cam); return [(v.x + 1) / 2 * vp.w, (1 - v.y) / 2 * vp.h] }
  const c = [P(-B, -B), P(B, -B), P(B, B), P(-B, B)]
  const top = Math.min(...c.map((p) => p[1])), bot = Math.max(...c.map((p) => p[1]))
  const padTop = res.cluster ? vp.h - res.cluster.h : vp.h
  return { top: Math.round(top), bot: Math.round(bot), h: Math.round(bot - top), farW: Math.round(c[1][0] - c[0][0]), nearW: Math.round(c[2][0] - c[3][0]), gapToPad: Math.round(padTop - bot), barBottom: res.top }
}

console.log('viewport  el    coachStrip  board y (h)        far/near width  gap board->pad')
for (const vp of VPS) for (const el of [1.0, 1.1, 1.2]) for (const strip of [true, false]) {
  const m = measure(vp, el, strip)
  console.log(`${vp.id.padEnd(9)} ${el.toFixed(2)}  ${String(strip).padEnd(10)}  ${m.top}..${m.bot} (${m.h})`.padEnd(48) + `${m.farW}/${m.nearW}`.padEnd(16) + `${m.gapToPad}`)
}

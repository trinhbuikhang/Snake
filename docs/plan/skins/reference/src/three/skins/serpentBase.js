// REFERENCE PROTOTYPE — not part of src/. Port it into PR-sized tasks per docs/plan/SKINS_PERF_PLAN.md.
// Skinned serpent rig shared by every skin (PROTOTYPE, uncommitted).
//
// Body: one preallocated tube rebuilt in place each frame from the grid
// path (rounded corners, linear constant-speed motion, tapered tail with a
// round cap) — 1 draw + 1 shadow draw at any length, no per-frame allocation.
// Head: a sculpted lathe (bean-shaped bulb smooth-unioned with the neck) whose
// rear tapers into the tube, so head and body read as one creature. The face
// is placed ON the lathe surface via surf(); skins add their own features.
// Optional instanced "beads" ride the spine (1 extra draw).
import * as THREE from 'three'

const MAX_SEGMENTS = 400
const RADIAL = 20
const STEP = 0.2
const ARC_K = 6
const CORNER_R = 0.48
const CAP = 6
const HEAD_RADIAL = 40
const MAX_PTS = MAX_SEGMENTS + 2
const MAX_RINGS = MAX_PTS * (Math.ceil(1 / STEP) + ARC_K + 1) + CAP + 40
const easeOutCubic = (t) => 1 - (1 - t) ** 3
const smoothstep = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
const smax = (a, b, k) => (b < 1e-4 ? a : Math.log(Math.exp(k * a) + Math.exp(k * b)) / k)

// Patch a lit material with the serpent varyings + the skin's GLSL chunks.
// chunks: { common, color, roughness, emissive } (each optional GLSL source)
export function patchSerpentMaterial(mat, uniforms, chunks, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aBody;\nvarying vec2 vBody;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = aBody;\nvLocal = position;')
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vBody;
varying vec3 vLocal;
float sHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
}
float sTop() { return sin(vBody.x * 6.2831853); }
${chunks.common || ''}`)
    if (chunks.color) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n{\n${chunks.color}\n}`)
    if (chunks.roughness) fs = fs.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n{\n${chunks.roughness}\n}`)
    if (chunks.normal) fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n{\n${chunks.normal}\n}`)
    if (chunks.emissive) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n{\n${chunks.emissive}\n}`)
    sh.fragmentShader = fs
  }
  mat.customProgramCacheKey = () => key
}

/**
 * cfg = {
 *   bodyR, flat, tailTip, neckR,            // body profile
 *   head: { rx, ry, len, front },           // lathe bulb (front = superellipse power of the face)
 *   material,                               // lit material shared by head + body (already patched)
 *   uniforms,                               // must contain uPulse (vec4)
 *   buildFace(api),                         // add eyes / mouth / accessories using api.place()
 *   beads: { mesh, spacing, start, size:[sx,sy,sz], lift } | null,
 *   applyInk(ink), update(rigState) optional
 * }
 */
export function createSerpent(scene, cfg) {
  const R = cfg.bodyR
  const FLAT = cfg.flat ?? 0.9
  const BODY_Y = R * FLAT + 0.02
  const NECK = cfg.neckR ?? R * 0.86
  const H = cfg.head
  const HEAD_CY = H.ry + 0.02
  const ZC = 0.04 // bulb centre, ahead of the path point
  const HL = H.len / 2
  const HLR = H.rear ?? HL // rear half-length: longer = the skull flows into the neck
  const BLEND = H.blend ?? 7
  const Z_BACK = ZC - HLR - 0.06
  const disposables = []
  const track = (x) => (disposables.push(x), x)

  // ---- head lathe profile ------------------------------------------------
  function profile(z, out) {
    const t = z > ZC ? (z - ZC) / HL : (z - ZC) / HLR
    const p = t > 0 ? H.front ?? 2.4 : H.rearPow ?? 1.7
    const at = Math.min(1, Math.abs(t))
    const e = at >= 1 ? 0 : Math.pow(1 - Math.pow(at, p), 1 / p)
    const neck = NECK * 0.97 * (1 - smoothstep(ZC - 0.1, ZC + 0.5, z))
    out.rx = smax(H.rx * e, neck, BLEND)
    out.ry = smax(H.ry * e, neck * FLAT, BLEND)
    out.cy = BODY_Y + (HEAD_CY - BODY_Y) * smoothstep(Z_BACK + 0.04, ZC, z)
    return out
  }
  const pr = { rx: 0, ry: 0, cy: 0 }
  // optional sculpt: H.sculpt(nx, ny, nz) -> outward offset, in head-normalised coords
  function sculptAt(arr, o) {
    const x = arr[o], y = arr[o + 1] - HEAD_CY, z = arr[o + 2] - ZC
    const d = H.sculpt(x / H.rx, y / H.ry, z / HL)
    if (!d) return 0
    const l = Math.hypot(x, y, z) || 1
    arr[o] += (x / l) * d; arr[o + 1] += (y / l) * d; arr[o + 2] += (z / l) * d
    return d
  }
  const _sc = new Float32Array(3)
  const headGeo = (() => {
    const zs = []
    const N1 = 16, N2 = 32
    for (let i = 0; i < N1; i++) zs.push(Z_BACK + ((ZC - Z_BACK) * i) / N1)
    for (let i = 0; i <= N2; i++) zs.push(ZC + HL * Math.sin((i / N2) * Math.PI * 0.5))
    const VPR = HEAD_RADIAL + 1
    const pos = new Float32Array(zs.length * VPR * 3)
    const bod = new Float32Array(zs.length * VPR * 2)
    zs.forEach((z, r) => {
      profile(z, pr)
      for (let k = 0; k <= HEAD_RADIAL; k++) {
        const th = (k / HEAD_RADIAL) * Math.PI * 2
        const v = r * VPR + k
        pos[v * 3] = pr.rx * Math.cos(th)
        pos[v * 3 + 1] = pr.cy + pr.ry * Math.sin(th)
        pos[v * 3 + 2] = z
        if (H.sculpt) sculptAt(pos, v * 3)
        bod[v * 2] = k / HEAD_RADIAL
        bod[v * 2 + 1] = -z // continuous with the body's distance-from-head coordinate
      }
    })
    const idx = []
    for (let r = 0; r < zs.length - 1; r++) {
      for (let k = 0; k < HEAD_RADIAL; k++) {
        const a = r * VPR + k, b = a + VPR
        idx.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aBody', new THREE.BufferAttribute(bod, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    // weld the seam normals (k = 0 and k = HEAD_RADIAL share a position)
    const nrm = g.attributes.normal
    for (let r = 0; r < zs.length; r++) {
      const a = r * VPR, b = a + HEAD_RADIAL
      const x = nrm.getX(a) + nrm.getX(b), y = nrm.getY(a) + nrm.getY(b), z = nrm.getZ(a) + nrm.getZ(b)
      const l = Math.hypot(x, y, z) || 1
      nrm.setXYZ(a, x / l, y / l, z / l); nrm.setXYZ(b, x / l, y / l, z / l)
    }
    return g
  })()
  track(headGeo)

  // point + outward normal on the head surface at (z, theta)
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3()
  function surf(z, th, outP, outN) {
    profile(z, pr)
    outP.set(pr.rx * Math.cos(th), pr.cy + pr.ry * Math.sin(th), z)
    _a.set(-pr.rx * Math.sin(th), pr.ry * Math.cos(th), 0) // d/dtheta
    const dz = 0.003
    profile(Math.min(z + dz, ZC + HL - 1e-4), pr)
    _b.set(pr.rx * Math.cos(th), pr.cy + pr.ry * Math.sin(th), z + dz).sub(outP) // d/dz
    outN.crossVectors(_a, _b).normalize()
    _c.set(outP.x, outP.y - HEAD_CY, outP.z - ZC)
    if (outN.dot(_c) < 0) outN.negate()
    if (outN.lengthSq() < 0.5) outN.set(0, 0, 1)
    if (H.sculpt) { _sc[0] = outP.x; _sc[1] = outP.y; _sc[2] = outP.z; sculptAt(_sc, 0); outP.set(_sc[0], _sc[1], _sc[2]) }
  }
  // param helper: phi in [0, pi/2] walks from the bulb equator to the snout tip
  const zAt = (phi) => ZC + HL * Math.sin(phi)

  const head = new THREE.Group()
  const headMesh = new THREE.Mesh(headGeo, cfg.material)
  headMesh.castShadow = true
  head.add(headMesh)
  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _zAxis = new THREE.Vector3(0, 0, 1)
  const _q = new THREE.Quaternion(), _up = new THREE.Vector3()
  const api = {
    THREE, track, headMesh, H, ZC, HL, HEAD_CY, zAt, surf,
    // put obj on the face at (phi, theta), pushed `lift` along the normal; local +z = outward,
    // local +y kept as close to head-up as possible (so decals/eyes stay upright)
    place(obj, phi, th, lift = 0) {
      surf(zAt(phi), th, _p, _n)
      obj.position.copy(_p).addScaledVector(_n, lift)
      _q.setFromUnitVectors(_zAxis, _n)
      obj.quaternion.copy(_q)
      _up.set(0, 1, 0).applyQuaternion(_q)
      // roll so the object's up points toward world up projected on the tangent plane
      const want = new THREE.Vector3(0, 1, 0).addScaledVector(_n, -_n.y).normalize()
      const ang = Math.atan2(_up.clone().cross(want).dot(_n), _up.dot(want))
      obj.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(_n, ang))
      headMesh.add(obj)
      return obj
    },
  }
  cfg.buildFace(api)
  scene.add(head)
  const lightAnchor = new THREE.Object3D() // engine hangs its head light at group + 1.2y

  // ---- BODY tube ---------------------------------------------------------
  const VPR = RADIAL + 1
  const pos = new Float32Array(MAX_RINGS * VPR * 3)
  const nor = new Float32Array(MAX_RINGS * VPR * 3)
  const bod = new Float32Array(MAX_RINGS * VPR * 2)
  const idx = new Uint32Array((MAX_RINGS - 1) * RADIAL * 6)
  for (let r = 0, o = 0; r < MAX_RINGS - 1; r++) {
    for (let k = 0; k < RADIAL; k++) {
      const a = r * VPR + k, b = a + VPR
      idx[o++] = a; idx[o++] = a + 1; idx[o++] = b
      idx[o++] = b; idx[o++] = a + 1; idx[o++] = b + 1
    }
  }
  const geo = track(new THREE.BufferGeometry())
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)
  const norAttr = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage)
  const bodAttr = new THREE.BufferAttribute(bod, 2).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', posAttr)
  geo.setAttribute('normal', norAttr)
  geo.setAttribute('aBody', bodAttr)
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.setDrawRange(0, 0)
  const body = new THREE.Mesh(geo, cfg.material)
  body.frustumCulled = false
  body.castShadow = true
  scene.add(body)
  const cosT = new Float32Array(VPR), sinT = new Float32Array(VPR)
  for (let k = 0; k <= RADIAL; k++) {
    const th = (k / RADIAL) * Math.PI * 2
    cosT[k] = Math.cos(th); sinT[k] = Math.sin(th)
  }

  // ---- beads (instanced, optional) -----------------------------------------
  const beads = cfg.beads || null
  if (beads) {
    beads.mesh.frustumCulled = false
    beads.mesh.count = 0
    beads.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(beads.mesh)
  }

  // ---- path scratch ------------------------------------------------------
  const P = new Float32Array(MAX_PTS * 3)
  const C = new Float32Array(MAX_PTS)
  const S = new Float32Array(MAX_RINGS * 3)
  const D = new Float32Array(MAX_RINGS)
  const RX = new Float32Array(MAX_RINGS) // per-sample radius (for beads)
  const FR = new Float32Array(MAX_RINGS * 9) // per-sample frame: side, up, tangent
  const CY = new Float32Array(MAX_RINGS)
  let nS = 0
  const eatPulses = []

  function pushS(x, y, z) {
    const o = nS * 3
    if (nS > 0) {
      const l = Math.hypot(x - S[o - 3], y - S[o - 2], z - S[o - 1])
      if (l < 1e-4) return
      D[nS] = D[nS - 1] + l
    } else D[0] = 0
    S[o] = x; S[o + 1] = y; S[o + 2] = z
    nS++
  }

  function buildPath(m) {
    nS = 0
    for (let j = 0; j < m; j++) C[j] = 0
    for (let j = 1; j < m - 1; j++) {
      const ax = P[j * 3] - P[j * 3 - 3], az = P[j * 3 + 2] - P[j * 3 - 1]
      const bx = P[j * 3 + 3] - P[j * 3], bz = P[j * 3 + 5] - P[j * 3 + 2]
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz)
      if (la < 1e-4 || lb < 1e-4) continue
      if ((ax * bx + az * bz) / (la * lb) < 0.999) C[j] = Math.min(CORNER_R, la * 0.5, lb * 0.5)
    }
    pushS(P[0], P[1], P[2])
    for (let j = 0; j < m - 1; j++) {
      const ax = P[j * 3], ay = P[j * 3 + 1], az = P[j * 3 + 2]
      const bx = P[j * 3 + 3], by = P[j * 3 + 4], bz = P[j * 3 + 5]
      const L = Math.hypot(bx - ax, by - ay, bz - az)
      if (L < 1e-5) continue
      const ux = (bx - ax) / L, uy = (by - ay) / L, uz = (bz - az) / L
      const s0 = C[j], s1 = L - C[j + 1]
      const cnt = Math.max(1, Math.ceil((s1 - s0) / STEP))
      for (let k = 1; k <= cnt; k++) {
        const s = s0 + ((s1 - s0) * k) / cnt
        pushS(ax + ux * s, ay + uy * s, az + uz * s)
      }
      if (C[j + 1] > 0 && j + 2 < m) {
        const r = C[j + 1]
        const cx = P[j * 3 + 6], cy = P[j * 3 + 7], cz = P[j * 3 + 8]
        const L2 = Math.hypot(cx - bx, cy - by, cz - bz)
        const qx = bx + ((cx - bx) / L2) * r, qy = by + ((cy - by) / L2) * r, qz = bz + ((cz - bz) / L2) * r
        const px = bx - ux * r, py = by - uy * r, pz = bz - uz * r
        for (let k = 1; k <= ARC_K; k++) {
          const t = k / ARC_K, it = 1 - t
          pushS(it * it * px + 2 * it * t * bx + t * t * qx, it * it * py + 2 * it * t * by + t * t * qy, it * it * pz + 2 * it * t * bz + t * t * qz)
        }
      }
    }
    // decorative tail curl past the last point (visual only, grid logic untouched)
    const curl = cfg.tailCurl
    if (curl && nS > 1) {
      const o = (nS - 1) * 3
      let dx = S[o] - S[o - 3], dz = S[o + 2] - S[o - 1]
      const l = Math.hypot(dx, dz) || 1
      dx /= l; dz /= l
      let x = S[o], z = S[o + 2]
      const steps = Math.ceil(curl.len / (STEP * 0.5))
      const ds = curl.len / steps
      for (let k = 1; k <= steps; k++) {
        const u = k / steps
        const a = curl.turn * ds / curl.len * (0.4 + 1.2 * u) * (curl.side ?? 1) // tightens toward the tip
        const c = Math.cos(a), s = Math.sin(a)
        const nx = dx * c - dz * s, nz = dx * s + dz * c
        dx = nx; dz = nz
        x += dx * ds; z += dz * ds
        pushS(x, S[o + 1], z)
      }
    }
  }

  function radiusAt(d, total, bulge) {
    const u = d / Math.max(total, 1e-3)
    // inside the head (d < 0.6) the tube shrinks so the lathe swallows it; then neck -> body
    const inner = 0.72 + 0.28 * smoothstep(0.05, -Z_BACK, d)
    const neckToBody = NECK + (R - NECK) * smoothstep(-Z_BACK, 1.9, d)
    const tail = 1 - (1 - (cfg.tailTip ?? 0.35)) * smoothstep(0.42, 1.0, u)
    return neckToBody * inner * tail * bulge
  }

  let v = 0
  function ring(cx, cy, cz, sx, sz, ux, uy, uz, rx, d) {
    const ry = rx * FLAT
    for (let k = 0; k <= RADIAL; k++) {
      const c = cosT[k], s = sinT[k]
      const vo = v * 3
      pos[vo] = cx + sx * c * rx + ux * s * ry
      pos[vo + 1] = cy + uy * s * ry
      pos[vo + 2] = cz + sz * c * rx + uz * s * ry
      const nx = sx * c * FLAT + ux * s, ny = uy * s, nz = sz * c * FLAT + uz * s
      const nl = Math.hypot(nx, ny, nz) || 1
      nor[vo] = nx / nl; nor[vo + 1] = ny / nl; nor[vo + 2] = nz / nl
      bod[v * 2] = k / RADIAL
      bod[v * 2 + 1] = d
      v++
    }
  }

  const bob = (animT, d) => Math.sin(animT * 2.6 - d * 0.9) * 0.022

  function writeTube(animT) {
    const total = D[nS - 1]
    v = 0
    let tx = 0, ty = 0, tz = 0, sx = 0, sz = 0, ux = 0, uy = 1, uz = 0, rx = R, cy = 0
    for (let i = 0; i < nS; i++) {
      const o = i * 3
      const a = Math.max(0, i - 1), b = Math.min(nS - 1, i + 1)
      tx = S[a * 3] - S[b * 3]; ty = S[a * 3 + 1] - S[b * 3 + 1]; tz = S[a * 3 + 2] - S[b * 3 + 2]
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl; ty /= tl; tz /= tl
      sx = -tz; sz = tx
      const sl = Math.hypot(sx, sz) || 1
      sx /= sl; sz /= sl
      ux = -sz * ty; uy = sz * tx - sx * tz; uz = sx * ty
      let bulge = 1
      for (let p = 0; p < eatPulses.length; p++) {
        const dd = Math.abs(eatPulses[p].progress - D[i])
        if (dd < 1.2) bulge = Math.max(bulge, 1 + (1 - dd / 1.2) * 0.28)
      }
      rx = radiusAt(D[i], total, bulge)
      cy = S[o + 1] + bob(animT, D[i])
      RX[i] = rx; CY[i] = cy
      const f = i * 9
      FR[f] = sx; FR[f + 1] = 0; FR[f + 2] = sz
      FR[f + 3] = ux; FR[f + 4] = uy; FR[f + 5] = uz
      FR[f + 6] = tx; FR[f + 7] = ty; FR[f + 8] = tz
      ring(S[o], cy, S[o + 2], sx, sz, ux, uy, uz, rx, D[i])
    }
    const lo = (nS - 1) * 3
    for (let j = 1; j <= CAP; j++) {
      const ang = (j / CAP) * Math.PI * 0.5
      const off = rx * Math.sin(ang)
      ring(S[lo] - tx * off, cy - ty * off, S[lo + 2] - tz * off, sx, sz, ux, uy, uz, rx * Math.cos(ang), total + off)
    }
    geo.setDrawRange(0, Math.max(0, nS + CAP - 1) * RADIAL * 6)
    posAttr.clearUpdateRanges(); posAttr.addUpdateRange(0, v * 3); posAttr.needsUpdate = true
    norAttr.clearUpdateRanges(); norAttr.addUpdateRange(0, v * 3); norAttr.needsUpdate = true
    bodAttr.clearUpdateRanges(); bodAttr.addUpdateRange(0, v * 2); bodAttr.needsUpdate = true
  }

  function writeBeads() {
    const m = beads.mesh
    const arr = m.instanceMatrix.array
    const total = D[nS - 1]
    const [bx, by, bz] = beads.size
    let count = 0, i = 0
    for (let d = beads.start; d < total - (beads.end ?? 0.5) && count < m.instanceMatrix.count; d += beads.spacing) {
      while (i < nS - 2 && D[i + 1] < d) i++
      const t = Math.max(0, Math.min(1, (d - D[i]) / Math.max(D[i + 1] - D[i], 1e-5)))
      const f = i * 9
      const rx = RX[i] + (RX[i + 1] - RX[i]) * t
      const k = rx / R
      const lift = rx * FLAT * (beads.lift ?? 0.86)
      const px = S[i * 3] + (S[i * 3 + 3] - S[i * 3]) * t + FR[f + 3] * lift
      const py = CY[i] + (CY[i + 1] - CY[i]) * t + FR[f + 4] * lift
      const pz = S[i * 3 + 2] + (S[i * 3 + 5] - S[i * 3 + 2]) * t + FR[f + 5] * lift
      const o = count * 16
      arr[o] = FR[f] * bx * k; arr[o + 1] = FR[f + 1] * bx * k; arr[o + 2] = FR[f + 2] * bx * k; arr[o + 3] = 0
      arr[o + 4] = FR[f + 3] * by * k; arr[o + 5] = FR[f + 4] * by * k; arr[o + 6] = FR[f + 5] * by * k; arr[o + 7] = 0
      arr[o + 8] = -FR[f + 6] * bz * k; arr[o + 9] = -FR[f + 7] * bz * k; arr[o + 10] = -FR[f + 8] * bz * k; arr[o + 11] = 0
      arr[o + 12] = px; arr[o + 13] = py; arr[o + 14] = pz; arr[o + 15] = 1
      count++
    }
    m.count = count
    m.instanceMatrix.clearUpdateRanges()
    m.instanceMatrix.addUpdateRange(0, count * 16)
    m.instanceMatrix.needsUpdate = true
  }

  const state = { animT: 0, dt: 0, isBoosting: false, death: null, blink: 1 }
  let blinkT = 3
  const rig = {
    cur: [], prev: [], yawView: 0, yawTarget: 0, rollView: 0, flick: 0, chomp: 0, death: null,
    group: lightAnchor,
    skin: cfg.id,
    setSnapshots(prev, cur) { rig.prev = prev; rig.cur = cur },
    setInk(ink) { if (ink) cfg.applyInk?.(ink) },
    setDir(dx, dz) { rig.yawTarget = Math.atan2(dx, dz) },
    onStep() { rig.flick = 1 },
    onEat() { rig.chomp = 1.35; eatPulses.push({ progress: 0, speed: 9 }) },
    startDeath(pose, center) { rig.death = { pose, center, t: 0 } },
    advanceDeath(dt, duration, reduced) {
      if (!rig.death) return
      rig.death.t = Math.min(1, rig.death.t + (reduced ? dt / Math.max(duration / 2, 0.001) : dt / duration))
    },
    reset() { rig.death = null; rig.flick = 0; rig.chomp = 0; eatPulses.length = 0 },
    deathCoil(i) {
      const d = rig.death
      const ang = i * 0.55
      const r = 0.55 + i * 0.09
      return { x: d.center.x + Math.cos(ang) * r, z: d.center.z + Math.sin(ang) * r }
    },
    dispose() {
      scene.remove(head, body)
      if (beads) scene.remove(beads.mesh)
      const mats = new Set()
      head.traverse((o) => { if (o.geometry) disposables.push(o.geometry); if (o.material) mats.add(o.material) })
      if (beads) { disposables.push(beads.mesh.geometry); mats.add(beads.mesh.material) }
      mats.add(cfg.material)
      for (const m of mats) { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose() }
      for (const d of new Set(disposables)) d.dispose?.()
    },
    paint({ cur, prev, t, death, animT, dt, isBoosting = false }) {
      const n = cur.length
      if (!n) return
      rig.chomp = Math.max(0, rig.chomp - dt * 3.8)
      for (let p = eatPulses.length - 1; p >= 0; p--) {
        eatPulses[p].progress += dt * eatPulses[p].speed
        if (eatPulses[p].progress > n + 2) eatPulses.splice(p, 1)
      }
      const pu = cfg.uniforms.uPulse.value
      pu.set(eatPulses[0]?.progress ?? -1, eatPulses[1]?.progress ?? -1, eatPulses[2]?.progress ?? -1, eatPulses[3]?.progress ?? -1)

      const lt = Math.max(0, Math.min(1, t))
      const p0 = prev[0] || cur[0]
      let m = 0
      const put = (x, z) => { P[m * 3] = x; P[m * 3 + 1] = BODY_Y; P[m * 3 + 2] = z; m++ }
      put(p0.x + (cur[0].x - p0.x) * lt, p0.z + (cur[0].z - p0.z) * lt)
      for (let i = 1; i < n; i++) put(cur[i].x, cur[i].z)
      if (n > 1) {
        const pl = prev[Math.min(n - 1, prev.length - 1)] || cur[n - 1]
        put(pl.x + (cur[n - 1].x - pl.x) * lt, pl.z + (cur[n - 1].z - pl.z) * lt)
      } else put(cur[0].x - 0.6, cur[0].z)
      if (death) {
        const e = easeOutCubic(death.t)
        for (let i = 0; i < m; i++) {
          const dc = rig.deathCoil(i)
          P[i * 3] += (dc.x - P[i * 3]) * e
          P[i * 3 + 2] += (dc.z - P[i * 3 + 2]) * e
        }
      }
      buildPath(m)
      writeTube(animT)
      if (beads) writeBeads()

      const hx = S[0], hz = S[2]
      let k = 1
      while (k < nS - 1 && D[k] < 0.35) k++
      const yaw = Math.atan2(hx - S[k * 3], hz - S[k * 3 + 2])
      let dyaw = yaw - rig.yawView
      while (dyaw > Math.PI) dyaw -= Math.PI * 2
      while (dyaw < -Math.PI) dyaw += Math.PI * 2
      rig.yawView += dyaw * Math.min(1, dt * 20)
      rig.rollView = THREE.MathUtils.lerp(rig.rollView, -Math.max(-0.2, Math.min(0.2, dyaw * 1.4)), Math.min(1, dt * 8))
      const sq = Math.sin(rig.chomp * Math.PI) * 0.1
      headMesh.scale.set(1 + sq, 1 - sq * 0.5, 1 + sq * 0.3)
      head.position.set(hx, bob(animT, 0), hz)
      head.rotation.set(death ? -0.08 : 0, rig.yawView, rig.rollView)
      lightAnchor.position.set(hx, HEAD_CY + 0.75, hz)

      blinkT -= dt
      if (blinkT < -0.13) blinkT = 2.8 + ((animT * 7.13) % 2)
      state.animT = animT; state.dt = dt; state.isBoosting = isBoosting; state.death = death
      state.blink = death ? 0.15 : blinkT < 0 && !globalThis.__serpentNoBlink ? 0.1 : 1
      cfg.update?.(state)
    },
  }
  return rig
}

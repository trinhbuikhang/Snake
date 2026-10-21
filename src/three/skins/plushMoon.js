// Skin "plushMoon" — Plush Moon: felt plush serpent, sky-blue back,
// cream belly with segment seams, gold-embroidered stars and
// crescents, a stitch seam along the top, sleepy closed eyes with
// lashes, blush, and a raised cream muzzle. Matches the approved
// concept in docs/plan/skins/images/.
//
// The muzzle is real geometry (H.sculpt raises the lathe) and the
// shader paints it cream with the SAME gaussian weight — both sides
// read the single MUZZLE constant set below (the GLSL is generated
// from it), so the cream region can never drift off the bump.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createSerpent, patchSerpentMaterial } from './serpentBase.js'

const GOLD = 0xe2bd68
const RIM = 0xbfe3ff

// Muzzle gaussian in head-normalised coords (x/rx, y/ry, z/halfLen):
// centre (cx, cy, cz), per-axis variances (vx, vy, vz), height h.
export const MUZZLE = { h: 0.1, cx: 0, cy: -0.26, cz: 0.9, vx: 0.17, vy: 0.11, vz: 0.16 }

export function muzzleSculpt(x, y, z) {
  const dx = x - MUZZLE.cx
  const dy = y - MUZZLE.cy
  const dz = z - MUZZLE.cz
  return MUZZLE.h * Math.exp(-((dx * dx) / MUZZLE.vx + (dy * dy) / MUZZLE.vy + (dz * dz) / MUZZLE.vz))
}

// GLSL float literal (integers need a decimal point).
const glf = (n) => (Number.isInteger(n) ? `${n}.0` : `${n}`)

export function createPlushMoonRig(scene) {
  const uniforms = {
    uBlue: { value: new THREE.Color(0x78b2e6) },
    uCream: { value: new THREE.Color(0xf7f0e2) },
    uGoldC: { value: new THREE.Color(GOLD) },
    uThread: { value: new THREE.Color(0x6f8fb0) },
    uBlush: { value: new THREE.Color(0xf4a0b4) },
    uCheek: { value: new THREE.Vector3() },
    uHeadCy: { value: 0.5 },
    uRim: { value: new THREE.Color(RIM) },
    uRimK: { value: 0.18 },
    uGoldGlow: { value: 0.22 },
    uPulse: { value: new THREE.Vector4(-1, -1, -1, -1) },
    uGold: { value: new THREE.Color(0xffd98a) },
    uHeadR: { value: new THREE.Vector3(1, 1, 1) }, // rx, ry, half-length (muzzle mask)
    uHeadC: { value: new THREE.Vector2(0.5, 0.04) }, // head centre y, z
    uFuzz: { value: 0.3 },
  }
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0,
    sheen: 1, sheenColor: new THREE.Color(0xd8ecff), sheenRoughness: 0.82,
  })
  patchSerpentMaterial(material, uniforms, {
    common: `uniform vec3 uBlue; uniform vec3 uCream; uniform vec3 uGoldC; uniform vec3 uThread; uniform vec3 uBlush;
uniform vec3 uCheek; uniform float uHeadCy; uniform vec3 uRim; uniform float uRimK; uniform float uGoldGlow;
uniform vec4 uPulse; uniform vec3 uGold; uniform vec3 uHeadR; uniform vec2 uHeadC; uniform float uFuzz;
float gGold = 0.0; float gThread = 0.0;
// raised cream muzzle (same gaussian as the JS sculpt, in head-normalised coords)
float muzzleW(vec3 p) {
  vec3 q = vec3(p.x / uHeadR.x, (p.y - uHeadC.x) / uHeadR.y, (p.z - uHeadC.y) / uHeadR.z);
  vec3 d = q - vec3(${glf(MUZZLE.cx)}, ${glf(MUZZLE.cy)}, ${glf(MUZZLE.cz)});
  return exp(-(d.x * d.x / ${glf(MUZZLE.vx)} + d.y * d.y / ${glf(MUZZLE.vy)} + d.z * d.z / ${glf(MUZZLE.vz)}));
}
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// gold embroidery coverage (stars + crescent moons) on the back/flanks
float plushGold() {
  if (vBody.y < 0.9) return 0.0;
  float top = sTop();
  float region = smoothstep(-0.15, 0.1, top);
  float circ = 2.7; // ~ body circumference in cells
  vec2 g = vec2(vBody.x * 11.0, vBody.y * 1.9);
  vec2 cell = floor(g);
  float h = sHash(cell);
  vec2 jit = vec2(sHash(cell + 7.1), sHash(cell + 3.3)) - 0.5;
  vec2 f = fract(g) - 0.5 - jit * 0.35;
  f.y *= (circ / 11.0) > 0.0 ? (1.0 / 1.9) / (circ / 11.0) : 1.0;
  float sz = 0.3 + 0.14 * sHash(cell + 1.7);
  float star = (1.0 - smoothstep(-0.01, 0.02, sdStar5(f, sz, 0.48))) * step(0.5, h);
  // tiny embroidered sparkle dots between the stars
  vec2 g2 = vec2(vBody.x * 26.0, vBody.y * 4.6);
  vec2 c2 = floor(g2);
  vec2 f2 = (fract(g2) - 0.5 - (vec2(sHash(c2 + 2.3), sHash(c2 + 5.9)) - 0.5) * 0.5) * vec2(1.0, 2.09);
  float dotS = (1.0 - smoothstep(0.1, 0.16, length(f2))) * step(0.72, sHash(c2));
  star = max(star, dotS);
  // crescent every 3 cells, on alternating flanks
  float k = floor((vBody.y + 1.2) / 3.0);
  float dd = mod(vBody.y + 1.2, 3.0) - 1.5;
  float side = mod(k, 2.0) < 1.0 ? 0.1 : 0.4;
  vec2 p = vec2((vBody.x - side) * circ, dd);
  float moon = (1.0 - smoothstep(0.3, 0.315, length(p))) * smoothstep(0.235, 0.25, length(p - vec2(0.13, 0.09)));
  return max(star, moon) * region;
}`,
    color: `
  float top = sTop();
  // on the head the cream belly drops under the chin so the muzzle shape reads
  float hb = smoothstep(0.1, 0.7, vBody.y);
  float belly = 1.0 - smoothstep(mix(-0.62, -0.22, hb), mix(-0.4, 0.0, hb), top);
  float seg = smoothstep(0.44, 0.5, abs(fract(vBody.y * 2.8) - 0.5)) * step(0.6, vBody.y);
  float muzzle = 0.0;
  if (vBody.y < 0.0) muzzle = smoothstep(0.16, 0.28, muzzleW(vLocal));
  vec3 col = mix(uBlue, uCream * mix(1.0, 0.84, seg * belly), max(belly, muzzle));
  float n = sNoise(vec2(vBody.x * 120.0, vBody.y * 44.0)) * 0.55 + sNoise(vec2(vBody.x * 300.0, vBody.y * 110.0)) * 0.45;
  col *= 0.95 + 0.08 * n;
  float seam = (1.0 - smoothstep(0.0022, 0.0055, abs(vBody.x - 0.25))) * step(0.42, fract(vBody.y * 8.0)) * (1.0 - belly);
  if (vBody.y < 0.0) seam *= 1.0 - smoothstep(0.18, 0.3, vLocal.z); // stops at the forehead
  col = mix(col, uThread, seam * 0.85);
  gGold = plushGold();
  // satin-stitch threads: fine diagonal ridges inside the embroidery
  gThread = 0.5 + 0.5 * sin(vBody.x * 1300.0 + vBody.y * 200.0);
  col = mix(col, uGoldC * (0.86 + 0.2 * gThread), gGold);
  if (vBody.y < 0.0) {
    vec3 q = vec3(abs(vLocal.x), vLocal.y, vLocal.z) - uCheek;
    col = mix(col, uBlush, (1.0 - smoothstep(0.045, 0.07, length(q))) * 0.85);
  }
  diffuseColor.rgb *= col;`,
    roughness: `
  roughnessFactor = mix(roughnessFactor, 0.3 + 0.2 * gThread, gGold);
  metalnessFactor = mix(metalnessFactor, 0.85, gGold);`,
    normal: `
  // embroidery relief: bump the normal with the screen-space gradient of the thread height
  float hgt = gGold * (0.014 + 0.004 * gThread);
  vec2 dH = vec2(dFdx(hgt), dFdy(hgt));
  vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
  vec3 r1 = cross(sY, normal), r2 = cross(normal, sX);
  float det = dot(sX, r1) * faceDirection;
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  normal = normalize(abs(det) * normal - grad);`,
    emissive: `
  float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += uRim * pow(1.0 - ndv, 2.0) * uRimK;
  totalEmissiveRadiance += uGoldC * gGold * uGoldGlow;
  // felt fuzz: broken, noisy halo on the silhouette
  float fz = sNoise(vec2(vBody.x * 160.0, vBody.y * 60.0));
  totalEmissiveRadiance += mix(uBlue, vec3(1.0), 0.55) * pow(1.0 - ndv, 3.0) * (0.45 + 0.55 * fz) * uFuzz * (1.0 - gGold);
  for (int i = 0; i < 4; i++) { float p = uPulse[i]; if (p > 0.0) totalEmissiveRadiance += uGold * exp(-pow((vBody.y - p) * 2.0, 2.0)) * 0.5; }`,
  }, 'skin-plushMoon')

  const lashMat = new THREE.MeshBasicMaterial({ color: 0x2b2230 })
  const EYE = { phi: 1.13, th: 0.48 }

  return createSerpent(scene, {
    id: 'plushMoon',
    bodyR: 0.44, flat: 0.9, tailTip: 0.42, neckR: 0.44,
    head: {
      rx: 0.8, ry: 0.68, len: 1.42, rear: 0.92, rearPow: 1.6, blend: 6, front: 2.0,
      sculpt: muzzleSculpt,
    },
    material, uniforms,
    buildFace(api) {
      uniforms.uHeadCy.value = api.HEAD_CY
      uniforms.uHeadR.value.set(api.H.rx, api.H.ry, api.HL)
      uniforms.uHeadC.value.set(api.HEAD_CY, api.ZC)
      // The face is built part by part and placed on the lathe as
      // before, then MERGED into one mesh per material (S03 review:
      // 13 loose face meshes cost +7 draw calls; the plan allows +2).
      // Each part's head-space matrix is baked into a cloned geometry,
      // so the merged meshes sit exactly where the parts were — and,
      // as children of the head mesh, they follow every head motion.
      const placed = []
      // eyelid bumps (felt) + closed sleepy lash line
      const bumpGeo = new THREE.SphereGeometry(1, 24, 16)
      const arc = new THREE.TorusGeometry(0.08, 0.011, 6, 22, Math.PI)
      const lashGeo = new THREE.CylinderGeometry(0.006, 0.004, 0.045, 5)
      for (const s of [1, -1]) {
        const g = new THREE.Group()
        const bump = new THREE.Mesh(bumpGeo, material)
        bump.scale.set(0.15, 0.13, 0.06)
        g.add(bump)
        const line = new THREE.Mesh(arc, lashMat)
        line.rotation.z = Math.PI
        line.position.set(0, 0.025, 0.051)
        g.add(line)
        for (const a of [0.12, 0.42, 0.72]) {
          const l = new THREE.Mesh(lashGeo, lashMat)
          const cx = Math.cos(a) * 0.08 * s, cy = 0.025 - Math.sin(a) * 0.08
          l.position.set(cx + Math.cos(a) * 0.02 * s, cy - Math.sin(a) * 0.02, 0.05)
          l.rotation.z = s > 0 ? Math.PI / 2 + a : -(Math.PI / 2 + a)
          g.add(l)
        }
        g.scale.setScalar(1.3)
        api.place(g, EYE.phi, s > 0 ? EYE.th : Math.PI - EYE.th, -0.026)
        placed.push(g)
      }
      const p = new THREE.Vector3(), n = new THREE.Vector3()
      api.surf(api.zAt(1.0), -0.12, p, n)
      uniforms.uCheek.value.set(Math.abs(p.x), p.y, p.z)
      // tiny nostrils + small smile
      const dot = new THREE.SphereGeometry(0.017, 8, 6)
      for (const th of [-0.42, Math.PI + 0.42]) {
        const g = new THREE.Group(); g.add(new THREE.Mesh(dot, lashMat))
        api.place(g, 1.38, th, -0.004)
        placed.push(g)
      }
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x6a5060 }))
      smile.rotation.z = Math.PI
      const sg = new THREE.Group(); sg.add(smile)
      api.place(sg, 1.33, -Math.PI / 2, -0.001)
      placed.push(sg)

      // ---- merge the placed parts, one mesh per material ----------
      const headMesh = api.headMesh
      headMesh.updateWorldMatrix(true, true)
      const inv = new THREE.Matrix4().copy(headMesh.matrixWorld).invert()
      const skinGeos = [] // eyelid bumps (skin material)
      const lashGeos = [] // lash lines, lashes, nostrils, mouth (basic dark)
      const srcGeos = new Set()
      const srcMats = new Set()
      for (const g of placed) {
        g.traverse((o) => {
          if (!o.isMesh) return
          srcGeos.add(o.geometry)
          const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)
          const geo = o.geometry.clone().applyMatrix4(rel)
          if (o.material === material) {
            skinGeos.push(geo)
          } else {
            // one merged basic material for all dark parts; each
            // part's own tint survives as a vertex colour
            srcMats.add(o.material)
            const tint = new THREE.Color(o.material.color)
            const count = geo.attributes.position.count
            const colors = new Float32Array(count * 3)
            for (let i = 0; i < count; i += 1) {
              colors[i * 3] = tint.r
              colors[i * 3 + 1] = tint.g
              colors[i * 3 + 2] = tint.b
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
            lashGeos.push(geo)
          }
        })
      }
      for (const g of placed) g.removeFromParent()
      for (const geo of srcGeos) geo.dispose()
      for (const m of srcMats) m.dispose()
      if (skinGeos.length) {
        headMesh.add(new THREE.Mesh(mergeGeometries(skinGeos), material))
        skinGeos.forEach((g) => g.dispose())
      }
      if (lashGeos.length) {
        headMesh.add(new THREE.Mesh(mergeGeometries(lashGeos), new THREE.MeshBasicMaterial({ vertexColors: true })))
        lashGeos.forEach((g) => g.dispose())
      }
    },
    applyInk(ink) {
      uniforms.uGoldC.value.set(GOLD)
      uniforms.uRim.value.set(RIM)
      if (ink.id !== 'jade') {
        uniforms.uGoldC.value.lerp(new THREE.Color(ink.ridge), 0.45)
        uniforms.uRim.value.lerp(new THREE.Color(ink.emissive), 0.5)
      }
    },
    update(st) {
      uniforms.uRimK.value = st.isBoosting ? 0.45 : 0.18
    },
  })
}

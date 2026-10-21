// REFERENCE PROTOTYPE — not part of src/. Port it into PR-sized tasks per docs/plan/SKINS_PERF_PLAN.md.
// Skin "moonJade" — Ngọc trăng: pearly white-jade vinyl-toy serpent, mint
// belly band, iridescent moonstone beads along the spine, big teal eyes,
// soft blush, gentle smile, a cherry-blossom petal on the head.
import * as THREE from 'three'
import { createSerpent, patchSerpentMaterial } from './serpentBase.js'

const BASE = 0xeaf2ec
const MINT = 0xa9dfc6
const RIM = 0xd9c8ff
const BEAD_GLOW = 0x8a6fb0

function eyeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#0e2a2d'
  g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill()
  const ir = g.createRadialGradient(128, 160, 10, 128, 140, 118)
  ir.addColorStop(0, '#a6f2e2'); ir.addColorStop(0.45, '#33b5aa'); ir.addColorStop(0.85, '#11666b'); ir.addColorStop(1, '#0b4247')
  g.fillStyle = ir
  g.beginPath(); g.arc(128, 132, 114, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#061312'
  g.beginPath(); g.arc(128, 126, 76, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(255,255,255,0.97)'
  g.beginPath(); g.ellipse(86, 84, 34, 30, -0.4, 0, Math.PI * 2); g.fill()
  g.beginPath(); g.arc(170, 176, 13, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(255,255,255,0.7)'
  g.beginPath(); g.arc(150, 70, 7, 0, Math.PI * 2); g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export function createMoonJadeRig(scene) {
  const uniforms = {
    uBase: { value: new THREE.Color(BASE) },
    uMint: { value: new THREE.Color(MINT) },
    uBlush: { value: new THREE.Color(0xf7a6b8) },
    uCheek: { value: new THREE.Vector3() },
    uRim: { value: new THREE.Color(RIM) },
    uRimK: { value: 0.22 },
    uPulse: { value: new THREE.Vector4(-1, -1, -1, -1) },
    uGold: { value: new THREE.Color(0xffd98a) },
    uGlowA: { value: new THREE.Color(0x9fe8cf) }, // inner scatter: mint ...
    uGlowB: { value: new THREE.Color(0xc9b8f2) }, // ... to lilac
    uGlowK: { value: 0.42 },
  }
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    sheen: 0.55, sheenColor: new THREE.Color(0xd6f7ea), sheenRoughness: 0.45,
    iridescence: 0.3, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 420],
  })
  patchSerpentMaterial(material, uniforms, {
    common: 'uniform vec3 uBase; uniform vec3 uMint; uniform vec3 uBlush; uniform vec3 uCheek; uniform vec3 uRim; uniform float uRimK; uniform vec4 uPulse; uniform vec3 uGold; uniform vec3 uGlowA; uniform vec3 uGlowB; uniform float uGlowK;',
    color: `
  float top = sTop();
  float belly = (1.0 - smoothstep(-0.3, -0.02, top)) * smoothstep(0.3, 0.75, vBody.y);
  // belly scutes: soft transverse grooves, a little deeper mint
  float seg = smoothstep(0.36, 0.5, abs(fract(vBody.y * 3.2) - 0.5));
  // milky internal gradient: faint mint low on the flank, faint lilac high up
  vec3 col = uBase * mix(vec3(0.95, 1.0, 0.97), vec3(1.0, 0.985, 1.02), smoothstep(-0.3, 0.9, top));
  col = mix(col, uMint * mix(1.0, 0.8, seg), belly * 0.95);
  col *= 0.86; // leave room for the scatter glow so bloom doesn't clip it to white
  if (vBody.y < 0.0) {
    vec3 q = vec3(abs(vLocal.x), vLocal.y, vLocal.z) - uCheek;
    col = mix(col, uBlush, exp(-dot(q, q) / 0.007) * 0.9);
  }
  diffuseColor.rgb *= col;`,
    emissive: `
  float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
  totalEmissiveRadiance += uRim * pow(1.0 - ndv, 2.4) * uRimK;
  // fake subsurface: light that soaked in glows out of the shaded side and
  // the thick core (inverted fresnel), mint low -> lilac high, like lit jade
  float topG = sTop();
  vec3 glowC = mix(uGlowA, uGlowB, smoothstep(-0.4, 0.9, topG));
  float scatter = 0.55;
  #if NUM_DIR_LIGHTS > 0
    float nl = dot(normal, directionalLights[0].direction);
    scatter = 0.35 + 0.65 * smoothstep(0.45, -0.55, nl); // wrap: strongest where direct light falls off
  #endif
  float core = 0.45 + 0.55 * pow(ndv, 1.5);
  totalEmissiveRadiance += glowC * uGlowK * scatter * core;
  // pearly glitter: sparse flecks that twinkle as the view changes
  vec2 gc = floor(vec2(vBody.x * 170.0, vBody.y * 62.0));
  float gh = sHash(gc);
  float tw = 0.5 + 0.5 * sin(dot(vViewPosition, vec3(2.3, 1.7, 2.9)) + gh * 40.0);
  totalEmissiveRadiance += vec3(1.0, 0.94, 1.0) * step(0.975, gh) * tw * tw * 0.55 * (0.4 + 0.6 * ndv) * smoothstep(0.0, 0.25, vBody.y); // none on the face
  for (int i = 0; i < 4; i++) { float p = uPulse[i]; if (p > 0.0) totalEmissiveRadiance += uGold * exp(-pow((vBody.y - p) * 2.0, 2.0)) * 0.5; }`,
  }, 'skin-moonJade')

  const eyeTex = eyeTexture()
  const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTex, emissiveMap: eyeTex, emissive: 0xffffff, emissiveIntensity: 0.16, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 })
  const CAP = 0.95
  const capGeo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, CAP).rotateX(Math.PI / 2)
  {
    const p = capGeo.attributes.position, uv = capGeo.attributes.uv, s = Math.sin(CAP)
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * s), 0.5 + p.getY(i) / (2 * s))
  }
  const eyes = []
  const ER = 0.17
  const EYE = { phi: 1.17, th: 0.36 }

  const beadMat = new THREE.MeshPhysicalMaterial({
    color: 0xe4d6fb, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03,
    iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [240, 720],
    sheen: 0.6, sheenColor: new THREE.Color(0xffc9e8),
  })
  // moonstone: a soft inner glow whose hue drifts pink -> lilac -> blue with view angle
  const beadU = { uBeadTint: { value: new THREE.Color(BEAD_GLOW) }, uBeadK: { value: 0.4 } }
  beadMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, beadU)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBeadTint; uniform float uBeadK;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
    float h = 1.0 - ndv;
    vec3 shift = mix(vec3(1.0, 0.72, 0.9), vec3(0.78, 0.7, 1.0), smoothstep(0.0, 0.55, h));
    shift = mix(shift, vec3(0.62, 0.82, 1.0), smoothstep(0.5, 1.0, h));
    totalEmissiveRadiance += mix(shift, uBeadTint * 2.0, 0.4) * uBeadK * (0.35 + 0.65 * pow(ndv, 0.7));
    // milky translucent core + moonstone glitter
    totalEmissiveRadiance += vec3(1.0, 0.95, 1.0) * pow(ndv, 3.0) * 0.18;
    vec3 gn = floor(normalize(normal) * 22.0);
    float gh = fract(sin(dot(gn, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    totalEmissiveRadiance += vec3(1.0, 0.9, 1.0) * step(0.93, gh) * 0.6;
  }`)
  }
  beadMat.customProgramCacheKey = () => 'skin-moonJade-bead'
  const beadMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 12), beadMat, 720)

  return createSerpent(scene, {
    id: 'moonJade',
    bodyR: 0.42, flat: 0.9, tailTip: 0.34, neckR: 0.42,
    head: { rx: 0.66, ry: 0.53, len: 1.12, rear: 0.86, rearPow: 1.6, blend: 6, front: 2.4 },
    material, uniforms,
    beads: { mesh: beadMesh, spacing: 0.5, start: 0.95, end: 1.7, size: [0.27, 0.17, 0.24], lift: 0.86 },
    tailCurl: { len: 0.85, turn: 2.5, side: 1 },
    buildFace(api) {
      for (const s of [1, -1]) {
        const eye = new THREE.Mesh(capGeo, eyeMat)
        eye.scale.set(ER, ER * 1.06, ER * 0.55)
        const g = new THREE.Group()
        g.add(eye)
        eye.position.z = -(Math.cos(CAP) * 0.55 * ER + 0.018)
        api.place(g, EYE.phi, s > 0 ? EYE.th : Math.PI - EYE.th)
        eyes.push(g)
      }
      // cheek (blush) centre in head space, below/outside the eye
      const p = new THREE.Vector3(), n = new THREE.Vector3()
      api.surf(api.zAt(1.02), -0.2, p, n)
      uniforms.uCheek.value.set(Math.abs(p.x), p.y, p.z)
      // gentle closed smile
      const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 6, 18, Math.PI), new THREE.MeshBasicMaterial({ color: 0x6e4452 }))
      smile.rotation.z = Math.PI
      const sg = new THREE.Group(); sg.add(smile)
      api.place(sg, 1.43, -Math.PI / 2, -0.002)
      // cherry-blossom petal
      // cherry-blossom petal: teardrop outline with a notch at the tip, gently cupped
      const ps = new THREE.Shape()
      ps.moveTo(-1, 0)
      ps.bezierCurveTo(-0.7, 0.62, 0.35, 0.66, 0.86, 0.2)
      ps.lineTo(0.7, 0)
      ps.lineTo(0.86, -0.2)
      ps.bezierCurveTo(0.35, -0.66, -0.7, -0.62, -1, 0)
      const petalGeo = new THREE.ShapeGeometry(ps, 10)
      { const a = petalGeo.attributes.position; for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i); a.setZ(i, 0.18 * (x * x * 0.3 + y * y)) } }
      petalGeo.computeVertexNormals()
      const petal = new THREE.Mesh(petalGeo, new THREE.MeshPhysicalMaterial({ color: 0xf28aad, roughness: 0.4, sheen: 0.6, sheenColor: new THREE.Color(0xffe0ea), emissive: 0x6a1a34, emissiveIntensity: 0.35, side: THREE.DoubleSide }))
      petal.scale.set(0.15, 0.15, 0.15)
      petal.rotation.z = 0.35
      const pg = new THREE.Group(); pg.add(petal)
      api.place(pg, 0.72, Math.PI / 2 - 0.42, 0.014)
    },
    applyInk(ink) {
      const def = ink.id === 'jade'
      uniforms.uRim.value.set(RIM)
      beadU.uBeadTint.value.set(BEAD_GLOW)
      if (!def) {
        uniforms.uRim.value.lerp(new THREE.Color(ink.emissive), 0.55)
        beadU.uBeadTint.value.lerp(new THREE.Color(ink.emissive), 0.6)
      }
    },
    update(st) {
      for (const e of eyes) e.scale.y = st.blink
      uniforms.uRimK.value = st.isBoosting ? 0.5 : 0.22
    },
  })
}

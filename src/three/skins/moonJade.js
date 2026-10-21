// Skin "moonJade" — Moon Jade (S01: minimal placeholder).
//
// Same silhouette the approved concept uses (pearly white-jade body,
// lathe head flowing into the tube, decorative tail curl) with a
// plain material and a simple face for now. S02 replaces the
// material with the full patched jade shader (belly band, rim light,
// subsurface glow, glitter), adds the moonstone beads and the
// detailed face — the geometry profile below does not change.
import * as THREE from 'three'
import { createSerpent } from './serpentBase.js'

const BASE = 0xeaf2ec

export function createMoonJadeRig(scene) {
  const uniforms = {
    uPulse: { value: new THREE.Vector4(-1, -1, -1, -1) },
  }
  const material = new THREE.MeshPhysicalMaterial({
    color: BASE,
    roughness: 0.34,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    sheen: 0.55,
    sheenColor: new THREE.Color(0xd6f7ea),
    sheenRoughness: 0.45,
    emissive: new THREE.Color(0xd47585), // jade ink's glow, as the old rig
    emissiveIntensity: 0.12,
  })
  const eyes = []
  return createSerpent(scene, {
    id: 'moonJade',
    bodyR: 0.42,
    flat: 0.9,
    tailTip: 0.34,
    neckR: 0.42,
    head: { rx: 0.66, ry: 0.53, len: 1.12, rear: 0.86, rearPow: 1.6, blend: 6, front: 2.4 },
    material,
    uniforms,
    beads: null, // moonstone beads arrive with the full skin in S02
    tailCurl: { len: 0.85, turn: 2.5, side: 1 },
    buildFace(api) {
      const eyeMat = new THREE.MeshPhysicalMaterial({
        color: 0x0e2a2d,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
      })
      const eyeGeo = new THREE.SphereGeometry(1, 24, 16)
      for (const s of [1, -1]) {
        const eye = new THREE.Mesh(eyeGeo, eyeMat)
        eye.scale.set(0.17, 0.18, 0.09)
        const g = new THREE.Group()
        g.add(eye)
        api.place(g, 1.17, s > 0 ? 0.36 : Math.PI - 0.36)
        eyes.push(g)
      }
      // gentle closed smile
      const smile = new THREE.Mesh(
        new THREE.TorusGeometry(0.055, 0.01, 6, 18, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x6e4452 }),
      )
      smile.rotation.z = Math.PI
      const sg = new THREE.Group()
      sg.add(smile)
      api.place(sg, 1.43, -Math.PI / 2, -0.002)
    },
    applyInk(ink) {
      // Ink tints the serpent's glow. Unlike the pearl rig — whose
      // segments cloned the material, so setInk never reached the
      // body — head and tube share this one material, so the tint
      // lands on the whole serpent (the S01 ink fix).
      material.emissive.set(ink.emissive)
    },
    update(st) {
      for (const e of eyes) e.scale.y = st.blink
    },
  })
}

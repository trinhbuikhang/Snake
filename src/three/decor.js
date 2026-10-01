// P4 "The Garden Remembers": purchasable 3D decorations for the pond.
// Built once at max counts; the store's garden tiers only toggle visibility,
// so buying something can never break the scene — worst case it stays
// hidden. No lights are added (emissive + sprites only) to protect perf.

import * as THREE from 'three'

const MAX_LANTERNS = 16
const MAX_BLOOMS = 9

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32)
  g.addColorStop(0, 'rgba(255, 214, 120, 0.85)')
  g.addColorStop(0.4, 'rgba(255, 170, 80, 0.28)')
  g.addColorStop(1, 'rgba(255, 160, 60, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeLantern(tex) {
  const group = new THREE.Group()
  // Dark wooden post
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 0.95, 8),
    new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9 }),
  )
  post.position.y = 0.48
  group.add(post)
  // Paper globe — warm emissive so it reads at night
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 16, 12),
    new THREE.MeshStandardMaterial({
      color: 0xffd9a0,
      emissive: 0xff9d45,
      emissiveIntensity: 1.6,
      roughness: 0.6,
    }),
  )
  globe.position.y = 1.12
  group.add(globe)
  // Soft halo sprite
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.75 }),
  )
  halo.scale.setScalar(1.5)
  halo.position.y = 1.12
  group.add(halo)
  return group
}

function makeBloom() {
  // A small glowing lotus: pink petal cones around a bright core.
  const group = new THREE.Group()
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0xff7fb0,
    emissive: 0xff2b75,
    emissiveIntensity: 0.9,
    roughness: 0.55,
  })
  for (let i = 0; i < 6; i++) {
    const petal = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), petalMat)
    const a = (i / 6) * Math.PI * 2
    petal.position.set(Math.cos(a) * 0.13, 0.09, Math.sin(a) * 0.13)
    petal.rotation.set(0.5, 0, -0.5)
    petal.rotation.y = -a
    group.add(petal)
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xfff3c4, emissive: 0xffd54f, emissiveIntensity: 2.2,
    }),
  )
  core.position.y = 0.12
  group.add(core)
  return group
}

export function buildDecor(scene) {
  const tex = glowTexture()

  // Lanterns ring the pond just outside the water (pond is ~20.4 wide).
  const lanterns = []
  for (let i = 0; i < MAX_LANTERNS; i++) {
    const a = (i / MAX_LANTERNS) * Math.PI * 2 + 0.2
    const r = 11.6 + (i % 2) * 0.5
    const l = makeLantern(tex)
    l.position.set(Math.cos(a) * r, -0.8, Math.sin(a) * r)
    l.visible = false
    scene.add(l)
    lanterns.push(l)
  }

  // Blooms drift near the existing lotus pads.
  const padSpots = [
    [7.2, 7.0], [-7.5, 7.3], [7.8, -6.8], [-7.1, -7.7], [-9.1, -1.8], [0.8, -9.4],
    [6.4, 7.6], [-6.6, -7.0], [8.5, -6.0],
  ]
  const blooms = []
  padSpots.slice(0, MAX_BLOOMS).forEach(([x, z], i) => {
    const b = makeBloom()
    b.position.set(x, 0.05, z)
    b.rotation.y = i * 1.7
    b.visible = false
    scene.add(b)
    blooms.push(b)
  })

  return {
    setLanternCount(n) {
      lanterns.forEach((l, i) => { l.visible = i < n })
    },
    setBloomCount(n) {
      blooms.forEach((b, i) => { b.visible = i < n })
    },
    update(t) {
      // Gentle bob for visible blooms — barely-there life.
      for (let i = 0; i < blooms.length; i++) {
        const b = blooms[i]
        if (!b.visible) continue
        b.position.y = 0.05 + Math.sin(t * 1.3 + i * 2.1) * 0.03
      }
    },
  }
}

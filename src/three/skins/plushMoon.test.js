import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createPlushMoonRig, MUZZLE, muzzleSculpt } from './plushMoon.js'
import { createMoonJadeRig } from './moonJade.js'
import { createSnakeRig } from '../snakeRig.js'

// S03 acceptance (headless parts): the muzzle sculpt is a gaussian
// that is 0 far from the muzzle and maximal at its centre, and the
// rig builds a very big round head with no bead instancing. The
// shader's muzzle mask is generated from the same MUZZLE constants
// (see plushMoon.js), so colour and geometry share one formula.
describe('muzzle sculpt (shared MUZZLE constants)', () => {
  it('is maximal at the muzzle centre and ~0 far away', () => {
    expect(muzzleSculpt(MUZZLE.cx, MUZZLE.cy, MUZZLE.cz)).toBeCloseTo(MUZZLE.h, 10)
    expect(muzzleSculpt(MUZZLE.cx, MUZZLE.cy, MUZZLE.cz)).toBeGreaterThan(0)
    expect(muzzleSculpt(2, 2, -2)).toBeLessThan(1e-6)
    expect(muzzleSculpt(-1.5, 1.2, 0)).toBeLessThan(1e-4)
  })

  it('falls off smoothly between centre and far field', () => {
    const near = muzzleSculpt(MUZZLE.cx + 0.2, MUZZLE.cy, MUZZLE.cz)
    const mid = muzzleSculpt(MUZZLE.cx + 0.45, MUZZLE.cy, MUZZLE.cz)
    expect(near).toBeLessThan(MUZZLE.h)
    expect(mid).toBeLessThan(near)
    expect(mid).toBeGreaterThan(0)
  })
})

function serpentine(n) {
  const cells = []
  const rows = Math.ceil(n / 20)
  for (let row = 0; row < rows && cells.length < n; row += 1) {
    const xs = [...Array(20).keys()]
    if (row % 2) xs.reverse()
    for (const x of xs) {
      if (cells.length < n) cells.push({ x, z: row })
    }
  }
  return cells
}

describe('Plush Moon skin (S03)', () => {
  it('builds a rig with a ~1.8x round head and no instanced beads', () => {
    const scene = new THREE.Scene()
    const rig = createPlushMoonRig(scene)
    expect(rig.skin).toBe('plushMoon')
    expect(scene.children.find((o) => o.isInstancedMesh)).toBeUndefined()

    let headSpan = 0
    scene.traverse((o) => {
      if (o.isMesh && o.geometry.attributes.aBody && o.geometry.attributes.position.usage !== THREE.DynamicDrawUsage) {
        o.geometry.computeBoundingBox()
        const bb = o.geometry.boundingBox
        headSpan = Math.max(headSpan, bb.max.x - bb.min.x)
      }
    })
    expect(headSpan).toBeGreaterThan(1.5) // ~2 * rx (0.8)
    expect(headSpan / (0.44 * 2)).toBeGreaterThan(1.7) // vs body diameter
    rig.dispose()
    expect(scene.children.length).toBe(0)
  })

  // S03 review fix: the face parts are merged into one mesh per
  // material, so the whole rig stays within Moon Jade + 2 meshes
  // (the draw-call budget). Loose face parts were 15 meshes total.
  it('merges the face into one mesh per material (mesh budget)', () => {
    const countMeshes = (scene) => {
      let n = 0
      scene.traverse((o) => { if (o.isMesh) n += 1 })
      return n
    }
    const plushScene = new THREE.Scene()
    const plush = createPlushMoonRig(plushScene)
    const jadeScene = new THREE.Scene()
    const jade = createMoonJadeRig(jadeScene)
    const plushCount = countMeshes(plushScene)
    const jadeCount = countMeshes(jadeScene)
    expect(plushCount).toBeLessThanOrEqual(jadeCount + 2)
    // body tube + head + merged felt bumps + merged dark face parts
    expect(plushCount).toBe(4)
    plush.dispose()
    jade.dispose()
    expect(plushScene.children.length).toBe(0)
  })

  it('is reachable through the dispatcher by skin id', () => {
    const rig = createSnakeRig(new THREE.Scene(), 'plushMoon')
    expect(rig.skin).toBe('plushMoon')
    rig.dispose()
  })

  it('paints a 400-cell snake and applies ink without errors', () => {
    const scene = new THREE.Scene()
    const rig = createPlushMoonRig(scene)
    const cells = serpentine(400)
    rig.setSnapshots(cells, cells)
    expect(() => {
      rig.paint({ cur: cells, prev: cells, t: 1, death: null, animT: 0, dt: 0.016 })
      rig.setInk({ id: 'abyss', emissive: 0x3b5bff, ridge: 0x9ecbff })
      rig.paint({ cur: cells, prev: cells, t: 0.5, death: null, animT: 0.1, dt: 0.016, isBoosting: true })
      rig.setInk({ id: 'jade', emissive: 0xd47585, ridge: 0xffe082 })
    }).not.toThrow()
    rig.dispose()
  })
})

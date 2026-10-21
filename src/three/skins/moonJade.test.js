import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createMoonJadeRig } from './moonJade.js'

// S02 acceptance (headless parts): the skin config is valid — a head
// clearly wider than the body, moonstone beads instanced within
// capacity even on a max-length snake, ink applies without error.
// The visual match against the concept renders is the reviewer's
// screenshot pass; shaders can't be judged in Node.
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

describe('Moon Jade skin (S02)', () => {
  it('builds a rig whose head is wider than its body, with instanced beads', () => {
    const scene = new THREE.Scene()
    const rig = createMoonJadeRig(scene)
    expect(rig.skin).toBe('moonJade')

    const beads = scene.children.find((o) => o.isInstancedMesh)
    expect(beads).toBeTruthy()
    expect(beads.instanceMatrix.count).toBe(720) // capacity
    expect(beads.count).toBe(0) // nothing until the first paint

    // Head lathe: the mesh under the head group whose geometry spans
    // ~2 * rx (0.66) — clearly wider than the 0.84 body diameter.
    let headSpan = 0
    scene.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && o.geometry.attributes.aBody && o.geometry.attributes.position.usage !== THREE.DynamicDrawUsage) {
        o.geometry.computeBoundingBox()
        const bb = o.geometry.boundingBox
        headSpan = Math.max(headSpan, bb.max.x - bb.min.x)
      }
    })
    expect(headSpan).toBeGreaterThan(1.2)
    expect(headSpan).toBeGreaterThan(0.42 * 2)
    rig.dispose()
  })

  it('keeps bead count within capacity on a 400-cell snake', () => {
    const scene = new THREE.Scene()
    const rig = createMoonJadeRig(scene)
    const cells = serpentine(400)
    rig.setSnapshots(cells, cells)
    rig.paint({ cur: cells, prev: cells, t: 1, death: null, animT: 0, dt: 0.016 })
    const beads = scene.children.find((o) => o.isInstancedMesh)
    expect(beads.count).toBeGreaterThan(700)
    expect(beads.count).toBeLessThanOrEqual(720)
    rig.dispose()
    expect(scene.children).not.toContain(beads)
  })

  it('applies ink (rim/bead tint) and boost state without errors', () => {
    const scene = new THREE.Scene()
    const rig = createMoonJadeRig(scene)
    const cells = serpentine(6)
    rig.setSnapshots(cells, cells)
    expect(() => {
      rig.setInk({ id: 'gold', emissive: 0xffb300, ridge: 0xffd54f })
      rig.paint({ cur: cells, prev: cells, t: 1, death: null, animT: 0, dt: 0.016, isBoosting: true })
      rig.setInk({ id: 'jade', emissive: 0xd47585, ridge: 0xffe082 })
      rig.paint({ cur: cells, prev: cells, t: 1, death: null, animT: 0.1, dt: 0.016 })
    }).not.toThrow()
    rig.dispose()
  })
})

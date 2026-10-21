import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createSnakeRig } from './snakeRig.js'

// P01: position interpolation inside a tick must be linear, so the head
// covers equal distance per frame (constant velocity). The pre-P01
// easeOutQuad gave 0, 0.4375, 0.75, 0.9375, 1 — surge, then stall.
describe('snakeRig paint interpolation (P01)', () => {
  it('moves the head at constant velocity within a tick', () => {
    const scene = new THREE.Scene()
    const rig = createSnakeRig(scene)
    const prev = [{ x: 0, z: 0 }, { x: -1, z: 0 }, { x: -2, z: 0 }]
    const cur = [{ x: 1, z: 0 }, { x: 0, z: 0 }, { x: -1, z: 0 }]
    rig.setSnapshots(prev, cur)
    const xs = []
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      rig.paint({ cur, prev, t, death: null, animT: 0, dt: 0.016 })
      xs.push(rig.group.position.x)
    }
    expect(xs).toEqual([0, 0.25, 0.5, 0.75, 1])
  })
})

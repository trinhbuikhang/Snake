import { describe, it, expect, vi, afterEach } from 'vitest'
import * as THREE from 'three'
import { createSnakeRig, isDebugOldRig } from './snakeRig.js'

// P01: position interpolation inside a tick must be linear, so the head
// covers equal distance per frame (constant velocity). The pre-P01
// easeOutQuad gave 0, 0.4375, 0.75, 0.9375, 1 — surge, then stall.
// S01: this now runs against the tube rig (group = the head-light
// anchor, positioned at the interpolated head point each paint).
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

const bodyMeshOf = (scene) =>
  scene.children.find((o) => o.isMesh && o.geometry.attributes.position.usage === THREE.DynamicDrawUsage)

describe('S01 tube rig', () => {
  it('reuses the same BufferAttributes across 100 paints (no per-frame allocation)', () => {
    const scene = new THREE.Scene()
    const rig = createSnakeRig(scene)
    const prev = [{ x: 0, z: 0 }, { x: -1, z: 0 }, { x: -2, z: 0 }, { x: -3, z: 0 }]
    const cur = [{ x: 1, z: 0 }, { x: 0, z: 0 }, { x: -1, z: 0 }, { x: -2, z: 0 }]
    rig.setSnapshots(prev, cur)
    rig.paint({ cur, prev, t: 0.5, death: null, animT: 0, dt: 0.016 })
    const geo = bodyMeshOf(scene).geometry
    const attrs = { pos: geo.attributes.position, nor: geo.attributes.normal, bod: geo.attributes.aBody }
    const drawRange = geo.drawRange.count
    expect(drawRange).toBeGreaterThan(0)
    for (let i = 0; i < 100; i += 1) {
      rig.paint({ cur, prev, t: (i % 10) / 10, death: null, animT: i * 0.016, dt: 0.016 })
    }
    expect(geo.attributes.position).toBe(attrs.pos)
    expect(geo.attributes.normal).toBe(attrs.nor)
    expect(geo.attributes.aBody).toBe(attrs.bod)
    expect(geo.drawRange.count).toBe(drawRange)
  })

  it('eat pulses, ink and the death coil run without errors', () => {
    const scene = new THREE.Scene()
    const rig = createSnakeRig(scene)
    const cells = [{ x: 0, z: 0 }, { x: -1, z: 0 }, { x: -2, z: 0 }, { x: -3, z: 0 }, { x: -4, z: 0 }]
    rig.setSnapshots(cells, cells)
    rig.setInk({ emissive: 0xff2b4e, ridge: 0xff8a80 })
    rig.onEat()
    expect(() => rig.paint({ cur: cells, prev: cells, t: 1, death: null, animT: 0.1, dt: 0.016 })).not.toThrow()
    rig.startDeath(cells, { x: 0, z: 0 })
    rig.advanceDeath(0.8, 1.6, false)
    expect(rig.death.t).toBeCloseTo(0.5, 6)
    expect(() => rig.paint({ cur: cells, prev: cells, t: 1, death: rig.death, animT: 0.2, dt: 0.016 })).not.toThrow()
    rig.reset(5)
    expect(rig.death).toBeNull()
  })

  it('dispose() removes the meshes from the scene and disposes geometry + material', () => {
    const scene = new THREE.Scene()
    const rig = createSnakeRig(scene)
    const body = bodyMeshOf(scene)
    const geoSpy = vi.spyOn(body.geometry, 'dispose')
    const matSpy = vi.spyOn(body.material, 'dispose')
    const before = scene.children.length
    expect(before).toBeGreaterThan(0)
    rig.dispose()
    expect(scene.children).not.toContain(body)
    expect(scene.children.length).toBe(0)
    expect(geoSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalledTimes(1) // shared head/body material, disposed once
  })
})

describe('createSnakeRig dispatcher', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to the tube rig for the default skin', () => {
    expect(isDebugOldRig()).toBe(false)
    const rig = createSnakeRig(new THREE.Scene())
    expect(rig.skin).toBe('moonJade')
    expect(typeof rig.dispose).toBe('function')
  })

  it('falls back to the default skin for an unknown skin id', () => {
    const rig = createSnakeRig(new THREE.Scene(), 'nope')
    expect(rig.skin).toBe('moonJade')
  })

  it('?rig=old returns the legacy pearl rig', () => {
    vi.stubGlobal('location', { search: '?rig=old' })
    expect(isDebugOldRig()).toBe(true)
    const rig = createSnakeRig(new THREE.Scene())
    expect(rig.skin).toBeUndefined()
    expect(rig.dispose).toBeUndefined()
  })
})

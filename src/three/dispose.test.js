import { describe, it, expect, vi } from 'vitest'
import { disposeObject3D } from './dispose.js'

// Plain fake Object3D nodes: traverse yields the node, then its
// children recursively — the same contract THREE.Object3D.traverse
// implements.
function node({ geometry = null, material = null, children = [] } = {}) {
  return {
    geometry,
    material,
    children,
    traverse(cb) {
      cb(this)
      for (const child of children) child.traverse(cb)
    },
  }
}

const res = (extra = {}) => ({ dispose: vi.fn(), ...extra })
const texture = () => res({ isTexture: true })

describe('disposeObject3D()', () => {
  it('disposes geometry, material and its textures', () => {
    const map = texture()
    const geo = res()
    const mat = res({ map, roughness: 0.5, color: { r: 1 } })
    disposeObject3D(node({ geometry: geo, material: mat }))
    expect(geo.dispose).toHaveBeenCalledTimes(1)
    expect(mat.dispose).toHaveBeenCalledTimes(1)
    expect(map.dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes shared resources exactly once, however often they appear', () => {
    const sharedGeo = res()
    const sharedTex = texture()
    const sharedMat = res({ map: sharedTex })
    const root = node({
      geometry: sharedGeo,
      material: sharedMat,
      children: [
        node({ geometry: sharedGeo, material: sharedMat }),
        node({ geometry: sharedGeo, material: [sharedMat, res({ map: sharedTex })] }),
      ],
    })
    disposeObject3D(root)
    expect(sharedGeo.dispose).toHaveBeenCalledTimes(1)
    expect(sharedMat.dispose).toHaveBeenCalledTimes(1)
    expect(sharedTex.dispose).toHaveBeenCalledTimes(1)
  })

  it('handles material arrays and bare nodes without crashing', () => {
    const m1 = res()
    const m2 = res()
    const root = node({ children: [node({}), node({ material: [m1, m2] }), node({ geometry: res() })] })
    disposeObject3D(root)
    expect(m1.dispose).toHaveBeenCalledTimes(1)
    expect(m2.dispose).toHaveBeenCalledTimes(1)
  })

  it('does not mistake non-texture material values for textures', () => {
    const mat = res({ color: { isTexture: false }, opacity: 1, visible: true })
    disposeObject3D(node({ material: mat }))
    expect(mat.dispose).toHaveBeenCalledTimes(1)
  })
})

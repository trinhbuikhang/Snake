import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { fitAligned } from './cameraFit.js'

// S05 acceptance: with the aligned preset's el/fov and the board
// half (rim included), every board corner projects inside the NDC
// margins at desktop / portrait / landscape aspects — verified by
// re-projecting with a real THREE.PerspectiveCamera — and the
// returned distance is the closest one (2% less violates).
const EL = 1.0
const FOV = 42
const BOARD_HALF = 10.25
const MARGINS = { x: 0.97, top: 0.8, bottom: 0.93 }
const ASPECTS = [1.6, 0.46, 2.17]
const EPS = 1e-6

function projectCorners({ dist, lookZ, aspect }) {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 500)
  const viewDir = new THREE.Vector3(0, Math.sin(EL), Math.cos(EL))
  camera.position.copy(viewDir).multiplyScalar(dist).add(new THREE.Vector3(0, 0, lookZ))
  camera.lookAt(0, 0, lookZ)
  camera.updateMatrixWorld()
  const corners = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      corners.push(new THREE.Vector3(sx * BOARD_HALF, 0, sz * BOARD_HALF).project(camera))
    }
  }
  return corners
}

const violates = (corners) =>
  corners.some((c) => Math.abs(c.x) > MARGINS.x + EPS || c.y > MARGINS.top + EPS || c.y < -MARGINS.bottom - EPS)

describe('fitAligned (S05)', () => {
  for (const aspect of ASPECTS) {
    it(`fits all four board corners inside the margins at aspect ${aspect}`, () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect, boardHalf: BOARD_HALF, margins: MARGINS })
      expect(Number.isFinite(fit.dist)).toBe(true)
      expect(fit.dist).toBeGreaterThan(0)
      const corners = projectCorners({ ...fit, aspect })
      for (const c of corners) {
        expect(Math.abs(c.x)).toBeLessThanOrEqual(MARGINS.x + EPS)
        expect(c.y).toBeLessThanOrEqual(MARGINS.top + EPS)
        expect(c.y).toBeGreaterThanOrEqual(-MARGINS.bottom - EPS)
      }
    })

    it(`is the closest fit at aspect ${aspect}: dist - 2% violates a margin`, () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect, boardHalf: BOARD_HALF, margins: MARGINS })
      const tighter = projectCorners({ dist: fit.dist * 0.98, lookZ: fit.lookZ, aspect })
      expect(violates(tighter)).toBe(true)
    })
  }

  it('fills much more of the screen than the old ortho fit (board NDC height)', () => {
    // The plan measured the old fit at 1.48 NDC tall and the
    // prototype at ~1.66; the fit must land in that neighbourhood.
    const fit = fitAligned({ el: EL, fov: FOV, aspect: 1.6, boardHalf: BOARD_HALF, margins: MARGINS })
    const corners = projectCorners({ ...fit, aspect: 1.6 })
    const height = Math.max(...corners.map((c) => c.y)) - Math.min(...corners.map((c) => c.y))
    expect(height).toBeGreaterThan(1.6)
    expect(height).toBeLessThanOrEqual(MARGINS.top + MARGINS.bottom + EPS)
  })
})

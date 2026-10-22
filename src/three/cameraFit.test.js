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

function projectWith(fit, aspect, points) {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 500)
  const viewDir = new THREE.Vector3(0, Math.sin(EL), Math.cos(EL))
  const look = new THREE.Vector3(fit.lookX ?? 0, 0, fit.lookZ)
  camera.position.copy(viewDir).multiplyScalar(fit.dist).add(look)
  camera.lookAt(look)
  camera.updateMatrixWorld()
  return points.map(([x, z]) => new THREE.Vector3(x, 0, z).project(camera))
}

const CORNERS = [
  [-BOARD_HALF, -BOARD_HALF],
  [-BOARD_HALF, BOARD_HALF],
  [BOARD_HALF, -BOARD_HALF],
  [BOARD_HALF, BOARD_HALF],
]

const limits = (margins) => ({
  left: margins.x,
  right: margins.right ?? margins.x,
  top: margins.top,
  bottom: margins.bottom,
})

const violates = (corners, margins) => {
  const lim = limits(margins)
  return corners.some(
    (c) => c.x > lim.right + EPS || c.x < -lim.left - EPS || c.y > lim.top + EPS || c.y < -lim.bottom - EPS,
  )
}

describe('fitAligned (S05)', () => {
  for (const aspect of ASPECTS) {
    it(`fits all four board corners inside the margins at aspect ${aspect}`, () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect, boardHalf: BOARD_HALF, margins: MARGINS })
      expect(Number.isFinite(fit.dist)).toBe(true)
      expect(fit.dist).toBeGreaterThan(0)
      expect(fit.lookX).toBe(0) // symmetric margins never shift sideways
      expect(violates(projectWith(fit, aspect, CORNERS), MARGINS)).toBe(false)
    })

    it(`is the closest fit at aspect ${aspect}: dist - 2% violates a margin`, () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect, boardHalf: BOARD_HALF, margins: MARGINS })
      const tighter = projectWith({ ...fit, dist: fit.dist * 0.98 }, aspect, CORNERS)
      expect(violates(tighter, MARGINS)).toBe(true)
    })
  }

  it('fills much more of the screen than the old ortho fit (board NDC height)', () => {
    // The plan measured the old fit at 1.48 NDC tall and the
    // prototype at ~1.66; the fit must land in that neighbourhood.
    const fit = fitAligned({ el: EL, fov: FOV, aspect: 1.6, boardHalf: BOARD_HALF, margins: MARGINS })
    const corners = projectWith(fit, 1.6, CORNERS)
    const height = Math.max(...corners.map((c) => c.y)) - Math.min(...corners.map((c) => c.y))
    expect(height).toBeGreaterThan(1.6)
    expect(height).toBeLessThanOrEqual(MARGINS.top + MARGINS.bottom + EPS)
  })

  // S05 review round: touch landscape (844x390). The engine passes
  // a top margin derived from the real HUD height (pill bottom
  // 74px + 8px gap at 390px tall -> top = 1 - 2*82/390 = 0.5795)
  // and a right margin that keeps the board left of the Dash /
  // d-pad cluster (cluster left edge at canvas width - 288px, -8px
  // gap -> NDC right = 1 - 592/844 = 0.2986).
  describe('touch landscape margins (aspect 2.17)', () => {
    const LAND = { x: 0.97, right: 0.2986, top: 0.5795, bottom: 0.93 }

    it('fits all four corners inside the tighter top/right margins', () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect: 2.17, boardHalf: BOARD_HALF, margins: LAND })
      expect(violates(projectWith(fit, 2.17, CORNERS), LAND)).toBe(false)
      // The board achieves this by sliding sideways, not just by
      // backing away: the look point shifts toward +x (board left).
      expect(fit.lookX).toBeGreaterThan(0)
    })

    it('is the closest fit: dist - 2% violates a margin', () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect: 2.17, boardHalf: BOARD_HALF, margins: LAND })
      const tighter = projectWith({ ...fit, dist: fit.dist * 0.98 }, 2.17, CORNERS)
      expect(violates(tighter, LAND)).toBe(true)
    })

    it('keeps the whole board surface left of the control cluster', () => {
      const fit = fitAligned({ el: EL, fov: FOV, aspect: 2.17, boardHalf: BOARD_HALF, margins: LAND })
      // Sample the board edges every half cell: no point of the
      // board may cross the cluster's left edge in NDC.
      const edge = []
      for (let i = 0; i <= 41; i += 1) {
        const t = -BOARD_HALF + (2 * BOARD_HALF * i) / 41
        edge.push([t, -BOARD_HALF], [t, BOARD_HALF], [-BOARD_HALF, t], [BOARD_HALF, t])
      }
      const pts = projectWith(fit, 2.17, edge)
      for (const p of pts) expect(p.x).toBeLessThanOrEqual(LAND.right + EPS)
    })
  })
})

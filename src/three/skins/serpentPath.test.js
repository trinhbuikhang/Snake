import { describe, it, expect } from 'vitest'
import {
  createPathState,
  buildPathPoints,
  buildPath,
  radiusAt,
  writeTube,
  yawAlpha,
  STEP,
  ARC_K,
  CORNER_R,
  CAP,
  RADIAL,
  MAX_RINGS,
} from './serpentPath.js'

const PROF = { bodyR: 0.42, flat: 0.9, neckR: 0.42, headBack: -0.88, tailTip: 0.34 }
const target = () => ({
  pos: new Float32Array(MAX_RINGS * (RADIAL + 1) * 3),
  nor: new Float32Array(MAX_RINGS * (RADIAL + 1) * 3),
  bod: new Float32Array(MAX_RINGS * (RADIAL + 1) * 2),
})
const cells = (list) => list.map(([x, z]) => ({ x, z }))

describe('buildPath() sampling', () => {
  it('samples a straight 5-cell run at STEP spacing', () => {
    const st = createPathState()
    // Polyline written directly (buildPathPoints is covered by the
    // linear-motion test below): 6 points, 5 segments of length 1.
    for (let i = 0; i < 6; i += 1) {
      st.P[i * 3] = i
      st.P[i * 3 + 1] = 0.4
      st.P[i * 3 + 2] = 0
    }
    buildPath(st, 6, null)
    // 5 straight segments of length 1, no corners: 1 + 5 * ceil(1 / STEP)
    expect(st.nS).toBe(1 + 5 * Math.ceil(1 / STEP))
    // samples are evenly spaced along the run
    expect(st.D[st.nS - 1]).toBeCloseTo(5, 5)
    const rings = writeTube(st, target(), 0, PROF, [])
    expect(rings).toBe(st.nS + CAP)
  })

  it('rounds a 90° corner with ARC_K arc samples inside CORNER_R', () => {
    const st = createPathState()
    const P = st.P
    // Long arms (3 units) so the corner radius is exactly CORNER_R.
    const pts = [[0, 0], [3, 0], [3, 3]]
    pts.forEach(([x, z], i) => {
      P[i * 3] = x
      P[i * 3 + 1] = 0.4
      P[i * 3 + 2] = z
    })
    buildPath(st, 3, null)
    // Samples in the corner zone: past the tangent point on arm A
    // (z ≈ 0 but x beyond the last straight sample), turning toward
    // arm B, none farther than CORNER_R from the corner (3, 0).
    const inZone = []
    for (let i = 0; i < st.nS; i += 1) {
      const x = st.S[i * 3]
      const z = st.S[i * 3 + 2]
      if (x > 3 - CORNER_R - 0.01 && z > 0.0001 && z < CORNER_R + 0.01) {
        inZone.push(Math.hypot(x - 3, z - 0))
      }
    }
    expect(inZone.length).toBe(ARC_K)
    for (const d of inZone) expect(d).toBeLessThanOrEqual(CORNER_R + 1e-6)
    // and the arc actually cuts the corner (closest sample well inside)
    expect(Math.min(...inZone)).toBeLessThanOrEqual(CORNER_R * 0.5)
  })
})

describe('linear head motion (P01 property)', () => {
  it('advances the head by equal distances for equal t steps', () => {
    const st = createPathState()
    const prev = cells([[0, 0], [-1, 0], [-2, 0]])
    const cur = cells([[1, 0], [0, 0], [-1, 0]])
    const xs = []
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const m = buildPathPoints(st, cur, prev, t, 0.4)
      buildPath(st, m, null)
      xs.push(st.S[0])
    }
    expect(xs).toEqual([0, 0.25, 0.5, 0.75, 1])
    const steps = xs.slice(1).map((x, i) => x - xs[i])
    for (const s of steps) expect(Math.abs(s - 0.25) / 0.25).toBeLessThan(0.01)
  })
})

describe('max-length bound', () => {
  it('a 400-cell serpentine never overflows MAX_RINGS and draws a sane range', () => {
    const st = createPathState()
    // Serpentine over the 20×20 board: 400 cells, a 90° turn every row.
    const snake = []
    for (let row = 0; row < 20; row += 1) {
      const xs = [...Array(20).keys()]
      if (row % 2) xs.reverse()
      for (const x of xs) snake.push({ x, z: row })
    }
    expect(snake.length).toBe(400)
    const prev = snake.map((c) => ({ ...c }))
    const m = buildPathPoints(st, snake, prev, 1, 0.4)
    expect(m).toBe(401)
    buildPath(st, m, null)
    expect(st.nS).toBeLessThanOrEqual(MAX_RINGS)
    const tg = target()
    const rings = writeTube(st, tg, 0, PROF, [])
    expect(rings).toBeLessThanOrEqual(MAX_RINGS)
    // the draw count the rig will set from these rings fits the
    // preallocated index buffer
    const drawCount = Math.max(0, rings - 1) * RADIAL * 6
    expect(drawCount).toBeLessThanOrEqual((MAX_RINGS - 1) * RADIAL * 6)
    // no NaNs crept into the tube
    for (let i = 0; i < rings * (RADIAL + 1) * 3; i += 997) {
      expect(Number.isFinite(tg.pos[i])).toBe(true)
    }
  })
})

describe('tail curl', () => {
  it('appends visual-only length past the last polyline point', () => {
    const mk = () => {
      const st = createPathState()
      for (let i = 0; i < 4; i += 1) {
        st.P[i * 3] = i
        st.P[i * 3 + 1] = 0.4
        st.P[i * 3 + 2] = 0
      }
      return st
    }
    const plain = mk()
    buildPath(plain, 4, null)
    const curled = mk()
    buildPath(curled, 4, { len: 0.85, turn: 2.5, side: 1 })
    expect(curled.nS).toBeGreaterThan(plain.nS)
    expect(curled.D[curled.nS - 1]).toBeGreaterThan(plain.D[plain.nS - 1] + 0.5)
  })
})

describe('radiusAt()', () => {
  it('tapers to tailTip at the tail and swallows the tube at the head', () => {
    const total = 20
    expect(radiusAt(total, total, 1, PROF)).toBeCloseTo(PROF.bodyR * PROF.tailTip, 6)
    expect(radiusAt(0, total, 1, PROF)).toBeLessThan(PROF.bodyR)
    // before the tail taper starts (u = 0.4 < 0.42): full radius
    expect(radiusAt(8, total, 1, PROF)).toBeCloseTo(PROF.bodyR, 6)
    // bulge multiplies through
    expect(radiusAt(8, total, 1.28, PROF)).toBeCloseTo(PROF.bodyR * 1.28, 6)
  })
})

describe('yawAlpha() head-yaw smoothing (C04)', () => {
  const SPEEDS = [0.165, 0.08, 0.0416, 0.0308] // base, floor, dash, worst intervals (s)

  it('stays in (0, 1] for any real frame time and speed', () => {
    for (const iv of SPEEDS) {
      for (const dt of [1 / 240, 1 / 120, 1 / 60, 1 / 30, 0.1]) {
        const a = yawAlpha(dt, iv)
        expect(a).toBeGreaterThan(0)
        expect(a).toBeLessThanOrEqual(1)
      }
    }
  })

  it('grows monotonically with dt and shrinks as the tick gets faster', () => {
    let prev = 0
    for (const dt of [0.004, 0.008, 0.016, 0.033, 0.066]) {
      const a = yawAlpha(dt, 0.165)
      expect(a).toBeGreaterThan(prev)
      prev = a
    }
    // A faster tick means a smaller tau, so the same frame closes more.
    expect(yawAlpha(0.016, 0.0308)).toBeGreaterThan(yawAlpha(0.016, 0.165))
  })

  it('tau is 0.25 * interval below the cap and exactly 50 ms at/above interval 0.2 s', () => {
    for (const dt of [0.008, 0.016, 0.033]) {
      expect(yawAlpha(dt, 0.1)).toBeCloseTo(1 - Math.exp(-dt / 0.025), 12)
      expect(yawAlpha(dt, 0.2)).toBeCloseTo(1 - Math.exp(-dt / 0.05), 12)
      expect(yawAlpha(dt, 0.4)).toBeCloseTo(1 - Math.exp(-dt / 0.05), 12)
    }
  })

  it('is frame-rate independent: the residual after the same total time agrees within 1% at 30/60/120 fps', () => {
    const T = 0.3 // seconds of painted frames after a turn
    for (const iv of SPEEDS) {
      const residual = (fps) => {
        let r = 1 // fraction of the yaw gap still open
        const frames = Math.round(T * fps)
        for (let i = 0; i < frames; i++) r *= 1 - yawAlpha(1 / fps, iv)
        return r
      }
      const r30 = residual(30)
      const r60 = residual(60)
      const r120 = residual(120)
      const spread = Math.max(r30, r60, r120) - Math.min(r30, r60, r120)
      expect(spread / r60).toBeLessThanOrEqual(0.01)
      // And it matches the closed form exp(-T / tau).
      const tau = Math.min(0.05, 0.25 * iv)
      expect(r60).toBeCloseTo(Math.exp(-T / tau), 6)
    }
  })
})

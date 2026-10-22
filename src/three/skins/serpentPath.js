// Pure serpent path + tube geometry — no three.js, no WebGL, so the
// whole sampling / radius / tube pipeline is unit-testable.
// serpentBase.js owns the three.js objects; this module owns the math.
//
// The spine is rebuilt every frame from the grid polyline: corners are
// rounded with quadratic Bézier arcs, the tail is capped round, and
// every buffer is preallocated for the longest possible snake (the
// 20×20 board → 400 cells), so a frame never allocates.

export const RADIAL = 20 // vertices per tube ring (plus a duplicated seam vertex)
export const STEP = 0.2 // spine sample spacing along straights
export const ARC_K = 6 // spine samples per rounded corner
export const CORNER_R = 0.48 // corner rounding radius (board cells)
export const CAP = 6 // rings in the round tail cap
export const MAX_SEGMENTS = 400
export const MAX_PTS = MAX_SEGMENTS + 2 // polyline points: cells + interpolated head/tail
export const MAX_RINGS = MAX_PTS * (Math.ceil(1 / STEP) + ARC_K + 1) + CAP + 40

export function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// Gentle vertical bob along the spine (also used for the head).
export function spineBob(animT, d) {
  return Math.sin(animT * 2.6 - d * 0.9) * 0.022
}

// Head-yaw smoothing factor for one painted frame (POLISH_PLAN C04).
//
// Exponential approach with a time constant tied to the tick:
// tau = min(50 ms, 0.25 * interval). Because the residual after any
// total time T is exp(-T / tau) no matter how T is sliced into frames,
// the drawn head settles in the same wall time at 30, 60 or 120 fps —
// unlike the old min(1, dt * 20) factor, whose effective rate changed
// with the frame rate (and took 2.6-3.8 ticks at dash/worst speeds).
// Returns the fraction of the remaining yaw gap to close this frame,
// in (0, 1] for dt > 0.
export function yawAlpha(dt, interval) {
  const tau = Math.min(0.05, 0.25 * interval)
  return tau > 0 ? 1 - Math.exp(-dt / tau) : 1
}

// Scratch state, allocated once per rig and reused every frame.
//   P: input polyline (xyz triplets)      C: per-point corner radius
//   S: sampled spine points (xyz)         D: cumulative distance per sample
//   RX: per-sample tube radius            CY: per-sample centre height
//   FR: per-sample frame (side, up, tangent — 9 floats)
export function createPathState() {
  return {
    P: new Float32Array(MAX_PTS * 3),
    C: new Float32Array(MAX_PTS),
    S: new Float32Array(MAX_RINGS * 3),
    D: new Float32Array(MAX_RINGS),
    RX: new Float32Array(MAX_RINGS),
    CY: new Float32Array(MAX_RINGS),
    FR: new Float32Array(MAX_RINGS * 9),
    nS: 0,
  }
}

// Fill state.P with this frame's polyline and return the point count:
// the head glides linearly from prev to cur (P01 — constant velocity),
// the body points sit on the current cells, and one extra tail point
// glides the same way so the tail end doesn't jump a cell per tick.
export function buildPathPoints(state, cur, prev, t, bodyY) {
  const n = cur.length
  const P = state.P
  const lt = Math.max(0, Math.min(1, t))
  let m = 0
  const put = (x, z) => {
    P[m * 3] = x
    P[m * 3 + 1] = bodyY
    P[m * 3 + 2] = z
    m += 1
  }
  const p0 = prev[0] || cur[0]
  put(p0.x + (cur[0].x - p0.x) * lt, p0.z + (cur[0].z - p0.z) * lt)
  for (let i = 1; i < n; i += 1) put(cur[i].x, cur[i].z)
  if (n > 1) {
    const pl = prev[Math.min(n - 1, prev.length - 1)] || cur[n - 1]
    put(pl.x + (cur[n - 1].x - pl.x) * lt, pl.z + (cur[n - 1].z - pl.z) * lt)
  } else {
    put(cur[0].x - 0.6, cur[0].z)
  }
  return m
}

function pushS(state, x, y, z) {
  const o = state.nS * 3
  if (state.nS > 0) {
    const l = Math.hypot(x - state.S[o - 3], y - state.S[o - 2], z - state.S[o - 1])
    if (l < 1e-4) return
    state.D[state.nS] = state.D[state.nS - 1] + l
  } else {
    state.D[0] = 0
  }
  state.S[o] = x
  state.S[o + 1] = y
  state.S[o + 2] = z
  state.nS += 1
}

// Sample the polyline in state.P (m points) into the spine (S/D):
// straight runs are stepped at STEP, corners become ARC_K-sample
// quadratic Bézier arcs of radius ≤ CORNER_R. `tailCurl` (optional,
// { len, turn, side }) appends a decorative curl past the last point —
// visual only, the grid logic never sees it.
export function buildPath(state, m, tailCurl) {
  const { P, C } = state
  state.nS = 0
  for (let j = 0; j < m; j += 1) C[j] = 0
  for (let j = 1; j < m - 1; j += 1) {
    const ax = P[j * 3] - P[j * 3 - 3]
    const az = P[j * 3 + 2] - P[j * 3 - 1]
    const bx = P[j * 3 + 3] - P[j * 3]
    const bz = P[j * 3 + 5] - P[j * 3 + 2]
    const la = Math.hypot(ax, az)
    const lb = Math.hypot(bx, bz)
    if (la < 1e-4 || lb < 1e-4) continue
    if ((ax * bx + az * bz) / (la * lb) < 0.999) C[j] = Math.min(CORNER_R, la * 0.5, lb * 0.5)
  }
  pushS(state, P[0], P[1], P[2])
  for (let j = 0; j < m - 1; j += 1) {
    const ax = P[j * 3]
    const ay = P[j * 3 + 1]
    const az = P[j * 3 + 2]
    const bx = P[j * 3 + 3]
    const by = P[j * 3 + 4]
    const bz = P[j * 3 + 5]
    const L = Math.hypot(bx - ax, by - ay, bz - az)
    if (L < 1e-5) continue
    const ux = (bx - ax) / L
    const uy = (by - ay) / L
    const uz = (bz - az) / L
    const s0 = C[j]
    const s1 = L - C[j + 1]
    const cnt = Math.max(1, Math.ceil((s1 - s0) / STEP))
    for (let k = 1; k <= cnt; k += 1) {
      const s = s0 + ((s1 - s0) * k) / cnt
      pushS(state, ax + ux * s, ay + uy * s, az + uz * s)
    }
    if (C[j + 1] > 0 && j + 2 < m) {
      const r = C[j + 1]
      const cx = P[j * 3 + 6]
      const cy = P[j * 3 + 7]
      const cz = P[j * 3 + 8]
      const L2 = Math.hypot(cx - bx, cy - by, cz - bz)
      const qx = bx + ((cx - bx) / L2) * r
      const qy = by + ((cy - by) / L2) * r
      const qz = bz + ((cz - bz) / L2) * r
      const px = bx - ux * r
      const py = by - uy * r
      const pz = bz - uz * r
      for (let k = 1; k <= ARC_K; k += 1) {
        const t = k / ARC_K
        const it = 1 - t
        pushS(
          state,
          it * it * px + 2 * it * t * bx + t * t * qx,
          it * it * py + 2 * it * t * by + t * t * qy,
          it * it * pz + 2 * it * t * bz + t * t * qz,
        )
      }
    }
  }
  if (tailCurl && state.nS > 1) {
    const o = (state.nS - 1) * 3
    let dx = state.S[o] - state.S[o - 3]
    let dz = state.S[o + 2] - state.S[o - 1]
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    let x = state.S[o]
    let z = state.S[o + 2]
    const steps = Math.ceil(tailCurl.len / (STEP * 0.5))
    const ds = tailCurl.len / steps
    for (let k = 1; k <= steps; k += 1) {
      const u = k / steps
      const a = ((tailCurl.turn * ds) / tailCurl.len) * (0.4 + 1.2 * u) * (tailCurl.side ?? 1)
      const c = Math.cos(a)
      const s = Math.sin(a)
      const nx = dx * c - dz * s
      const nz = dx * s + dz * c
      dx = nx
      dz = nz
      x += dx * ds
      z += dz * ds
      pushS(state, x, state.S[o + 1], z)
    }
  }
}

// Tube radius at spine distance d of `total`: the head end is
// swallowed by the lathe head (prof.headBack is the head's rear
// extent, negative), the neck eases out to the full body radius,
// and the tail tapers to prof.tailTip of the body radius. `bulge`
// is the digestion-wave multiplier (1 = none).
// prof = { bodyR, neckR, headBack, tailTip }
export function radiusAt(d, total, bulge, prof) {
  const u = d / Math.max(total, 1e-3)
  const inner = 0.72 + 0.28 * smoothstep(0.05, -prof.headBack, d)
  const neckToBody = prof.neckR + (prof.bodyR - prof.neckR) * smoothstep(-prof.headBack, 1.9, d)
  const tail = 1 - (1 - prof.tailTip) * smoothstep(0.42, 1.0, u)
  return neckToBody * inner * tail * bulge
}

// Write one ring per spine sample, plus CAP rings tapering to a
// round point at the tail, into target = { pos, nor, bod }
// (Float32Arrays sized for MAX_RINGS × (RADIAL + 1) vertices).
// `pulses` are the digestion waves ({ progress } in spine distance).
// Returns the number of rings written.
const COS_T = new Float32Array(RADIAL + 1)
const SIN_T = new Float32Array(RADIAL + 1)
for (let k = 0; k <= RADIAL; k += 1) {
  const th = (k / RADIAL) * Math.PI * 2
  COS_T[k] = Math.cos(th)
  SIN_T[k] = Math.sin(th)
}

export function writeTube(state, target, animT, prof, pulses) {
  const { S, D, RX, CY, FR } = state
  const nS = state.nS
  const total = D[nS - 1]
  const VPR = RADIAL + 1
  const cosT = COS_T
  const sinT = SIN_T
  const FLAT = prof.flat
  let v = 0
  const ring = (cx, cy, cz, sx, sz, ux, uy, uz, rx, d) => {
    const ry = rx * FLAT
    for (let k = 0; k <= RADIAL; k += 1) {
      const c = cosT[k]
      const s = sinT[k]
      const vo = v * 3
      target.pos[vo] = cx + sx * c * rx + ux * s * ry
      target.pos[vo + 1] = cy + uy * s * ry
      target.pos[vo + 2] = cz + sz * c * rx + uz * s * ry
      const nx = sx * c * FLAT + ux * s
      const ny = uy * s
      const nz = sz * c * FLAT + uz * s
      const nl = Math.hypot(nx, ny, nz) || 1
      target.nor[vo] = nx / nl
      target.nor[vo + 1] = ny / nl
      target.nor[vo + 2] = nz / nl
      target.bod[v * 2] = k / RADIAL
      target.bod[v * 2 + 1] = d
      v += 1
    }
  }

  let tx = 0
  let ty = 0
  let tz = 0
  let sx = 0
  let sz = 0
  let ux = 0
  let uy = 1
  let uz = 0
  let rx = prof.bodyR
  let cy = 0
  for (let i = 0; i < nS; i += 1) {
    const o = i * 3
    const a = Math.max(0, i - 1)
    const b = Math.min(nS - 1, i + 1)
    tx = S[a * 3] - S[b * 3]
    ty = S[a * 3 + 1] - S[b * 3 + 1]
    tz = S[a * 3 + 2] - S[b * 3 + 2]
    const tl = Math.hypot(tx, ty, tz) || 1
    tx /= tl
    ty /= tl
    tz /= tl
    sx = -tz
    sz = tx
    const sl = Math.hypot(sx, sz) || 1
    sx /= sl
    sz /= sl
    ux = -sz * ty
    uy = sz * tx - sx * tz
    uz = sx * ty
    let bulge = 1
    for (let p = 0; p < pulses.length; p += 1) {
      const dd = Math.abs(pulses[p].progress - D[i])
      if (dd < 1.2) bulge = Math.max(bulge, 1 + (1 - dd / 1.2) * 0.28)
    }
    rx = radiusAt(D[i], total, bulge, prof)
    cy = S[o + 1] + spineBob(animT, D[i])
    RX[i] = rx
    CY[i] = cy
    const f = i * 9
    FR[f] = sx
    FR[f + 1] = 0
    FR[f + 2] = sz
    FR[f + 3] = ux
    FR[f + 4] = uy
    FR[f + 5] = uz
    FR[f + 6] = tx
    FR[f + 7] = ty
    FR[f + 8] = tz
    ring(S[o], cy, S[o + 2], sx, sz, ux, uy, uz, rx, D[i])
  }
  const lo = (nS - 1) * 3
  for (let j = 1; j <= CAP; j += 1) {
    const ang = (j / CAP) * Math.PI * 0.5
    const off = rx * Math.sin(ang)
    ring(S[lo] - tx * off, cy - ty * off, S[lo + 2] - tz * off, sx, sz, ux, uy, uz, rx * Math.cos(ang), total + off)
  }
  return v / VPR
}

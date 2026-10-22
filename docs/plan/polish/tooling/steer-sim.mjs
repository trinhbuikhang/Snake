// Steering-feel simulator for docs/plan/POLISH_PLAN.md (workstream C).
// Tooling only — not part of the game build, not part of `npm test`.
//
// Drives the REAL pure modules (src/game/logic.js turn/step/speedInterval,
// src/three/skins/serpentPath.js path builder) through the engine's real
// tick loop — runTicks() in src/three/tickClock.js, the exact function
// engine.js calls since POLISH_PLAN C01 (at a fixed interval per speed,
// so no syncInterval) — and the rig's head-yaw smoothing (serpentBase.js
// paint(): yawView += dyaw * yawAlpha(dt, interval), the real function
// from serpentPath.js since POLISH_PLAN C04; target = atan2 of the spine
// 0.35 cells behind the head). Scripted inputs are delivered as DOM
// events are: before the next animation frame's tick update.
//
// usage (repo root): node docs/plan/polish/tooling/steer-sim.mjs [--json out.json]
// Deterministic (seeded RNG) — the same commit always prints the same numbers.
import fs from 'fs'
import { createGame, turn, step, speedInterval, gridToWorld, DIR } from '../../../../src/game/logic.js'
import { createPathState, buildPathPoints, buildPath, yawAlpha } from '../../../../src/three/skins/serpentPath.js'
import { runTicks } from '../../../../src/three/tickClock.js'

let seed = 0x5eed
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

// Speeds worth feeling: start of a run, the speed floor, Dash at the floor,
// and the fastest legal combo (Full Moon x High Tide x Lantern Rush x Dash).
export const SPEEDS = {
  base: speedInterval(0, false),
  floor: speedInterval(999, false),
  dash: speedInterval(999, true),
  worst: speedInterval(999, true, 1.15, 1.05, 1.12),
}
const FPS = [120, 60, 30]

function freshGame() {
  const g = createGame('half', 'classic')
  g.food = { x: 0, y: 0 } // keep food out of the way
  g.snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }] // room to run right
  return g
}

// Run one scripted session. inputs: [{ at (s), key }]. Returns per-step log.
function run({ interval, fps, inputs, duration, yaw = false }) {
  const g = freshGame()
  const dt = 1 / fps
  const clock = { accum: 0, interval }
  let deadEv = null
  let now = 0
  let k = 0
  const steps = [] // { t, dir }
  const accepted = [] // { at, key }
  const frames = [] // { t, yawView, yawTarget }
  const toCells = () => g.snake.map((c) => gridToWorld(c.x, c.y))
  let prev = toCells()
  let cur = prev
  const path = createPathState()
  let yawView = Math.atan2(DIR[g.dir].x, DIR[g.dir].y)
  while (now < duration) {
    now += dt
    // DOM events that arrived since the last frame are handled first.
    while (k < inputs.length && inputs[k].at <= now) {
      if (turn(g, inputs[k].key)) accepted.push({ ...inputs[k], stepIdx: steps.length })
      k++
    }
    runTicks(clock, dt, (tickDt, clk) => {
      const ev = step(g, tickDt)
      if (ev.dead) {
        deadEv = ev
        return { dead: true, nextInterval: interval }
      }
      // a step happens at the tick boundary inside this frame
      steps.push({ t: now - (clk.accum - tickDt), frameT: now, dir: g.dir })
      prev = cur
      cur = toCells()
      return { dead: false, nextInterval: interval }
    })
    if (deadEv) return { steps, accepted, frames, dead: true, cause: deadEv.cause }
    if (yaw) {
      const t = Math.min(1, clock.accum / interval)
      const m = buildPathPoints(path, cur, prev, t, 0.5)
      buildPath(path, m, null)
      const { S, D, nS } = path
      let j = 1
      while (j < nS - 1 && D[j] < 0.35) j++
      const target = Math.atan2(S[0] - S[j * 3], S[2] - S[j * 3 + 2])
      let d = target - yawView
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      // C04: the real yawAlpha from src (tau = min(50 ms, 0.25 * interval)).
      yawView += d * yawAlpha(dt, interval)
      frames.push({ t: now, yawView, target })
    }
  }
  return { steps, accepted, frames, dead: false }
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length
const r1 = (x) => Math.round(x * 10) / 10

// --- 1. Quick double turns: are any dropped? -------------------------------
// Moving right; press A then B `gap` ms later at a random phase of a tick.
const PAIRS = [
  { name: 'U-turn up,left', keys: ['up', 'left'] },
  { name: 'lane up,right', keys: ['up', 'right'] },
]
const GAPS = [0, 8, 16, 33, 50]
function doubleTurns(trials = 200) {
  const out = []
  for (const [sp, iv] of Object.entries(SPEEDS)) for (const fps of FPS) for (const pair of PAIRS) for (const gap of GAPS) {
    let dropped = 0, deaths = 0
    for (let i = 0; i < trials; i++) {
      const t0 = (2 + rnd()) * iv
      const inputs = [{ at: t0, key: pair.keys[0] }, { at: t0 + gap / 1000, key: pair.keys[1] }]
      const r = run({ interval: iv, fps, inputs, duration: t0 + gap / 1000 + 4 * iv + 1 / fps })
      if (r.dead) { deaths++; if (process.env.DEBUG) console.log('dead', sp, fps, pair.name, gap, r.cause, r.steps.map((x) => x.dir).join(',')); continue }
      // the step directions taken after the first input was handled must contain A then B
      const from = r.accepted.length ? r.accepted[0].stepIdx : r.steps.length
      const dirs = r.steps.slice(from).map((s) => s.dir)
      const a = dirs.indexOf(pair.keys[0])
      const ok = a >= 0 && dirs.indexOf(pair.keys[1], a + 1) > a
      if (!ok) dropped++
    }
    out.push({ speed: sp, interval: iv, fps, pair: pair.name, gapMs: gap, trials, dropped, deaths })
  }
  return out
}

// --- 2. Triple tap inside one tick (documents MAX_QUEUE=2 behaviour) --------
function tripleTap(trials = 200) {
  const out = []
  for (const [sp, iv] of Object.entries(SPEEDS)) {
    let applied3 = 0
    for (let i = 0; i < trials; i++) {
      const t0 = (2 + rnd() * 0.2) * iv
      const inputs = [{ at: t0, key: 'up' }, { at: t0 + 0.004, key: 'left' }, { at: t0 + 0.008, key: 'down' }]
      const r = run({ interval: iv, fps: 60, inputs, duration: t0 + 5 * iv })
      if (r.accepted.length === 3) applied3++
    }
    out.push({ speed: sp, trials, thirdAccepted: applied3 })
  }
  return out
}

// --- 3. Input -> direction change latency ----------------------------------
function latency(trials = 400) {
  const out = []
  for (const [sp, iv] of Object.entries(SPEEDS)) for (const fps of FPS) {
    const logic = [], visible = []
    for (let i = 0; i < trials; i++) {
      const t0 = (2 + rnd()) * iv
      const r = run({ interval: iv, fps, inputs: [{ at: t0, key: 'up' }], duration: t0 + 3 * iv + 0.1 })
      const s = r.accepted.length ? r.steps.slice(r.accepted[0].stepIdx).find((x) => x.dir === 'up') : null
      if (!s) continue
      // logic: the tick boundary that applies the turn (never before the
      // input — a boundary that fell inside the same frame counts as 0)
      logic.push(Math.max(0, s.t - t0))
      visible.push(s.frameT - t0) // first frame painted after that step
    }
    out.push({
      speed: sp, intervalMs: r1(iv * 1000), fps,
      logicMeanMs: r1(mean(logic) * 1000), logicMaxMs: r1(Math.max(...logic) * 1000), logicMaxTicks: +(Math.max(...logic) / iv).toFixed(2),
      visibleMeanMs: r1(mean(visible) * 1000), visibleP95Ms: r1(pct(visible, 0.95) * 1000), visibleMaxMs: r1(Math.max(...visible) * 1000),
    })
  }
  return out
}

// --- 4. Head yaw settle after a 90-degree turn -----------------------------
// Time from the step that applies the turn until the drawn head yaw is
// within 9 degrees (10 %) of the new heading; and the same for the yaw
// TARGET alone (geometry of the rounded spine, no smoothing).
function yawSettle() {
  const out = []
  for (const [sp, iv] of Object.entries(SPEEDS)) for (const fps of FPS) {
    const t0 = 2.3 * iv
    const r = run({ interval: iv, fps, inputs: [{ at: t0, key: 'up' }], duration: t0 + 8 * iv + 0.12, yaw: true })
    const s = r.steps.slice(r.accepted[0].stepIdx).find((x) => x.dir === 'up')
    const goal = Math.atan2(DIR.up.x, DIR.up.y)
    const tol = (Math.PI / 2) * 0.1
    const near = (a) => Math.abs(Math.atan2(Math.sin(a - goal), Math.cos(a - goal))) <= tol
    const fView = r.frames.find((f) => f.t >= s.t && near(f.yawView))
    const fTarget = r.frames.find((f) => f.t >= s.t && near(f.target))
    const v = fView ? fView.t - s.t : NaN
    const tg = fTarget ? fTarget.t - s.t : NaN
    out.push({ speed: sp, intervalMs: r1(iv * 1000), fps, targetSettleMs: r1(tg * 1000), viewSettleMs: r1(v * 1000), viewSettleTicks: +(v / iv).toFixed(2) })
  }
  return out
}

const res = { commitNote: 'run on the checked-out commit', speeds: SPEEDS, doubleTurns: doubleTurns(), tripleTap: tripleTap(), latency: latency(), yawSettle: yawSettle() }

const dropTotal = res.doubleTurns.reduce((s, x) => s + x.dropped, 0)
const trialTotal = res.doubleTurns.reduce((s, x) => s + x.trials, 0)
console.log(`speeds (ms/tick): ${Object.entries(SPEEDS).map(([k, v]) => `${k}=${r1(v * 1000)}`).join(' ')}`)
console.log(`\n[1] quick double turns: dropped ${dropTotal}/${trialTotal} (deaths ${res.doubleTurns.reduce((s, x) => s + x.deaths, 0)})`)
for (const sp of Object.keys(SPEEDS)) {
  const rows = res.doubleTurns.filter((x) => x.speed === sp)
  console.log(`  ${sp.padEnd(5)} dropped ${rows.reduce((s, x) => s + x.dropped, 0)}/${rows.reduce((s, x) => s + x.trials, 0)}`)
}
console.log('\n[2] triple tap in one tick (up,left,down within 8 ms): third input accepted')
for (const x of res.tripleTap) console.log(`  ${x.speed.padEnd(5)} ${x.thirdAccepted}/${x.trials}`)
console.log('\n[3] input -> direction change (ms)   logic mean/max(ticks)   first painted frame mean/p95/max')
for (const x of res.latency) console.log(`  ${x.speed.padEnd(5)} ${String(x.intervalMs).padStart(5)}ms/tick ${String(x.fps).padStart(3)}fps   ${x.logicMeanMs}/${x.logicMaxMs} (${x.logicMaxTicks})   ${x.visibleMeanMs}/${x.visibleP95Ms}/${x.visibleMaxMs}`)
console.log('\n[4] head yaw smoothing: src yawAlpha, tau = min(50 ms, 0.25 x interval) (C04)')
console.log('[4] head yaw settle after the turning step (within 9 deg): target(geometry) / drawn head (ms, ticks)')
for (const x of res.yawSettle) console.log(`  ${x.speed.padEnd(5)} ${String(x.intervalMs).padStart(5)}ms/tick ${String(x.fps).padStart(3)}fps   ${x.targetSettleMs} / ${x.viewSettleMs} (${x.viewSettleTicks} ticks)`)

const jsonAt = process.argv.indexOf('--json')
if (jsonAt > 0) fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(res, null, 1))

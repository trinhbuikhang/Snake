// HUD layout harness: screenshots gameplay at a set of viewports, dumps HUD
// rects, HUD-HUD overlaps and board cells covered by HUD (cells projected
// with the same perspective camera the engine fits).
// Tooling for docs/plan/HUD_PLAN.md (not part of the game build).
// usage: node docs/plan/hud/tooling/harness.mjs <url> <label> <outdir> <fitmodel.mjs> [only=id,id] [coach=off]
//   env PW_CORE = path to playwright-core's index.mjs (default: 'playwright-core')
//   env CHROME  = Chrome/Chromium binary (default: /usr/bin/google-chrome)
// Run from the repo root so 'three' resolves from node_modules.
import fs from 'fs'
import path from 'path'
import * as THREE from 'three'
const { chromium } = await import(process.env.PW_CORE || 'playwright-core')
const [url, label, outdir, fitModelPath, only, coachArg] = process.argv.slice(2)
// V03: a `coach=off` pass measures the returning-player framing — the
// context is seeded with ran-xinh-onboarded=1 so the first-night
// coach never shows, and the fit model gets coachVisible: false.
const coachVisible = coachArg !== 'coach=off'
const { cameraFor } = await import(path.resolve(fitModelPath))
fs.mkdirSync(outdir, { recursive: true })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
export const VIEWPORTS = [
  { id: 'p390', w: 390, h: 844, touch: true, dpr: 3 },
  { id: 'p375', w: 375, h: 667, touch: true, dpr: 3 },
  { id: 'p414', w: 414, h: 896, touch: true, dpr: 3 },
  { id: 'teams375', w: 375, h: 640, touch: true, dpr: 3, note: 'Teams in-app visible area' },
  { id: 'p390safe', w: 390, h: 844, touch: true, dpr: 3, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
  { id: 'l844t', w: 844, h: 390, touch: true, dpr: 3 },
  { id: 'l844safe', w: 844, h: 390, touch: true, dpr: 3, safe: { top: 0, bottom: 21, left: 47, right: 47 } },
  { id: 't768', w: 768, h: 1024, touch: true, dpr: 2, note: 'tablet portrait' },
  { id: 'w600', w: 600, h: 800, touch: false, dpr: 1, note: 'between compact and centred bar' },
  { id: 'd1280', w: 1280, h: 800, touch: false, dpr: 1 },
  { id: 'l844m', w: 844, h: 390, touch: false, dpr: 1, note: 'small desktop window, mouse' },
]
const SEL = '.chip, .icon-btn, .btn-boost, .dbtn, .coach-card, .journal-ping, .hud-stat, .hud-menu-btn, .hud-menu__item'
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = {}
for (const vp of VIEWPORTS) {
  if (only && !only.split(',').includes(vp.id)) continue
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: vp.touch, hasTouch: vp.touch, serviceWorkers: 'block' })
  if (vp.safe) {
    // Headless has no notch: rewrite env(safe-area-inset-*) in served CSS
    // (Vite build inlines CSS into a .css asset).
    await ctx.route(/\.css(\?.*)?$/, async (route) => {
      const resp = await route.fetch(); let body = await resp.text()
      body = body.replace(/env\(\s*safe-area-inset-(top|bottom|left|right)\s*(,[^)]*)?\)/g, (_, s) => `${vp.safe[s]}px`)
      await route.fulfill({ response: resp, body })
    })
  }
  const page = await ctx.newPage(); const errs = []
  if (!coachVisible) await page.addInitScript(() => { try { localStorage.setItem('ran-xinh-onboarded', '1') } catch {} })
  page.on('pageerror', e => errs.push('pageerror: ' + e.message))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'), null, { timeout: 90000 })
  await sleep(1200)
  await page.click('.btn--primary')
  for (let i = 0; i < 10; i++) { await sleep(300); const bb = await page.$('.prologue-begin'); if (!bb) break; await bb.click() }
  await page.waitForFunction(() => document.querySelector('.hud-top'), null, { timeout: 30000 }).catch(() => {})
  await page.waitForFunction(() => document.querySelector('.coach-card'), null, { timeout: 6000 }).catch(() => {})
  await sleep(700)
  const shot = path.join(outdir, `${label}-${vp.id}.png`)
  await page.screenshot({ path: shot, timeout: 120000 })
  const info = await page.evaluate((SEL) => {
    const vis = e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 }
    const els = [...document.querySelectorAll(SEL)].filter(vis)
    const rects = els.map((e, i) => { const r = e.getBoundingClientRect(); return { i, name: (e.getAttribute('aria-label') || e.className.toString().split(' ')[0] + ':' + (e.textContent || '').trim().slice(0, 10)), cls: e.className.toString(), l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, tap: e.matches('button') } })
    // containment pairs (parent/child) are not overlaps
    const contains = els.map(a => els.map(b => a !== b && (a.contains(b) || b.contains(a))))
    const c = document.querySelector('canvas').getBoundingClientRect()
    return { rects, contains, canvas: { w: c.width, h: c.height }, coarse: matchMedia('(pointer: coarse)').matches, status: document.querySelector('.hud-top') ? 'playing' : 'other', showsControls: !!document.querySelector('.btn-boost') && vis(document.querySelector('.btn-boost')) }
  }, SEL)
  const { rects, contains } = info
  const overlaps = []
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    if (contains[i][j]) continue
    const a = rects[i], q = rects[j]
    const ow = Math.min(a.r, q.r) - Math.max(a.l, q.l), oh = Math.min(a.b, q.b) - Math.max(a.t, q.t)
    if (ow > 0.5 && oh > 0.5) overlaps.push({ a: a.name, b: q.name, area: Math.round(ow * oh) })
  }
  // project board cells
  const cam = cameraFor({ w: info.canvas.w, h: info.canvas.h, coarse: info.coarse, controls: info.showsControls, rects, safe: vp.safe, coachVisible })
  const camera = new THREE.PerspectiveCamera(cam.fov, info.canvas.w / info.canvas.h, 0.1, 500)
  camera.position.set(...cam.pos); camera.lookAt(new THREE.Vector3(...cam.look)); camera.updateMatrixWorld(); camera.updateProjectionMatrix()
  const P = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(camera); return [(v.x + 1) / 2 * info.canvas.w, (1 - v.y) / 2 * info.canvas.h] }
  const clip = (poly, r) => {
    const edges = [[p => p[0] >= r.l, (p, q) => [r.l, p[1] + (q[1] - p[1]) * (r.l - p[0]) / (q[0] - p[0])]], [p => p[0] <= r.r, (p, q) => [r.r, p[1] + (q[1] - p[1]) * (r.r - p[0]) / (q[0] - p[0])]], [p => p[1] >= r.t, (p, q) => [p[0] + (q[0] - p[0]) * (r.t - p[1]) / (q[1] - p[1]), r.t]], [p => p[1] <= r.b, (p, q) => [p[0] + (q[0] - p[0]) * (r.b - p[1]) / (q[1] - p[1]), r.b]]]
    let out = poly
    for (const [inside, inter] of edges) { const inp = out; out = []; for (let k = 0; k < inp.length; k++) { const p = inp[k], q = inp[(k + 1) % inp.length]; if (inside(q)) { if (!inside(p)) out.push(inter(p, q)); out.push(q) } else if (inside(p)) out.push(inter(p, q)) } if (!out.length) break }
    return out
  }
  const area = (p) => Math.abs(p.reduce((s, a, k) => { const q = p[(k + 1) % p.length]; return s + a[0] * q[1] - q[0] * a[1] }, 0)) / 2
  const covered = []; let offscreen = 0
  for (let cx = 0; cx < 20; cx++) for (let cz = 0; cz < 20; cz++) {
    const x0 = cx - 10, z0 = cz - 10
    const poly = [P(x0, z0), P(x0 + 1, z0), P(x0 + 1, z0 + 1), P(x0, z0 + 1)]
    const A = area(poly)
    const vis = area(clip(poly, { l: 0, t: 0, r: info.canvas.w, b: info.canvas.h }))
    if (vis < A * 0.999) offscreen++
    let worst = 0, by = null
    for (const r of rects) { const f = area(clip(poly, r)) / A; if (f > worst) { worst = f; by = r.name } }
    if (worst > 0.002) covered.push({ cx, cz, frac: +worst.toFixed(2), by })
  }
  const corners = [P(-10.25, -10.25), P(10.25, -10.25), P(10.25, 10.25), P(-10.25, 10.25)].map(p => p.map(Math.round))
  const lines = []
  for (let k = 0; k <= 20; k++) { lines.push([P(k - 10, -10), P(k - 10, 10)]); lines.push([P(-10, k - 10), P(10, k - 10)]) }
  const smallTaps = rects.filter(r => r.tap && (r.w < 44 - 0.5 || r.h < 44 - 0.5)).map(r => `${r.name} ${Math.round(r.w)}x${Math.round(r.h)}`)
  const boardTop = Math.min(...corners.map(p => p[1])), boardBot = Math.max(...corners.map(p => p[1]))
  results[vp.id] = { ...vp, status: info.status, coarse: info.coarse, controls: info.showsControls, rects, overlaps, covered, coveredAny: covered.length, coveredQuarter: covered.filter(c => c.frac >= 0.25).length, offscreen, corners, lines, smallTaps, boardTop, boardBot, errs, cam }
  console.log(`${label} ${vp.id} ${info.status} coarse=${info.coarse} controls=${info.showsControls} hudOverlaps=${overlaps.length} cellsCovered=${covered.length} (>=25%: ${results[vp.id].coveredQuarter}) offscreen=${offscreen} board y ${boardTop}..${boardBot}/${vp.h} smallTaps=${smallTaps.length} errs=${errs.length}`)
  await ctx.close()
}
fs.writeFileSync(path.join(outdir, `${label}.json`), JSON.stringify(results, null, 1))
await b.close()

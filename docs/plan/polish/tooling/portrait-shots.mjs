// Portrait screenshots + DOM metrics for docs/plan/POLISH_PLAN.md (workstream V).
// Tooling only — not part of the game build, not part of `npm test`.
// Same setup as docs/plan/hud/tooling (Playwright + headless Chrome, env PW_CORE / CHROME).
//
// usage (repo root, preview server running):
//   node docs/plan/polish/tooling/portrait-shots.mjs <url> <label> <outdir> [id,id]
// For each portrait viewport: <label>-<id>-title.png, -play.png (coach skipped),
// -coach.png (first coach step), -paused.png, and <label>-portrait.json with:
//   stat value font size/family + numeral style, d-pad/Dash rects,
//   padHit = share of the d-pad's square that lands on a direction button,
//   pause-sheet + title tap sizes.
import fs from 'fs'
import path from 'path'
const { chromium } = await import(process.env.PW_CORE || 'playwright-core')
const [url, label, outdir, only] = process.argv.slice(2)
fs.mkdirSync(outdir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const PORTRAIT = [
  { id: 'p390', w: 390, h: 844, dpr: 3 },
  { id: 'p375', w: 375, h: 667, dpr: 3 },
  { id: 'p414', w: 414, h: 896, dpr: 3 },
  { id: 'teams375', w: 375, h: 640, dpr: 3, note: 'Teams in-app visible area (HUD_PLAN)' },
  { id: 'p390safe', w: 390, h: 844, dpr: 3, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
]
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const out = {}
for (const vp of PORTRAIT) {
  if (only && !only.split(',').includes(vp.id)) continue
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  if (vp.safe) {
    await ctx.route(/\.css(\?.*)?$/, async (route) => {
      const resp = await route.fetch(); let body = await resp.text()
      body = body.replace(/env\(\s*safe-area-inset-(top|bottom|left|right)\s*(,[^)]*)?\)/g, (_, s) => `${vp.safe[s]}px`)
      await route.fulfill({ response: resp, body })
    })
  }
  const page = await ctx.newPage(); const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'), null, { timeout: 90000 })
  await sleep(1500)
  const shot = (s) => page.screenshot({ path: path.join(outdir, `${label}-${vp.id}-${s}.png`), timeout: 120000 })
  await shot('title')
  const titleTaps = await page.evaluate(() => [...document.querySelectorAll('button')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) } }))
  // Headless Chrome renders ~2 fps and the engine clamps dt to 0.1 s, but a
  // Classic snake still reaches the wall before the shots are done. Gameplay
  // shots therefore run in Zen Garden (walls wrap, no self-death) — the HUD
  // layout is the same; the title shot above is the default Classic title.
  await page.evaluate(() => localStorage.setItem('ran-xinh-mode', 'zen'))
  await page.reload({ waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'), null, { timeout: 90000 })
  await sleep(1200)
  await page.click('.btn--primary')
  for (let i = 0; i < 10; i++) { await sleep(300); const bb = await page.$('.prologue-begin'); if (!bb) break; await bb.click() }
  await page.waitForFunction(() => document.querySelector('.hud-top'), null, { timeout: 30000 }).catch(() => {})
  await page.waitForFunction(() => document.querySelector('.coach-card'), null, { timeout: 6000 }).catch(() => {})
  await sleep(500)
  await shot('coach')
  const coach = await page.$('.coach-card'); if (coach) await coach.click()
  await sleep(700)
  await shot('play')
  const play = await page.evaluate(() => {
    const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
    const val = document.querySelector('.hud-stat__value') || document.querySelector('.hud-stat strong, .hud-stat b, .hud-stat span:last-child')
    const lab = document.querySelector('.hud-stat__label') || document.querySelector('.hud-stat span:first-child')
    const cs = val ? getComputedStyle(val) : null
    const ls = lab ? getComputedStyle(lab) : null
    const pad = document.querySelector('.dpad')
    let padHit = null
    if (pad) {
      const r = pad.getBoundingClientRect(); let n = 0, hit = 0
      for (let y = r.top + 2; y < r.bottom; y += 4) for (let x = r.left + 2; x < r.right; x += 4) { n++; const el = document.elementFromPoint(x, y); if (el && el.closest('.dbtn')) hit++ }
      padHit = +(hit / n).toFixed(3)
    }
    return {
      status: document.querySelector('.hud-top') ? 'playing' : 'other',
      bar: R(document.querySelector('.hud-top')), stats: R(document.querySelector('.hud-stats')),
      statValue: cs && { fontSize: cs.fontSize, fontFamily: cs.fontFamily.split(',')[0], numeric: cs.fontVariantNumeric, color: cs.color },
      statLabel: ls && { fontSize: ls.fontSize, letterSpacing: ls.letterSpacing },
      dpad: R(pad), dbtn: [...document.querySelectorAll('.dbtn')].map(R), dash: R(document.querySelector('.btn-boost')), padHit,
    }
  })
  await page.click('[aria-label="Pause"]').catch(() => {})
  await sleep(900)
  await shot('paused')
  const pauseTaps = await page.evaluate(() => [...document.querySelectorAll('.sheet button, .pause-settings button')].map((e) => { const r = e.getBoundingClientRect(); return { name: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) } }))
  out[vp.id] = { ...vp, play, titleTaps, pauseTaps, errs }
  const p = play
  console.log(`${label} ${vp.id} ${p.status} statValue=${p.statValue?.fontSize} ${p.statValue?.fontFamily} numeric=${p.statValue?.numeric} label=${p.statLabel?.fontSize} dpad=${p.dpad?.w}x${p.dpad?.h}@y${p.dpad?.t} dbtn=${p.dbtn[0]?.w}px padHit=${p.padHit} dash=${p.dash?.w}px@x${p.dash?.l},y${p.dash?.t} pauseTaps<44=${pauseTaps.filter((t) => t.h < 44).length} errs=${errs.length}`)
  await ctx.close()
}
fs.writeFileSync(path.join(outdir, `${label}-portrait.json`), JSON.stringify(out, null, 1))
await b.close()

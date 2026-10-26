// Title + pause probe for docs/plan/POLISH_PLAN.md (workstream V, V04).
// Tooling only — not part of the game build, not part of `npm test`.
// Same setup as docs/plan/hud/tooling (Playwright + headless Chrome,
// env PW_CORE / CHROME). Measures what V04's acceptance criteria name:
//   - title: the 3 corner buttons' centres hit the buttons themselves
//     (elementFromPoint), sheet scroll (sh - ch), Start playing bottom,
//     mode-card bottoms, at 390x844 and 375x640;
//   - pause: every .sheet-actions button's size at 375x667 (V04 wants
//     one line of text, height >= 44px).
//
// usage (repo root, preview server running):
//   node docs/plan/polish/tooling/title-probe.mjs <url> <label> <outdir>
// Writes <label>-title.json and <label>-*.png screenshots.
import fs from 'fs'
import path from 'path'
const { chromium } = await import(process.env.PW_CORE || 'playwright-core')
const [url, label, outdir] = process.argv.slice(2)
if (!url || !label || !outdir) throw new Error('usage: title-probe.mjs <url> <label> <outdir>')
fs.mkdirSync(outdir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const out = {}

async function titleAt(w, h, id) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('.lockup', { timeout: 45000 })
  await page.screenshot({ path: path.join(outdir, `${label}-${id}-title.png`), timeout: 120000 })
  out[id] = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet')
    const primary = document.querySelector('.btn--primary')
    const modes = [...document.querySelectorAll('.mode-btn')]
    const corners = [...document.querySelectorAll('.chrome-actions .icon-btn')].map((btn) => {
      const r = btn.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { label: btn.getAttribute('aria-label'), visible: !!el && (el === btn || btn.contains(el)) }
    })
    return {
      sheet: { sh: sheet.scrollHeight, ch: sheet.clientHeight, scroll: sheet.scrollHeight - sheet.clientHeight },
      primaryBottom: primary ? Math.round(primary.getBoundingClientRect().bottom) : null,
      modeBottoms: modes.map((m) => Math.round(m.getBoundingClientRect().bottom)),
      corners,
    }
  })
  await ctx.close()
}

async function pauseAt(w, h, id) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('.lockup', { timeout: 45000 })
  await page.evaluate(() => document.querySelector('.btn--primary').click())
  for (let i = 0; i < 12; i++) {
    await sleep(400)
    if (await page.evaluate(() => !!document.querySelector('.hud-top'))) break
    await page.evaluate(() => { const b = document.querySelector('.prologue-begin'); if (b) b.click() })
  }
  await page.waitForSelector('.hud-top', { timeout: 30000 })
  await page.keyboard.press('p')
  await page.waitForSelector('.sheet[aria-label="Paused"]', { timeout: 10000 })
  await page.screenshot({ path: path.join(outdir, `${label}-${id}-paused.png`), timeout: 120000 })
  out[id] = await page.evaluate(() => [...document.querySelectorAll('.sheet[aria-label="Paused"] .sheet-actions .btn')].map((btn) => {
    const r = btn.getBoundingClientRect()
    return { text: btn.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }
  }))
  await ctx.close()
}

await titleAt(390, 844, 'p390')
await titleAt(375, 640, 'teams375')
await pauseAt(375, 667, 'p375')
await b.close()
fs.writeFileSync(path.join(outdir, `${label}-title.json`), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))

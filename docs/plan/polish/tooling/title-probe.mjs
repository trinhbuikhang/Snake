// Title + pause + corner-intersection probe for docs/plan/POLISH_PLAN.md
// (workstream V, V04 round 1). Tooling only — not part of the game
// build, not part of `npm test`. Same setup as docs/plan/hud/tooling
// (Playwright + headless Chrome, env PW_CORE / CHROME).
//
// Measures what V04's acceptance criteria name:
//   - title: the 3 corner buttons' centres hit the buttons themselves
//     (elementFromPoint), sheet scroll (sh - ch), Start playing bottom,
//     mode-card bottoms, at 390x844 and 375x640;
//   - pause: every .sheet-actions button's size at 375x667 (V04 wants
//     one line of text, height >= 44px);
//   - round-1 criterion 2: at scrollTop=0, the .chrome-actions rect
//     must intersect NO text/button element inside the sheet content,
//     for title, How to play, Garden, Journal at 390x844, 375x640,
//     375x667, 844x390, 600x800, 1280x800, and game over at 375x640
//     and 375x667 (game over needs a full run to death, so it runs
//     only at the two viewports in the review). Each sheet also
//     reports cardTop vs the sheet's padding-top: cardTop must be
//     >= padding-top (an overflowing sheet must scroll from its top,
//     not from a negative centred offset).
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
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] })
const out = {}


// Corner rects vs text/button elements inside the sheet content.
// Returns the list of intersections (empty = pass). Note: this whole
// function is serialized into the page by page.evaluate, so it must
// not close over module-scope variables.
function intersections() {
  const TEXT_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'SPAN', 'BUTTON', 'LABEL', 'A', 'KBD', 'B', 'STRONG', 'EM'])
  const sheet = document.querySelector('.sheet')
  const card = document.querySelector('.sheet-card') || document.querySelector('.lockup')
  const corners = [...document.querySelectorAll('.chrome-actions .icon-btn')]
  const hits = []
  const els = [...card.querySelectorAll('*')].filter((e) => {
    if (!TEXT_TAGS.has(e.tagName)) return false
    const r = e.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity <= 0.05) return false
    return (e.textContent || '').trim().length > 0
  })
  for (const c of corners) {
    const cr = c.getBoundingClientRect()
    for (const e of els) {
      const r = e.getBoundingClientRect()
      const ow = Math.min(cr.right, r.right) - Math.max(cr.left, r.left)
      const oh = Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)
      if (ow > 0.5 && oh > 0.5) {
        hits.push({ corner: c.getAttribute('aria-label'), el: `${e.tagName}.${e.className}`.slice(0, 40), text: e.textContent.trim().slice(0, 30) })
      }
    }
  }
  return {
    scrollTop: sheet.scrollTop,
    cardTop: Math.round(card.getBoundingClientRect().top),
    sheetPaddingTop: getComputedStyle(sheet).paddingTop,
    hits,
  }
}

async function freshPage(w, h, touch) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForSelector('.lockup', { timeout: 45000 })
  return { ctx, page }
}

async function titleAt(w, h, id) {
  const { ctx, page } = await freshPage(w, h, true)
  await page.screenshot({ path: path.join(outdir, `${label}-${id}-title.png`), timeout: 120000 })
  out[id] = {
    ...(await page.evaluate(() => {
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
    })),
    intersections: await page.evaluate(intersections),
  }
  await ctx.close()
}

async function sheetAt(w, h, touch, id, ariaLabel, shortId, opener) {
  const { ctx, page } = await freshPage(w, h, touch)
  await page.evaluate(opener)
  await page.waitForFunction((name) => !!document.querySelector(`.sheet[aria-label="${name}"]`), ariaLabel, { timeout: 15000 })
  await sleep(500)
  // Fresh sheets mount at scrollTop 0; force it so the measurement
  // cannot depend on leftover scroll state.
  await page.evaluate(() => { document.querySelector('.sheet').scrollTop = 0 })
  await sleep(200)
  await page.screenshot({ path: path.join(outdir, `${label}-${id}-${shortId}.png`), timeout: 120000 })
  out[`${id}-${shortId}`] = await page.evaluate(intersections)
  await ctx.close()
}

const OPENERS = [
  { aria: 'How to play', short: 'howto', fn: () => [...document.querySelectorAll('.title-menu .btn')].find((x) => x.textContent.includes('How to')).click() },
  { aria: 'The Garden Remembers', short: 'garden', fn: () => [...document.querySelectorAll('.title-menu .btn')].find((x) => x.textContent.includes('Garden')).click() },
  { aria: 'Journal of whispers and verses', short: 'journal', fn: () => document.querySelector('.journal-link').click() },
]

async function pauseAt(w, h, id) {
  const { ctx, page } = await freshPage(w, h, true)
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

async function gameOverAt(w, h, id) {
  const { ctx, page } = await freshPage(w, h, true)
  await page.evaluate(() => document.querySelector('.btn--primary').click())
  for (let i = 0; i < 12; i++) {
    await sleep(400)
    if (await page.evaluate(() => !!document.querySelector('.hud-top'))) break
    await page.evaluate(() => { const b = document.querySelector('.prologue-begin'); if (b) b.click() })
  }
  await page.waitForSelector('.hud-top', { timeout: 30000 })
  // Unsteered Classic snake reaches the wall by itself.
  await page.waitForFunction(() => !!document.querySelector('.sheet[aria-label="Game over"]'), null, { timeout: 180000 })
  await sleep(500)
  await page.evaluate(() => { document.querySelector('.sheet').scrollTop = 0 })
  await sleep(200)
  await page.screenshot({ path: path.join(outdir, `${label}-${id}-gameover.png`), timeout: 120000 })
  out[`${id}-gameover`] = await page.evaluate(intersections)
  await ctx.close()
}

await titleAt(390, 844, 'p390')
await titleAt(375, 640, 'teams375')
await pauseAt(375, 667, 'p375')

const SHEET_VPS = [
  { id: 'p390', w: 390, h: 844, touch: true },
  { id: 'teams375', w: 375, h: 640, touch: true },
  { id: 'p375', w: 375, h: 667, touch: true },
  { id: 'l844t', w: 844, h: 390, touch: true },
  { id: 'w600', w: 600, h: 800, touch: false },
  { id: 'd1280', w: 1280, h: 800, touch: false },
]
for (const vp of SHEET_VPS) {
  for (const o of OPENERS) {
    await sheetAt(vp.w, vp.h, vp.touch, vp.id, o.aria, o.short, o.fn)
  }
}
await gameOverAt(375, 640, 'teams375')
await gameOverAt(375, 667, 'p375')

await b.close()
fs.writeFileSync(path.join(outdir, `${label}-title.json`), JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))

// Title-sheet probe for docs/plan/POLISH_PLAN.md (V04). Tooling only.
// Prints, at 390x844 and 375x640 (touch), whether the title sheet needs
// scrolling (scrollHeight vs clientHeight), whether the corner buttons
// (.chrome-actions: camera / touch pad / mute) are actually tappable
// (elementFromPoint at their centre), and every visible button's rect.
// usage (repo root, preview running): PW_CORE=... node docs/plan/polish/tooling/title-probe.mjs [url]
const { chromium } = await import(process.env.PW_CORE || 'playwright-core')
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [w, h] of [[390, 844], [375, 640]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.goto(process.argv[2] || 'http://localhost:4462/', { waitUntil: 'load' })
  await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'), null, { timeout: 90000 })
  await new Promise(r => setTimeout(r, 1200))
  const info = await page.evaluate(() => {
    const ov = document.querySelector('.title-overlay, .overlay--title, .title') || document.querySelector('.btn--primary').closest('[class*="overlay"], .sheet, section, div')
    const sc = (e) => { let x = e; while (x && x !== document.body) { const cs = getComputedStyle(x); if (/(auto|scroll)/.test(cs.overflowY) && x.scrollHeight > x.clientHeight + 1) return { cls: x.className, sh: x.scrollHeight, ch: x.clientHeight }; x = x.parentElement } return null }
    const R = (e) => e && (({ top, bottom, left, right }) => ({ t: Math.round(top), b: Math.round(bottom), l: Math.round(left), r: Math.round(right) }))(e.getBoundingClientRect())
    const ca = document.querySelector('.chrome-actions')
    let caTop = null
    if (ca) { const r = ca.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); caTop = el && (el.closest('.chrome-actions') ? 'visible' : 'covered by ' + el.className) }
    const btns = [...document.querySelectorAll('button')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ n: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 20), ...R(e) }))
    return { ovCls: ov && ov.className, scroll: sc(document.querySelector('.btn--primary')), docSH: document.documentElement.scrollHeight, chrome: R(ca), caTop, btns }
  })
  console.log(w, h, JSON.stringify(info))
  await ctx.close()
}
await b.close()

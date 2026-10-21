import { chromium } from 'playwright-core'
const url = (process.argv[2] || 'http://localhost:4317/') + '?perf'
const tag = process.argv[3] || 'before'
const OUT = process.env.OUT || '/workspace/snake-audit/snake-look'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, serviceWorkers: 'block' })
const page = await ctx.newPage(); await page.addInitScript((skin) => { globalThis.__cuteNoBlink = true; globalThis.__serpentNoBlink = true; if (skin) localStorage.setItem('ran-xinh-skin', JSON.stringify({ owned: ['moonJade', 'plushMoon'], selected: skin })) }, process.env.SKIN || null); const errs = []; page.on('pageerror', e => errs.push(e.message))
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'), null, { timeout: 30000 })
await sleep(1500)
await page.click('.btn--primary')
for (let i = 0; i < 10; i++) { await sleep(300); const bb = await page.$('.prologue-begin'); if (!bb) break; await bb.click() }
await page.waitForFunction(() => !document.querySelector('.ready-veil'), null, { timeout: 20000 }).catch(() => {})
await page.evaluate(() => {
  const L = __perf.logic
  L.snake = [[13,6],[12,6],[11,6],[10,6],[9,6],[9,7],[9,8],[10,8],[11,8],[12,8],[12,9],[12,10],[11,10],[10,10],[9,10],[8,10]].map(([x,y]) => ({ x, y }))
  L.dir = 'right'; L.queue = []
})
// wait until one tick consumed the new snake, then pause mid-motion-free
await page.waitForFunction(() => __perf.logic.snake[0].x !== 13, null, { timeout: 20000 })
await page.keyboard.press('KeyP'); await sleep(500)
if (process.env.DBG) console.log('status', await page.evaluate(() => document.querySelector('[role=dialog],[role=status]')?.getAttribute('aria-label')), await page.evaluate(() => JSON.stringify({cam: __perf.camera.position, tgt: __perf.camPosTarget, look: __perf.camLookTarget, snake: __perf.logic.snake.slice(0,3), alive: __perf.logic.alive})))

import fs from 'fs'
if (process.env.EVAL) console.log('eval', await page.evaluate(process.env.EVAL))
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const grab = (file) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(document.querySelector('canvas').toDataURL('image/png'))))).then(d => fs.writeFileSync(file, Buffer.from(d.split(',')[1], 'base64')))
const view = async (name, pos, look) => {
  if (ONLY && !ONLY.includes(name)) return
  await page.evaluate(([pos, look]) => { const P = __perf; if (pos) { P.camPosTarget.set(...pos); P.camera.position.set(...pos) } if (look) P.camLookTarget.set(...look) }, [pos, look])
  await sleep(2500)
  await grab(`${OUT}/${tag}-${name}.png`); console.log('saved', `${OUT}/${tag}-${name}.png`)
}
const head = await page.evaluate(() => { const h = __perf.logic.snake[0]; return [h.x - 9.5, 0.4, h.y - 9.5] })
console.log('head at', head)
await view('default-cam', null, null)
const c = [1.0, 0.3, -1.6] // body centre (world)
await view('close-3q', [c[0] + 4.5, 4.2, c[2] + 5.8], c)
await view('close-head', [head[0] + 2.6, 1.6, head[2] + 2.4], [head[0] - 0.3, 0.4, head[2]])
await view('close-top', [c[0], 9, c[2] + 2.5], c)
await view('face', [head[0] + 2.9, 1.35, head[2] + 0.5], [head[0], 0.7, head[2]])
console.log('errors', errs)
await b.close()

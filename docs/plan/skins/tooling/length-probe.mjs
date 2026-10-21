import { chromium } from 'playwright-core'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: +(process.argv[2] || 1.5), serviceWorkers: 'block' })
const page = await ctx.newPage()
await page.goto('http://localhost:4317/?perf&rig=' + (process.env.RIG || 'A'), { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'))
await sleep(1500)
await page.click('.btn--primary')
for (let i = 0; i < 10; i++) { await sleep(300); const bb = await page.$('.prologue-begin'); if (!bb) break; await bb.click() }
await page.waitForFunction(() => !document.querySelector('.ready-veil'), null, { timeout: 20000 }).catch(() => {})
for (const len of [3, 20, 60, 120]) {
  const r = await page.evaluate(async (len) => {
    const P = __perf, L = P.logic
    // serpentine body of `len` cells, head at top-left moving right
    const cells = []; let x = 0, y = 1, dx = 1
    while (cells.length < len) { cells.push({ x, y }); x += dx; if (x > 17 || x < 0) { x -= dx; dx = -dx; y++ ; } }
    cells.reverse() // head = last generated
    L.snake = cells
    const h = cells[0], n = cells[1]; L.dir = h.y !== n.y ? 'down' : (h.x > n.x ? 'right' : 'left'); L.queue = []
    await new Promise(r => setTimeout(r, 1500))
    const ri = P.renderer.info; ri.autoReset = false; ri.reset()
    await new Promise(r => requestAnimationFrame(() => { ri.reset(); requestAnimationFrame(r) }))
    const out = { calls: ri.render.calls, tris: ri.render.triangles }
    ri.autoReset = true
    let vis = 0; P.scene.traverseVisible(o => { if (o.isMesh) vis++ })
    const s = new P.THREE.Vector2(); P.renderer.getDrawingBufferSize(s)
    const c = P.composer.renderTarget1
    return { len: L.snake.length, alive: L.alive, ...out, visibleMeshes: vis, buffer: s.x + 'x' + s.y, composer: c.width + 'x' + c.height + ' x' + c.samples + 'MSAA', attrsAntialias: P.renderer.getContextAttributes().antialias }
  }, len)
  console.log(JSON.stringify(r))
}
await b.close()

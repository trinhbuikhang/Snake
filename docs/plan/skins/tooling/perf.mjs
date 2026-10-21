import { chromium } from 'playwright-core'
import fs from 'fs'
const url = (process.argv[2] || 'http://localhost:4317/') + '?perf'
const DPR = +(process.argv[3] || 1)
const OUT = '/workspace/snake-audit/perf'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: DPR, serviceWorkers: 'block' })
const page = await ctx.newPage()
const errs = []; page.on('pageerror', e => errs.push(e.message))
await page.addInitScript(() => {
  // React commit counter (works with production react-dom)
  window.__commits = 0
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, isDisabled: false, renderers: new Map(), inject() { return 1 }, onCommitFiberRoot() { window.__commits++ }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {} }
  // rAF callback duration
  window.__rafDur = []
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); window.__rafDur.push(performance.now() - s) })
  window.__long = []
  try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }) } catch {}
})
const t0 = Date.now()
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'), null, { timeout: 30000 })
console.log('engine first frame after', Date.now() - t0, 'ms (swiftshader, localhost)')
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const r = performance.getEntriesByType('resource').map(e => [e.name.split('/').pop(), Math.round(e.transferSize || e.encodedBodySize), Math.round(e.duration)]); return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), r } })
console.log('nav', JSON.stringify(nav))
await sleep(1500)
const titleProgs = await page.evaluate(() => __perf.renderer.info.programs.length)
// start run
await page.click('.btn--primary')
for (let i = 0; i < 10; i++) { await sleep(300); const bb = await page.$('.prologue-begin'); if (!bb) break; await bb.click() }
// close any how-to / coach
await page.evaluate(() => document.querySelectorAll('.howto-close,.coach-skip').forEach(e => e.click()))
await page.waitForFunction(() => !document.querySelector('.ready-veil'), null, { timeout: 15000 }).catch(() => {})
// steer in a square; sample per-frame renderer.info
await page.evaluate(() => {
  const P = window.__perf; const r = P.renderer
  r.info.autoReset = false
  window.__frames = []; window.__progTimeline = []
  window.__commits0 = window.__commits
  window.__rafDur.length = 0; window.__long0 = window.__long.length
  const keys = ['ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']; let k = 0
  window.__steer = setInterval(() => { const code = keys[k++ % 4]; window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code })) }, 560)
  const t0 = performance.now()
  const f = () => {
    const i = r.info
    window.__frames.push({ t: performance.now() - t0, calls: i.render.calls, tris: i.render.triangles, pts: i.render.points, lines: i.render.lines, geos: i.memory.geometries, tex: i.memory.textures, progs: i.programs.length, head: [P.rig.group.position.x, P.rig.group.position.z] })
    i.reset()
    if (performance.now() - t0 < 12000) requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
})
// CPU profile for 6s
const cdp = await ctx.newCDPSession(page)
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await sleep(1500)
await cdp.send('Profiler.start')
await sleep(6000)
const { profile } = await cdp.send('Profiler.stop')
fs.writeFileSync(`${OUT}/play.cpuprofile`, JSON.stringify(profile))
await page.screenshot({ path: `${OUT}/perf-during-play-dpr${DPR}.png` })
await sleep(4600)
const res = await page.evaluate(() => {
  clearInterval(window.__steer)
  const P = window.__perf, r = P.renderer, c = P.composer, bp = P.bloomPass
  const objs = { meshes: 0, visibleMeshes: 0, shadowCasters: 0, lights: [], materials: new Set() }
  P.scene.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isSprite || o.isLine) { objs.visibleMeshes++; if (o.castShadow) objs.shadowCasters++; objs.materials.add(o.material.uuid) } if (o.isLight) objs.lights.push(o.type + (o.castShadow ? '(shadow ' + o.shadow.mapSize.x + ')' : '')) })
  P.scene.traverse(o => { if (o.isMesh) objs.meshes++ })
  const size = new P.THREE.Vector2(); r.getDrawingBufferSize(size)
  return {
    status: document.querySelector('[role=dialog],[role=status]')?.getAttribute('aria-label') || 'none',
    pixelRatio: r.getPixelRatio(), drawingBuffer: [size.x, size.y],
    composerRT: c && [c.renderTarget1.width, c.renderTarget1.height, 'samples', c.renderTarget1.samples, c.renderTarget1.texture.type],
    bloomRTs: bp && bp.renderTargetsHorizontal.map(t => t.width + 'x' + t.height), bloomBright: bp && [bp.renderTargetBright.width, bp.renderTargetBright.height],
    shadow: [P.moon.shadow.mapSize.x, r.shadowMap.type],
    qualityIdx: P.getQ(), gov: (({ warmIntervals, ...g }) => g)(P.getGov()),
    objs: { ...objs, materials: objs.materials.size },
    programs: r.info.programs.length,
    frames: window.__frames, raf: window.__rafDur.slice(), commits: window.__commits - window.__commits0,
    long: window.__long.slice(window.__long0), gl: (() => { const gl = r.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?' })(),
  }
})
const fr = res.frames
const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { n: s.length, min: s[0], med: s[s.length >> 1], p95: s[Math.floor(s.length * .95)], max: s[s.length - 1] } }
console.log(JSON.stringify({ ...res, frames: undefined, raf: undefined }, null, 1))
console.log('title-screen programs:', titleProgs)
console.log('draw calls/frame', JSON.stringify(stat(fr.map(f => f.calls))))
console.log('triangles/frame', JSON.stringify(stat(fr.map(f => f.tris))))
console.log('programs timeline', JSON.stringify([...new Set(fr.map(f => f.progs))]), 'textures', JSON.stringify([...new Set(fr.map(f => f.tex))]), 'geos', JSON.stringify([...new Set(fr.map(f => f.geos))]))
console.log('frames sampled', fr.length, 'over 12s => fps', (fr.length / 12).toFixed(1))
console.log('rAF callback ms', JSON.stringify(stat(res.raf.map(x => +x.toFixed(2)))))
console.log('react commits during 12s play:', res.commits)
fs.writeFileSync(`${OUT}/frames-dpr${DPR}.json`, JSON.stringify(fr))
console.log('errors', errs)
await b.close()

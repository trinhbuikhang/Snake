import { chromium } from 'playwright-core'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const page = await b.newPage({ viewport: { width: 960, height: 600 } })
await page.addInitScript(() => { window.__rafDur = []; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); window.__rafDur.push(performance.now() - s) }) })
await page.goto('http://localhost:4317/?perf', { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.garden-canvas--ready'))
await sleep(2500)
const probe = (label, fn) => page.evaluate(async ([label, fn]) => {
  const P = window.__perf; const before = P.renderer.info.programs.length
  window.__rafDur.length = 0
  eval(fn)
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))
  const base = window.__rafDur.slice()
  return `${label}: programs ${before} -> ${P.renderer.info.programs.length}; frame JS ms ${base.map(x => x.toFixed(0)).join(',')}`
}, [label, fn])
console.log(await probe('baseline (title, food hidden)', ''))
for (const t of ['earth', 'mars', 'saturn', 'jupiter', 'neptune']) console.log(await probe('first ' + t, `P.garden.setFood(0,0,false,'${t}')`))
console.log(await probe('first sun/bloom', `P.garden.setFood(0,0,true,'sun')`))
console.log(await probe('hideFood (1 fewer point light)', `P.garden.hideFood()`))
console.log(await probe('show again', `P.garden.setFood(0,0,false,'earth')`))
console.log(await probe('first eat burst+popup', `P.garden.burstAt(0,0.85,0,false,'earth',1)`))
console.log(await probe('death petals', `P.garden.petalFall()`))
console.log('checkShaderErrors =', await page.evaluate(() => __perf.renderer.debug.checkShaderErrors), ' KHR_parallel_shader_compile =', await page.evaluate(() => !!__perf.renderer.getContext().getExtension('KHR_parallel_shader_compile')))
await b.close()

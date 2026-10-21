import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { createEngine } from './engine.js'
import { useGame } from '../game/store.js'

// Engine lifecycle tests (T08, plus the PR #23 review note: the
// startup applyQuality() call had no automated guard).
//
// The real three.js module is used for the scene graph and math, with
// only the GPU-bound pieces replaced: WebGLRenderer, PMREMGenerator,
// the postprocessing passes, and the garden/rig/decor builders. The
// audio module is replaced with spies. Everything else — the store,
// the game logic, the governor — is the real code, so these tests run
// the engine's actual construction, start() and destroy() paths.

const h = vi.hoisted(() => ({
  composers: [],
  renderers: [],
  bloomPasses: [],
  renderPasses: [],
  outputPasses: [],
  roomEnvs: [],
  winListeners: {},
  docListeners: {},
  fakeNow: null,
  roCallbacks: [],
  raf: new Map(),
  nextRafId: 1,
  scene: null,
  envTex: { isTexture: true, dispose: vi.fn() },
  cancelAnimationFrame: null,
  audio: null,
  garden: null,
  rig: null,
  rigCalls: [],
  nextRigs: [],
  pendingCompile: null,
  decor: null,
  noCompileAsync: false,
  foodRestore: null,
}))

vi.mock('three', async () => {
  const actual = await vi.importActual('three')
  class FakeRenderer {
    constructor(params = {}) {
      this.params = params
      this.pixelRatios = []
      this.shadowMap = {}
      this.debug = {}
      this.disposeCalls = 0
      this.compileCalls = []
      this.compileAsyncCalls = []
      this.renderCalls = []
      this.events = []
      this.currentTarget = null
      if (h.noCompileAsync) this.compileAsync = undefined
      h.renderers.push(this)
    }
    setPixelRatio(r) {
      this.pixelRatios.push(r)
    }
    setSize() {}
    getRenderTarget() {
      return this.currentTarget
    }
    setRenderTarget(t) {
      this.events.push(['setRenderTarget', t])
      this.currentTarget = t
    }
    render(scene, camera) {
      this.events.push(['render'])
      this.renderCalls.push([scene, camera])
    }
    compile(scene, camera) {
      this.events.push(['compile'])
      this.compileCalls.push([scene, camera])
    }
    compileAsync(scene, camera) {
      this.events.push(['compileAsync'])
      this.compileAsyncCalls.push([scene, camera])
      if (h.pendingCompile) return h.pendingCompile.promise
      return Promise.resolve(scene)
    }
    dispose() {
      this.disposeCalls += 1
    }
  }
  class FakePMREMGenerator {
    fromScene() {
      return { texture: h.envTex }
    }
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePMREMGenerator }
})

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    constructor() {
      this.renderTarget1 = { samples: 0, dispose: vi.fn() }
      this.renderTarget2 = { samples: 0, dispose: vi.fn() }
      this.writeBuffer = this.renderTarget1
      this.readBuffer = this.renderTarget2
      this.passes = []
      this.dispose = vi.fn()
      h.composers.push(this)
    }
    addPass(pass) {
      this.passes.push(pass)
    }
    setPixelRatio() {}
    setSize() {}
    render() {}
  },
}))
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
  RenderPass: class {
    constructor() {
      this.dispose = vi.fn()
      h.renderPasses.push(this)
    }
  },
}))
vi.mock('three/addons/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    constructor() {
      this.enabled = true
      this.dispose = vi.fn()
      h.bloomPasses.push(this)
    }
  },
}))
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
  OutputPass: class {
    constructor() {
      this.dispose = vi.fn()
      h.outputPasses.push(this)
    }
  },
}))
vi.mock('three/addons/environments/RoomEnvironment.js', () => ({
  RoomEnvironment: class {
    constructor() {
      this.dispose = vi.fn()
      h.roomEnvs.push(this)
    }
  },
}))

vi.mock('./garden.js', () => ({
  buildGarden: (scene) => {
    h.scene = scene
    return h.garden
  },
}))
vi.mock('./snakeRig.js', () => ({
  createSnakeRig: (scene, skinId) => {
    h.rigCalls.push(skinId)
    return h.nextRigs.length ? h.nextRigs.shift() : h.rig
  },
}))
vi.mock('./decor.js', () => ({ buildDecor: () => h.decor }))

vi.mock('../audio/sound.js', () => {
  const audio = {
    unlockAudio: vi.fn(),
    setMuted: vi.fn(),
    playEat: vi.fn(),
    playBloom: vi.fn(),
    playVerse: vi.fn(),
    playTurn: vi.fn(),
    playDeath: vi.fn(),
    setPadOn: vi.fn(),
    setWaterOn: vi.fn(),
    setAmbientOn: vi.fn(),
    setAmbientPhase: vi.fn(),
  }
  h.audio = audio
  return { default: audio, audio, playVerse: audio.playVerse }
})

// ---- DOM stubs -------------------------------------------------------------
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  devicePixelRatio: 2,
  addEventListener: vi.fn((type, fn) => {
    h.winListeners[type] = fn
  }),
  removeEventListener: vi.fn((type) => {
    delete h.winListeners[type]
  }),
}
globalThis.document = {
  addEventListener: vi.fn((type, fn) => {
    h.docListeners[type] = fn
  }),
  removeEventListener: vi.fn((type) => {
    delete h.docListeners[type]
  }),
  hidden: false,
}
globalThis.ResizeObserver = class {
  constructor(cb) {
    h.roCallbacks.push(cb)
  }
  observe() {}
  disconnect() {}
}
globalThis.requestAnimationFrame = (cb) => {
  const id = h.nextRafId
  h.nextRafId += 1
  h.raf.set(id, cb)
  return id
}
h.cancelAnimationFrame = vi.fn((id) => {
  h.raf.delete(id)
})
globalThis.cancelAnimationFrame = h.cancelAnimationFrame

const initialStoreState = useGame.getState()

function freshCanvas() {
  return {
    clientWidth: 900,
    clientHeight: 700,
    parentElement: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

// Drive the engine's rAF loop forward in 100ms steps (dt clamps at
// 0.1s per frame, so each step advances engine clocks by exactly 0.1s).
// The clock is continuous across calls within a test — the engine's own
// prevTS bookkeeping depends on monotonic timestamps.
function runFrames(msTotal) {
  if (h.fakeNow === null) h.fakeNow = performance.now()
  for (let elapsed = 0; elapsed < msTotal; elapsed += 100) {
    const entries = [...h.raf.entries()]
    if (entries.length === 0) return
    const [id, cb] = entries[entries.length - 1]
    h.raf.delete(id)
    h.fakeNow += 100
    cb(h.fakeNow)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useGame.setState(initialStoreState, true)
  h.composers = []
  h.renderers = []
  h.bloomPasses = []
  h.renderPasses = []
  h.outputPasses = []
  h.roomEnvs = []
  h.winListeners = {}
  h.docListeners = {}
  h.fakeNow = null
  h.roCallbacks = []
  h.raf = new Map()
  h.scene = null
  h.noCompileAsync = false
  h.foodRestore = vi.fn()
  h.garden = {
    moonGroup: { scale: { setScalar: vi.fn() } },
    setFoodGlow: vi.fn(),
    setFood: vi.fn(),
    hideFood: vi.fn(),
    prepareFoodForCompile: vi.fn(() => h.foodRestore),
    burstAt: vi.fn(),
    petalFall: vi.fn(),
    addRipple: vi.fn(),
    update: vi.fn(),
  }
  h.rigCalls = []
  h.nextRigs = []
  h.pendingCompile = null
  h.rig = {
    death: null,
    group: { position: new THREE.Vector3(0, 0, 0) },
    setInk: vi.fn(),
    reset: vi.fn(),
    setDir: vi.fn(),
    paint: vi.fn(),
    onStep: vi.fn(),
    onEat: vi.fn(),
    advanceDeath: vi.fn(),
    startDeath: vi.fn(),
    detach: vi.fn(),
    dispose: vi.fn(),
  }
  h.decor = { setLanternCount: vi.fn(), setBloomCount: vi.fn(), update: vi.fn() }
})

describe('createEngine lifecycle', () => {
  it('start() applies the initial quality step: composer targets retargeted exactly once', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    const composer = h.composers[0]
    // The PR #23 guard: without the startup applyQuality() call the
    // targets are never retargeted at all (no dispose). Since P03 the
    // count itself comes from msaaFor(effective dpr): this window
    // reports DPR 2, step 0 caps at 1.5 → 0 samples.
    expect(composer.renderTarget1.samples).toBe(0)
    expect(composer.renderTarget2.samples).toBe(0)
    expect(composer.renderTarget1.dispose).toHaveBeenCalledTimes(1)
    expect(composer.renderTarget2.dispose).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('resizes after startup never retarget MSAA again', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    const composer = h.composers[0]
    const onResize = h.roCallbacks[0]
    for (let i = 0; i < 5; i += 1) onResize()
    expect(composer.renderTarget1.samples).toBe(0)
    expect(composer.renderTarget1.dispose).toHaveBeenCalledTimes(1)
    expect(composer.renderTarget2.dispose).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('destroy() releases the composer, the scene resources and the renderer', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    const composer = h.composers[0]
    // A probe mesh with real geometry/material/texture in the scene.
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const tex = { isTexture: true, dispose: vi.fn() }
    const mat = new THREE.MeshBasicMaterial({ map: tex })
    const geoDispose = vi.spyOn(geo, 'dispose')
    const matDispose = vi.spyOn(mat, 'dispose')
    h.scene.add(new THREE.Mesh(geo, mat))

    engine.destroy()

    expect(h.cancelAnimationFrame).toHaveBeenCalled()
    expect(composer.renderTarget1.dispose).toHaveBeenCalledTimes(2) // startup retarget + destroy
    expect(composer.renderTarget2.dispose).toHaveBeenCalledTimes(2)
    expect(composer.dispose).toHaveBeenCalledTimes(1)
    expect(h.bloomPasses[0].dispose).toHaveBeenCalledTimes(1)
    expect(geoDispose).toHaveBeenCalledTimes(1)
    expect(matDispose).toHaveBeenCalledTimes(1)
    expect(tex.dispose).toHaveBeenCalledTimes(1)
    expect(h.renderers[0].disposeCalls).toBe(1)
    expect(h.envTex.dispose).toHaveBeenCalled()
  })

  it("destroy() disposes the moon light's shadow map (T08 review)", () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    const moon = h.scene.children.find((c) => c.isDirectionalLight)
    expect(moon).toBeTruthy()
    // The real renderer allocates the shadow map on first render; stand
    // in for that GPU target — it is the largest resource destroy()
    // used to leak on every remount (2048x2048).
    const mapDispose = vi.fn()
    moon.shadow.map = { dispose: mapDispose }
    const shadowDispose = vi.spyOn(moon.shadow, 'dispose')

    engine.destroy()

    expect(shadowDispose).toHaveBeenCalledTimes(1)
    expect(mapDispose).toHaveBeenCalledTimes(1)
  })

  it('destroy() disposes the temporary RoomEnvironment (Codex P2 on PR #25)', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    expect(h.roomEnvs).toHaveLength(1)

    engine.destroy()

    expect(h.roomEnvs[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('destroy() disposes every composer pass exactly once (T08 review)', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    const composer = h.composers[0]
    expect(composer.passes).toHaveLength(3) // RenderPass, bloom, OutputPass

    engine.destroy()

    expect(h.renderPasses[0].dispose).toHaveBeenCalledTimes(1)
    expect(h.bloomPasses[0].dispose).toHaveBeenCalledTimes(1)
    expect(h.outputPasses[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('a blur during the ready beat holds the run at ready until focus returns (T10c)', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    useGame.getState().start()
    useGame.getState().beginNight()
    expect(useGame.getState().status).toBe('ready')

    // Halfway through the 1.8s beat, the window loses focus.
    runFrames(1000)
    expect(useGame.getState().status).toBe('ready')
    h.winListeners.blur()

    // However long the player is away, the run must not start itself.
    runFrames(5000)
    expect(useGame.getState().status).toBe('ready')

    // On return the beat restarts from zero: a full READY_BEAT_S of
    // attended frames is required before play begins.
    h.winListeners.focus()
    runFrames(1000)
    expect(useGame.getState().status).toBe('ready')
    runFrames(1000)
    expect(useGame.getState().status).toBe('playing')
    engine.destroy()
  })

  it('precompiles shaders once at init with all food shown, then restores visibility (P02)', async () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    const renderer = h.renderers[0]
    expect(h.garden.prepareFoodForCompile).toHaveBeenCalledTimes(1)
    expect(renderer.compileAsyncCalls).toHaveLength(1)
    expect(renderer.compileAsyncCalls[0][0]).toBe(h.scene)
    expect(renderer.compileAsyncCalls[0][1]).toBeInstanceOf(THREE.PerspectiveCamera)
    expect(renderer.compileCalls).toHaveLength(0)
    // The restore runs when the async compile settles.
    await new Promise((r) => setTimeout(r, 0))
    expect(h.foodRestore).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('falls back to compile() when compileAsync is unavailable (P02)', async () => {
    h.noCompileAsync = true
    const engine = createEngine(freshCanvas(), { reduced: false })
    const renderer = h.renderers[0]
    expect(renderer.compileAsyncCalls).toHaveLength(0)
    expect(renderer.compileCalls).toHaveLength(1)
    await new Promise((r) => setTimeout(r, 0))
    expect(h.foodRestore).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('compiles against the composer read buffer and restores the target before awaiting (P02 round 2)', async () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    const renderer = h.renderers[0]
    const readBuffer = h.composers[0].readBuffer
    const targetEvents = renderer.events.filter(([k]) => k === 'setRenderTarget').map(([, t]) => t)
    expect(targetEvents).toEqual([readBuffer, null]) // aim at readBuffer, back to the previous (null) target
    const kinds = renderer.events.map(([k]) => k)
    expect(kinds.indexOf('setRenderTarget')).toBeLessThan(kinds.indexOf('compileAsync'))
    // The restore already happened synchronously during createEngine —
    // before the async compile settles (no await has run yet here).
    expect(renderer.currentTarget).toBe(null)
    await new Promise((r) => setTimeout(r, 0))
    expect(h.foodRestore).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('warms up with one synchronous off-screen render on the second frame (P02 round 2)', async () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    const renderer = h.renderers[0]
    await new Promise((r) => setTimeout(r, 0)) // let the init compile settle
    expect(h.garden.prepareFoodForCompile).toHaveBeenCalledTimes(1)
    expect(h.foodRestore).toHaveBeenCalledTimes(1)

    engine.start()
    runFrames(200) // two loop frames — the warm-up fires on frame 2
    // No await since runFrames: the warm-up's restore must already
    // have run inside the frame callback (same tick as the render).
    expect(renderer.renderCalls).toHaveLength(1)
    expect(h.garden.prepareFoodForCompile).toHaveBeenCalledTimes(2)
    expect(h.foodRestore).toHaveBeenCalledTimes(2)
    // It drew into the composer read buffer, then restored the target.
    const renderIdx = renderer.events.findIndex(([k]) => k === 'render')
    expect(renderer.events[renderIdx - 1]).toEqual(['setRenderTarget', h.composers[0].readBuffer])
    expect(renderer.events[renderIdx + 1]).toEqual(['setRenderTarget', null])

    runFrames(2000) // exactly once — never again on later frames
    expect(renderer.renderCalls).toHaveLength(1)
    engine.destroy()
  })

  it('reduced mode keeps the null target and still warms up once (P02 round 2)', () => {
    const engine = createEngine(freshCanvas(), { reduced: true })
    const renderer = h.renderers[0]
    expect(h.composers).toHaveLength(0)
    expect(renderer.compileAsyncCalls).toHaveLength(1)
    // No composer → nothing ever re-aims the render target.
    expect(renderer.events.filter(([k]) => k === 'setRenderTarget')).toHaveLength(0)

    engine.start()
    runFrames(200) // two frames
    // The loop renders via renderer.render in reduced mode: frame 1,
    // the warm-up (start of frame 2's render, same tick), frame 2.
    expect(renderer.renderCalls).toHaveLength(3)
    expect(h.garden.prepareFoodForCompile).toHaveBeenCalledTimes(2)
    // The warm-up restore ran synchronously (the init compile's
    // restore is still pending a microtask — no await in this test).
    expect(h.foodRestore).toHaveBeenCalledTimes(1)
    engine.destroy()
  })

  it('creates the renderer without antialias when the composer renders (P03)', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    expect(h.composers).toHaveLength(1)
    expect(h.renderers[0].params.antialias).toBe(false)
    engine.destroy()
  })

  it('creates the renderer with antialias in reduced mode, where no composer exists (P03)', () => {
    const engine = createEngine(freshCanvas(), { reduced: true })
    expect(h.composers).toHaveLength(0)
    expect(h.renderers[0].params.antialias).toBe(true)
    engine.destroy()
  })

  it('caps the starting step at DPR 1.5 with a 1024px shadow map (P03)', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    const renderer = h.renderers[0]
    // This window reports devicePixelRatio 2 — step 0 must clamp it
    // to 1.5 (applySize runs last via start()'s applyQuality).
    expect(renderer.pixelRatios[renderer.pixelRatios.length - 1]).toBe(1.5)
    const moon = h.scene.children.find((c) => c.isDirectionalLight)
    expect(moon.shadow.mapSize.x).toBe(1024)
    expect(moon.shadow.mapSize.y).toBe(1024)
    engine.destroy()
  })

  it('enables renderer shader-error checks only in dev (P02)', () => {
    const dev = createEngine(freshCanvas(), { reduced: false })
    expect(h.renderers[0].debug.checkShaderErrors).toBe(true) // vitest runs with DEV=true
    dev.destroy()
    vi.stubEnv('DEV', false)
    try {
      const prod = createEngine(freshCanvas(), { reduced: false })
      expect(h.renderers[1].debug.checkShaderErrors).toBe(false)
      prod.destroy()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('destroy() silences the audio and unsubscribes every store subscription', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    vi.clearAllMocks()

    engine.destroy()
    expect(h.audio.setAmbientOn).toHaveBeenCalledWith(false)
    expect(h.audio.setPadOn).toHaveBeenCalledWith(false)
    expect(h.audio.setWaterOn).toHaveBeenCalledWith(false)

    // After destroy, store changes must not reach the engine anymore:
    // neither the status subscriber (it would call the audio mock) nor
    // the garden subscriber (it would call the decor mock).
    vi.clearAllMocks()
    useGame.setState({ status: 'dead' })
    useGame.setState({ garden: { lantern: 2, lotus: 1, ink: 'gold' } })
    expect(h.audio.setPadOn).not.toHaveBeenCalled()
    expect(h.audio.setAmbientOn).not.toHaveBeenCalled()
    expect(h.decor.setLanternCount).not.toHaveBeenCalled()
  })
})

describe('skin swapping (S04)', () => {
  const makeRig = (skin) => ({
    skin,
    death: null,
    group: { position: new THREE.Vector3(0, 0, 0) },
    setInk: vi.fn(),
    reset: vi.fn(),
    setDir: vi.fn(),
    paint: vi.fn(),
    onStep: vi.fn(),
    onEat: vi.fn(),
    advanceDeath: vi.fn(),
    startDeath: vi.fn(),
    detach: vi.fn(),
    dispose: vi.fn(),
  })

  it('creates the rig for the selected skin and swaps live on change', async () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    // The boot rig is built for the stored selected skin (default).
    expect(h.rigCalls).toEqual(['moonJade'])

    const plush = makeRig('plushMoon')
    const spare = makeRig('moonJade')
    h.nextRigs.push(plush, spare)
    useGame.setState({ skins: { owned: ['moonJade', 'plushMoon'], selected: 'plushMoon' } })

    // New rig created with the new id; ink/pose re-applied to it.
    expect(h.rigCalls).toEqual(['moonJade', 'plushMoon'])
    expect(plush.setInk).toHaveBeenCalled()
    expect(plush.reset).toHaveBeenCalled()
    expect(plush.setDir).toHaveBeenCalled()

    // The old rig's dispose is deferred until the boot precompile
    // settles (S04 review fix) — mocked compileAsync resolves
    // immediately, so one macrotask later it has happened exactly
    // once, and the spare-skin precompile consumed its own rig.
    await new Promise((r) => setTimeout(r, 0))
    expect(h.rig.dispose).toHaveBeenCalledTimes(1)
    expect(spare.dispose).toHaveBeenCalledTimes(1)

    engine.destroy()
    useGame.setState({ skins: { owned: ['moonJade'], selected: 'moonJade' } })
  })

  it('boots a single rig for the already-hydrated skin (no boot swap)', async () => {
    localStorage.setItem(
      'ran-xinh-skin',
      JSON.stringify({ owned: ['moonJade', 'plushMoon'], selected: 'plushMoon' }),
    )
    useGame.getState().hydrate()
    const engine = createEngine(freshCanvas(), { reduced: false })
    await new Promise((r) => setTimeout(r, 0))
    // Exactly one rig was ever created for plushMoon (the spare-skin
    // precompile may attempt the OTHER skin, but under this mock it
    // aliases the live rig and disposes nothing).
    expect(h.rigCalls.filter((id) => id === 'plushMoon')).toEqual(['plushMoon'])
    expect(h.rig.dispose).not.toHaveBeenCalled()
    engine.destroy()
    localStorage.removeItem('ran-xinh-skin')
    useGame.setState({ skins: { owned: ['moonJade'], selected: 'moonJade' } })
  })

  it('defers the old rig dispose until the boot precompile settles', async () => {
    let settle
    h.pendingCompile = { promise: new Promise((res) => { settle = res }) }
    const engine = createEngine(freshCanvas(), { reduced: false })
    const plush = makeRig('plushMoon')
    const spare = makeRig('moonJade')
    h.nextRigs.push(plush, spare)
    // Swapping while compileAsync is still polling must not throw
    // and must not dispose the old rig's materials yet.
    useGame.setState({ skins: { owned: ['moonJade', 'plushMoon'], selected: 'plushMoon' } })
    expect(h.rigCalls).toEqual(['moonJade', 'plushMoon'])
    expect(plush.setInk).toHaveBeenCalled()
    // The old rig leaves the scene immediately (no frozen twin)…
    expect(h.rig.detach).toHaveBeenCalledTimes(1)
    // …but its GPU dispose waits for the precompile to settle.
    expect(h.rig.dispose).not.toHaveBeenCalled()

    settle()
    await new Promise((r) => setTimeout(r, 0))
    // After the settle: old rig disposed exactly once, and the
    // precompile ran to completion (food visibility restored, spare
    // skin precompiled + disposed).
    expect(h.rig.dispose).toHaveBeenCalledTimes(1)
    expect(h.foodRestore).toHaveBeenCalled()
    expect(spare.dispose).toHaveBeenCalledTimes(1)

    engine.destroy()
    useGame.setState({ skins: { owned: ['moonJade'], selected: 'moonJade' } })
    h.pendingCompile = null
  })

  it('never swaps a rig without dispose() (the ?rig=old debug rig)', () => {
    h.rig.dispose = undefined
    const engine = createEngine(freshCanvas(), { reduced: false })
    useGame.setState({ skins: { owned: ['moonJade', 'plushMoon'], selected: 'plushMoon' } })
    expect(h.rigCalls).toEqual(['moonJade'])
    engine.destroy()
    useGame.setState({ skins: { owned: ['moonJade'], selected: 'moonJade' } })
  })
})

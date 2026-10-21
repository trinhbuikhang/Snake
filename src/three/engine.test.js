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
  roCallbacks: [],
  raf: new Map(),
  nextRafId: 1,
  scene: null,
  envTex: { isTexture: true, dispose: vi.fn() },
  cancelAnimationFrame: null,
  audio: null,
  garden: null,
  rig: null,
  decor: null,
}))

vi.mock('three', async () => {
  const actual = await vi.importActual('three')
  class FakeRenderer {
    constructor() {
      this.shadowMap = {}
      this.disposeCalls = 0
      h.renderers.push(this)
    }
    setPixelRatio() {}
    setSize() {}
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
      this.dispose = vi.fn()
      h.composers.push(this)
    }
    addPass() {}
    setPixelRatio() {}
    setSize() {}
    render() {}
  },
}))
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({ RenderPass: class {} }))
vi.mock('three/addons/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    constructor() {
      this.enabled = true
      this.dispose = vi.fn()
      h.bloomPasses.push(this)
    }
  },
}))
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }))
vi.mock('three/addons/environments/RoomEnvironment.js', () => ({ RoomEnvironment: class {} }))

vi.mock('./garden.js', () => ({
  buildGarden: (scene) => {
    h.scene = scene
    return h.garden
  },
}))
vi.mock('./snakeRig.js', () => ({ createSnakeRig: () => h.rig }))
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
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}
globalThis.document = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useGame.setState(initialStoreState, true)
  h.composers = []
  h.renderers = []
  h.bloomPasses = []
  h.roCallbacks = []
  h.raf = new Map()
  h.scene = null
  h.garden = {
    moonGroup: { scale: { setScalar: vi.fn() } },
    setFoodGlow: vi.fn(),
    setFood: vi.fn(),
    hideFood: vi.fn(),
    burstAt: vi.fn(),
    petalFall: vi.fn(),
    addRipple: vi.fn(),
    update: vi.fn(),
  }
  h.rig = {
    death: null,
    group: {},
    setInk: vi.fn(),
    reset: vi.fn(),
    setDir: vi.fn(),
    paint: vi.fn(),
    onStep: vi.fn(),
    onEat: vi.fn(),
    advanceDeath: vi.fn(),
    startDeath: vi.fn(),
  }
  h.decor = { setLanternCount: vi.fn(), setBloomCount: vi.fn(), update: vi.fn() }
})

describe('createEngine lifecycle', () => {
  it('start() applies the initial quality step: composer targets get 4x MSAA, retargeted exactly once', () => {
    const engine = createEngine(freshCanvas(), { reduced: false })
    engine.start()
    const composer = h.composers[0]
    // The PR #23 guard: without the startup applyQuality() call these
    // stay at EffectComposer's default of 0 samples.
    expect(composer.renderTarget1.samples).toBe(4)
    expect(composer.renderTarget2.samples).toBe(4)
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
    expect(composer.renderTarget1.samples).toBe(4)
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

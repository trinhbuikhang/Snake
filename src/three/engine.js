import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import {
  DIR,
  KEY_DIRS,
  createGame,
  createDemo,
  step,
  turn,
  speedInterval,
  moonPhaseById,
  gameModeById,
  LANTERN_DURATION,
  BASE_INTERVAL,
  gridToWorld,
  gridToWorldInto,
  N,
} from '../game/logic.js'
import { useGame, READY_BEAT_S, readSkins, readOnboarded } from '../game/store.js'
import { inputBus } from '../game/inputBus.js'
import { isTypingTarget } from '../game/keyboard.js'
import audio from '../audio/sound.js'
import { createGovernor, observeWarmupFrame, settleWarmup, nextQualityIdx, msaaRetargetNeeded, msaaFor, QUALITY_STEPS, SPIKE_FRAME_MULTIPLE } from './qualityGovernor.js'
import { disposeObject3D } from './dispose.js'
import { rescaleAccum, runTicks } from './tickClock.js'
import { writeCellsInto } from './cellBuffer.js'
import { alignedCamera, presetFor, coachBlocksCamera } from './cameraFit.js'
import { readSafeArea } from '../game/hudLayout.js'
import { createSwipeTracker } from '../game/swipe.js'
import { buildGarden } from './garden.js'
import { createSnakeRig } from './snakeRig.js'
import { buildDecor } from './decor.js'
import { lanternCount, bloomCount, inkById } from '../game/garden.js'
import { nightEventById } from '../game/nightEvents.js'
import { SKIN_IDS } from '../game/skins.js'

const FOV = 42
const FIT_HALF = 11.8
const BOARD_HALF = 10.25 // board edge (±10) + rim, for the perspective fit
const DEMO_INTERVAL = 0.15
const DEATH_DURATION = 1.6
const BLOOM_BASE = 0.42

// Camera mode angle configurations:
// 'aligned': Perfectly aligned with screen axes (AZ = 0), Up goes Up, Right goes Right.
// 'topdown': Overhead tactical 2.5D view for maximum precision.
// 'cinematic': Gentle isometric tilt for artistic elegance.
const CAM_PRESETS = {
  // S05: 'aligned' fits the board perspective-correctly (cameraFit.js):
  // el a touch lower so the serpent's face reads, NDC margins leave
  // the top 20% to the HUD pills.
  aligned: { az: 0, el: 1.0, fov: 42, distMult: 1, perspFit: { x: 0.97, top: 0.8, bottom: 0.93 } },
  topdown: { az: 0, el: 1.48, fov: 44, distMult: 1.15 },
  cinematic: { az: 0.54, el: 0.88, fov: 42, distMult: 1.12 },
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

export function createEngine(canvas, { reduced } = {}) {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  reduced = reduced ?? !!mq?.matches

  // P03: gameplay renders through the EffectComposer (created below,
  // whenever not reduced), which does its own MSAA on its render
  // targets — a multisampled default framebuffer on top of that costs
  // memory and bandwidth for nothing. Decide composer use BEFORE the
  // renderer exists so antialias can follow it: on only when there is
  // no composer (reduced mode draws straight to the canvas).
  const useComposer = !reduced
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !useComposer, powerPreference: 'high-performance' })
  // Clamp by the starting step's DPR cap right away (P03 review
  // note): without this the composer would allocate one oversized
  // target at the device's full DPR before start()'s applyQuality()
  // brings it down to step 0.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_STEPS[0].dpr))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // P02: shader-error checks are a dev aid. In production, every
  // program link would otherwise pay synchronous getProgramParameter /
  // getShaderInfoLog calls, which also block parallel compilation.
  renderer.debug.checkShaderErrors = import.meta.env.DEV

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x07110e)
  scene.fog = new THREE.FogExp2(0x07110e, 0.012)

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 350)
  const camPosTarget = new THREE.Vector3(0, 26, 16)
  const camLookTarget = new THREE.Vector3(0, 0, 0)
  camera.position.copy(camPosTarget)
  camera.lookAt(camLookTarget)

  // Camera shake
  let camShake = 0
  // Reused scratch state — the frame loop must not allocate per frame:
  // scratch vectors plus the one paint-param object below (rig.paint()
  // destructures its argument and never retains it, so the same object is
  // refilled every frame). Per-tick snapshot arrays used to allocate
  // at tick rate too; since P06 they are double-buffered and refilled
  // in place (see snapBufs below and cellBuffer.js).
  const _shake = new THREE.Vector3()
  const _headOff = new THREE.Vector3(0, 1.2, 0)
  const paintParams = { cur: null, prev: null, t: 0, death: null, animT: 0, dt: 0, isBoosting: false, interval: BASE_INTERVAL }

  // ---- adaptive quality ------------------------------------------------------
  // The ladder itself (QUALITY_STEPS) lives in qualityGovernor.js,
  // exported so its shape is unit-tested (P03 review). In short: start
  // at DPR 1.5 / shadow 1024, sacrifice pixel ratio, then bloom, and
  // drop the shadow map to 512 only at the last step; MSAA follows
  // the effective pixel ratio via msaaFor(), not a ladder field.
  let qualityIdx = 0
  let appliedMsaa = null
  let fpsAccum = 0
  let fpsCount = 0
  let spikeCount = 0 // frames in the current window beyond the spike threshold (P04)
  // Governor decisions live in qualityGovernor.js (pure, unit-tested):
  // it learns the device's rAF ceiling during a warmup and judges FPS
  // windows relative to that ceiling — stepping down after 2 bad
  // windows, back up after ~10s of sustained headroom.
  let gov = createGovernor(QUALITY_STEPS.length - 1)
  let warmElapsed = 0

  function applySize() {
    const q = QUALITY_STEPS[qualityIdx]
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    const dpr = Math.min(window.devicePixelRatio, q.dpr)
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    if (composer) {
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
    }
    return { q, dpr }
  }

  function applyQuality() {
    const { q, dpr } = applySize()
    if (composer) {
      // Retargeting MSAA samples disposes both composer render targets —
      // only pay that when the derived count actually changes (T06:
      // resizes and shadow-only steps must not dispose anything). The
      // count is msaaFor(effective dpr) (P03); the retarget decision
      // stays the pure msaaRetargetNeeded() so it is unit-tested.
      const stepMsaa = msaaFor(dpr)
      if (msaaRetargetNeeded(appliedMsaa, stepMsaa)) {
        try {
          composer.renderTarget1.samples = stepMsaa
          composer.renderTarget1.dispose()
          composer.renderTarget2.samples = stepMsaa
          composer.renderTarget2.dispose()
        } catch {
          /* MSAA optional */
        }
        appliedMsaa = stepMsaa
      }
      if (bloomPass) bloomPass.enabled = q.bloom
    }
    if (moon.shadow.mapSize.x !== q.shadow) {
      moon.shadow.mapSize.set(q.shadow, q.shadow)
      if (moon.shadow.map) {
        moon.shadow.map.dispose()
        moon.shadow.map = null
      }
    }
  }

  // ---- lights -----------------------------------------------------------
  const moon = new THREE.DirectionalLight(0xf2ede4, 2.1)
  moon.position.set(12, 30, 8)
  moon.castShadow = true
  moon.shadow.mapSize.set(1024, 1024) // P03: 1024 at the top step; applyQuality owns it per step
  moon.shadow.camera.left = -16
  moon.shadow.camera.right = 16
  moon.shadow.camera.top = 16
  moon.shadow.camera.bottom = -16
  moon.shadow.camera.near = 2
  moon.shadow.camera.far = 75
  moon.shadow.bias = -0.0005
  scene.add(moon)

  const hemi = new THREE.HemisphereLight(0xf0ece1, 0x142820, 0.65)
  scene.add(hemi)
  const amb = new THREE.AmbientLight(0xdcf5ea, 0.28)
  scene.add(amb)

  // Bioluminescent headlight that shines onto the water ahead of snake
  const headLight = new THREE.PointLight(0xffe299, 3.2, 11, 2)
  scene.add(headLight)
  const headLightBase = 3.0

  // ---- water reflection environment ------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer)
  // Kept around so destroy() can dispose the temporary room scene
  // (Codex P2 on PR #25: fromScene's input scene is not part of the
  // main traversal, so its geometries/materials would leak otherwise).
  const roomEnv = new RoomEnvironment()
  const envTex = pmrem.fromScene(roomEnv, 0.04).texture

  const garden = buildGarden(scene, { envTex, reduced })
  // The worn skin is read from storage directly (validated by
  // readSkins), NOT from the store: hydrate() only runs later, so a
  // returning player who wears Plush Moon would otherwise boot a
  // Moon Jade rig and swap mid-startup (S04 review — that swap raced
  // the shader precompile and crashed it). Boot builds exactly one
  // rig; when hydrate() then lands the same selection, swapRig's
  // same-skin guard makes it a no-op.
  let rig = createSnakeRig(scene, readSkins().selected)
  const decor = buildDecor(scene)

  // P4 "The Garden Remembers": apply purchased decorations, the serpent's
  // ink, and the Moonrise Night's giant moon from store state.
  function applyGarden() {
    const st = useGame.getState()
    const g = st.garden || { lantern: 0, lotus: 0, ink: 'jade' }
    decor.setLanternCount(lanternCount(g.lantern))
    decor.setBloomCount(bloomCount(g.lotus))
    rig.setInk(inkById(g.ink))
    garden.moonGroup.scale.setScalar(st.moonriseActive ? 2.4 : 1)
  }
  applyGarden()

  // S04: skins — swap the serpent rig live when the worn skin
  // changes (no reload; ink + pose carry over via applyGarden /
  // reset / setDir). The debug pearl rig (?rig=old) has no dispose()
  // and never swaps. compiledSkins tracks whose shader programs are
  // already built (the P02 TODO): the selected skin compiles at
  // load, the other one in precompileSpareSkin() below — and if a
  // swap beats that to it, the incoming skin compiles here in one
  // synchronous block before the old rig goes away, so the swap
  // never stalls a rendered frame on shader linking.
  const compiledSkins = new Set([rig.skin])
  // While the boot precompile's compileAsync is still polling the
  // scene's materials, disposing ANY of them breaks its poll loop
  // (three.js: reading 'isReady' of undefined) and the promise never
  // settles — restoreFood() and the spare-skin precompile would
  // never run (S04 review). swapRig therefore defers the old rig's
  // dispose until the precompile settles; by the time a player can
  // swap mid-game it has long settled and dispose is immediate.
  let precompilePending = null
  function disposeOldRig(old) {
    // Out of the scene right away — no frozen twin snake standing
    // in the garden while the dispose is deferred (S04 review,
    // round 2). Only the GPU teardown waits for the settle.
    old.detach?.()
    if (precompilePending) {
      const pending = precompilePending
      pending.then(
        () => old.dispose(),
        () => old.dispose(),
      )
    } else {
      old.dispose()
    }
  }
  function compileSceneNow() {
    const prevTarget = composer ? renderer.getRenderTarget() : null
    if (composer) renderer.setRenderTarget(composer.readBuffer)
    try {
      renderer.compile(scene, camera)
    } finally {
      if (composer) renderer.setRenderTarget(prevTarget)
    }
  }
  function swapRig(skinId) {
    const old = rig
    if (!old.dispose || skinId === old.skin) return
    rig = createSnakeRig(scene, skinId)
    if (rig === old) return
    if (!compiledSkins.has(skinId)) {
      try {
        compileSceneNow()
      } catch {
        // A failed precompile only means the first frame with the
        // new skin compiles lazily, as before P02.
      }
      compiledSkins.add(skinId)
    }
    disposeOldRig(old)
    applyGarden()
    rig.reset(logic.snake.length)
    rig.setDir(DIR[logic.dir].x, DIR[logic.dir].y)
  }
  const unsubGarden = useGame.subscribe((s, prev) => {
    if (s.garden !== prev.garden || s.moonriseActive !== prev.moonriseActive) applyGarden()
    if (s.skins?.selected !== prev.skins?.selected) swapRig(s.skins.selected)
  })

  // ---- postprocessing ----------------------------------------------------
  let composer = null
  let bloomPass = null
  if (useComposer) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_BASE, 0.68, 0.84)
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
  }

  // ---- shader precompilation (P02) ---------------------------------------
  // The first appearance of each planet (and the supernova) used to
  // stall a frame on shader compilation — worst on the first food of
  // a run. Compile everything gameplay needs up front instead: the
  // garden temporarily shows every planet group, compileAsync builds
  // their programs (in parallel where the driver supports it), then
  // the garden restores visibility. Fire-and-forget: first paint is
  // not blocked, and if a run starts before this settles, any program
  // still missing simply compiles lazily on first use, as before.
  async function precompileShaders() {
    const restoreFood = garden.prepareFoodForCompile()
    try {
      // Gameplay renders through the composer into a render target
      // (linear, no tone mapping). Compiling against the default
      // framebuffer would build the sRGB/ACES variants instead, and
      // the first food would compile the real ones mid-run (P02
      // review, round 2). Compile against the composer's read buffer
      // — the target the scene pass draws into. Program parameters
      // are captured synchronously inside compile/compileAsync, so
      // the previous target is restored in the finally BEFORE the
      // async link is awaited. Reduced mode has no composer: the
      // null target it plays with is already correct.
      const prevTarget = composer ? renderer.getRenderTarget() : null
      if (composer) renderer.setRenderTarget(composer.readBuffer)
      let pending = null
      try {
        if (typeof renderer.compileAsync === 'function') pending = renderer.compileAsync(scene, camera)
        else renderer.compile(scene, camera)
      } finally {
        if (composer) renderer.setRenderTarget(prevTarget)
      }
      if (pending) {
        // Tracked so swapRig can defer disposing the old rig until
        // this settles (see disposeOldRig).
        precompilePending = pending
        try {
          await pending
        } finally {
          if (precompilePending === pending) precompilePending = null
        }
      }
    } catch {
      // Optimization only — a failed precompile must never break
      // boot; any missing program compiles lazily on first use.
    } finally {
      restoreFood()
    }
    precompileSpareSkin()
  }

  // S04 (the P02 TODO): precompile the OTHER skin's materials too,
  // so the first Garden swap doesn't stall on shader linking. The
  // spare rig is created, compiled and disposed inside one
  // synchronous block — no frame can render while it exists.
  function precompileSpareSkin() {
    if (!rig.dispose) return
    const other = SKIN_IDS.find((id) => id !== rig.skin)
    if (!other || compiledSkins.has(other)) return
    let spare = null
    try {
      spare = createSnakeRig(scene, other)
      if (spare === rig || !spare.dispose) return
      compileSceneNow()
      compiledSkins.add(other)
    } catch {
      // Optimization only — same contract as precompileShaders.
    } finally {
      if (spare && spare !== rig) spare.dispose()
    }
  }
  precompileShaders()

  // P02 (round 2): compiling alone did not remove the first-food
  // hitch — only a real draw does (first render is what uploads
  // textures and warms the pipeline). One warm-up render with every
  // planet temporarily shown, executed as a single synchronous block
  // inside the frame loop just before that frame's normal render:
  // composer mode draws into readBuffer, which the pass chain
  // overwrites in the same frame, and reduced mode draws to the
  // canvas and is painted over by the frame itself before anything
  // is presented. No await in between, so the visibility race of
  // round 1 cannot recur. Runs exactly once, on the loop's second
  // frame — after first paint, never blocking it.
  function warmupRender() {
    const restoreFood = garden.prepareFoodForCompile()
    try {
      if (composer) {
        const prevTarget = renderer.getRenderTarget()
        renderer.setRenderTarget(composer.readBuffer)
        try {
          renderer.render(scene, camera)
        } finally {
          renderer.setRenderTarget(prevTarget)
        }
      } else {
        renderer.render(scene, camera)
      }
    } catch {
      // Warm-up is an optimization; a failure must not break the frame.
    } finally {
      restoreFood()
    }
  }

  // ---- game state ---------------------------------------------------------
  let logic = createGame()
  // P06: the (prev, cur) snapshot pair is double-buffered — two
  // reusable arrays alternate roles per tick (see cellBuffer.js for
  // why mutating the back buffer inside the tick is safe).
  const snapBufs = [[], []]
  let snapIdx = 0
  let curCells = snapBufs[0]
  let prevCells = snapBufs[0]
  const fillWorldCells = (buf, cells) =>
    writeCellsInto(buf, cells.length, (i, o) => gridToWorldInto(cells[i].x, cells[i].y, o))
  // The tick clock (C01): runTicks() in tickClock.js advances it; the
  // object is created once and mutated in place (P06).
  const tickClock = { accum: 0, interval: BASE_INTERVAL }
  // The interval currently in force (C01): one closure shared by the
  // frame loop's pre-tick sync and each tick's next-interval recompute.
  const currentInterval = () =>
    speedInterval(logic.foodsEaten, isBoosting, moonSpeedMult, modeSpeedMult, eventSpeedMult)
  // One tick of the real game (C01): step the simulation, then the
  // engine-side consequences in their original order. The result object
  // is reused — the frame loop allocates nothing (P06).
  const tickResult = { dead: false, nextInterval: 0 }
  const tickStep = (tickDt) => {
    const ev = step(logic, tickDt)
    if (ev.dead) {
      handleDeath(ev)
      tickResult.dead = true
      return tickResult
    }
    commitTick()
    if (ev.ate) handleEat(ev)
    // The Jade Carp: caught when the snake's head enters its cell.
    if (spirit && logic.snake[0].x === spirit.x && logic.snake[0].y === spirit.y) catchSpirit()
    tickResult.dead = false
    tickResult.nextInterval = currentInterval()
    return tickResult
  }
  let readyAccum = 0 // clock for the "night begins" beat before the run starts
  let readyHeld = false // T10c: beat frozen while the window is blurred/hidden
  let isBoosting = false
  let boostHeld = false // C03: Dash physically held (inputBus), even before 'playing'
  let moonSpeedMult = 1 // moon-phase speed modifier for this run
  let modeSpeedMult = 1 // game-mode speed modifier for this run
  let eventSpeedMult = 1 // night-event speed modifier for this run
  let lastTimeSec = -1 // last Lantern Rush second pushed to the store

  // The Jade Carp — a rare garden spirit (~1/15 nights) that swims across the
  // lake on a straight path. Catch it with the snake's head for +10.
  let spirit = null // { x, y, dx, accum } in grid cells
  let spiritMesh = null
  const SPIRIT_STEP = 0.42 // seconds per carp cell

  function clearSpirit() {
    if (spiritMesh) {
      scene.remove(spiritMesh)
      spiritMesh.geometry.dispose()
      spiritMesh.material.dispose()
      spiritMesh = null
    }
    spirit = null
  }

  function spawnSpirit() {
    clearSpirit()
    const y = 2 + Math.floor(Math.random() * (N - 4))
    const dx = Math.random() < 0.5 ? 1 : -1
    spirit = { x: dx === 1 ? 0 : N - 1, y, dx, accum: 0 }
    spiritMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 20, 14),
      new THREE.MeshStandardMaterial({
        color: 0x2fbf8f,
        emissive: 0x1a7a58,
        emissiveIntensity: 1.6,
        roughness: 0.35,
      }),
    )
    const w = gridToWorld(spirit.x, spirit.y)
    spiritMesh.position.set(w.x, 0.45, w.z)
    scene.add(spiritMesh)
  }

  function catchSpirit() {
    const w = gridToWorld(spirit.x, spirit.y)
    clearSpirit()
    const st = useGame.getState()
    garden.burstAt(w.x, 0.85, w.z, false, 'carp', 10)
    st.addScore(10, logic.snake.length, false, 'carp')
    st.registerSpiritCatch()
    audio.playBloom()
    pulse = 1.15
    camShake = 0.18
  }

  // Run modifiers ("Tuần trăng" + game mode + night event): light intensity,
  // food glow, fog density, speed
  function applyRunModifiers() {
    const st = useGame.getState()
    const phase = moonPhaseById(st.moonPhase)
    const mode = gameModeById(st.gameMode)
    const ev = nightEventById(st.nightEvent)
    moon.intensity = 2.1 * phase.light
    hemi.intensity = 0.65 * (0.55 + 0.45 * phase.light)
    amb.intensity = 0.28 * (0.6 + 0.4 * phase.light)
    garden.setFoodGlow(phase.foodGlow)
    scene.fog.density = 0.012 * ev.fogMult
    moonSpeedMult = phase.speedMult
    modeSpeedMult = mode.speedMult
    eventSpeedMult = ev.speedMult
  }

  function updateDirectionStore() {
    const st = useGame.getState()
    const nextQueued = logic.queue.length > 0 ? logic.queue[0] : null
    st.setDirections(logic.dir, nextQueued)
  }

  function resetGame() {
    const st = useGame.getState()
    logic = createGame(st.moonPhase, st.gameMode, st.nightEvent)
    applyRunModifiers()
    lastTimeSec = -1
    clearSpirit()
    // A rare garden spirit visits roughly 1 in 15 nights.
    if (Math.random() < 1 / 15) spawnSpirit()
    st.setTimeLeft(logic.mode === 'lantern' ? LANTERN_DURATION : null)
    snapIdx = 0
    curCells = fillWorldCells(snapBufs[0], logic.snake)
    prevCells = curCells
    tickClock.accum = 0
    isBoosting = false
    boostHeld = false
    tickClock.interval = BASE_INTERVAL
    rig.reset(logic.snake.length)
    rig.setDir(1, 0)
    paintParams.cur = curCells
    paintParams.prev = prevCells
    paintParams.t = 1
    paintParams.death = null
    paintParams.animT = animT
    paintParams.dt = 0
    paintParams.isBoosting = false
    paintParams.interval = tickClock.interval
    rig.paint(paintParams)
    if (logic.food) {
      const w = gridToWorld(logic.food.x, logic.food.y)
      garden.setFood(w.x, w.z, logic.foodIsBloom, logic.foodPlanet)
    }
    updateDirectionStore()
  }

  function commitTick() {
    // Swap the double buffer: the new state is written into the
    // buffer that is not the current `cur`, then the pair flips.
    const nextIdx = 1 - snapIdx
    fillWorldCells(snapBufs[nextIdx], logic.snake)
    prevCells = snapBufs[snapIdx]
    curCells = snapBufs[nextIdx]
    snapIdx = nextIdx
    rig.setDir(DIR[logic.dir].x, DIR[logic.dir].y)
    rig.onStep()

    // Add subtle water wake under snake head
    if (curCells[0]) {
      garden.addRipple(curCells[0].x, curCells[0].z, isBoosting ? 1.8 : 1.3, isBoosting ? 0xffd54f : 0x6eedc4)
    }

    if (logic.food) {
      const w = gridToWorld(logic.food.x, logic.food.y)
      garden.setFood(w.x, w.z, logic.foodIsBloom, logic.foodPlanet)
    } else {
      garden.hideFood() // board full: don't leave a stale planet floating around
    }
    updateDirectionStore()
    // Lantern Rush: push the countdown to the HUD whenever the second changes.
    if (logic.mode === 'lantern' && logic.timeLeft != null) {
      const sec = Math.max(0, Math.ceil(logic.timeLeft))
      if (sec !== lastTimeSec) {
        lastTimeSec = sec
        useGame.getState().setTimeLeft(sec)
      }
    }
  }

  // ---- title-screen orbit demo ------------------------------------------
  let demo = null
  // Same double-buffering as the game snapshots (P06).
  const demoBufs = [[], []]
  let demoBufIdx = 0
  let demoCur = demoBufs[0]
  let prevDemoCells = demoBufs[0]
  let demoAccum = 0

  // Writes the demo snake's current body into buf (head first,
  // walking back along the orbit path), grid → world in place.
  function fillDemoCells(buf) {
    const L = demo.path.length
    return writeCellsInto(buf, demo.len, (k, o) => {
      const p = demo.path[(((demo.idx - k) % L) + L) % L]
      gridToWorldInto(p.x, p.y, o)
    })
  }

  function resetDemo() {
    demo = createDemo()
    demoAccum = 0
    demoBufIdx = 0
    demoCur = fillDemoCells(demoBufs[0])
    prevDemoCells = demoCur
    rig.reset(demo.len)
    rig.setDir(0, 1)
    garden.hideFood()
  }

  function advanceDemo() {
    const L = demo.path.length
    demo.idx = (demo.idx + 1) % L
    const nextIdx = 1 - demoBufIdx
    fillDemoCells(demoBufs[nextIdx])
    prevDemoCells = demoBufs[demoBufIdx]
    demoCur = demoBufs[nextIdx]
    demoBufIdx = nextIdx
    const h = demo.path[demo.idx]
    const p2 = demo.path[((demo.idx - 1) % L + L) % L]
    rig.setDir(h.x - p2.x, h.y - p2.y)
    rig.onStep()
  }

  // ---- death ---------------------------------------------------------------
  let dying = false
  let deathDur = reduced ? 0.7 : DEATH_DURATION
  let deathT = 0

  function handleDeath(ev) {
    const timeUp = ev.cause === 'time' // Lantern Rush: the feast ends, no tragedy
    audio.setPadOn(false)
    audio.setWaterOn(false)
    if (timeUp) audio.playBloom()
    else audio.playDeath()
    garden.petalFall()
    garden.hideFood()
    rig.startDeath(curCells, { x: curCells[0].x, z: curCells[0].z })
    dying = true
    deathT = 0
    tickClock.accum = 0
    clearSpirit() // the spirit leaves when the night ends
    camShake = timeUp ? 0 : 0.38 // a finished feast needs no screen impact
    logic.deathCause = ev.cause || 'unknown'
    if (logic.mode === 'lantern') useGame.getState().setTimeLeft(0)
    snapshotPending = true // capture the moment of death for the shareable moon card
  }

  function finalizeDeath() {
    dying = false
    useGame.getState().gameOver({ score: logic.score, length: logic.snake.length, cause: logic.deathCause })
  }

  function handleEat(ev) {
    if (ev.bloom) audio.playBloom()
    else audio.playEat()

    const hw = curCells[0]
    garden.burstAt(hw.x, 0.85, hw.z, ev.bloom, ev.planet, ev.gained)
    useGame.getState().addScore(ev.gained, ev.length, ev.bloom, ev.planet)
    // Whisper counters (per-night + lifetime food stats, then trigger check)
    useGame.getState().registerEat({ bloom: ev.bloom })
    rig.onEat()
    pulse = 1.15
    camShake = ev.bloom ? 0.22 : 0.08
  }

  // ---- death snapshot for the shareable moon card ---------------------------
  let snapshotPending = false

  function captureSnapshot() {
    try {
      const maxW = 960
      const scale = Math.min(1, maxW / (canvas.width || 1))
      const c = document.createElement('canvas')
      c.width = Math.max(2, Math.round(canvas.width * scale))
      c.height = Math.max(2, Math.round(canvas.height * scale))
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height)
      useGame.getState().setDeathSnapshot(c.toDataURL('image/jpeg', 0.85))
    } catch {
      useGame.getState().setDeathSnapshot(null)
    }
  }

  let pulse = 0

  // ---- input ---------------------------------------------------------------
  function requestTurn(key) {
    const st = useGame.getState()
    // During the ready beat the snake is still, but the player may already
    // choose a direction — it takes effect on the first step.
    if ((st.status === 'playing' || st.status === 'ready') && !dying) {
      const accepted = turn(logic, key)
      if (accepted) {
        audio.playTurn()
        updateDirectionStore()
      }
    }
  }

  function setBoost(boosting) {
    const st = useGame.getState()
    if (st.status === 'playing' && !dying) {
      isBoosting = boosting
      st.setBoosting(boosting)
      const oldInterval = tickClock.interval
      tickClock.interval = currentInterval()
      // P01: keep the current tick's progress ratio — only the speed
      // changes, so the snake does not lurch when boost toggles mid-tick.
      tickClock.accum = rescaleAccum(tickClock.accum, oldInterval, tickClock.interval)
    }
  }

  const unlock = () => audio.unlockAudio()

  function onKeyDown(e) {
    // Typing in a form field (e.g. the Journal's gardener-name input):
    // every game shortcut is ignored, so letters and Space reach the field.
    if (isTypingTarget(e.target)) return
    unlock()
    const st = useGame.getState()
    const c = e.code

    // Boost / Dash with Space or Shift
    if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight') {
      if (st.status === 'playing' && !dying) {
        e.preventDefault()
        setBoost(true)
        return
      }
    }

    if (c === 'Space') {
      e.preventDefault()
      if (st.showHowTo) {
        st.closeHowTo()
        if (st.status === 'title' || st.status === 'dead') st.start()
        else if (st.status === 'prologue') st.advancePrologue()
        return
      }
      if (st.status === 'title' || st.status === 'dead') st.start()
      else if (st.status === 'prologue') st.advancePrologue()
      else if (st.status === 'ready') st.enterPlaying()
      return
    }

    if (c === 'KeyC' || c === 'KeyV') {
      e.preventDefault()
      st.toggleCameraMode()
      return
    }

    if (c === 'Escape' || c === 'KeyP') {
      e.preventDefault()
      if (st.showHowTo) {
        st.closeHowTo()
        return
      }
      if (st.status === 'playing' || st.status === 'paused') st.togglePause()
      return
    }

    if (c === 'KeyM') {
      st.setMuted(!st.muted)
      return
    }

    const k = KEY_DIRS[c]
    if (k) {
      e.preventDefault()
      requestTurn(k)
    }
  }

  function onKeyUp(e) {
    const c = e.code
    if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight') {
      setBoost(false)
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  const unsubBus = inputBus.on((ev) => {
    if (!ev) return
    if (ev.type === 'turn') requestTurn(ev.key)
    if (ev.type === 'boost') {
      // C03: remember the physical hold even outside 'playing' — Dash
      // pressed during the ready beat applies the moment the run starts.
      boostHeld = ev.boosting
      setBoost(ev.boosting)
    }
    if (ev.type === 'camera') useGame.getState().toggleCameraMode()
  })

  // Touch swipe on the canvas (C02): the tracker in game/swipe.js
  // follows the one finger that landed on the canvas by touch
  // identifier — a thumb holding Dash never hijacks the swipe — and a
  // second turn inside one gesture needs a clear axis (no curl turns).
  const swipe = createSwipeTracker()
  const onTouchStart = (e) => {
    unlock()
    swipe.start(e)
  }

  const onTouchMove = (e) => {
    const key = swipe.move(e)
    if (key) requestTurn(key)
  }

  const onTouchEnd = (e) => {
    swipe.end(e)
  }

  const onTouchCancel = () => {
    swipe.cancel()
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: true })
  canvas.addEventListener('touchmove', onTouchMove, { passive: false })
  canvas.addEventListener('touchend', onTouchEnd, { passive: true })
  canvas.addEventListener('touchcancel', onTouchCancel, { passive: true })

  // Pause on tab blur / visibility loss
  const onBlur = () => {
    const st = useGame.getState()
    if (st.status === 'playing') st.pause()
    else if (st.status === 'ready') {
      // T10c: hold the ready beat while the player is away — a run must
      // never start itself in an unattended window. The beat restarts
      // from zero when focus returns (onFocus), so the player always
      // gets the full beat with eyes on the garden.
      readyHeld = true
      readyAccum = 0
    }
    setBoost(false)
    boostHeld = false // C03 (review fix): a blurred window must not carry a stale Dash hold into the run
  }
  const onFocus = () => {
    readyHeld = false
  }
  const onVis = () => {
    if (document.hidden) onBlur()
    else onFocus()
  }
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVis)

  // ---- store wiring ----------------------------------------------------------
  // Run audio, shared by run start and resume-from-pause so the two paths
  // can never drift apart: Silent Night hears only water; every other
  // night gets the pad and the generative score tuned to its moon.
  function startRunAudio() {
    const ev = nightEventById(useGame.getState().nightEvent)
    if (ev.id === 'silent') {
      audio.setPadOn(false)
      audio.setWaterOn(true)
      audio.setAmbientOn(false)
    } else {
      audio.setWaterOn(false)
      audio.setPadOn(true)
      // P6 music: the generative score tunes itself to the night's moon.
      audio.setAmbientPhase(useGame.getState().moonPhase)
      audio.setAmbientOn(true)
    }
  }

  const unsubStore = useGame.subscribe((s, prev) => {
    if (s.status !== prev.status) {
      // Entering a run: the prologue now opens a "ready" beat first (the
      // garden visible, the snake still), and only then does play begin.
      // resetGame() runs on the beat so the player sees the true board.
      const enteringRun =
        (s.status === 'ready' || s.status === 'playing') &&
        (prev.status === 'title' || prev.status === 'dead' || prev.status === 'prologue')
      if (enteringRun) {
        unlock() // runs inside the user's click/keypress gesture, so AudioContext creation is allowed
        resetGame()
        readyAccum = 0
        // P6 "First Light": Silent Night keeps its promise — no music, only water.
        startRunAudio()
      } else if (s.status === 'playing' && prev.status === 'ready') {
        // The ready beat ends: start the simulation from a clean slate.
        // Snap prev onto cur (same buffer, P06): interpolation across
        // the beat would drag the snake from its pre-beat pose.
        tickClock.accum = 0
        prevCells = curCells
      } else if (s.status === 'playing' && prev.status === 'paused') {
        tickClock.accum = 0
        prevCells = curCells
        startRunAudio() // fade the night's sounds back in
      } else if (s.status === 'paused') {
        // Pause silences the garden too (T05): ambient, pad and water all
        // fade out; startRunAudio() restores them on resume.
        audio.setAmbientOn(false)
        audio.setPadOn(false)
        audio.setWaterOn(false)
      } else if (s.status === 'prologue' && (prev.status === 'title' || prev.status === 'dead')) {
        unlock() // start() runs in the gesture; the demo garden keeps drifting behind the prologue
      } else if (s.status === 'title') {
        resetDemo()
        audio.setPadOn(false)
        audio.setWaterOn(false)
        audio.setAmbientOn(false)
      } else if (s.status === 'dead') {
        audio.setPadOn(false)
        audio.setWaterOn(false)
        audio.setAmbientOn(false)
      }
      // C03: Dash already held through the ready beat — boost from the
      // first tick instead of dropping the press (setBoost gates on
      // 'playing', so the ready-time press only set the flag).
      if (s.status === 'playing' && prev.status === 'ready' && boostHeld) setBoost(true)
    }
    if (s.muted !== prev.muted) audio.setMuted(s.muted)
    if (s.cameraMode !== prev.cameraMode || s.showControls !== prev.showControls) updateCameraTarget()
    // V03: the portrait reframe keys off the coach holding the camera —
    // on the first night that includes every screen before the card
    // shows (coachBlocksCamera), so the refit fires once when the coach
    // is done, not when the card appears or steps change.
    const coachHeld = (x) =>
      coachBlocksCamera({
        coachStep: x.coachStep,
        night: x.night,
        onboarded: readOnboarded(),
      })
    if (coachHeld(s) !== coachHeld(prev)) updateCameraTarget()
    if (s.moonPhase !== prev.moonPhase || s.gameMode !== prev.gameMode) applyRunModifiers() // title-screen pickers: update ambience & speed live
  })

  const initialStore = useGame.getState()
  audio.setMuted(initialStore.muted)

  // ---- camera calculation ----------------------------------------------------
  function updateCameraTarget() {
    const st = useGame.getState()
    const mode = st.cameraMode || 'aligned'
    const basePreset = CAM_PRESETS[mode] || CAM_PRESETS.aligned

    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    // V03: portrait with the first-night coach gone reframes steeper
    // and taller (presetFor); the coach "holds" the old framing for
    // the whole first night until it is done (coachBlocksCamera).
    // Only the aligned preset reframes — topdown/cinematic keep their
    // exact framing.
    const coachVisible = coachBlocksCamera({
      coachStep: st.coachStep,
      night: st.night,
      onboarded: readOnboarded(),
    })
    const preset = basePreset.perspFit ? presetFor(basePreset, { w, h, coachVisible }) : basePreset
    camera.aspect = w / h
    camera.fov = preset.fov

    const viewDir = new THREE.Vector3(
      Math.sin(preset.az) * Math.cos(preset.el),
      Math.sin(preset.el),
      Math.cos(preset.az) * Math.cos(preset.el),
    )

    const worldUp = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(viewDir, worldUp).normalize()
    const up = new THREE.Vector3().crossVectors(right, viewDir).normalize()

    if (preset.perspFit) {
      // Perspective-correct fit (aligned only, S05): the closest
      // distance keeping every board corner inside the NDC margins,
      // with the look point slid so the board centres in the free
      // band. Since H04 the margins come from the HUD itself —
      // alignedCamera() derives them from hudLayout's hudReserve()
      // (top bar + safe-area + the touch cluster whenever it is
      // visible by the ONE controlsVisible() rule the HUD renders
      // with — no pointer-type condition, no local constants).
      // Read at fit time only (resize / mode / toggle change),
      // never per frame; readSafeArea() is zeros without a DOM.
      const { dist, lookZ, lookX } = alignedCamera({
        w,
        h,
        safe: readSafeArea(),
        showControls: st.showControls,
        preset,
        boardHalf: BOARD_HALF,
        coachVisible,
      })
      camLookTarget.set(lookX, 0, lookZ)
      camPosTarget.copy(viewDir).multiplyScalar(dist * preset.distMult).add(camLookTarget)
    } else {
      let maxR = 0
      let maxU = 0
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const v = new THREE.Vector3(sx * FIT_HALF, 0, sz * FIT_HALF)
          maxR = Math.max(maxR, Math.abs(v.dot(right)))
          maxU = Math.max(maxU, Math.abs(v.dot(up)) + 0.3)
        }
      }

      const tanHalf = Math.tan((camera.fov * Math.PI) / 360)
      const dist = Math.max(maxU / tanHalf, maxR / (tanHalf * camera.aspect)) * preset.distMult
      camLookTarget.set(0, 0, 0)
      camPosTarget.copy(viewDir).multiplyScalar(dist)
    }
    camera.updateProjectionMatrix()
  }

  function resize() {
    // Sizes only (T06): a resize must not dispose composer targets or
    // re-apply quality side effects — applyQuality() owns those, and it
    // runs when the governor actually changes the step.
    applySize()
    updateCameraTarget()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas.parentElement || canvas)

  // ---- main loop ---------------------------------------------------------------
  let rafId = 0
  let prevTS = performance.now()
  let animT = 0
  let framesRendered = 0 // drives the one-shot P02 warm-up render (frame 2)
  garden.camera = camera.position

  function frame(now) {
    rafId = requestAnimationFrame(frame)
    const rawDt = (now - prevTS) / 1000
    const dt = Math.min(rawDt, 0.1)
    prevTS = now
    animT += dt

    // Adaptive quality (T06, P04): FPS is judged relative to the
    // display's refresh rate — the warmup median snapped up to the
    // nearest standard rate by snapRefresh(), NOT the rate the GPU
    // achieves at the top step (a weak machine rendering 35fps on a
    // 60Hz panel must still feel pressure to step down; a stable
    // 30Hz device must not). A window is also judged on its spikes
    // (P04): frames longer than SPIKE_FRAME_MULTIPLE × the target
    // interval are counted, and >= 10% of them makes the window bad
    // even when its average is fine. Measured ONLY while playing —
    // title, prologue and pause frames must not cost the run its
    // quality. Thresholds, hysteresis and recovery live in the pure,
    // unit-tested qualityGovernor.js.
    if (useGame.getState().status === 'playing' && rawDt < 0.5) {
      if (gov.targetFps === null) {
        gov = observeWarmupFrame(gov, rawDt)
        warmElapsed += rawDt
        if (warmElapsed >= 2) gov = settleWarmup(gov)
      } else {
        fpsAccum += rawDt
        fpsCount++
        if (rawDt > SPIKE_FRAME_MULTIPLE / gov.targetFps) spikeCount++
        if (fpsAccum >= 2.5) {
          const avgFps = fpsCount / fpsAccum
          const spikeRatio = spikeCount / fpsCount
          fpsAccum = 0
          fpsCount = 0
          spikeCount = 0
          const next = nextQualityIdx(gov, avgFps, spikeRatio)
          if (next.idx !== gov.idx) {
            qualityIdx = next.idx
            applyQuality()
          }
          gov = next
        }
      }
    }

    // Camera smooth follow & shake
    if (camShake > 0.001) {
      camShake = Math.max(0, camShake - dt * 1.8)
    }
    _shake.set(
      (Math.random() - 0.5) * camShake * 1.2,
      (Math.random() - 0.5) * camShake * 0.8,
      (Math.random() - 0.5) * camShake * 1.2,
    )

    // Smooth camera interpolation
    camera.position.lerp(camPosTarget, Math.min(1, dt * 5.5))
    camera.position.add(_shake)
    camera.lookAt(camLookTarget)

    garden.camera = camera.position
    garden.update(dt)
    decor.update(animT)

    const st = useGame.getState()

    if (dying) {
      deathT += dt
      rig.advanceDeath(dt, deathDur, reduced)
      if (deathT >= deathDur) finalizeDeath()
    }

    if (st.status === 'playing' && !dying) {
      // The tick block itself lives in tickClock.js (C01) so tests and
      // the steering simulator drive this exact code; the per-tick work
      // stays here via the once-created tickStep callback (P06).
      runTicks(tickClock, dt, tickStep, currentInterval)
      // The carp swims on its own clock, independent of the snake's ticks.
      if (spirit) {
        spirit.accum += dt
        while (spirit && spirit.accum >= SPIRIT_STEP) {
          spirit.accum -= SPIRIT_STEP
          spirit.x += spirit.dx
          if (spirit.x < 0 || spirit.x >= N) clearSpirit()
        }
        if (spiritMesh && spirit) {
          const w = gridToWorld(spirit.x, spirit.y)
          spiritMesh.position.set(w.x, 0.45 + Math.sin(animT * 6) * 0.06, w.z)
        }
      }
    } else if (st.status === 'ready' && !dying) {
      // The "night begins" beat: the garden breathes, the snake holds still.
      // Driven by the frame loop so a backgrounded tab can't skip it —
      // and held entirely while the window is blurred (T10c, see onBlur).
      if (!readyHeld) {
        readyAccum += dt
        if (readyAccum >= READY_BEAT_S) {
          readyAccum = 0
          st.enterPlaying()
        }
      }
    } else if ((st.status === 'title' || st.status === 'prologue') && !dying) {
      demoAccum += dt
      while (demoAccum >= DEMO_INTERVAL) {
        demoAccum -= DEMO_INTERVAL
        advanceDemo()
      }
    }

    let paintT = 0
    if (st.status === 'playing' && !dying) paintT = clamp01(tickClock.accum / tickClock.interval)
    else if (st.status === 'ready') paintT = 0 // the snake holds its opening pose
    else if (st.status === 'title' || st.status === 'prologue') paintT = clamp01(demoAccum / DEMO_INTERVAL)
    else if (st.status === 'paused' || dying) paintT = 1 // dying: hold the death pose, don't snap back a tick

    const cells = (st.status === 'title' || st.status === 'prologue') ? demoCur : curCells
    const precells = (st.status === 'title' || st.status === 'prologue') ? prevDemoCells : prevCells
    // Reuse the shared params object — no allocation per frame (AUDIT L3).
    // rig.death passes through directly: paint only reads its truthiness
    // and .t, exactly like the old { t: rig.death.t } wrapper.
    paintParams.cur = cells
    paintParams.prev = precells
    paintParams.t = paintT
    paintParams.death = rig.death || null
    paintParams.animT = animT
    paintParams.dt = dt
    paintParams.isBoosting = isBoosting
    paintParams.interval = tickClock.interval
    rig.paint(paintParams)

    // Headlight follows snake head
    headLight.position.copy(rig.group.position).add(_headOff)
    headLight.intensity = headLightBase + (isBoosting ? 1.5 : 0) + pulse * 2.5

    // Bloom pulse decay
    if (bloomPass) {
      pulse = Math.max(0, pulse - dt * 1.8)
      bloomPass.strength = BLOOM_BASE + pulse * 1.1 + (isBoosting ? 0.15 : 0)
    }

    // P02 warm-up: one off-screen render with every planet shown, on
    // the loop's second frame (after first paint), synchronously
    // before this frame's own render — see warmupRender().
    framesRendered += 1
    if (framesRendered === 2) warmupRender()

    if (composer) composer.render()
    else renderer.render(scene, camera)

    // Capture the death frame synchronously with the render (same task),
    // so the drawing buffer is still valid without preserveDrawingBuffer.
    if (snapshotPending) {
      snapshotPending = false
      captureSnapshot()
    }
  }

  // ---- lifecycle ----------------------------------------------------------------
  function start() {
    useGame.getState().hydrate()
    resetGame()
    resetDemo()
    updateCameraTarget()
    resize()
    // Apply the starting quality step in full exactly once (T06 review):
    // resize() now only sets sizes, and the governor only re-applies on
    // a step change — without this call the composer's targets would
    // keep their default 0 samples instead of the count msaaFor()
    // derives for step 0's effective DPR (P03).
    // appliedMsaa starts null, so this first call performs the one
    // MSAA retarget; later resizes stay size-only.
    applyQuality()
    prevTS = performance.now()
    rafId = requestAnimationFrame(frame)
  }

  function destroy() {
    cancelAnimationFrame(rafId)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVis)
    canvas.removeEventListener('touchstart', onTouchStart)
    canvas.removeEventListener('touchmove', onTouchMove)
    canvas.removeEventListener('touchend', onTouchEnd)
    canvas.removeEventListener('touchcancel', onTouchCancel)
    unsubBus()
    unsubStore()
    unsubGarden()
    ro.disconnect()
    // Silence the garden (T08): without this the ambient scheduler's
    // setInterval and the pad/water voices keep running after unmount,
    // stacking a new layer of music on every remount.
    audio.setAmbientOn(false)
    audio.setPadOn(false)
    audio.setWaterOn(false)
    // Release the composer's GPU targets before the scene and renderer
    // go (dispose is idempotent; the explicit target disposes cover
    // three versions whose composer lacks its own dispose()).
    if (composer) {
      composer.renderTarget1?.dispose()
      composer.renderTarget2?.dispose()
      // Every pass, not just bloom: RenderPass and OutputPass hold
      // their own materials and programs (T08 review).
      composer.passes?.forEach((p) => p.dispose?.())
      composer.dispose?.()
    }
    // The moon's shadow map is a WebGLRenderTarget that
    // disposeObject3D cannot reach (it only gathers geometry,
    // materials and textures) — release it explicitly (T08 review).
    moon.dispose()
    // Every geometry/material/texture the garden, rig, decor and
    // spirit added to the scene, each disposed exactly once.
    disposeObject3D(scene)
    roomEnv.dispose()
    envTex.dispose()
    pmrem.dispose()
    renderer.dispose()
  }

  resetGame()
  resetDemo()

  return { start, destroy }
}
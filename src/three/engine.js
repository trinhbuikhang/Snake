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
  N,
} from '../game/logic.js'
import { useGame } from '../game/store.js'
import { inputBus } from '../game/inputBus.js'
import audio from '../audio/sound.js'
import { buildGarden } from './garden.js'
import { createSnakeRig } from './snakeRig.js'
import { buildDecor } from './decor.js'
import { lanternCount, bloomCount, inkById } from '../game/garden.js'
import { nightEventById } from '../game/nightEvents.js'

const FOV = 42
const FIT_HALF = 11.8
const DEMO_INTERVAL = 0.15
const DEATH_DURATION = 1.6
const BLOOM_BASE = 0.42

// Camera mode angle configurations:
// 'aligned': Perfectly aligned with screen axes (AZ = 0), Up goes Up, Right goes Right.
// 'topdown': Overhead tactical 2.5D view for maximum precision.
// 'cinematic': Gentle isometric tilt for artistic elegance.
const CAM_PRESETS = {
  aligned: { az: 0, el: 1.05, fov: 42, distMult: 1.08 },
  topdown: { az: 0, el: 1.48, fov: 44, distMult: 1.15 },
  cinematic: { az: 0.54, el: 0.88, fov: 42, distMult: 1.12 },
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const cloneXZ = (cells) => cells.map((c) => ({ x: c.x, z: c.z }))

export function createEngine(canvas, { reduced } = {}) {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  reduced = reduced ?? !!mq?.matches

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

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

  // ---- lights -----------------------------------------------------------
  const moon = new THREE.DirectionalLight(0xf2ede4, 2.1)
  moon.position.set(12, 30, 8)
  moon.castShadow = true
  moon.shadow.mapSize.set(2048, 2048)
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
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const garden = buildGarden(scene, { envTex, reduced })
  const rig = createSnakeRig(scene)
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
  useGame.subscribe((s, prev) => {
    if (s.garden !== prev.garden || s.moonriseActive !== prev.moonriseActive) applyGarden()
  })

  // ---- postprocessing ----------------------------------------------------
  let composer = null
  let bloomPass = null
  if (!reduced) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_BASE, 0.68, 0.84)
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())
  }

  // ---- game state ---------------------------------------------------------
  let logic = createGame()
  let curCells = []
  let prevCells = []
  let interval = { v: BASE_INTERVAL }
  let accum = 0
  let isBoosting = false
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

  const worldCells = (snake) => snake.map((c) => gridToWorld(c.x, c.y))

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
    curCells = worldCells(logic.snake)
    prevCells = cloneXZ(curCells)
    accum = 0
    isBoosting = false
    interval.v = BASE_INTERVAL
    rig.reset(logic.snake.length)
    rig.setDir(1, 0)
    rig.paint({ cur: curCells, prev: prevCells, t: 1, death: null, animT, dt: 0, isBoosting: false })
    if (logic.food) {
      const w = gridToWorld(logic.food.x, logic.food.y)
      garden.setFood(w.x, w.z, logic.foodIsBloom, logic.foodPlanet)
    }
    updateDirectionStore()
  }

  function commitTick() {
    prevCells = cloneXZ(curCells)
    curCells = worldCells(logic.snake)
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
  let demoCur = []
  let prevDemoCells = []
  let demoAccum = 0

  function demoBody() {
    const cells = []
    const L = demo.path.length
    for (let k = 0; k < demo.len; k++) {
      const i = ((demo.idx - k) % L + L) % L
      cells.push(demo.path[i])
    }
    return cells
  }

  function resetDemo() {
    demo = createDemo()
    demoAccum = 0
    prevDemoCells = demoBody().map((c) => gridToWorld(c.x, c.y))
    demoCur = cloneXZ(prevDemoCells)
    rig.reset(demo.len)
    rig.setDir(0, 1)
    garden.hideFood()
  }

  function advanceDemo() {
    const L = demo.path.length
    demo.idx = (demo.idx + 1) % L
    prevDemoCells = cloneXZ(demoCur)
    demoCur = demoBody().map((c) => gridToWorld(c.x, c.y))
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
    if (timeUp) audio.playBloom()
    else audio.playDeath()
    garden.petalFall()
    garden.hideFood()
    rig.startDeath(curCells, { x: curCells[0].x, z: curCells[0].z })
    dying = true
    deathT = 0
    accum = 0
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
    if (st.status === 'playing' && !dying) {
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
      interval.v = speedInterval(logic.foodsEaten, isBoosting, moonSpeedMult, modeSpeedMult, eventSpeedMult)
    }
  }

  const unlock = () => audio.unlockAudio()

  function onKeyDown(e) {
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
        else if (st.status === 'prologue') st.beginNight()
        return
      }
      if (st.status === 'title' || st.status === 'dead') st.start()
      else if (st.status === 'prologue') st.beginNight()
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
    if (ev.type === 'boost') setBoost(ev.boosting)
    if (ev.type === 'camera') useGame.getState().toggleCameraMode()
  })

  // Touch swipe on the canvas with smooth threshold
  const pointer = { active: false, sx: 0, sy: 0 }
  const onTouchStart = (e) => {
    unlock()
    const t = e.touches[0]
    pointer.active = true
    pointer.sx = t.clientX
    pointer.sy = t.clientY
  }

  const onTouchMove = (e) => {
    if (!pointer.active) return
    const t = e.touches[0]
    const dx = t.clientX - pointer.sx
    const dy = t.clientY - pointer.sy
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (Math.max(ax, ay) < 18) return
    const key = ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    pointer.sx = t.clientX
    pointer.sy = t.clientY
    requestTurn(key)
  }

  const onTouchEnd = () => {
    pointer.active = false
  }

  canvas.addEventListener('touchstart', onTouchStart, { passive: true })
  canvas.addEventListener('touchmove', onTouchMove, { passive: false })
  canvas.addEventListener('touchend', onTouchEnd, { passive: true })
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: true })

  // Pause on tab blur / visibility loss
  const onBlur = () => {
    const st = useGame.getState()
    if (st.status === 'playing') st.pause()
    setBoost(false)
  }
  const onVis = () => {
    if (document.hidden) onBlur()
  }
  window.addEventListener('blur', onBlur)
  document.addEventListener('visibilitychange', onVis)

  // ---- store wiring ----------------------------------------------------------
  const unsubStore = useGame.subscribe((s, prev) => {
    if (s.status !== prev.status) {
      if (s.status === 'playing' && (prev.status === 'title' || prev.status === 'dead' || prev.status === 'prologue')) {
        unlock() // runs inside the user's click/keypress gesture, so AudioContext creation is allowed
        resetGame()
        audio.setPadOn(true)
      } else if (s.status === 'playing' && prev.status === 'paused') {
        accum = 0
        prevCells = cloneXZ(curCells)
      } else if (s.status === 'prologue' && (prev.status === 'title' || prev.status === 'dead')) {
        unlock() // start() runs in the gesture; the demo garden keeps drifting behind the prologue
      } else if (s.status === 'title') {
        resetDemo()
        audio.setPadOn(false)
      } else if (s.status === 'dead') {
        audio.setPadOn(false)
      }
    }
    if (s.muted !== prev.muted) audio.setMuted(s.muted)
    if (s.cameraMode !== prev.cameraMode) updateCameraTarget()
    if (s.moonPhase !== prev.moonPhase || s.gameMode !== prev.gameMode) applyRunModifiers() // title-screen pickers: update ambience & speed live
  })

  const initialStore = useGame.getState()
  audio.setMuted(initialStore.muted)

  // ---- camera calculation ----------------------------------------------------
  function updateCameraTarget() {
    const st = useGame.getState()
    const mode = st.cameraMode || 'aligned'
    const preset = CAM_PRESETS[mode] || CAM_PRESETS.aligned

    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
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
    camPosTarget.copy(viewDir).multiplyScalar(dist)
    camera.updateProjectionMatrix()
  }

  function resize() {
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h, false)
    if (composer) {
      composer.setSize(w, h)
      try {
        composer.renderTarget1.samples = 4
        composer.renderTarget2.samples = 4
      } catch {
        /* MSAA optional */
      }
    }
    updateCameraTarget()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas.parentElement || canvas)

  // ---- main loop ---------------------------------------------------------------
  let rafId = 0
  let prevTS = performance.now()
  let animT = 0
  garden.camera = camera.position

  function frame(now) {
    rafId = requestAnimationFrame(frame)
    const dt = Math.min((now - prevTS) / 1000, 0.1)
    prevTS = now
    animT += dt

    // Camera smooth follow & shake
    if (camShake > 0.001) {
      camShake = Math.max(0, camShake - dt * 1.8)
    }
    const shakeOffset = new THREE.Vector3(
      (Math.random() - 0.5) * camShake * 1.2,
      (Math.random() - 0.5) * camShake * 0.8,
      (Math.random() - 0.5) * camShake * 1.2,
    )

    // Smooth camera interpolation
    camera.position.lerp(camPosTarget, Math.min(1, dt * 5.5))
    camera.position.add(shakeOffset)
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
      accum += dt
      interval.v = speedInterval(logic.foodsEaten, isBoosting, moonSpeedMult, modeSpeedMult, eventSpeedMult)
      let guard = 0
      while (accum >= interval.v) {
        const tickDt = interval.v // seconds this tick consumes (drives the lantern clock)
        const ev = step(logic, tickDt)
        if (ev.dead) {
          handleDeath(ev)
          break
        }
        commitTick()
        if (ev.ate) handleEat(ev)
        // The Jade Carp: caught when the snake's head enters its cell.
        if (spirit && logic.snake[0].x === spirit.x && logic.snake[0].y === spirit.y) catchSpirit()
        interval.v = speedInterval(logic.foodsEaten, isBoosting, moonSpeedMult, modeSpeedMult, eventSpeedMult)
        accum -= interval.v
        if (++guard > 6) {
          accum = 0
          break
        }
      }
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
    } else if ((st.status === 'title' || st.status === 'prologue') && !dying) {
      demoAccum += dt
      while (demoAccum >= DEMO_INTERVAL) {
        demoAccum -= DEMO_INTERVAL
        advanceDemo()
      }
    }

    let paintT = 0
    let death = null
    if (st.status === 'playing' && !dying) paintT = clamp01(accum / interval.v)
    else if (st.status === 'title' || st.status === 'prologue') paintT = clamp01(demoAccum / DEMO_INTERVAL)
    else if (st.status === 'paused' || dying) paintT = 1 // dying: hold the death pose, don't snap back a tick
    if (rig.death) death = { t: rig.death.t }

    const cells = (st.status === 'title' || st.status === 'prologue') ? demoCur : curCells
    const precells = (st.status === 'title' || st.status === 'prologue') ? prevDemoCells : prevCells
    rig.paint({ cur: cells, prev: precells, t: paintT, death, animT, dt, isBoosting })

    // Headlight follows snake head
    headLight.position.copy(rig.group.position).add(new THREE.Vector3(0, 1.2, 0))
    headLight.intensity = headLightBase + (isBoosting ? 1.5 : 0) + pulse * 2.5

    // Bloom pulse decay
    if (bloomPass) {
      pulse = Math.max(0, pulse - dt * 1.8)
      bloomPass.strength = BLOOM_BASE + pulse * 1.1 + (isBoosting ? 0.15 : 0)
    }

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
    prevTS = performance.now()
    rafId = requestAnimationFrame(frame)
  }

  function destroy() {
    cancelAnimationFrame(rafId)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    document.removeEventListener('visibilitychange', onVis)
    canvas.removeEventListener('touchstart', onTouchStart)
    canvas.removeEventListener('touchmove', onTouchMove)
    canvas.removeEventListener('touchend', onTouchEnd)
    canvas.removeEventListener('touchcancel', onTouchEnd)
    unsubBus()
    unsubStore()
    ro.disconnect()
    envTex.dispose()
    pmrem.dispose()
    renderer.dispose()
  }

  resetGame()
  resetDemo()

  return { start, destroy }
}
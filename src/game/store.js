import { create } from 'zustand'
import { MOON_IDS } from './logic.js'

export const BEST_KEY = 'ran-xinh-best'
export const MUTE_KEY = 'ran-xinh-muted'
export const CAM_KEY = 'ran-xinh-cam'
export const CTRLS_KEY = 'ran-xinh-ctrls'
export const MOON_KEY = 'ran-xinh-moon'

function readJSON(key) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? null : v
  } catch {
    return null
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* private mode etc. — best-effort only */
  }
}

export const readBest = () => Math.max(0, parseInt(readJSON(BEST_KEY) || '0', 10) || 0)
export const readMuted = () => readJSON(MUTE_KEY) === '1'
const CAM_MODES = ['aligned', 'topdown', 'cinematic']
export const readCam = () => {
  const v = readJSON(CAM_KEY)
  return CAM_MODES.includes(v) ? v : 'aligned'
}
export const readCtrls = () => readJSON(CTRLS_KEY) === '1'
export const readMoon = () => {
  const v = readJSON(MOON_KEY)
  return MOON_IDS.includes(v) ? v : 'half'
}

export const useGame = create((set, get) => ({
  status: 'title', // title | playing | paused | dead
  showHowTo: false,
  score: 0,
  length: 3,
  best: 0,
  isNewBest: false,
  muted: false,

  // Responsive UI feedback
  currentDir: 'right',
  queuedDir: null,
  isBoosting: false,

  // Camera mode: 'aligned' (Classic 3D - Up is Up) | 'topdown' (Top-Down 2D) | 'cinematic' (Cinematic tilt)
  cameraMode: 'aligned',

  // Moon phase run modifier: 'new' | 'crescent' | 'half' | 'gibbous' | 'full'
  moonPhase: 'half',

  // Snapshot of the canvas at the moment of death, for the shareable moon card
  deathSnapshot: null,

  // Controls display toggle
  showControls: false,

  // Floating notifications / score popups
  floatingTexts: [],

  hydrate() {
    set({
      best: readBest(),
      muted: readMuted(),
      cameraMode: readCam(),
      showControls: readCtrls(),
      moonPhase: readMoon(),
    })
  },

  start() {
    set({
      status: 'playing',
      score: 0,
      length: 3,
      isNewBest: false,
      showHowTo: false,
      currentDir: 'right',
      queuedDir: null,
      isBoosting: false,
      floatingTexts: [],
      deathSnapshot: null,
    })
  },
  pause() {
    if (get().status === 'playing') set({ status: 'paused', isBoosting: false })
  },
  resume() {
    if (get().status === 'paused') set({ status: 'playing' })
  },
  togglePause() {
    get().status === 'playing' ? get().pause() : get().resume()
  },
  toTitle() {
    set({ status: 'title', showHowTo: false, isNewBest: false, isBoosting: false })
  },

  openHowTo() {
    set({ showHowTo: true })
  },
  closeHowTo() {
    set({ showHowTo: false })
  },

  setDirections(currentDir, queuedDir) {
    set({ currentDir, queuedDir })
  },

  setBoosting(isBoosting) {
    if (get().isBoosting !== isBoosting) {
      set({ isBoosting })
    }
  },

  toggleCameraMode() {
    const modes = ['aligned', 'topdown', 'cinematic']
    const nextIdx = (modes.indexOf(get().cameraMode) + 1) % modes.length
    const nextMode = modes[nextIdx]
    writeJSON(CAM_KEY, nextMode)
    set({ cameraMode: nextMode })
  },

  setCameraMode(mode) {
    writeJSON(CAM_KEY, mode)
    set({ cameraMode: mode })
  },

  setMoonPhase(moonPhase) {
    if (!MOON_IDS.includes(moonPhase)) return
    writeJSON(MOON_KEY, moonPhase)
    set({ moonPhase })
  },

  setDeathSnapshot(deathSnapshot) {
    set({ deathSnapshot })
  },

  toggleControls() {
    const next = !get().showControls
    writeJSON(CTRLS_KEY, next ? '1' : '0')
    set({ showControls: next })
  },

  addScore(delta, length, isBloom = false, planet = '') {
    const newScore = get().score + delta
    const id = Date.now() + Math.random()
    const name = planet === 'sun' || isBloom ? 'SUPERNOVA!' : (planet === 'earth' ? 'EARTH' : planet === 'mars' ? 'MARS' : planet === 'saturn' ? 'SATURN' : planet === 'jupiter' ? 'JUPITER' : planet === 'neptune' ? 'NEPTUNE' : '')
    const text = name ? `+${delta} ${name}` : `+${delta}`

    set((s) => ({
      score: newScore,
      length,
      floatingTexts: [...s.floatingTexts.slice(-4), { id, text, isBloom }],
    }))

    // Auto remove floating text after animation
    setTimeout(() => {
      set((s) => ({
        floatingTexts: s.floatingTexts.filter((item) => item.id !== id),
      }))
    }, 1200)
  },

  gameOver(result) {
    if (result.score > get().best) writeJSON(BEST_KEY, result.score)
    set({
      status: 'dead',
      score: result.score,
      length: result.length,
      best: Math.max(get().best, result.score),
      isNewBest: result.score > get().best,
      isBoosting: false,
    })
  },

  setMuted(m) {
    set({ muted: m })
    writeJSON(MUTE_KEY, m ? '1' : '0')
  },
}))
import { create } from 'zustand'
import { MOON_IDS, MODE_IDS } from './logic.js'
import { evaluateWhispers } from './whispers.js'
import { evaluateVerses } from './verses.js'
import { EVENT_IDS, rollNightEvent } from './nightEvents.js'

export const BEST_KEY = 'ran-xinh-best' // legacy single best, migrated into BESTS_KEY
export const BESTS_KEY = 'ran-xinh-bests'
export const MUTE_KEY = 'ran-xinh-muted'
export const CAM_KEY = 'ran-xinh-cam'
export const CTRLS_KEY = 'ran-xinh-ctrls'
export const MOON_KEY = 'ran-xinh-moon'
export const MODE_KEY = 'ran-xinh-mode'
export const NIGHT_KEY = 'ran-xinh-night'
export const TOTALS_KEY = 'ran-xinh-totals'
export const WHISPERS_KEY = 'ran-xinh-whispers'
export const SEEN_KEY = 'ran-xinh-seen'
export const VERSES_KEY = 'ran-xinh-verses'
export const TONIGHT_KEY = 'ran-xinh-tonight'

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
// Per-mode bests, with one-time migration from the legacy single best.
export const readBests = () => {
  const fresh = { classic: 0, lantern: 0, zen: 0 }
  try {
    const raw = readJSON(BESTS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      for (const id of MODE_IDS) {
        const v = parseInt(parsed?.[id], 10)
        if (Number.isFinite(v) && v > 0) fresh[id] = v
      }
      return fresh
    }
  } catch {
    /* corrupted JSON — fall through to migration */
  }
  fresh.classic = readBest()
  return fresh
}
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
export const readMode = () => {
  const v = readJSON(MODE_KEY)
  return MODE_IDS.includes(v) ? v : 'classic'
}
export const readNight = () => Math.max(0, parseInt(readJSON(NIGHT_KEY) || '0', 10) || 0)
// Lifetime counters: { supernovas, planets, deaths, spiritCatches, zenSessions,
// lanternFeasts }. Missing/corrupt → zeros.
export const readTotals = () => {
  const fresh = { supernovas: 0, planets: 0, deaths: 0, spiritCatches: 0, zenSessions: 0, lanternFeasts: 0 }
  try {
    const parsed = JSON.parse(readJSON(TOTALS_KEY) || 'null')
    for (const k of Object.keys(fresh)) {
      const v = parseInt(parsed?.[k], 10)
      if (Number.isFinite(v) && v > 0) fresh[k] = v
    }
  } catch {
    /* corrupted JSON — fall through with zeros */
  }
  return fresh
}
// Unlocked whisper ids (array of strings).
export const readWhispers = () => {
  try {
    const parsed = JSON.parse(readJSON(WHISPERS_KEY) || 'null')
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}
// Unlocked verse ids (array of strings) — "Biên niên trăng" collection.
export const readVerses = () => {
  try {
    const parsed = JSON.parse(readJSON(VERSES_KEY) || 'null')
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}
// The event rolled for the upcoming night ('none' = quiet night).
export const readTonight = () => {
  const v = readJSON(TONIGHT_KEY)
  return v === 'none' || EVENT_IDS.includes(v) ? v : null
}
// Seen run contexts: { modes: [...], phases: [...] }.
export const readSeen = () => {
  const fresh = { modes: [], phases: [] }
  try {
    const parsed = JSON.parse(readJSON(SEEN_KEY) || 'null')
    if (Array.isArray(parsed?.modes)) fresh.modes = parsed.modes.filter((v) => MODE_IDS.includes(v))
    if (Array.isArray(parsed?.phases)) fresh.phases = parsed.phases.filter((v) => MOON_IDS.includes(v))
  } catch {
    /* corrupted JSON — fall through with empties */
  }
  return fresh
}

// Shared finish logic for gameOver() and endZenSession(): records the run,
// updates the current mode's best, and moves to the 'dead' status so the
// game-over overlay (and the moon card) can present the result.
function completeRun(get, set, cause) {
  const mode = get().gameMode
  const score = get().score
  const bests = { ...get().bests }
  const prevBest = bests[mode] || 0
  const newBest = Math.max(prevBest, score)
  bests[mode] = newBest
  writeJSON(BESTS_KEY, JSON.stringify(bests))
  set({
    status: 'dead',
    bests,
    best: newBest,
    isNewBest: score > prevBest,
    isBoosting: false,
    deathCause: cause,
    timeLeft: null,
  })
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

  // Game mode: 'classic' | 'lantern' | 'zen'
  gameMode: 'classic',

  // Best score per mode; `best` mirrors the current mode's best for the HUD.
  bests: { classic: 0, lantern: 0, zen: 0 },

  // Lantern Rush countdown (seconds left), null in other modes
  timeLeft: null,

  // How the last run ended: 'wall' | 'self' | 'time' | 'zen' | null
  deathCause: null,

  // Snapshot of the canvas at the moment of death, for the shareable moon card
  deathSnapshot: null,

  // Controls display toggle
  showControls: false,

  // Floating notifications / score popups
  floatingTexts: [],

  // Whispers of the Night (P2 storytelling): collectible one-line poems.
  // night: how many runs have begun (each run is one "Night")
  night: 0,
  // totals: lifetime counters { supernovas, planets, deaths }
  totals: { supernovas: 0, planets: 0, deaths: 0 },
  // nightStats: counters for the current night only { supernovas, planets }
  nightStats: { supernovas: 0, planets: 0 },
  // seenModes / seenPhases: mode & moon-phase ids ever played
  seenModes: [],
  seenPhases: [],
  // unlockedWhispers: whisper ids the player has heard
  unlockedWhispers: [],
  // whisperToasts: queued toast notifications for freshly unlocked whispers
  whisperToasts: [],
  // nightBanner: { night, modeLabel, phaseLabel } shown briefly when a run starts
  nightBanner: null,
  // showJournal: the collection overlay is open
  showJournal: false,

  // The Lunar Chronicle (P3 storytelling): 30 two-line moon verses, earned
  // through deliberate feats and collected out of order.
  unlockedVerses: [],
  verseToasts: [],
  // prologueQueue: whispers + verses unlocked by the nightStart evaluation,
  // shown one at a time on the pre-play prologue screen so the player can
  // actually read them before the run begins. Each entry is
  // { kind: 'whisper'|'verse', id, text? , lines? }.
  prologueQueue: [],
  // tonightEvent: the special event rolled for the upcoming night ('none' =
  // quiet night), announced on the title screen. nightEvent: the event active
  // during the current run.
  tonightEvent: 'none',
  nightEvent: 'none',

  hydrate() {
    const bests = readBests()
    const gameMode = readMode()
    const seen = readSeen()
    set({
      bests,
      best: bests[gameMode] || 0,
      muted: readMuted(),
      cameraMode: readCam(),
      showControls: readCtrls(),
      moonPhase: readMoon(),
      gameMode,
      night: readNight(),
      totals: readTotals(),
      unlockedWhispers: readWhispers(),
      unlockedVerses: readVerses(),
      tonightEvent: readTonight() || rollNightEvent(),
      seenModes: seen.modes,
      seenPhases: seen.phases,
    })
  },

  start() {
    const prev = get()
    const night = prev.night + 1
    const isFirstMode = !prev.seenModes.includes(prev.gameMode)
    const isFirstPhase = !prev.seenPhases.includes(prev.moonPhase)
    const seenModes = isFirstMode ? [...prev.seenModes, prev.gameMode] : prev.seenModes
    const seenPhases = isFirstPhase ? [...prev.seenPhases, prev.moonPhase] : prev.seenPhases
    const nightEvent = prev.tonightEvent || 'none'
    const tonightEvent = rollNightEvent()
    writeJSON(NIGHT_KEY, String(night))
    writeJSON(SEEN_KEY, JSON.stringify({ modes: seenModes, phases: seenPhases }))
    writeJSON(TONIGHT_KEY, tonightEvent)
    set({
      status: 'prologue',
      score: 0,
      length: 3,
      isNewBest: false,
      showHowTo: false,
      currentDir: 'right',
      queuedDir: null,
      isBoosting: false,
      floatingTexts: [],
      deathSnapshot: null,
      timeLeft: null,
      deathCause: null,
      night,
      seenModes,
      seenPhases,
      nightStats: { supernovas: 0, planets: 0, boostEats: 0 },
      nightBanner: { night },
      tonightEvent,
      nightEvent,
      whisperToasts: [],
      verseToasts: [],
      prologueQueue: [],
    })
    get().checkWhispers('nightStart', { isFirstMode, isFirstPhase })
    get().checkVerses('nightStart', { isFirstMode, isFirstPhase })
    // The night's new poems belong to the prologue screen, not to floating
    // toasts over live gameplay: collect them so they can be read one at a
    // time before the run begins.
    const afterStart = get()
    set({
      prologueQueue: [
        ...afterStart.whisperToasts.map((t) => ({ kind: 'whisper', id: t.id, text: t.text })),
        ...afterStart.verseToasts.map((t) => ({ kind: 'verse', id: t.id, lines: t.lines })),
      ],
      whisperToasts: [],
      verseToasts: [],
    })
  },
  // Called from the prologue screen (button, tap, or keypress) once the
  // player has read the night's new whispers and verses.
  beginNight() {
    if (get().status !== 'prologue') return
    set({ status: 'playing', prologueQueue: [] })
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
      if (isBoosting) get().checkWhispers('dash')
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

  setGameMode(gameMode) {
    if (!MODE_IDS.includes(gameMode)) return
    writeJSON(MODE_KEY, gameMode)
    set({ gameMode, best: get().bests[gameMode] || 0 })
  },

  setTimeLeft(timeLeft) {
    set({ timeLeft })
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
    const name = planet === 'sun' || isBloom ? 'SUPERNOVA!' : (planet === 'carp' ? 'JADE CARP' : planet === 'earth' ? 'EARTH' : planet === 'mars' ? 'MARS' : planet === 'saturn' ? 'SATURN' : planet === 'jupiter' ? 'JUPITER' : planet === 'neptune' ? 'NEPTUNE' : '')
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
    const cause = result.cause || 'unknown'
    const totals = { ...get().totals }
    if (cause === 'wall' || cause === 'self' || cause === 'time') {
      totals.deaths += 1
    }
    if (cause === 'time') totals.lanternFeasts += 1
    writeJSON(TOTALS_KEY, JSON.stringify(totals))
    set({ totals })
    set({ score: result.score, length: result.length })
    completeRun(get, set, cause)
    get().checkWhispers('death', { cause })
    get().checkVerses('death', { cause })
    if (get().isNewBest) {
      get().checkWhispers('newBest')
      get().checkVerses('newBest')
    }
  },

  // Zen Garden has no death: the player ends the session from the pause menu.
  endZenSession() {
    const st = get()
    if (st.gameMode !== 'zen') return
    if (st.status !== 'playing' && st.status !== 'paused') return
    const totals = { ...get().totals, zenSessions: get().totals.zenSessions + 1 }
    writeJSON(TOTALS_KEY, JSON.stringify(totals))
    set({ totals })
    completeRun(get, set, 'zen')
    get().checkWhispers('zenEnd')
    get().checkVerses('zenEnd')
    if (get().isNewBest) {
      get().checkWhispers('newBest')
      get().checkVerses('newBest')
    }
  },

  // Whisper engine: evaluate trigger predicates against current run context.
  // Loops so chained unlocks (e.g. mode-zen + all-modes) resolve in one pass.
  checkWhispers(event, extra = {}) {
    const s = get()
    let unlocked = [...s.unlockedWhispers]
    const freshAll = []
    for (let i = 0; i < 5; i += 1) {
      const ctx = {
        event,
        night: get().night,
        score: get().score,
        length: get().length,
        mode: get().gameMode,
        moonPhase: get().moonPhase,
        totals: get().totals,
        nightStats: get().nightStats,
        seenModes: get().seenModes,
        seenPhases: get().seenPhases,
        unlocked,
        ...extra,
      }
      const fresh = evaluateWhispers(ctx)
      if (fresh.length === 0) break
      freshAll.push(...fresh)
      unlocked = [...unlocked, ...fresh.map((w) => w.id)]
    }
    if (freshAll.length === 0) return
    writeJSON(WHISPERS_KEY, JSON.stringify(unlocked))
    const toasts = freshAll.map((w) => ({ ...w, toastId: `w${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }))
    set((prev) => ({
      unlockedWhispers: unlocked,
      whisperToasts: [...prev.whisperToasts, ...toasts].slice(-6),
    }))
  },

  // Called by the engine right after addScore(): updates per-night + lifetime
  // food counters, then evaluates whisper triggers for the eat.
  registerEat({ bloom = false } = {}) {
    const totals = { ...get().totals }
    const nightStats = { ...get().nightStats }
    if (bloom) {
      totals.supernovas += 1
      nightStats.supernovas += 1
    } else {
      totals.planets += 1
      nightStats.planets += 1
    }
    if (get().isBoosting) nightStats.boostEats = (nightStats.boostEats || 0) + 1
    writeJSON(TOTALS_KEY, JSON.stringify(totals))
    set({ totals, nightStats })
    get().checkWhispers(bloom ? 'supernova' : 'eat')
    get().checkVerses(bloom ? 'supernova' : 'eat')
  },

  // The Lunar Chronicle (P3): evaluate moon-verse triggers against run
  // context. Same chaining loop as whispers so verse-ink-legend (all 29
  // others heard) resolves in the same pass.
  checkVerses(event, extra = {}) {
    const s = get()
    let unlocked = [...s.unlockedVerses]
    const freshAll = []
    for (let i = 0; i < 5; i += 1) {
      const ctx = {
        event,
        night: get().night,
        score: get().score,
        length: get().length,
        mode: get().gameMode,
        moonPhase: get().moonPhase,
        nightEvent: get().nightEvent,
        bests: get().bests,
        totals: get().totals,
        nightStats: get().nightStats,
        unlocked,
        unlockedWhispers: get().unlockedWhispers,
        ...extra,
      }
      const fresh = evaluateVerses(ctx)
      if (fresh.length === 0) break
      freshAll.push(...fresh)
      unlocked = [...unlocked, ...fresh.map((v) => v.id)]
    }
    if (freshAll.length === 0) return
    writeJSON(VERSES_KEY, JSON.stringify(unlocked))
    const toasts = freshAll.map((v) => ({ ...v, toastId: `v${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }))
    set((prev) => ({
      unlockedVerses: unlocked,
      verseToasts: [...prev.verseToasts, ...toasts].slice(-4),
    }))
  },

  dismissVerseToast(toastId) {
    set((s) => ({ verseToasts: s.verseToasts.filter((t) => t.toastId !== toastId) }))
  },

  dismissWhisperToast(toastId) {
    set((s) => ({ whisperToasts: s.whisperToasts.filter((t) => t.toastId !== toastId) }))
  },

  // Called by the engine when the snake catches the Jade Carp spirit.
  registerSpiritCatch() {
    const totals = { ...get().totals, spiritCatches: get().totals.spiritCatches + 1 }
    writeJSON(TOTALS_KEY, JSON.stringify(totals))
    set({ totals })
    get().checkVerses('spirit')
  },

  clearNightBanner() {
    set({ nightBanner: null })
  },

  openJournal() {
    set({ showJournal: true })
  },
  closeJournal() {
    set({ showJournal: false })
  },

  setMuted(m) {
    set({ muted: m })
    writeJSON(MUTE_KEY, m ? '1' : '0')
  },
}))
import { create } from 'zustand'
import { MOON_IDS, MODE_IDS } from './logic.js'
import { evaluateWhispers } from './whispers.js'
import { evaluateVerses } from './verses.js'
import { EVENT_IDS, rollNightEvent } from './nightEvents.js'
import { isoWeekId, communityEventForWeek } from './community.js'
import { playVerse } from '../audio/sound.js'
import {
  INK_IDS, inkById,
  LANTERN_MAX_TIER, LANTERN_COSTS, lanternCount,
  BLOOM_MAX_TIER, BLOOM_COSTS, bloomCount,
  earnMoonlight, nextStreak, toDayString, journeyReady, JOURNEY_GOAL,
} from './garden.js'
import {
  SKINS, SKIN_IDS, DEFAULT_SKIN, isDefaultSkin, skinById,
  skinUnlockState, checkSkinMilestones,
} from './skins.js'

export const BEST_KEY = 'ran-xinh-best' // legacy single best, migrated into BESTS_KEY
export const BESTS_KEY = 'ran-xinh-bests'
export const MUTE_KEY = 'ran-xinh-muted'
export const MUSIC_KEY = 'ran-xinh-music' // { on, volume } — M02 music toggle + volume
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
// P4 "The Garden Remembers"
export const MOONLIGHT_KEY = 'ran-xinh-moonlight' // { balance, earned }
export const GARDEN_KEY = 'ran-xinh-garden' // { lantern, lotus, inks, ink }
export const SKIN_KEY = 'ran-xinh-skin' // { owned: [skin ids], selected: skin id }
export const JOURNEY_KEY = 'ran-xinh-journey' // { progress, completed }
export const KEEPSAKE_KEY = 'ran-xinh-keepsakes' // [{ id, night, date }]
export const STREAK_KEY = 'ran-xinh-streak' // { count, lastDay }
// P5 "Shared Skies"
export const NAME_KEY = 'ran-xinh-name' // gardener's display name for shared cards
export const ONBOARDED_KEY = 'ran-xinh-onboarded' // first-night coach marks seen
export const PENDING_UNLOCKS_KEY = 'ran-xinh-pending-unlocks' // title-screen unlocks waiting for the next prologue (T10b)
export const COACH_STEPS = 3 // number of first-night guide steps
export const COMMUNITY_BOOST = 10 // extra roll weight for the week's shared sky
// The "night begins" ready beat: seconds of stillness between the prologue
// and the run, so the player is never thrown into motion.
export const READY_BEAT_S = 1.8
// First-night coach marks wait until the snake is already moving, so the
// guide never covers the player's first orienting seconds.
export const COACH_DELAY_MS = 2000

// The coach mark's delayed show — stored so leaving `playing` can cancel
// it instead of letting a dead timer fire into another status (AUDIT L8).
let coachTimer = null
let coachDueAt = 0 // wall-clock ms the pending timer should fire (0 = none)
function clearCoachTimer() {
  if (coachTimer !== null) {
    clearTimeout(coachTimer)
    coachTimer = null
  }
}
function armCoachTimer(delayMs, get, set) {
  clearCoachTimer()
  coachDueAt = Date.now() + delayMs
  coachTimer = setTimeout(() => {
    coachTimer = null
    coachDueAt = 0
    if (get().status === 'playing' && get().coachStep < 0) set({ coachStep: 0 })
  }, delayMs)
}

function readItem(key) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? null : v
  } catch {
    return null
  }
}

function writeItem(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* private mode etc. — best-effort only */
  }
}

export const readBest = () => Math.max(0, parseInt(readItem(BEST_KEY) || '0', 10) || 0)
// Per-mode bests, with one-time migration from the legacy single best.
export const readBests = () => {
  const fresh = { classic: 0, lantern: 0, zen: 0 }
  try {
    const raw = readItem(BESTS_KEY)
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
export const readMuted = () => readItem(MUTE_KEY) === '1'
// M02: music toggle + volume, persisted as one JSON object. Corrupt or
// missing fields fall back per-field to the defaults, never to a crash.
export const readMusic = () => {
  const defaults = { on: true, volume: 0.6 }
  try {
    const parsed = JSON.parse(readItem(MUSIC_KEY) || 'null')
    if (!parsed || typeof parsed !== 'object') return defaults
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.round(Math.min(1, Math.max(0, parsed.volume)) * 10) / 10
        : defaults.volume
    return { on: typeof parsed.on === 'boolean' ? parsed.on : defaults.on, volume }
  } catch {
    return defaults
  }
}
const CAM_MODES = ['aligned', 'topdown', 'cinematic']
export const readCam = () => {
  const v = readItem(CAM_KEY)
  return CAM_MODES.includes(v) ? v : 'aligned'
}
export const readCtrls = () => readItem(CTRLS_KEY) === '1'
export const readMoon = () => {
  const v = readItem(MOON_KEY)
  return MOON_IDS.includes(v) ? v : 'half'
}
export const readMode = () => {
  const v = readItem(MODE_KEY)
  return MODE_IDS.includes(v) ? v : 'classic'
}
export const readNight = () => Math.max(0, parseInt(readItem(NIGHT_KEY) || '0', 10) || 0)
export const readOnboarded = () => readItem(ONBOARDED_KEY) === '1'
// Lifetime counters: { supernovas, planets, deaths, spiritCatches, zenSessions,
// lanternFeasts }. Missing/corrupt → zeros.
export const readTotals = () => {
  const fresh = { supernovas: 0, planets: 0, deaths: 0, spiritCatches: 0, zenSessions: 0, lanternFeasts: 0 }
  try {
    const parsed = JSON.parse(readItem(TOTALS_KEY) || 'null')
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
    const parsed = JSON.parse(readItem(WHISPERS_KEY) || 'null')
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}
// Unlocked verse ids (array of strings) — "Biên niên trăng" collection.
export const readVerses = () => {
  try {
    const parsed = JSON.parse(readItem(VERSES_KEY) || 'null')
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}
// Pending unlock entries earned on the title screen (T10b): full poem
// entries { kind, id, text?, lines? } waiting for the next prologue.
export const readPendingUnlocks = () => {
  try {
    const parsed = JSON.parse(readItem(PENDING_UNLOCKS_KEY) || 'null')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p) => p && (p.kind === 'whisper' || p.kind === 'verse') && typeof p.id === 'string',
    )
  } catch {
    return []
  }
}
// The event rolled for the upcoming night ('none' = quiet night).
export const readTonight = () => {
  const v = readItem(TONIGHT_KEY)
  return v === 'none' || EVENT_IDS.includes(v) ? v : null
}
// P4 "The Garden Remembers" readers.
export const readMoonlight = () => {
  const fresh = { balance: 0, earned: 0 }
  try {
    const parsed = JSON.parse(readItem(MOONLIGHT_KEY) || 'null')
    for (const k of Object.keys(fresh)) {
      const v = parseInt(parsed?.[k], 10)
      if (Number.isFinite(v) && v > 0) fresh[k] = v
    }
  } catch { /* corrupted save — start fresh */ }
  return fresh
}
export const readGarden = () => {
  const fresh = { lantern: 0, lotus: 0, inks: ['jade'], ink: 'jade' }
  try {
    const parsed = JSON.parse(readItem(GARDEN_KEY) || 'null')
    if (parsed && typeof parsed === 'object') {
      const lan = parseInt(parsed.lantern, 10)
      if (Number.isFinite(lan)) fresh.lantern = Math.max(0, Math.min(LANTERN_MAX_TIER, lan))
      const lot = parseInt(parsed.lotus, 10)
      if (Number.isFinite(lot)) fresh.lotus = Math.max(0, Math.min(BLOOM_MAX_TIER, lot))
      if (Array.isArray(parsed.inks)) {
        const owned = parsed.inks.filter((id) => INK_IDS.includes(id))
        if (owned.length) fresh.inks = [...new Set(['jade', ...owned])]
      }
      if (fresh.inks.includes(parsed.ink)) fresh.ink = parsed.ink
    }
  } catch { /* corrupted save — start fresh */ }
  return fresh
}
// Serpent skins: owned + selected, validated against the registry.
// Default-rule skins are always owned; unknown ids are dropped and
// a selected skin that is not owned falls back to the default.
export const readSkins = () => {
  const fresh = { owned: SKINS.filter(isDefaultSkin).map((s) => s.id), selected: DEFAULT_SKIN }
  try {
    const parsed = JSON.parse(readItem(SKIN_KEY) || 'null')
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.owned)) {
        fresh.owned = [...new Set([...fresh.owned, ...parsed.owned.filter((id) => SKIN_IDS.includes(id))])]
      }
      if (fresh.owned.includes(parsed.selected)) fresh.selected = parsed.selected
    }
  } catch { /* corrupted save — start fresh */ }
  return fresh
}
export const readJourney = () => {
  const fresh = { progress: 0, completed: 0 }
  try {
    const parsed = JSON.parse(readItem(JOURNEY_KEY) || 'null')
    for (const k of Object.keys(fresh)) {
      const v = parseInt(parsed?.[k], 10)
      if (Number.isFinite(v) && v > 0) fresh[k] = v
    }
  } catch { /* corrupted save — start fresh */ }
  return fresh
}
export const readKeepsakes = () => {
  try {
    const parsed = JSON.parse(readItem(KEEPSAKE_KEY) || 'null')
    return Array.isArray(parsed) ? parsed.filter((k) => k && typeof k.id === 'string') : []
  } catch {
    return []
  }
}
export const readStreak = () => {
  const fresh = { count: 0, lastDay: null }
  try {
    const parsed = JSON.parse(readItem(STREAK_KEY) || 'null')
    const c = parseInt(parsed?.count, 10)
    if (Number.isFinite(c) && c > 0) fresh.count = c
    if (typeof parsed?.lastDay === 'string') fresh.lastDay = parsed.lastDay
  } catch { /* corrupted save — start fresh */ }
  return fresh
}
// P5 "Shared Skies": the name the gardener signs shared cards with.
export const readName = () => {
  try {
    const v = readItem(NAME_KEY)
    return typeof v === 'string' ? v.trim().slice(0, 24) : ''
  } catch {
    return ''
  }
}
// Seen run contexts: { modes: [...], phases: [...] }.
export const readSeen = () => {
  const fresh = { modes: [], phases: [] }
  try {
    const parsed = JSON.parse(readItem(SEEN_KEY) || 'null')
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
  // The run is over (dead) — the pending coach mark must not fire later.
  clearCoachTimer()
  coachDueAt = 0
  const mode = get().gameMode
  const score = get().score
  // P6: the first night's coach marks end with the run, finished or not.
  if (get().coachStep >= 0) {
    writeItem(ONBOARDED_KEY, '1')
    set({ coachStep: -1 })
  }
  const bests = { ...get().bests }
  const prevBest = bests[mode] || 0
  const newBest = Math.max(prevBest, score)
  bests[mode] = newBest
  writeItem(BESTS_KEY, JSON.stringify(bests))

  // P4 "The Garden Remembers": every night earns moonlight, feeds the
  // Journey to the Moon, and a completed Moonrise Night leaves a keepsake.
  const wasMoonrise = get().moonriseActive === true
  const ml = earnMoonlight({
    score,
    mode,
    moonPhase: get().moonPhase,
    isNewBest: score > prevBest,
    streak: get().streak?.count || 0,
    moonrise: wasMoonrise,
  })
  const moonlight = {
    balance: (get().moonlight?.balance || 0) + ml,
    earned: (get().moonlight?.earned || 0) + ml,
  }
  writeItem(MOONLIGHT_KEY, JSON.stringify(moonlight))
  let journey = {
    progress: (get().journey?.progress || 0) + ml,
    completed: get().journey?.completed || 0,
  }
  let keepsakes = get().keepsakes || []
  let moonriseCoda = null
  if (wasMoonrise) {
    keepsakes = [
      ...keepsakes,
      { id: `keepsake-${get().night}-${Date.now()}`, night: get().night, date: toDayString() },
    ]
    writeItem(KEEPSAKE_KEY, JSON.stringify(keepsakes))
    journey = { progress: 0, completed: journey.completed + 1 }
    moonriseCoda = { moonlight: ml, keepsake: keepsakes[keepsakes.length - 1] }
  }
  writeItem(JOURNEY_KEY, JSON.stringify(journey))

  // S06: completing a Moonrise Night grants the milestone skins
  // (Plush Moon) for free. The grant is recorded like any other
  // unlock — an entry in runUnlocks, so the player sees it in the
  // game-over summary (T10b routing: a live run's unlocks rest
  // there). The skin is owned, not auto-worn.
  let skins = get().skins
  let skinUnlockEntries = []
  if (wasMoonrise && skins) {
    const granted = checkSkinMilestones({
      owned: skins.owned,
      journeyCompleted: journey.completed,
    })
    if (granted.length > 0) {
      skins = { owned: [...skins.owned, ...granted], selected: skins.selected }
      writeItem(SKIN_KEY, JSON.stringify(skins))
      skinUnlockEntries = granted.map((id) => ({
        kind: 'skin',
        id,
        text: `${skinById(id).name} is yours — a gift of the Moonrise Night.`,
      }))
    }
  }

  // P5 "Shared Skies" — Tonight's Highlights: the run's most beautiful
  // moments, finalized here. Candidates were noted during play; keep the top
  // 3 by priority, in the order they happened, for the game-over reel.
  const candidates = [...(get().nightHighlights || [])]
  if (wasMoonrise) {
    candidates.push({
      kind: 'moonrise',
      text: 'The moon leaned close, and the sky rained stars.',
      priority: 2,
      at: Date.now(),
    })
  }
  if (score > prevBest && prevBest > 0) {
    candidates.push({
      kind: 'newbest',
      text: 'Tonight, the moon learned your name.',
      priority: 3,
      at: Date.now(),
    })
  }
  const highlights = [...candidates]
    .sort((a, b) => b.priority - a.priority || a.at - b.at)
    .slice(0, 3)
    .sort((a, b) => a.at - b.at)

  set({
    status: 'dead',
    bests,
    best: newBest,
    isNewBest: score > prevBest,
    isBoosting: false,
    deathCause: cause,
    timeLeft: null,
    moonlight,
    journey,
    keepsakes,
    moonriseActive: false,
    moonriseCoda,
    lastMoonlight: ml,
    highlights,
    skins,
    runUnlocks: [...(get().runUnlocks || []), ...skinUnlockEntries],
  })
}

export const useGame = create((set, get) => ({
  status: 'title', // title | prologue | playing | paused | dead
  showHowTo: false,
  score: 0,
  length: 3,
  best: 0,
  isNewBest: false,
  muted: false,
  music: { on: true, volume: 0.6 },

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
  // whisperToasts: transient ferry for night-start unlocks — start() moves
  // them into prologueQueue so they are read before the run begins.
  whisperToasts: [],
  // runUnlocks: whispers + verses unlocked during a live run. They no longer
  // float over the gameplay as toasts; a quiet corner note counts them and
  // the poems wait in the game-over summary, readable at rest.
  // Each entry is { kind: 'whisper'|'verse', id, text?, lines? }.
  runUnlocks: [],
  // pendingUnlocks: whispers + verses unlocked while on the title screen
  // (e.g. Garden purchases via checkVerses('garden')). Persisted under
  // PENDING_UNLOCKS_KEY; start() moves them to the head of the next
  // night's prologueQueue so they are actually read (T10b). Same entry
  // shape as runUnlocks.
  pendingUnlocks: [],
  // nightBanner: { night, modeLabel, phaseLabel } shown briefly when a run starts
  nightBanner: null,
  // coachStep: P6 first-night guide. -1 = hidden/done, 0..2 = visible steps.
  coachStep: -1,
  // showJournal: the collection overlay is open
  showJournal: false,

  // The Lunar Chronicle (P3 storytelling): 30 two-line moon verses, earned
  // through deliberate feats and collected out of order.
  unlockedVerses: [],

  // P4 "The Garden Remembers"
  moonlight: { balance: 0, earned: 0 },
  garden: { lantern: 0, lotus: 0, inks: ['jade'], ink: 'jade' },
  // Serpent skins (game/skins.js): owned ids + the one being worn.
  skins: { owned: [DEFAULT_SKIN], selected: DEFAULT_SKIN },
  journey: { progress: 0, completed: 0 },
  keepsakes: [],
  streak: { count: 0, lastDay: null },
  showGarden: false,
  moonriseArmed: false,
  moonriseActive: false,
  moonriseCoda: null,
  lastMoonlight: 0,
  verseToasts: [],
  // P5 "Shared Skies"
  gardenerName: '', // display name signed on shared cards (ran-xinh-name)
  communityEvent: 'none', // this ISO week's shared sky event id
  nightHighlights: [], // highlight candidates noted during the run
  highlights: [], // finalized top-3 moments for the game-over reel
  milestone: 0, // highest score milestone (25/50/100) noted this run
  // prologueQueue: whispers + verses unlocked by the nightStart evaluation,
  // shown one at a time on the pre-play prologue screen so the player can
  // actually read them before the run begins. Each entry is
  // { kind: 'whisper'|'verse', id, text? , lines? }.
  prologueQueue: [],
  // prologueIndex: which poem of the prologueQueue is being read.
  prologueIndex: 0,
  // tonightEvent: the special event rolled for the upcoming night ('none' =
  // quiet night), announced on the title screen. nightEvent: the event active
  // during the current run.
  tonightEvent: 'none',
  nightEvent: 'none',

  hydrate() {
    const bests = readBests()
    const gameMode = readMode()
    const seen = readSeen()
    const journey = readJourney()
    let skins = readSkins()
    // S06: a player who completed a Moonrise Night before skin
    // grants existed has still earned the milestone skins — record
    // the grant now so it is never lost.
    const grants = checkSkinMilestones({ owned: skins.owned, journeyCompleted: journey.completed })
    if (grants.length > 0) {
      skins = { owned: [...skins.owned, ...grants], selected: skins.selected }
      writeItem(SKIN_KEY, JSON.stringify(skins))
    }
    set({
      bests,
      best: bests[gameMode] || 0,
      muted: readMuted(),
      music: readMusic(),
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
      moonlight: readMoonlight(),
      garden: readGarden(),
      skins,
      journey,
      keepsakes: readKeepsakes(),
      streak: readStreak(),
      gardenerName: readName(),
      pendingUnlocks: readPendingUnlocks(),
      communityEvent: communityEventForWeek(isoWeekId(new Date())),
    })
  },

  start() {
    const prev = get()
    const night = prev.night + 1
    const isFirstMode = !prev.seenModes.includes(prev.gameMode)
    const isFirstPhase = !prev.seenPhases.includes(prev.moonPhase)
    const seenModes = isFirstMode ? [...prev.seenModes, prev.gameMode] : prev.seenModes
    const seenPhases = isFirstPhase ? [...prev.seenPhases, prev.moonPhase] : prev.seenPhases
    // P4 — a deliberately-started Moonrise Night overrides the rolled event.
    const moonrise = prev.moonriseArmed === true
    const nightEvent = moonrise ? 'moonrise' : (prev.tonightEvent || 'none')
    // P5 — Shared Skies: the week's community event gets bonus roll weight
    // so every gardener is more likely to meet the same sky.
    const communityEvent = communityEventForWeek(isoWeekId(new Date()))
    const tonightEvent = rollNightEvent(Math.random, { [communityEvent]: COMMUNITY_BOOST })
    // P4 — lunar streak: one counted day per calendar day, consecutive days
    // extend it. A broken streak simply stops the bonus; never a punishment.
    const advancedStreak = nextStreak(prev.streak, toDayString())
    const streak = advancedStreak || prev.streak
    if (advancedStreak) writeItem(STREAK_KEY, JSON.stringify(advancedStreak))
    writeItem(NIGHT_KEY, String(night))
    writeItem(SEEN_KEY, JSON.stringify({ modes: seenModes, phases: seenPhases }))
    writeItem(TONIGHT_KEY, tonightEvent)
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
      runUnlocks: [],
      prologueQueue: [],
      prologueIndex: 0,
      streak,
      moonriseArmed: false,
      moonriseActive: moonrise,
      moonriseCoda: null,
      lastMoonlight: 0,
      communityEvent,
      nightHighlights: [],
      highlights: [],
      milestone: 0,
    })
    get().checkWhispers('nightStart', { isFirstMode, isFirstPhase })
    get().checkVerses('nightStart', { isFirstMode, isFirstPhase })
    // The night's new poems belong to the prologue screen, not to floating
    // toasts over live gameplay: collect them so they can be read one at a
    // time before the run begins. Poems earned on the title screen
    // (pendingUnlocks, T10b) lead the queue — they have waited longest —
    // then the nightStart poems.
    const afterStart = get()
    set({
      prologueQueue: [
        ...afterStart.pendingUnlocks,
        ...afterStart.whisperToasts.map((t) => ({ kind: 'whisper', id: t.id, text: t.text })),
        ...afterStart.verseToasts.map((t) => ({ kind: 'verse', id: t.id, lines: t.lines })),
      ],
      whisperToasts: [],
      verseToasts: [],
      pendingUnlocks: [],
    })
    try {
      localStorage.removeItem(PENDING_UNLOCKS_KEY)
    } catch {
      /* storage unavailable — the in-state copy is already cleared */
    }
  },
  // Called from the prologue screen (button, card tap, or keypress) once
  // the player has read the night's new whispers and verses. Opens the
  // "ready" beat — the garden is visible and the snake is still — before
  // the run truly starts, so the player is never thrown into motion.
  beginNight() {
    if (get().status !== 'prologue') return
    set({ status: 'ready', prologueQueue: [] })
  },

  // The ready beat ends and the run truly starts. Guarded so a hurried tap
  // and the engine's own timer can't both fire it.
  enterPlaying() {
    if (get().status !== 'ready') return
    set({ status: 'playing', nightBanner: null })
    // P6 "First Light": first-ever night gets gentle coach marks — delayed
    // until the snake is already moving, so the guide never covers the
    // player's first orienting seconds.
    if (get().night === 1 && !readOnboarded()) {
      armCoachTimer(COACH_DELAY_MS, get, set)
    }
  },

  // Step through the prologue's poems: the next poem, or the night itself
  // once the last one has been read.
  advancePrologue() {
    if (get().status !== 'prologue') return
    const { prologueIndex, prologueQueue } = get()
    if (prologueIndex < prologueQueue.length - 1) set({ prologueIndex: prologueIndex + 1 })
    else get().beginNight()
  },

  // P6 "First Light": first-night coach marks (auto-advance, tap to skip).
  advanceCoach() {
    const step = get().coachStep
    if (step < 0) return
    if (step >= COACH_STEPS - 1) get().dismissCoach()
    else set({ coachStep: step + 1 })
  },
  dismissCoach() {
    writeItem(ONBOARDED_KEY, '1')
    set({ coachStep: -1 })
  },

  // --- P4 "The Garden Remembers" ---
  setShowGarden(v) {
    set({ showGarden: v })
  },

  // Journey to the Moon: when the ascension bar is full, the player may call
  // the Moonrise Night — it arms and starts immediately.
  startMoonrise() {
    if (!journeyReady(get().journey?.progress || 0)) return
    set({ moonriseArmed: true })
    get().start()
  },

  dismissMoonriseCoda() {
    set({ moonriseCoda: null })
  },

  // P5 "Shared Skies" — the name signed on shared cards.
  // While typing, keep the raw text (inner spaces included) and do not
  // persist yet; trimming happens once, in commitGardenerName, when the
  // field loses focus or the Journal closes. Trimming on every keystroke
  // made mid-name spaces impossible to type.
  setGardenerName(name) {
    const raw = typeof name === 'string' ? name.slice(0, 24) : ''
    set({ gardenerName: raw })
  },

  commitGardenerName() {
    const clean = (get().gardenerName || '').trim().slice(0, 24)
    writeItem(NAME_KEY, clean)
    set({ gardenerName: clean })
  },

  // P5 "Shared Skies" — note a beautiful moment of the current night.
  // One entry per kind (re-noting refreshes the text); candidates are
  // finalized into the top-3 `highlights` when the run completes.
  noteHighlight(kind, text, priority) {
    const at = Date.now()
    set((s) => {
      const rest = (s.nightHighlights || []).filter((h) => h.kind !== kind)
      return { nightHighlights: [...rest, { kind, text, priority, at }].slice(-8) }
    })
  },

  _spend(cost) {
    const moonlight = get().moonlight
    if (moonlight.balance < cost) return null
    const next = { balance: moonlight.balance - cost, earned: moonlight.earned }
    writeItem(MOONLIGHT_KEY, JSON.stringify(next))
    set({ moonlight: next })
    return next
  },

  _saveGarden(garden) {
    writeItem(GARDEN_KEY, JSON.stringify(garden))
    set({ garden })
  },

  upgradeLanterns() {
    const g = get().garden
    const next = g.lantern + 1
    if (next > LANTERN_MAX_TIER) return
    if (!get()._spend(LANTERN_COSTS[next])) return
    get()._saveGarden({ ...g, lantern: next })
    get().checkVerses('garden')
  },

  upgradeBlooms() {
    const g = get().garden
    const next = g.lotus + 1
    if (next > BLOOM_MAX_TIER) return
    if (!get()._spend(BLOOM_COSTS[next])) return
    get()._saveGarden({ ...g, lotus: next })
    get().checkVerses('garden')
  },

  // Buying an ink also selects it; re-tapping an owned ink just selects it.
  chooseInk(id) {
    const ink = inkById(id)
    const g = get().garden
    if (g.inks.includes(ink.id)) {
      if (g.ink !== ink.id) get()._saveGarden({ ...g, ink: ink.id })
      return
    }
    if (!get()._spend(ink.cost)) return
    get()._saveGarden({ ...g, inks: [...g.inks, ink.id], ink: ink.id })
    get().checkVerses('garden')
  },

  // Wear a skin. Only owned skins can be worn — unlocking (800 ☾ or
  // a Moonrise Night) arrives in S06; until then an unowned skin is
  // a no-op here and shows as locked in the picker.
  chooseSkin(id) {
    if (!SKIN_IDS.includes(id)) return
    const cur = get().skins
    if (!cur.owned.includes(id) || cur.selected === id) return
    const skins = { owned: cur.owned, selected: id }
    writeItem(SKIN_KEY, JSON.stringify(skins))
    set({ skins })
  },

  buySkin(id) {
    // S06: buy an unowned skin with moonlight, like chooseInk —
    // the price comes from the skin's unlock data, the balance is
    // spent through _spend, and a bought skin is worn at once.
    // Re-buying an owned skin never charges: it just wears it.
    if (!SKIN_IDS.includes(id)) return
    const cur = get().skins
    if (!cur) return
    if (cur.owned.includes(id)) {
      get().chooseSkin(id)
      return
    }
    const st = skinUnlockState(skinById(id), {
      owned: cur.owned,
      balance: get().moonlight?.balance || 0,
      journeyCompleted: get().journey?.completed || 0,
    })
    if (st.owned) {
      // A milestone already grants it (defensive; completeRun and
      // hydrate normally record grants before this can happen).
      const skins = { owned: [...cur.owned, id], selected: cur.selected }
      writeItem(SKIN_KEY, JSON.stringify(skins))
      set({ skins })
      return
    }
    if (!st.buyable) return
    if (!get()._spend(st.cost)) return
    const skins = { owned: [...cur.owned, id], selected: id }
    writeItem(SKIN_KEY, JSON.stringify(skins))
    set({ skins })
  },
  pause() {
    if (get().status === 'playing') {
      clearCoachTimer()
      set({ status: 'paused', isBoosting: false })
    }
  },
  resume() {
    if (get().status === 'paused') {
      set({ status: 'playing' })
      // If pause() cancelled the coach timer mid-delay (night 1), resume
      // it with the time left — otherwise the guide never shows this run.
      const remaining = coachDueAt - Date.now()
      if (remaining > 0) armCoachTimer(remaining, get, set)
      else coachDueAt = 0
    }
  },
  togglePause() {
    get().status === 'playing' ? get().pause() : get().resume()
  },
  toTitle() {
    clearCoachTimer()
    coachDueAt = 0
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
    writeItem(CAM_KEY, nextMode)
    set({ cameraMode: nextMode })
  },

  setCameraMode(mode) {
    writeItem(CAM_KEY, mode)
    set({ cameraMode: mode })
  },

  setMoonPhase(moonPhase) {
    if (!MOON_IDS.includes(moonPhase)) return
    writeItem(MOON_KEY, moonPhase)
    set({ moonPhase })
  },

  setGameMode(gameMode) {
    if (!MODE_IDS.includes(gameMode)) return
    writeItem(MODE_KEY, gameMode)
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
    writeItem(CTRLS_KEY, next ? '1' : '0')
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
    writeItem(TOTALS_KEY, JSON.stringify(totals))
    set({ totals })
    set({ score: result.score, length: result.length })
    // P5 "Shared Skies" — a lantern feast deserves a highlight of its own.
    if (cause === 'time' && result.score >= 40) {
      get().noteHighlight('feast', 'Sixty seconds of falling stars — a lantern feast.', 1)
    }
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
    writeItem(TOTALS_KEY, JSON.stringify(totals))
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
    writeItem(WHISPERS_KEY, JSON.stringify(unlocked))
    // Routing by status (T10b): night-start unlocks ride the toast ferry
    // into the prologue queue, where they are read one at a time before
    // the run begins. Title-screen unlocks wait in pendingUnlocks
    // (persisted) for the next night's prologue. Any other status rests
    // in runUnlocks for the game-over summary — never capped, the sheet
    // scrolls.
    const items = freshAll.map((w) => ({ kind: 'whisper', id: w.id, text: w.text }))
    const status = get().status
    if (status === 'prologue') {
      const toasts = freshAll.map((w) => ({ ...w, toastId: `w${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }))
      set((prev) => ({
        unlockedWhispers: unlocked,
        whisperToasts: [...prev.whisperToasts, ...toasts].slice(-6),
      }))
    } else if (status === 'title') {
      const pending = [...get().pendingUnlocks]
      for (const item of items) {
        if (!pending.some((p) => p.id === item.id)) pending.push(item)
      }
      writeItem(PENDING_UNLOCKS_KEY, JSON.stringify(pending))
      set({ unlockedWhispers: unlocked, pendingUnlocks: pending })
    } else {
      set((prev) => ({
        unlockedWhispers: unlocked,
        runUnlocks: [...prev.runUnlocks, ...items],
      }))
    }
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
    writeItem(TOTALS_KEY, JSON.stringify(totals))
    set({ totals, nightStats })
    // P5 "Shared Skies" — note the night's beautiful moments for the reel.
    if (bloom && nightStats.supernovas === 1) {
      get().noteHighlight('supernova', 'A dying star chose you to carry its last light.', 2)
    }
    const score = get().score
    const seenMilestone = get().milestone || 0
    const MILESTONES = [
      [25, 'Twenty-five lights — the pond begins to glow.'],
      [50, 'Fifty lights. The garden holds its breath.'],
      [100, 'A hundred lights. The night will remember this.'],
    ]
    for (const [t, text] of MILESTONES) {
      if (score >= t && seenMilestone < t) {
        set({ milestone: t })
        get().noteHighlight('milestone', text, t >= 100 ? 2 : 1)
      }
    }
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
        communityEvent: get().communityEvent,
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
    writeItem(VERSES_KEY, JSON.stringify(unlocked))
    // P6: a soft moon-chime marks the moment a verse joins the chronicle.
    // Audio feedback stays — it never covers the garden.
    playVerse()
    // Like whispers above, routed by status (T10b): prologue → toast
    // ferry; title → pendingUnlocks (persisted) for the next prologue;
    // anything else → runUnlocks for the game-over summary, uncapped.
    const items = freshAll.map((v) => ({ kind: 'verse', id: v.id, lines: v.lines }))
    const status = get().status
    if (status === 'prologue') {
      const toasts = freshAll.map((v) => ({ ...v, toastId: `v${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }))
      set((prev) => ({
        unlockedVerses: unlocked,
        verseToasts: [...prev.verseToasts, ...toasts].slice(-4),
      }))
    } else if (status === 'title') {
      const pending = [...get().pendingUnlocks]
      for (const item of items) {
        if (!pending.some((p) => p.id === item.id)) pending.push(item)
      }
      writeItem(PENDING_UNLOCKS_KEY, JSON.stringify(pending))
      set({ unlockedVerses: unlocked, pendingUnlocks: pending })
    } else {
      set((prev) => ({
        unlockedVerses: unlocked,
        runUnlocks: [...prev.runUnlocks, ...items],
      }))
    }
  },

  // Called by the engine when the snake catches the Jade Carp spirit.
  registerSpiritCatch() {
    const totals = { ...get().totals, spiritCatches: get().totals.spiritCatches + 1 }
    writeItem(TOTALS_KEY, JSON.stringify(totals))
    set({ totals })
    get().noteHighlight('spirit', 'The Jade Carp chose to be caught.', 3)
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
    writeItem(MUTE_KEY, m ? '1' : '0')
  },

  // M02: the engine subscription mirrors these into sound.js (the same
  // bridge setMuted uses), so the store stays the single source of
  // truth and the audio module never reads localStorage itself.
  setMusicOn(on) {
    const music = { ...get().music, on }
    set({ music })
    writeItem(MUSIC_KEY, JSON.stringify(music))
  },

  setMusicVolume(v) {
    const volume = Math.round(Math.min(1, Math.max(0, v)) * 10) / 10
    const music = { ...get().music, volume }
    set({ music })
    writeItem(MUSIC_KEY, JSON.stringify(music))
  },
}))
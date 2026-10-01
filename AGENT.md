# AGENT.md — Moonlit Serpent (Snake)

Guidance for AI coding agents working in this repository.

## What this is

**Moonlit Serpent** (`ran-xinh`) is a premium 3D Snake game: a serpent gliding through a moonlit Vietnamese ink garden. Classic grid Snake rules, rendered with Three.js, UI in React.

- Package name: `ran-xinh`
- Stack: **Vite 6 + React 18 + Three.js + Zustand**
- Language: English in code and all player-facing UI/copy (Vietnamese ink-garden art theme retained; switched 2026-10-01 for global audience + font safety)
- Repo: https://github.com/trinhbuikhang/Snake

## Commands

```bash
npm install
npm run dev      # Vite dev server (host: true)
npm run build    # production build → dist/
npm run preview  # preview production build
```

`vite.config.js` uses `base: './'` so the build can be served from a subpath or opened as static files.

## Architecture

```
index.html
src/
  main.jsx              # React entry
  App.jsx               # stage: GameCanvas + Hud
  styles.css            # HUD / overlay styles
  components/
    GameCanvas.jsx      # mounts Three.js engine on a <canvas>
    Hud.jsx             # title, score, pause, how-to, controls
  game/
    logic.js            # pure grid Snake: step, turn, food, demo orbit
    store.js            # Zustand UI/game status + localStorage prefs
    inputBus.js         # keyboard / touch / swipe → direction + boost
  three/
    engine.js           # render loop, camera modes, couples logic ↔ scene
    garden.js           # night-garden scene (ground, props, lighting feel)
    snakeRig.js         # snake mesh / animation on the grid path
  audio/
    sound.js            # SFX (respects mute)
```

### Separation of concerns (keep this)

| Layer | Role | Rule |
|-------|------|------|
| `game/logic.js` | Pure simulation | No React, no Three, no DOM. Safe to unit-test in Node. |
| `game/store.js` | UI + session state | Status (`title` \| `playing` \| `paused` \| `dead`), score, camera, mute, floating texts. Persists prefs via localStorage keys `ran-xinh-*`. |
| `game/inputBus.js` | Input fan-in | Decouples DOM events from the engine tick. |
| `three/engine.js` | Runtime glue | Owns WebGL, composer/bloom, camera presets, tick that calls `step` / `turn`. |
| `components/*` | Thin React shell | Canvas mount + HUD only — do not put game rules in JSX. |

### Gameplay constants (in `logic.js`)

- Grid size: `N = 20`
- Speed: `BASE_INTERVAL` → speeds up every `SPEED_STEP_EVERY` foods; floor `MIN_INTERVAL`; boost multiplies interval by `BOOST_MULTIPLIER`
- Food themes: planets + occasional “bloom” / supernova (`PLANETS`, `SUPERNOVA`)
- Moon-phase run modifiers ("Tuần trăng") live in `src/game/logic.js` (`MOON_PHASES`): score values, speed multiplier, light intensity, food glow. Player choice persisted under `ran-xinh-moon`.
- Game modes ("Ba nẻo chơi") live in `src/game/logic.js` (`GAME_MODES`): `classic` (survive), `lantern` (60s `LANTERN_DURATION` time attack — `step(game, dt)` counts down `timeLeft`, `cause: 'time'`), `zen` (walls wrap, no self-death, slower). Choice persisted under `ran-xinh-mode`; per-mode bests in `ran-xinh-bests` (legacy `ran-xinh-best` migrates into `classic`). Store exposes `deathCause` (`wall`/`self`/`time`/`zen`) for the game-over overlay; zen sessions end via `endZenSession()` (pause menu), never by death.
- Directions: arrows / WASD / HJKL; opposite turns rejected
- Whispers of the Night ("Lời thì thầm") live in `src/game/whispers.js`: 40 collectible one-line poems with pure `when(ctx)` trigger predicates (no React/Three/DOM — unit-testable in Node). The store evaluates them via `checkWhispers(event, extra)` (chained unlocks resolve in one pass), persists heard ids under `ran-xinh-whispers`, and queues toasts (`whisperToasts`). Each run is one "Night" (`ran-xinh-night`, incremented in `start()`); per-night counters reset there, lifetime counters (`{supernovas, planets, deaths, spiritCatches, zenSessions, lanternFeasts}`) persist under `ran-xinh-totals`; seen modes/phases under `ran-xinh-seen`. Engine hooks: `registerEat()` after `addScore()` in `handleEat`, `gameOver()` (death + newBest), `endZenSession()` (zenEnd), `setBoosting(true)` (dash). UI: `NightBanner` (run intro), `WhisperToasts`, `JournalOverlay` (collection grid, opened from title).
- The Lunar Chronicle ("Biên niên trăng", P3) live in `src/game/verses.js`: 30 two-line moon verses with pure `when(ctx)` triggers; the final verse (`verse-ink-legend`) unlocks when the other 29 are heard. Store evaluates via `checkVerses(event, extra)` (persisted `ran-xinh-verses`, toasts `verseToasts`), called on the same hooks as whispers plus `registerSpiritCatch()`. Heard verses can be shared as 1080×1350 cards via `composeVerseCard()` in `moonCard.js` (Web Share + download fallback, like the moon card).
- Night Events live in `src/game/nightEvents.js`: 5 special nights (Meteor Shower, Thick Fog, High Tide, Silent Night, Bloom Tide) with `supernovaMult`/`planetBonus`/`speedMult`/`fogMult` modifiers; ~28% of nights are special via `rollNightEvent()`. The store rolls `tonightEvent` at `start()` (announced on the title screen, persisted `ran-xinh-tonight`) and activates it as `nightEvent`; `createGame(moonId, modeId, eventId)` stores `game.event`, `step()` adds `planetBonus` to planet score and bends the supernova cadence (`supernovaMult`), `speedInterval()` takes an `eventMult`, and the engine sets `scene.fog.density` from `fogMult`.
- The Jade Carp spirit: engine-only (Three.js), spawns on ~1/15 nights in `resetGame()`, swims one cell per `SPIRIT_STEP` seconds across a row, despawns at the edge/run end; head-catch gives +10 via `addScore(..., 'carp')` → `registerSpiritCatch()` (totals.spiritCatches, verse check). Visual: glowing jade sphere; burst via `garden.burstAt(..., 'carp', 10)`.

### Camera modes (`store` + `engine`)

- `aligned` — axes match screen (default “Classic 3D”)
- `topdown` — near-overhead 2.5D
- `cinematic` — gentle isometric tilt

## Conventions for agents

1. **Do not mix layers.** New mechanics → `logic.js` first; visuals → `three/*`; HUD copy/controls → `Hud.jsx` + `store.js`.
2. **Prefer extending existing modules** over new frameworks (no extra state libs, no R3F unless explicitly requested).
3. **Respect mute and `prefers-reduced-motion`** (engine already checks reduced motion).
4. **localStorage keys** are prefixed `ran-xinh-`; keep that prefix for any new prefs.
5. **English product voice** in player-facing strings; keep code identifiers in English.
6. Avoid drive-by refactors and unrelated file edits.

## Out of scope unless asked

- Backend / multiplayer / accounts
- Native mobile wrappers
- Changing the art direction away from the night ink garden

## Quick mental model

React draws the HUD. Zustand holds “what the player sees about the run.” Pure `logic.js` owns the grid truth. `engine.js` advances that truth on a timer, drives Three.js, and pushes score/status into the store. `inputBus` feeds intended turns and boost into the engine each frame.

Run statuses: `title → prologue → playing ⇄ paused → dead`. `start()` sets `prologue` (not `playing`): the night's fresh whispers/verses are collected into `prologueQueue` and shown one at a time on the prologue screen so the player can read them before the run. `beginNight()` (button, tap, Space/Enter) moves to `playing`, where the engine's `resetGame()` runs. The demo garden keeps drifting behind the prologue. In-play whispers/verses still use floating toasts, rendered in a single `.toast-stack` column so they can never overlap.

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
npm test         # vitest run — committed suites; the ONLY basis for a "tests pass" claim
```

`vite.config.js` uses `base: './'` so the build can be served from a subpath or opened as static files.

CI (`.github/workflows/ci.yml`, Node 22) runs `npm ci` + `npm run build` + `npm test` on every PR and every `master` push. The old GitHub Pages deploy workflow is gone — deploys are Cloudflare-only (push to `master`).

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
    sound.js            # procedural SFX + pad/water ambience (respects mute)
```

### Separation of concerns (keep this)

| Layer | Role | Rule |
|-------|------|------|
| `game/logic.js` | Pure simulation | No React, no Three, no DOM. Safe to unit-test in Node. |
| `game/store.js` | UI + session state | Status (`title` \| `prologue` \| `ready` \| `playing` \| `paused` \| `dead`), score, camera, mute, floating texts. Persists prefs via localStorage keys `ran-xinh-*`. |
| `game/inputBus.js` | Input fan-in | Decouples DOM events from the engine tick. |
| `three/engine.js` | Runtime glue | Owns WebGL, composer/bloom, camera presets, the quality governor, the tick that calls `step` / `turn`, and full teardown in `destroy()`. |
| `components/*` | Thin React shell | Canvas mount + HUD only — do not put game rules in JSX. |

### Gameplay constants (in `logic.js`)

- Grid size: `N = 20`
- Speed: `BASE_INTERVAL` → speeds up every `SPEED_STEP_EVERY` foods; floor `MIN_INTERVAL`; boost multiplies interval by `BOOST_MULTIPLIER`
- Food themes: planets + occasional “bloom” / supernova (`PLANETS`, `SUPERNOVA`)
- Moon-phase run modifiers ("Tuần trăng") live in `src/game/logic.js` (`MOON_PHASES`): score values, speed multiplier, light intensity, food glow. Player choice persisted under `ran-xinh-moon`.
- Game modes ("Ba nẻo chơi") live in `src/game/logic.js` (`GAME_MODES`): `classic` (survive), `lantern` (60s `LANTERN_DURATION` time attack — `step(game, dt)` counts down `timeLeft`, `cause: 'time'`), `zen` (walls wrap, no self-death, slower). Choice persisted under `ran-xinh-mode`; per-mode bests in `ran-xinh-bests` (legacy `ran-xinh-best` migrates into `classic`). Store exposes `deathCause` (`wall`/`self`/`time`/`zen`) for the game-over overlay; zen sessions end via `endZenSession()` (pause menu), never by death.
- Directions: arrows / WASD / HJKL; opposite turns rejected
- Whispers of the Night ("Lời thì thầm") live in `src/game/whispers.js`: 40 collectible one-line poems with pure `when(ctx)` trigger predicates (no React/Three/DOM — unit-testable in Node). The store evaluates them via `checkWhispers(event, extra)` (chained unlocks resolve in one pass), persists heard ids under `ran-xinh-whispers`, and queues toasts (`whisperToasts`). Each run is one "Night" (`ran-xinh-night`, incremented in `start()`); per-night counters reset there, lifetime counters (`{supernovas, planets, deaths, spiritCatches, zenSessions, lanternFeasts}`) persist under `ran-xinh-totals`; seen modes/phases under `ran-xinh-seen`. Engine hooks: `registerEat()` after `addScore()` in `handleEat`, `gameOver()` (death + newBest), `endZenSession()` (zenEnd), `setBoosting(true)` (dash). UI: `NightBanner` (run intro), `WhisperToasts`, `JournalOverlay` (collection grid, opened from title).
- The Lunar Chronicle ("Biên niên trăng", P3) live in `src/game/verses.js`: 32 two-line moon verses with pure `when(ctx)` triggers (30 from P3 + `verse-moonrise` + `verse-garden-awakens` from P4); the final verse (`verse-ink-legend`) unlocks when all others are heard. Store evaluates via `checkVerses(event, extra)` (persisted `ran-xinh-verses`, toasts `verseToasts`), called on the same hooks as whispers plus `registerSpiritCatch()` and garden purchases (`'garden'` event). Heard verses can be shared as 1080×1350 cards via `composeVerseCard()` in `moonCard.js` (Web Share + download fallback, like the moon card).
- Night Events live in `src/game/nightEvents.js`: 5 special nights (Meteor Shower, Thick Fog, High Tide, Silent Night, Bloom Tide) with `supernovaMult`/`planetBonus`/`speedMult`/`fogMult` modifiers; ~28% of nights are special via `rollNightEvent()`. The store rolls `tonightEvent` at `start()` (announced on the title screen, persisted `ran-xinh-tonight`) and activates it as `nightEvent`; `createGame(moonId, modeId, eventId)` stores `game.event`, `step()` adds `planetBonus` to planet score and bends the supernova cadence (`supernovaMult`), `speedInterval()` takes an `eventMult`, and the engine sets `scene.fog.density` from `fogMult`.
- The Jade Carp spirit: engine-only (Three.js), spawns on ~1/15 nights in `resetGame()`, swims one cell per `SPIRIT_STEP` seconds across a row, despawns at the edge/run end; head-catch gives +10 via `addScore(..., 'carp')` → `registerSpiritCatch()` (totals.spiritCatches, verse check). Visual: glowing jade sphere; burst via `garden.burstAt(..., 'carp', 10)`.
- The Garden Remembers ("Vườn nhớ", P4): pure economy in `src/game/garden.js` — `earnMoonlight({score, mode, moonPhase, isNewBest, streak, moonrise})` (mode/phase/streak/newBest multipliers, min 1), `INKS` (jade/gold/crimson/abyss with emissive/ridge tints), lantern tiers [4,8,12,16] + bloom tiers [0,3,6,9] with per-tier costs, `nextStreak(prev, today)` (pure over YYYY-MM-DD; a broken streak just resets to 1, never punishes), `JOURNEY_GOAL = 3000` ascension points (1:1 with earned moonlight). Store persists `ran-xinh-moonlight` `{balance, earned}`, `ran-xinh-garden` `{lantern, lotus, inks, ink}`, `ran-xinh-journey` `{progress, completed}`, `ran-xinh-keepsakes`, `ran-xinh-streak`; `completeRun()` awards moonlight + ascension on every night end, and a completed Moonrise Night grants a keepsake + resets the journey bar + shows the `MoonriseCoda`. Shop actions: `upgradeLanterns()`, `upgradeBlooms()`, `chooseInk(id)` (buy-and-wear), `startMoonrise()` (requires `journeyReady()`, arms then `start()`), `setShowGarden()`.
- Moonrise Night: a 6th night event in `nightEvents.js` (`supernovaMult: 4` → `placeFood` makes every food a supernova, `planetBonus: 2`, `fogMult: 0.7`, `weight: 0` so it never rolls by chance). Started deliberately via `startMoonrise()`; `start()` overrides the rolled event with `'moonrise'`, sets `moonriseActive`, and `verse-moonrise` unlocks on `nightStart` (shown in the prologue). Engine: `garden.moonGroup.scale` ×2.4 while `moonriseActive` (applied in `applyGarden()`, subscribed to garden/moonrise changes).
- Visible garden upgrades: `src/three/decor.js` `buildDecor(scene)` pre-builds 16 lanterns (emissive paper globes on posts around the pond, no real lights) + 9 lotus blooms; `setLanternCount`/`setBloomCount` toggle visibility from `lanternCount(tier)`/`bloomCount(tier)`; `decor.update(t)` bobs visible blooms. `createSnakeRig` exposes `setInk(ink)` (re-tints body emissive + ridge color; `jade` = original look). UI: `GardenOverlay` (shop + journey + streak), title moonlight pill + journey bar + moonrise CTA, `JournalOverlay` "Keepsakes" tab, `+N ☾ moonlight` on the game-over card, `MoonriseCoda` cinematic overlay, HowTo item 9.

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
7. **Never claim "tests pass" without committed tests runnable via `npm test`.** Sandbox-only checks are fine, but they must be labeled as manual. (Audit rule, from T04.)
8. **Binary files (icons, images, fonts) must be committed through real git.** Never push them through a UTF-8-text-only API — base64 text masquerading as binaries was exactly how production ended up serving "PNGs" that were text files. (Audit rule, from T01.)
9. Check `docs/audit/FIX_PLAN.md` before touching anything the audit covers — settled decisions there are final. Ambiguity → stop and ask.

## Out of scope unless asked

- Backend / multiplayer / accounts
- Native mobile wrappers
- Changing the art direction away from the night ink garden

## Quick mental model

React draws the HUD. Zustand holds “what the player sees about the run.” Pure `logic.js` owns the grid truth. `engine.js` advances that truth on a timer, drives Three.js, and pushes score/status into the store. `inputBus` feeds intended turns and boost into the engine each frame.

Run statuses: `title → prologue → ready → playing ⇄ paused → dead`. `start()` sets `prologue` (not `playing`): the night's fresh whispers/verses are collected into `prologueQueue` and shown one at a time on the prologue screen (dwell `PROLOGUE_DWELL` in `Hud.jsx`: 6000ms verses, 4500ms whispers) so the player can read them before the run. `beginNight()` (button, card tap, Space/Enter) moves to `ready`: the garden is visible and the snake holds still for `READY_BEAT_S` (1.8s, driven by the engine frame loop in `engine.js`) — the engine's own timer then calls `enterPlaying()`, which also fires the first-night coach marks. The demo garden keeps drifting behind the prologue.

Mid-run whispers/verses never float over live gameplay anymore (PR #13): they rest in the store's `runUnlocks` array. During play a quiet `JournalPing` corner note ("✦ N new in your journal") is the only signal; the game-over sheet lists them under "New in your journal tonight". There is no `.toast-stack` anymore.

P5 "Shared Skies": `src/game/community.js` (pure) derives the week's shared sky from the ISO week id — every gardener worldwide gets the same event each week, no server. `rollNightEvent(random, extraWeights)` boosts the community event's weight (+10). `verse-shared-sky` unlocks when a run ends under the week's shared sky. Tonight's Highlights: `noteHighlight(kind, text, priority)` collects moments during a run (first supernova, score milestones 25/50/100, spirit catch, lantern feast); `completeRun()` adds moonrise/new-best and finalizes the top 3 by priority into `highlights`, shown as a staggered reel on the game-over sheet and shareable via `composeHighlightCard()`. Shared cards carry the gardener's signature (`ran-xinh-name`, set in the Journal) plus a caption in the Web Share payload.

P6 "First Light" (launch polish): PWA via `public/manifest.webmanifest` + `public/sw.js` (versioned cache `moonlit-serpent-v4` — navigations network-first, `/assets/*` cache-first, other same-origin files stale-while-revalidate; registered from `main.jsx` in PROD only) + icons in `public/icons/` (192/512/maskable, generated from the ink-serpent key art); `index.html` carries manifest/apple-touch/OG/Twitter meta and `public/og-image.jpg` (1200×630 JPEG, rendered by `/tmp/uitest/render_og.py`). `GameCanvas` lazy-loads `three/engine.js` via dynamic `import()` so three.js ships as a separate chunk and first paint never waits on it (canvas fades in via `.garden-canvas--ready`). Audio: the generative ambient score is `setAmbientOn(on)` / `setAmbientPhase(moonPhaseId)` in `src/audio/sound.js` — the engine starts it per run via `startRunAudio()` and tunes it to the night's moon phase; `setWaterOn()` (looped water + droplet plinks) plays instead of the pad on Silent Night — the engine picks ambience from `nightEventById(st.nightEvent)` when a run starts; `playVerse()` chimes when `checkVerses()` unlocks fresh verses. First-night onboarding: `beginNight()` sets `coachStep: 0` when `night === 1` and `ran-xinh-onboarded` is unset; `CoachMarks` in `Hud.jsx` shows 3 auto-advancing hints (tap to skip), `completeRun()`/`dismissCoach()` persist the flag.

## Post-launch fixes (T01–T08, from the 2026-10-21 audit)

What the audit changed, condensed so agents don't relearn it the hard way:

- **T01 — real binaries:** `public/icons/` and `public/og-image.jpg` are true PNG/JPEG bytes committed through real git (T01 re-decoded them from base64 *text* that the text-only API had written). SW cache is now `moonlit-serpent-v4`.
- **T02 — keyboard scope:** `src/game/keyboard.js` exports `isTypingTarget()`; `engine.js`'s key handler returns early while typing, so global shortcuts never hijack text inputs. `setGardenerName()` no longer trims per keystroke — `commitGardenerName()` trims and persists on blur / Journal close.
- **T03 — Cloudflare-only deploys:** the broken GitHub Pages workflow is deleted; push to `master` is the only deploy path.
- **T04 — committed tests:** Vitest suites live in the repo (`logic`, `keyboard`, `store`, `dispose`, `engine`, `sound`, `qualityGovernor`, `sw`). CI on Node 22. Includes a seeded 1000-game fuzz in `logic.test.js` and real-engine lifecycle tests in `engine.test.js` (GPU-bound pieces mocked).
- **T05 — ambient scheduler:** `planPhrases` clamps overdue phrases to `currentTime + 0.1` instead of bursting after a hidden tab; pause fades ambient/pad/water out and resume restores them via `startRunAudio()` (Silent Night plays water only).
- **T06 — quality governor:** `src/three/qualityGovernor.js` is pure: warmup learns the median rAF ceiling (≥30 samples), steps down after 2 windows below 0.75× target, back up after 4 windows above 0.92× target, with hysteresis and anti-oscillation (`failedSteps`). It is only sampled while `status === 'playing'`; `resize()` never disposes composer targets; `start()` applies the initial quality step exactly once (step 0 keeps 4× MSAA).
- **T07 — SW strategy:** `public/sw.js` matches its header — navigations network-first, `/assets/*` cache-first, all other same-origin files stale-while-revalidate. `src/sw.test.js` runs the real SW against stubs.
- **T08 — engine teardown:** `destroy()` cancels rAF, removes listeners, unsubscribes the garden/store/inputBus subscriptions, silences ambient/pad/water, disposes composer targets and **every** composer pass (RenderPass/bloom/OutputPass), calls `moon.dispose()` (the 2048×2048 moonlight shadow map is a `WebGLRenderTarget` the traversal can't reach) and `roomEnv.dispose()` (the PMREM `RoomEnvironment` temp scene), then `disposeObject3D(scene)` (`src/three/dispose.js`: traverse + dedupe geometry/material/textures), `envTex`, `pmrem`, and the renderer.

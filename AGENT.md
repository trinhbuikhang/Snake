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
    skins.js            # serpent skin registry (data + unlock rules, pure)
    hudLayout.js        # HUD layout tokens + pure layout rules shared by CSS and the camera fit
    inputBus.js         # keyboard / touch / swipe → direction + boost
    swipe.js            # pure one-finger swipe tracker (C02)
    padInput.js         # pure whole-pad steering direction (C03)
  three/
    engine.js           # render loop, camera modes, couples logic ↔ scene
    garden.js           # night-garden scene (ground, props, lighting feel)
    snakeRig.js         # dispatcher: builds the rig for the selected skin
    snakeRig.old.js     # legacy pearl-chain rig — debug only, via ?rig=old
    cameraFit.js        # perspective fit for the aligned camera (pure)
    tickClock.js        # tick-phase rescale on speed change (pure)
    cellBuffer.js       # double-buffered per-tick cell snapshots (pure)
    skins/
      serpentPath.js    # continuous path math for the tube rig (pure)
      serpentBase.js    # shared tube-rig factory: createSerpent(scene, cfg)
      moonJade.js       # Moon Jade skin builder
      plushMoon.js      # Plush Moon skin builder
      index.js          # SKIN_RIGS: skin id → builder
  audio/
    sound.js            # procedural SFX + water (respects mute)
    music.js            # "Moonlit Garden Lullaby" look-ahead scheduler (M03/M04)
    musicState.js       # pure audio lifecycle reducer + musicTarget table (M01/M04)
    lullaby.js          # pure lullaby composition: composeLoop(seed, arrangement) (M03)
    unlock.js           # first-gesture audio unlock + hide/show lifecycle (M01)
```

### Separation of concerns (keep this)

| Layer | Role | Rule |
|-------|------|------|
| `game/logic.js` | Pure simulation | No React, no Three, no DOM. Safe to unit-test in Node. |
| `game/store.js` | UI + session state | Status (`title` \| `prologue` \| `ready` \| `playing` \| `paused` \| `dead`), score, camera, mute, floating texts. Persists prefs via localStorage keys `ran-xinh-*`. |
| `game/inputBus.js` | Input fan-in | Decouples DOM events from the engine tick. |
| `game/hudLayout.js` | HUD layout source | Pure tokens + layout rules (bar/cluster sizes, reserves, coach placement). CSS reads the same numbers via `--hud-*` variables (sync-tested); the camera fit reads them via `hudReserve()`. |
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

- `aligned` — axes match screen (default “Classic 3D”). Framing is a true perspective fit (S05, HUD-following since H04): `updateCameraTarget()` calls the one pure entry `alignedCamera({w, h, safe, showControls, preset, boardHalf})` in `src/three/cameraFit.js`, which wraps `hudReserve()` → `fitMargins()` → `fitAligned()`. `fitAligned` finds the closest distance keeping all four board corners (±10.25, rim included) inside NDC margins, sliding the look point (`lookZ`, and `lookX` when asymmetric) instead of the old ortho-style `FIT_HALF` sizing. The margins are no longer constants: `fitMargins` derives them from the HUD bands `hudReserve()` reports (top bar + safe-area insets, read via `readSafeArea()` at fit time only) capped by the preset's base margins (x 0.97 / top 0.80 / bottom 0.93). Landscape with the touch cluster visible → a right margin slides the board left of the cluster; portrait → `anchor: 'middle'` centres the board in the free band between the bar and the coach strip (`softBottom`). The engine refits on resize, on `cameraMode` change, and on `showControls` change — never per frame. (The S05-era constants `HUD_BOTTOM_PX` / `TOUCH_CLUSTER_W_PX` and the `pointer: coarse` condition are gone; do not reintroduce them.)
- `topdown` — near-overhead 2.5D (legacy `FIT_HALF` framing)
- `cinematic` — gentle isometric tilt (legacy `FIT_HALF` framing)

### HUD layout (H01–H05)

Settled by `docs/plan/HUD_PLAN.md`; the numbers live in exactly one place:

- **Single source**: `src/game/hudLayout.js` (pure, no React/Three/DOM writes) exports the `HUD` tokens (`edge 10, barH 44, btn 44, gap 8, fitGap 8, padInset 16, padGap 8, dashGap 16, coachH 92, coachGap 12`), `COMPACT_MAX_W = 560`, `CONTROLS_MAX_W = 900`, and the rules `isCompact`, `controlsVisible`, `clusterSize`, `hudReserve`, `coachPlacement`, `readSafeArea`. `styles.css` mirrors the tokens as `:root` `--hud-*` variables (plus the pastel accents `--pastel-*`, `--hud-glass`, `--hud-line`); `hudLayout.test.js` asserts the CSS equals the JS (including the `.dpad` 58px tracks and `.btn-boost` sizes), so a one-sided change fails tests. Adding or resizing any fixed HUD element means updating `hudReserve()` and re-running the harness (below).
- **Top bar**: one 44px grid row (`.hud-top`, inset by `max(--hud-edge, env(safe-area-inset-*))`) holding the stat capsule (`.hud-stats` with `Stat` cells; the Lantern Rush timer is an extra cell; dashing only glows the capsule) and `.hud-actions`. Compact (`isCompact(w)`, w < 560): the capsule stretches across the left and only Pause stays — Camera / Touch pad / Sound move into the Pause sheet. `SettingsToggles({labelled})` in `Hud.jsx` renders both shapes of those toggles (round icon buttons in the bar and on title/game-over via `Corners`; labelled `.pill-toggle` pills in the Pause sheet). `Corners` is not rendered while `playing`/`paused`. `Hud.jsx` tracks size with the `useViewport()` hook (resize listener only).
- **One cluster rule**: the touch cluster (Dash + d-pad) is visible ⇔ `controlsVisible(w, showControls) = showControls || w ≤ 900`. `Hud.jsx` renders it by that function and `alignedCamera` reserves space by the same function — never gate either side on `pointer: coarse` or on a CSS media query again (that divergence is what H04 removed).
- **Coach card**: placed by `coachPlacement()` — `above-pad` (portrait + cluster: above the pad, inside the strip the camera reserves), `pad-column` (landscape + cluster: the 272px column above the pad), `top-left` (no cluster: under the bar, 272px wide — the prototype's 250px measured 106px tall, over the `HUD.coachH` 92 budget; 272px measures 88px). Dots + "tap to skip" share one `.coach-card__foot` row; copy is unchanged since before the plan.
- **Measuring**: `docs/plan/hud/tooling/harness.mjs` (headless Chrome, 11 viewports: p390, p375, p414, teams375, p390safe, t768, w600, l844t, l844safe, l844m, d1280) renders the game with the coach visible and reports `hudOverlaps` (intersecting HUD element pairs) and `cellsCovered` (board cells under any HUD rect) — the target is 0/0 at all 11. It takes a camera model module: `fit-baseline-aabe5b7.mjs` reproduces the pre-plan fit for before/after comparisons; `fit-prototype.mjs` now just calls the engine's own `alignedCamera`, so measurements can never drift from the shipping fit.

### Polish: steering, portrait, music (C01–M04)

Settled by `docs/plan/POLISH_PLAN.md` (all merged; V05 optional, only on the owner's say):

- **Steering feel (C01–C04)**: the tick loop is the pure `runTicks` in `src/three/tickClock.js` (extracted from `engine.js`, so the Node `steer-sim.mjs` measures the shipping loop, not a copy). One-finger swipes go through the pure `createSwipeTracker` in `src/game/swipe.js` (first turn at 18px, later turns at 32px + 1.5×); the whole `.dpad` steers through the pure `padDirection` in `src/game/padInput.js` (Chebyshev dead zone 16px, dominant axis, ties → vertical, one steering `pointerId` held by capture). Head yaw smoothing is the pure `yawAlpha(dt, interval) = 1 − exp(−dt / min(0.05, 0.25·interval))` in `src/three/skins/serpentPath.js`, so the head settles within ~1 tick at any speed. Dash lives in the centre cell of the d-pad (portrait cluster centred, landscape unchanged).
- **Portrait fit (V03)**: `presetFor` in `src/three/cameraFit.js` picks the elevation (1.2 iff portrait + coach hidden); `coachBlocksCamera({coachStep, night, onboarded})` scopes the night-1 camera hold by onboarding state across the whole journey (fresh storage has `night = 0`); the engine refits only on a predicate edge. Portrait boards centre between the bar and the coach strip via `anchor: 'middle'`.
- **Portrait menus (V04)**: corner actions sit above sheets (`--z-chrome-actions: 35`) with a 66px corner-row reserve on `.sheet` at all widths; title below 560px uses a 3-pill row with short labels ("Garden" / "How to" / "Camera"); Pause at 375px stacks full-width buttons.
- **Music (M01–M04)**: no audio files — everything is procedural. `src/audio/unlock.js` creates the AudioContext only on a real activation gesture (never before), resumes on `suspended`/`interrupted`, and fades 0.2s + suspends on hide; `src/audio/musicState.js` holds the pure `audioLifecycle` reducer and the `musicTarget` table. The store slice `music: { on, volume }` persists under `ran-xinh-music` (bad JSON → per-field defaults, volume clamped 0–1, rounded to 0.1). `src/audio/sound.js` owns the `musicGain` bus (child of master; SFX stay on master, so Music off keeps SFX) and `duckMusic()` (−6 dB, 20/150/400ms, never stacked deeper, on eat/bloom/verse/death — never on turn). `src/audio/lullaby.js` composes the 16-bar 3/4 66 BPM loop (F pentatonic, F–Dm–B♭–C; `moonrise` transposes +2 to G–Em–C–D); `src/audio/music.js` schedules it with a 200ms look-ahead and exposes `applyMusic(target)` — the engine's single music path (`applyRunAudio` in `engine.js`): off fades 0.6s, arrangement changes crossfade 1.5s on per-generation play gains (no silence gap), resume re-enters at the next bar, death rings out the run's arrangement for 2s then falls to `menu`. Silent Night is water-only via `setWaterOn`. Menu music sits at 0.7 gain; the scheduler bus caps at 0.25. Bundle budget for M01–M04 was +6 kB gzip on `index` (landed +3.05 vs pre-M01 `b3f38e2` by the owner's measure, within budget).

### Serpent skins (S01–S06)

The snake is a **continuous tube rig**, not a chain of pearls: `serpentPath.js` turns the grid path into a smooth spine (arc-length steps, rounded corners) and `serpentBase.js`'s `createSerpent(scene, cfg)` builds a tube + a lathe head fused into it, sharing ONE material per skin — so draw calls are fixed at any snake length (Moon Jade 9, Plush Moon 6) and the paint path allocates nothing per frame (positions are written into preallocated buffers; per-tick cell snapshots are double-buffered via `cellBuffer.js`'s `writeCellsInto`).

- **Skin config (`cfg`)**: `{ id, bodyR, flat, tailTip, neckR, head, material, uniforms, buildFace, beads, tailCurl, applyInk, update }`. `uniforms.uPulse` (vec4) is required. `head` is exposed to builders as `H`; an optional `H.sculpt(nx, ny, nz)` hook offsets head vertices in head-normalised coords (Plush Moon's muzzle). `tailCurl` shapes the resting tail curl; `beads` adds an instanced bead strand (Moon Jade's moonstones); `applyInk`/`update` are per-skin hooks (ink accents, blinking).
- **Material patching**: skins start from `MeshPhysicalMaterial` and inject GLSL via `patchSerpentMaterial(mat, uniforms, chunks, key)` (an `onBeforeCompile`): chunk slots `common`, `color`, `roughness`, `normal`, `emissive` are spliced after the standard three.js includes (`<common>`, `<color_fragment>`, `<metalnessmap_fragment>`, `<normal_fragment_maps>`, `<emissivemap_fragment>`); the vertex side adds an `aBody` attribute (`vBody`/`vLocal` varyings) so shaders know where along/across the body a fragment sits. The `key` becomes the material's `customProgramCacheKey` — skins never share programs by accident.
- **Faces**: `cfg.buildFace(api)` receives `{ track, headMesh, H, ZC, HL, HEAD_CY, zAt, surf, place }`; `api.place(obj, ...)` positions face parts on the head's curved surface. Static face parts are merged per material into single meshes (shared materials do NOT merge draw calls). Never pass the `THREE` namespace itself through `api` — modules import three themselves (a leaked namespace reference once cost +179 kB of tree-shaking).
- **Rig API** (what `engine.js` drives): `group` (light anchor), `setSnapshots`, `setInk`, `setDir`, `onStep`, `onEat`, `startDeath`, `advanceDeath`, `reset`, `deathCoil`, `paint`, plus `detach()` (remove from scene now) / `dispose()` (GPU teardown) and `skin` (the cfg id). Ink (`setInk`) only tints accents on skins — rim light, beads, embroidery — never the whole body.
- **Dispatch**: `snakeRig.js`'s `createSnakeRig(scene, skinId)` looks up `SKIN_RIGS` in `three/skins/index.js`; unknown ids fall back to Moon Jade. `snakeRig.old.js` is the pre-S01 pearl rig, reachable only via `?rig=old` (`isDebugOldRig()`) for debugging — it has no `dispose`/`detach` and never swaps.
- **Registry & unlocks**: player-facing data lives in `src/game/skins.js` (`SKINS`: English `name`, Vietnamese `nameVi` subtitle, `desc`, `swatch`, `accent`, `unlock`). The store's `skins` slice `{ owned, selected }` persists under **`ran-xinh-skin`**; `chooseSkin(id)` wears owned skins only, `buySkin(id)` buys with moonlight through `_spend` (and wears at once). Unlock rules are an OR-list in `SKINS[*].unlock` — `{type:'default'}`, `{type:'moonlight', cost}`, `{type:'milestone', id:'first-moonrise'}` — evaluated by the pure `skinUnlockState(skin, ctx)` / `checkSkinMilestones(ctx)` in `game/skins.js`. Completing a Moonrise Night grants milestone skins in `completeRun()` (recorded as a `runUnlocks` entry of `kind: 'skin'` for the game-over sheet); `hydrate()` records the same grant for players who finished a Moonrise before S06. The picker in the Garden sheet (`Hud.jsx`) renders price/hint states straight from `skinUnlockState`.
- **Engine swap**: the boot rig is built from `readSkins().selected` (persisted state read directly — the store hydrates later). `swapRig()` builds the new rig, synchronously compiles its materials if needed, detaches the old rig immediately but defers its `dispose()` until any pending async precompile settles (disposing mid-compile breaks three.js). `precompileSpareSkin()` compiles the non-selected skin at boot inside `precompileShaders()` so the first swap is hitch-free.

**Adding a new skin** (no store/picker/engine changes needed):

1. Add one entry to `SKINS` in `src/game/skins.js` (id, names, desc, swatch, accent, unlock rules).
2. Add `src/three/skins/<id>.js` exporting a `create<Name>Rig(scene)` builder on top of `createSerpent` (follow `moonJade.js` / `plushMoon.js`).
3. Register it in `SKIN_RIGS` in `src/three/skins/index.js`.
4. Add tests for its unlock state if it introduces a new rule shape.

### Performance rules (P01–P06)

Settled by `docs/plan/SKINS_PERF_PLAN.md`; do not regress them:

- **P01 — linear motion**: the snake interpolates linearly between ticks (no easing on the movement path — easing reads as speed wobble). `rescaleAccum()` in `tickClock.js` rescales the tick accumulator whenever the interval changes so speed changes keep phase.
- **P02 — shader precompile**: all programs are compiled up front against the composer's read buffer (`precompileShaders()` + one synchronous warm-up render on loop frame 2), so gameplay never pays a first-use compile hitch. The food light is never hidden — hiding it would change `NUM_POINT_LIGHTS` and re-link every program; food visibility is written by the single state-driven `applyFoodVisibility()` in `garden.js`, which always re-applies the *current* logical state.
- **P03 — renderer budget**: `useComposer` is decided before the renderer is created; canvas MSAA is on only without the composer (`antialias: !useComposer`), DPR is clamped to 1.5, composer MSAA samples come from `msaaFor(dpr)` in `qualityGovernor.js`, and the moon shadow map starts at 1024.
- **P04 — refresh-aware governor**: `snapRefresh()` snaps the target FPS to the display's real refresh rate; a window steps quality down when its average FPS is below 0.75× target OR its spike ratio (frames over 2× the median) reaches 0.1 (`nextQualityIdx` in `qualityGovernor.js`). Ladder: `QUALITY_STEPS` (DPR/shadow/bloom rungs).
- **P05 — no in-play blur**: HUD elements visible during play use solid translucent backgrounds, never `backdrop-filter` (static sheets may keep a small ≤8px blur).
- **P06 — zero per-frame allocation** on the paint path: cell snapshots are double-buffered (`cellBuffer.js`), garden burst palettes are module constants, and scratch vectors are reused. If a per-frame `new` sneaks into `engine.js`'s frame loop or the rig's `paint`, that's a regression.

## Conventions for agents

1. **Do not mix layers.** New mechanics → `logic.js` first; visuals → `three/*`; HUD copy/controls → `Hud.jsx` + `store.js`.
2. **Prefer extending existing modules** over new frameworks (no extra state libs, no R3F unless explicitly requested).
3. **Respect mute and `prefers-reduced-motion`** (engine already checks reduced motion).
4. **localStorage keys** are prefixed `ran-xinh-`; keep that prefix for any new prefs.
5. **English product voice** in player-facing strings; keep code identifiers in English.
6. Avoid drive-by refactors and unrelated file edits.
7. **Never claim "tests pass" without committed tests runnable via `npm test`.** Sandbox-only checks are fine, but they must be labeled as manual. (Audit rule, from T04.)
8. **Binary files (icons, images, fonts) must be committed through real git.** Never push them through a UTF-8-text-only API — base64 text masquerading as binaries was exactly how production ended up serving "PNGs" that were text files. (Audit rule, from T01.)
9. Check `docs/audit/FIX_PLAN.md` before touching anything the audit covers — settled decisions there are final. Same for `docs/plan/SKINS_PERF_PLAN.md` (skins + performance): its settled decisions (skin prices, storage key, camera scope, perf budgets) are final. Same for `docs/plan/HUD_PLAN.md` (HUD layout + camera fit): its settled decisions (single top bar, compact breakpoint, `controlsVisible`, coach placement, the harness 0/0 target) are final. Same for `docs/plan/POLISH_PLAN.md` (steering feel, portrait polish, procedural music): its settled decisions (one task = one branch + one PR, `runTicks`/`swipe.js`/`padDirection`/`yawAlpha`, portrait preset + coach scoping, `musicTarget`/`applyMusic`/ducking, no audio files) are final. Ambiguity → stop and ask.

## Out of scope unless asked

- Backend / multiplayer / accounts
- Native mobile wrappers
- Changing the art direction away from the night ink garden
- Real-money purchases / in-app purchase — skins are earned with moonlight or milestones only; IAP would need a backend + accounts (future work)

## Quick mental model

React draws the HUD. Zustand holds “what the player sees about the run.” Pure `logic.js` owns the grid truth. `engine.js` advances that truth on a timer, drives Three.js, and pushes score/status into the store. `inputBus` feeds intended turns and boost into the engine each frame.

Run statuses: `title → prologue → ready → playing ⇄ paused → dead`. `start()` sets `prologue` (not `playing`): the night's fresh whispers/verses are collected into `prologueQueue` and shown one at a time on the prologue screen (dwell `PROLOGUE_DWELL` in `Hud.jsx`: 6000ms verses, 4500ms whispers) so the player can read them before the run. `beginNight()` (button, card tap, Space/Enter) moves to `ready`: the garden is visible and the snake holds still for `READY_BEAT_S` (1.8s, driven by the engine frame loop in `engine.js`) — the engine's own timer then calls `enterPlaying()`, which also fires the first-night coach marks. The demo garden keeps drifting behind the prologue.

Mid-run whispers/verses never float over live gameplay anymore (PR #13): they rest in the store's `runUnlocks` array. During play a quiet `JournalPing` corner note ("✦ N new in your journal") is the only signal; the game-over sheet lists them under "New in your journal tonight". There is no `.toast-stack` anymore.

P5 "Shared Skies": `src/game/community.js` (pure) derives the week's shared sky from the ISO week id — every gardener worldwide gets the same event each week, no server. `rollNightEvent(random, extraWeights)` boosts the community event's weight (+10). `verse-shared-sky` unlocks when a run ends under the week's shared sky. Tonight's Highlights: `noteHighlight(kind, text, priority)` collects moments during a run (first supernova, score milestones 25/50/100, spirit catch, lantern feast); `completeRun()` adds moonrise/new-best and finalizes the top 3 by priority into `highlights`, shown as a staggered reel on the game-over sheet and shareable via `composeHighlightCard()`. Shared cards carry the gardener's signature (`ran-xinh-name`, set in the Journal) plus a caption in the Web Share payload.

P6 "First Light" (launch polish): PWA via `public/manifest.webmanifest` + `public/sw.js` (versioned cache `moonlit-serpent-v4` — navigations network-first, `/assets/*` cache-first, other same-origin files stale-while-revalidate; registered from `main.jsx` in PROD only) + icons in `public/icons/` (192/512/maskable, generated from the ink-serpent key art); `index.html` carries manifest/apple-touch/OG/Twitter meta and `public/og-image.jpg` (1200×630 JPEG, rendered by `/tmp/uitest/render_og.py`). `GameCanvas` lazy-loads `three/engine.js` via dynamic `import()` so three.js ships as a separate chunk and first paint never waits on it (canvas fades in via `.garden-canvas--ready`). Audio: the generative music is the "Moonlit Garden Lullaby" (`src/audio/lullaby.js` + `src/audio/music.js` scheduler, M03/M04 — see the Polish section above); the engine drives it per run via `applyRunAudio()` and tunes pad brightness to the night's moon phase; `setWaterOn()` (looped water + droplet plinks) plays instead of music on Silent Night — the engine picks the target from `musicTarget()` on every audio-relevant store change; `playVerse()` chimes when `checkVerses()` unlocks fresh verses. First-night onboarding: `beginNight()` sets `coachStep: 0` when `night === 1` and `ran-xinh-onboarded` is unset; `CoachMarks` in `Hud.jsx` shows 3 auto-advancing hints (tap to skip), `completeRun()`/`dismissCoach()` persist the flag.

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

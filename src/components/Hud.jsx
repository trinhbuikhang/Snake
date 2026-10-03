import { useEffect, useState } from 'react'
import { useGame } from '../game/store.js'
import { inputBus } from '../game/inputBus.js'
import { MOON_PHASES, moonPhaseById, GAME_MODES, gameModeById } from '../game/logic.js'
import { WHISPERS, WHISPER_COUNT } from '../game/whispers.js'
import { VERSES, VERSE_COUNT } from '../game/verses.js'
import { nightEventById } from '../game/nightEvents.js'
import {
  INKS,
  LANTERN_TIERS, LANTERN_COSTS, LANTERN_MAX_TIER,
  BLOOM_TIERS, BLOOM_COSTS, BLOOM_MAX_TIER,
  lanternCount, bloomCount,
  journeyReady, JOURNEY_GOAL, MOONLIGHT_GLYPH,
} from '../game/garden.js'
import { composeMoonCard, composeVerseCard, composeHighlightCard } from '../game/moonCard.js'

const arr = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)

const icons = {
  mute: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M23 9l-6 6M17 9l6 6" opacity="0.9" />
    </svg>
  ),
  unmute: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M19 6a8 8 0 0 1 0 12" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.4" />
      <rect x="14" y="5" width="4" height="14" rx="1.4" />
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  gamepad: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="6" />
      <path d="M6 12h4m-2-2v4m9-2h.01m3-2h.01" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  up: <path d="M6 14l6-6 6 6" />,
  down: <path d="M6 10l6 6 6-6" />,
  left: <path d="M14 6l-6 6 6 6" />,
  right: <path d="M10 6l6 6-6 6" />,
}

// Direction arrow glyphs
const DIR_ARROW = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

const CAM_LABELS = {
  aligned: 'Classic 3D',
  topdown: 'Top-Down 2D',
  cinematic: 'Cinematic',
}

// Title-screen moon-phase picker ("Tuần trăng"): a flavorful difficulty choice.
const MOON_UI = {
  new: { emoji: '🌑', hint: 'Calm & dark · Supernova +5' },
  crescent: { emoji: '🌒', hint: 'Gentle pace · Supernova +4' },
  half: { emoji: '🌓', hint: 'Classic balance' },
  gibbous: { emoji: '🌔', hint: 'Bold · Planets +2' },
  full: { emoji: '🌕', hint: 'High risk · Planets +2, faster' },
}

function MoonPicker() {
  const moonPhase = useGame((s) => s.moonPhase)
  const setMoonPhase = useGame((s) => s.setMoonPhase)
  return (
    <div className="moon-picker">
      <p className="moon-label">choose your moon</p>
      <div className="moon-row" role="radiogroup" aria-label="Moon phase">
        {MOON_PHASES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={moonPhase === p.id}
            title={`${p.name} — ${MOON_UI[p.id].hint}`}
            className={`moon-btn${moonPhase === p.id ? ' moon-btn--active' : ''}`}
            onClick={() => setMoonPhase(p.id)}
          >
            <span className="moon-emoji" aria-hidden="true">
              {MOON_UI[p.id].emoji}
            </span>
            <span className="moon-name">{p.name.replace(' Moon', '')}</span>
          </button>
        ))}
      </div>
      <p className="moon-hint">{MOON_UI[moonPhase]?.hint}</p>
    </div>
  )
}

// Title-screen game-mode picker ("Ba nẻo chơi"): three ways into the garden.
const MODE_UI = {
  classic: { emoji: '🐍', hint: 'Survive & thrive · the timeless hunt' },
  lantern: { emoji: '🏮', hint: '60 seconds · eat everything that glows' },
  zen: { emoji: '🍃', hint: 'No death · drift and grow in peace' },
}

function ModePicker() {
  const gameMode = useGame((s) => s.gameMode)
  const setGameMode = useGame((s) => s.setGameMode)
  return (
    <div className="mode-picker">
      <p className="mode-label">choose your journey</p>
      <div className="mode-row" role="radiogroup" aria-label="Game mode">
        {GAME_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={gameMode === m.id}
            title={`${m.name} — ${MODE_UI[m.id].hint}`}
            className={`mode-btn${gameMode === m.id ? ' mode-btn--active' : ''}`}
            onClick={() => setGameMode(m.id)}
          >
            <span className="mode-emoji" aria-hidden="true">
              {MODE_UI[m.id].emoji}
            </span>
            <span className="mode-name">{m.name}</span>
          </button>
        ))}
      </div>
      <p className="mode-hint">{MODE_UI[gameMode]?.hint}</p>
    </div>
  )
}

export function TitleOverlay() {
  const best = useGame((s) => s.best)
  const gameMode = useGame((s) => s.gameMode)
  const start = useGame((s) => s.start)
  const openHowTo = useGame((s) => s.openHowTo)
  const openJournal = useGame((s) => s.openJournal)
  const cameraMode = useGame((s) => s.cameraMode)
  const toggleCameraMode = useGame((s) => s.toggleCameraMode)
  const unlockedWhispers = useGame((s) => s.unlockedWhispers)
  const unlockedVerses = useGame((s) => s.unlockedVerses)
  const keepsakes = useGame((s) => s.keepsakes)
  const tonightEvent = useGame((s) => s.tonightEvent)
  const tonight = nightEventById(tonightEvent)
  // P5 Shared Skies — this week's event, shared by every gardener.
  const communityEvent = useGame((s) => s.communityEvent)
  const sharedSky = nightEventById(communityEvent)
  const moonlight = useGame((s) => s.moonlight)
  const journey = useGame((s) => s.journey)
  const streak = useGame((s) => s.streak)
  const setShowGarden = useGame((s) => s.setShowGarden)
  const startMoonrise = useGame((s) => s.startMoonrise)
  const moonriseReady = journeyReady(journey.progress)
  const journeyPct = Math.min(100, Math.round((journey.progress / JOURNEY_GOAL) * 100))

  return (
    <div className="sheet" role="dialog" aria-label="Moonlit Serpent title">
      <div className="lockup">
        <p className="overline">a moonlit nocturne in the jade garden</p>
        <h1>Moonlit Serpent</h1>
        <p className="tagline">
          <span>A poetic, razor-sharp 3D snake experience</span>
        </p>
        <div className="rule" />
        <div className="title-wallet" aria-live="polite">
          <span className="moonlight-pill" title="Moonlight — earned every night, spent in the Garden">
            {MOONLIGHT_GLYPH} {moonlight.balance}
          </span>
          {streak.count > 1 && (
            <span className="streak-pill" title="Consecutive nights played — each adds +10% moonlight, up to +50%">
              ✦ {streak.count}-night streak
            </span>
          )}
        </div>
        {moonriseReady ? (
          <button type="button" className="btn btn--moonrise" onClick={startMoonrise} autoFocus>
            🌕 Begin the Moonrise Night
          </button>
        ) : (
          <div className="journey-bar" title="Journey to the Moon — earn moonlight to fill the bar">
            <div className="journey-bar__track">
              <div className="journey-bar__fill" style={{ width: `${journeyPct}%` }} />
            </div>
            <p className="journey-bar__label">
              Journey to the Moon · {journey.progress}/{JOURNEY_GOAL}
            </p>
          </div>
        )}
        <div className="actions">
          {!moonriseReady && (
            <button type="button" className="btn btn--primary" onClick={start} autoFocus>
              Start playing
            </button>
          )}
          <button type="button" className="btn" onClick={() => setShowGarden(true)}>
            🏮 Garden
          </button>
          <button type="button" className="btn" onClick={openHowTo}>
            How to play
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={toggleCameraMode}
            title="Change camera (C key)"
          >
            Camera: {CAM_LABELS[cameraMode] || 'Classic 3D'}
          </button>
        </div>
        <ModePicker />
        <MoonPicker />
        {best > 0 && (
          <p className="best-note">
            best · {best} pts{gameMode !== 'classic' ? ` · ${gameModeById(gameMode).name}` : ''}
          </p>
        )}
        <p className="tonight-note" aria-live="polite">
          <span className="tonight-note__label">Tonight:</span> {tonight.name}
          <span className="tonight-note__line"> — “{tonight.line}”</span>
        </p>
        {communityEvent !== 'none' && (
          <p
            className="community-sky"
            title="Shared Skies — every gardener plays under the same sky this week"
          >
            <span className="community-sky__label">This week's shared sky:</span> {sharedSky.name}
            <span className="community-sky__line"> — “{sharedSky.line}”</span>
          </p>
        )}
        <button type="button" className="btn btn--ghost journal-link" onClick={openJournal}>
          📖 Journal · {unlockedWhispers.length}/{WHISPER_COUNT} whispers ·{' '}
          {unlockedVerses.length}/{VERSE_COUNT} verses
        </button>
      </div>
    </div>
  )
}

// P4 "The Garden Remembers" — spend moonlight on visible garden upgrades,
// choose the serpent's ink, and watch the Journey to the Moon.
export function GardenOverlay() {
  const setShowGarden = useGame((s) => s.setShowGarden)
  const moonlight = useGame((s) => s.moonlight)
  const garden = useGame((s) => s.garden)
  const journey = useGame((s) => s.journey)
  const streak = useGame((s) => s.streak)
  const upgradeLanterns = useGame((s) => s.upgradeLanterns)
  const upgradeBlooms = useGame((s) => s.upgradeBlooms)
  const chooseInk = useGame((s) => s.chooseInk)
  const startMoonrise = useGame((s) => s.startMoonrise)

  const moonriseReady = journeyReady(journey.progress)
  const journeyPct = Math.min(100, Math.round((journey.progress / JOURNEY_GOAL) * 100))

  const lanternMaxed = garden.lantern >= LANTERN_MAX_TIER
  const lanternCost = lanternMaxed ? 0 : LANTERN_COSTS[garden.lantern + 1]
  const bloomMaxed = garden.lotus >= BLOOM_MAX_TIER
  const bloomCost = bloomMaxed ? 0 : BLOOM_COSTS[garden.lotus + 1]

  return (
    <div className="sheet" role="dialog" aria-label="The Garden Remembers">
      <div className="sheet-card garden">
        <p className="overline">the garden remembers</p>
        <h2>Your Garden</h2>
        <p className="garden__balance" aria-live="polite">
          <span className="moonlight-pill moonlight-pill--big">{MOONLIGHT_GLYPH} {moonlight.balance}</span>
          <span className="garden__hint">moonlight · earned every night you play</span>
        </p>

        <div className="garden__section">
          <h3>🏮 Lanterns</h3>
          <p className="garden__desc">
            Paper lanterns around the lake — {lanternCount(garden.lantern)} glowing now.
          </p>
          {lanternMaxed ? (
            <p className="garden__maxed">✦ The shore is fully lit.</p>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={upgradeLanterns}
              disabled={moonlight.balance < lanternCost}
            >
              Light {lanternCount(garden.lantern + 1)} lanterns · {MOONLIGHT_GLYPH} {lanternCost}
            </button>
          )}
        </div>

        <div className="garden__section">
          <h3>🪷 Lotus blooms</h3>
          <p className="garden__desc">
            Glowing lotus flowers drifting on the water — {bloomCount(garden.lotus)} in bloom.
          </p>
          {bloomMaxed ? (
            <p className="garden__maxed">✦ The lake is in full bloom.</p>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={upgradeBlooms}
              disabled={moonlight.balance < bloomCost}
            >
              Bloom {bloomCount(garden.lotus + 1)} flowers · {MOONLIGHT_GLYPH} {bloomCost}
            </button>
          )}
        </div>

        <div className="garden__section">
          <h3>🖋 Serpent ink</h3>
          <p className="garden__desc">The color of the serpent's glow.</p>
          <div className="garden__inks">
            {INKS.map((ink) => {
              const owned = garden.inks.includes(ink.id)
              const selected = garden.ink === ink.id
              const affordable = moonlight.balance >= ink.cost
              return (
                <button
                  key={ink.id}
                  type="button"
                  className={`garden__ink${selected ? ' is-selected' : ''}`}
                  onClick={() => chooseInk(ink.id)}
                  disabled={!owned && !affordable}
                  title={ink.desc}
                >
                  <span
                    className="garden__swatch"
                    style={{ background: `#${ink.emissive.toString(16).padStart(6, '0')}` }}
                  />
                  <span className="garden__ink-name">{ink.name}</span>
                  <span className="garden__ink-state">
                    {selected ? 'worn' : owned ? 'wear' : `${MOONLIGHT_GLYPH} ${ink.cost}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="garden__section garden__journey">
          <h3>🌕 Journey to the Moon</h3>
          <div className="journey-bar__track">
            <div className="journey-bar__fill" style={{ width: `${journeyPct}%` }} />
          </div>
          <p className="garden__desc">
            {journey.progress}/{JOURNEY_GOAL} ascension
            {journey.completed > 0 && ` · ${journey.completed} moonrise${journey.completed > 1 ? 's' : ''} lived`}
          </p>
          {streak.count > 1 && (
            <p className="garden__desc">
              ✦ {streak.count}-night streak — moonlight earns +{Math.min(streak.count, 5) * 10}% tonight
            </p>
          )}
          {moonriseReady ? (
            <button type="button" className="btn btn--moonrise" onClick={startMoonrise}>
              🌕 Begin the Moonrise Night
            </button>
          ) : (
            <p className="garden__hint">
              Fill the bar with moonlight to call a Moonrise Night — a giant moon,
              a sky raining supernovas, and a keepsake for your Journal.
            </p>
          )}
        </div>

        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowGarden(false)}>
            Back to the garden
          </button>
        </div>
      </div>
    </div>
  )
}

export function HowToOverlay() {
  const closeHowTo = useGame((s) => s.closeHowTo)
  return (
    <div className="sheet" role="dialog" aria-label="How to play">
      <div className="sheet-card">
        <p className="overline">guide</p>
        <h2>How to play Moonlit Serpent</h2>
        <div className="howto-list">
          <p>
            <span className="num">1</span>
            <span>
              Steer with <kbd>W A S D</kbd> or the <kbd>↑ ↓ ← →</kbd> keys. The classic 3D camera is axis-aligned (Up means Up, Right means Right), so every turn lands exactly where you expect.
            </span>
          </p>
          <p>
            <span className="num">2</span>
            <span>
              <b>Dash</b>: Hold <kbd>Space</kbd> or <kbd>Shift</kbd> (or the on-screen ⚡ button) to surge forward at double speed.
            </span>
          </p>
          <p>
            <span className="num">3</span>
            <span>
              <b>Camera</b>: Press <kbd>C</kbd> to switch between <b>Classic 3D</b>, <b>Top-Down 2D</b> (easiest for strategy), or <b>Cinematic</b>.
            </span>
          </p>
          <p>
            <span className="num">4</span>
            <span>
              Eat <b>planets</b> (Earth, Mars, Saturn, Jupiter, Neptune) to grow. Occasionally a rare blazing <b>Supernova</b> appears. The <b>moon you choose</b> on the title screen sets the stakes — a full moon pays double but runs faster.
            </span>
          </p>
          <p>
            <span className="num">5</span>
            <span>
              The glowing jade fence and your own body are the only obstacles.
            </span>
          </p>
          <p>
            <span className="num">6</span>
            <span>
              <b>Three ways to play</b>: <b>Classic</b> (survive &amp; thrive), <b>Lantern Rush</b> (a 60-second feast against the clock), or <b>Zen Garden</b> (no death — drift and grow in peace). Choose on the title screen; each mode keeps its own best score.
            </span>
          </p>
          <p>
            <span className="num">7</span>
            <span>
              Every run is one <b>Night</b>. Listen for <b>whispers</b> — one-line poems the garden reveals as you play — earn <b>moon verses</b> through great feats, and collect them all in your <b>Journal</b>. Each night opens with a quiet moment to read the night's new poems before you begin.
            </span>
          </p>
          <p>
            <span className="num">8</span>
            <span>
              Some nights are <b>special</b> — meteor showers, thick fog, high tides — announced on the title screen. And on rare nights, the <b>Jade Carp</b> crosses the lake: catch it with your head for +10.
            </span>
          </p>
          <p>
            <span className="num">9</span>
            <span>
              Every night earns <b>☾ moonlight</b>. Spend it in the <b>Garden</b> to light paper lanterns, bloom lotuses, and change the serpent's ink — all visible in the 3D lake. Play consecutive nights to build a <b>streak</b> (+10% moonlight per night, up to +50%; it never punishes a missed night). Fill the <b>Journey to the Moon</b> bar to call a <b>Moonrise Night</b>: a giant moon, a sky raining supernovas, and a keepsake for your Journal.
            </span>
          </p>
          <p className="small">On mobile: swipe across the lake or use the virtual buttons below.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={closeHowTo}>
          Got it
        </button>
      </div>
    </div>
  )
}

export function PauseOverlay() {
  const resume = useGame((s) => s.resume)
  const toTitle = useGame((s) => s.toTitle)
  const gameMode = useGame((s) => s.gameMode)
  const endZenSession = useGame((s) => s.endZenSession)
  return (
    <div className="sheet" role="dialog" aria-label="Paused">
      <div className="sheet-card">
        <p className="overline">taking a breather</p>
        <h2>Paused</h2>
        <p>The moonlit garden awaits your return.</p>
        <div className="sheet-actions">
          <button type="button" className="btn btn--primary" onClick={resume} autoFocus>
            Resume
          </button>
          <button type="button" className="btn" onClick={toTitle}>
            Back to title
          </button>
          {gameMode === 'zen' && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={endZenSession}
              title="End this zen session and see your summary"
            >
              🍃 End session
            </button>
          )}
        </div>
        <p className="hint">
          Press <kbd>P</kbd> or <kbd>Esc</kbd> to resume
        </p>
      </div>
    </div>
  )
}

// Game-over copy varies by how the run ended.
const END_COPY = {
  time: { overline: "time's up", title: 'The lanterns dim — what a feast!' },
  zen: { overline: 'session complete', title: 'The garden breathes with you' },
  wall: { overline: 'the end', title: 'The lake grows still once more' },
  self: { overline: 'the end', title: 'The serpent ties its final knot' },
  unknown: { overline: 'the end', title: 'The lake grows still once more' },
}

export function GameOverOverlay() {
  const score = useGame((s) => s.score)
  const best = useGame((s) => s.best)
  const length = useGame((s) => s.length)
  const moonPhase = useGame((s) => s.moonPhase)
  const gameMode = useGame((s) => s.gameMode)
  const deathCause = useGame((s) => s.deathCause)
  const deathSnapshot = useGame((s) => s.deathSnapshot)
  const isNewBest = useGame((s) => s.isNewBest)
  const lastMoonlight = useGame((s) => s.lastMoonlight)
  const night = useGame((s) => s.night)
  const highlights = useGame((s) => s.highlights)
  const gardenerName = useGame((s) => s.gardenerName)
  const start = useGame((s) => s.start)
  const toTitle = useGame((s) => s.toTitle)
  const [sharing, setSharing] = useState(false)
  const [sharingHighlights, setSharingHighlights] = useState(false)

  const endCopy = END_COPY[deathCause] || END_COPY.unknown
  const phaseName = moonPhaseById(moonPhase).name
  const modeName = gameModeById(gameMode).name

  // P5 Shared Skies — one helper paints a canvas into a shared/downloaded file.
  async function shareCanvas(canvas, fileName, title, caption) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const file = new File([blob], fileName, { type: 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text: caption })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
  }

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    try {
      const card = await composeMoonCard({
        snapshotDataURL: deathSnapshot,
        score,
        best,
        length,
        phaseName,
        modeName,
        dateLabel: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        gardenerName,
      })
      await shareCanvas(
        card,
        'moonlit-serpent-card.png',
        'Moonlit Serpent — my moon card',
        `A night in the ink garden — ${score} pts under the ${phaseName} · Moonlit Serpent`,
      )
    } catch {
      // Share sheet dismissed — nothing to do
    } finally {
      setSharing(false)
    }
  }

  async function handleShareHighlights() {
    if (sharingHighlights || highlights.length === 0) return
    setSharingHighlights(true)
    try {
      const card = await composeHighlightCard({
        highlights,
        night,
        score,
        modeName,
        phaseName,
        gardenerName,
      })
      const caption =
        highlights.map((h) => `“${h.text}”`).join('\n') + "\n— Tonight's highlights · Moonlit Serpent"
      await shareCanvas(card, 'moonlit-serpent-highlights.png', 'Moonlit Serpent — tonight’s highlights', caption)
    } catch {
      // Share sheet dismissed — nothing to do
    } finally {
      setSharingHighlights(false)
    }
  }

  return (
    <div className="sheet" role="dialog" aria-label="Game over">
      <div className="sheet-card">
        <p className="overline">{endCopy.overline}</p>
        <h2>{endCopy.title}</h2>
        {isNewBest && <span className="best-badge">✦ New Best!</span>}
        <div className="result-score" aria-live="polite">
          {score}
        </div>
        <p className="result-best">
          {gameModeById(gameMode).name} best · {best} pts
        </p>
        <p className="result-moon">
          {gameModeById(gameMode).name} · {moonPhaseById(moonPhase).name} run
        </p>
        {lastMoonlight > 0 && (
          <p className="result-moonlight" aria-live="polite">
            {MOONLIGHT_GLYPH} +{lastMoonlight} moonlight for the garden
          </p>
        )}
        {highlights.length > 0 && (
          <div className="highlights" aria-label="Tonight's highlights">
            <p className="highlights__title">Tonight's highlights</p>
            <ul>
              {highlights.map((h, i) => (
                <li
                  key={`${h.kind}-${i}`}
                  className="highlights__item"
                  style={{ animationDelay: `${0.35 + i * 0.45}s` }}
                >
                  “{h.text}”
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="sheet-actions">
          <button type="button" className="btn btn--primary" onClick={start} autoFocus>
            Play again
          </button>
          <button type="button" className="btn" onClick={toTitle}>
            Back to title
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleShare}
            disabled={sharing}
            title="Generate a shareable moon card of this run"
          >
            {sharing ? 'Painting your card…' : '🌙 Share moon card'}
          </button>
          {highlights.length > 0 && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleShareHighlights}
              disabled={sharingHighlights}
              title="Share tonight's three most beautiful moments as a card"
            >
              {sharingHighlights ? 'Painting…' : '✨ Share highlights'}
            </button>
          )}
        </div>
        <p className="hint">
          Press <kbd>Space</kbd> to glide again
        </p>
      </div>
    </div>
  )
}

// P4 — the short cinematic that closes a Moonrise Night: a keepsake poem.
export function MoonriseCoda() {
  const moonriseCoda = useGame((s) => s.moonriseCoda)
  const dismissMoonriseCoda = useGame((s) => s.dismissMoonriseCoda)
  const night = useGame((s) => s.night)
  if (!moonriseCoda) return null
  return (
    <div className="sheet coda" role="dialog" aria-label="Moonrise keepsake">
      <div className="sheet-card coda__card">
        <p className="coda__moon" aria-hidden="true">🌕</p>
        <p className="overline">the moon remembers</p>
        <h2>A Moonrise Night, lived</h2>
        <p className="coda__poem">
          “The moon leaned close,
          <br />
          and the sky rained stars.”
        </p>
        <p className="coda__meta">
          Night {night} · {moonriseCoda.keepsake.date} · {MOONLIGHT_GLYPH} +{moonriseCoda.moonlight} moonlight
        </p>
        <p className="coda__hint">
          A keepsake rests in your Journal. The journey begins again — the garden is already saving moonlight.
        </p>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={dismissMoonriseCoda} autoFocus>
            Return to the garden
          </button>
        </div>
      </div>
    </div>
  )
}

// P2 storytelling — a brief poetic banner naming each run as a "Night".
function NightBanner() {
  const nightBanner = useGame((s) => s.nightBanner)
  const clearNightBanner = useGame((s) => s.clearNightBanner)
  const moonPhase = useGame((s) => s.moonPhase)
  const gameMode = useGame((s) => s.gameMode)
  const nightEvent = useGame((s) => s.nightEvent)

  useEffect(() => {
    if (!nightBanner) return undefined
    const t = setTimeout(clearNightBanner, 2600)
    return () => clearTimeout(t)
  }, [nightBanner, clearNightBanner])

  if (!nightBanner) return null
  const phaseName = moonPhaseById(moonPhase)?.name || moonPhase
  const modeName = gameModeById(gameMode)?.name || gameMode
  const eventName = nightEventById(nightEvent)?.name
  return (
    <div className="night-banner" role="status" aria-live="polite">
      <p className="night-banner__kicker">Night {nightBanner.night}</p>
      <p className="night-banner__sub">
        {phaseName} · {modeName}
        {nightEvent !== 'none' && eventName ? ` · ${eventName}` : ''}
      </p>
    </div>
  )
}

// The breath before the run: the garden is visible and the snake is still.
// Purely presentational — it never steals input, so a swipe during the beat
// still pre-steers the snake on touch screens.
function ReadyVeil() {
  return (
    <div className="ready-veil" role="status" aria-label="The night begins">
      <p className="ready-veil__line">The night begins</p>
      <p className="ready-veil__sub">the garden holds its breath</p>
    </div>
  )
}

// P6 "First Light": gentle first-night guide — three short hints shown only on
// the player's very first night. They auto-advance; tapping skips the guide.
const COACH_COPY = [
  {
    title: 'Welcome, gardener',
    text: 'Steer with WASD or the arrow keys — on touch, swipe across the lake.',
  },
  {
    title: 'Eat the planets',
    text: 'Glowing planets make you grow. A golden supernova is worth far more.',
  },
  {
    title: 'Mind the garden',
    text: 'The jade fence and your own tail end the night. Press P to rest anytime.',
  },
]

function CoachMarks() {
  const coachStep = useGame((s) => s.coachStep)
  const advanceCoach = useGame((s) => s.advanceCoach)
  const dismissCoach = useGame((s) => s.dismissCoach)

  useEffect(() => {
    if (coachStep < 0) return undefined
    const t = setTimeout(advanceCoach, 5500)
    return () => clearTimeout(t)
  }, [coachStep, advanceCoach])

  if (coachStep < 0 || coachStep >= COACH_COPY.length) return null
  const step = COACH_COPY[coachStep]
  return (
    <div className="coach-marks" role="status" aria-live="polite">
      <button type="button" className="coach-card" onClick={dismissCoach} aria-label="Skip the guide">
        <p className="coach-card__title">{step.title}</p>
        <p className="coach-card__text">{step.text}</p>
        <p className="coach-card__dots" aria-hidden="true">
          {COACH_COPY.map((_, i) => (
            <span key={i} className={i === coachStep ? 'on' : ''} />
          ))}
        </p>
        <p className="coach-card__skip">tap to skip</p>
      </button>
    </div>
  )
}

function WhisperToast({ toast, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="whisper-toast" role="status">
      <span className="whisper-toast__mark" aria-hidden="true">
        ✦
      </span>
      <p>{toast.text}</p>
    </div>
  )
}

// P2 storytelling — floating one-line poems when a whisper unlocks.
function WhisperToasts() {
  const toasts = useGame((s) => s.whisperToasts)
  const dismissWhisperToast = useGame((s) => s.dismissWhisperToast)
  if (toasts.length === 0) return null
  return (
    <div className="whisper-toasts" aria-live="polite">
      {toasts.map((t) => (
        <WhisperToast key={t.toastId} toast={t} onDone={() => dismissWhisperToast(t.toastId)} />
      ))}
    </div>
  )
}

function VerseToast({ toast, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="verse-toast" role="status">
      <p className="verse-toast__overline">a verse of the chronicle</p>
      <p className="verse-toast__line">“{toast.lines[0]}”</p>
      <p className="verse-toast__line">“{toast.lines[1]}”</p>
    </div>
  )
}

// P3 storytelling — floating two-line verses when a moon verse unlocks.
function VerseToasts() {
  const toasts = useGame((s) => s.verseToasts)
  const dismissVerseToast = useGame((s) => s.dismissVerseToast)
  if (toasts.length === 0) return null
  return (
    <div className="verse-toasts" aria-live="polite">
      {toasts.map((t) => (
        <VerseToast key={t.toastId} toast={t} onDone={() => dismissVerseToast(t.toastId)} />
      ))}
    </div>
  )
}

// The night opens with a quiet moment: the night's new whispers and verses
// are read one at a time BEFORE gameplay begins, instead of bursting over
// the live garden in unreadable stacks.
// Dwell time per poem on the prologue screen: long enough to actually
// read, never a flash. Verses get more room than one-line whispers.
const PROLOGUE_DWELL = { verse: 6000, whisper: 4500 }

export function PrologueOverlay() {
  const night = useGame((s) => s.night)
  const queue = useGame((s) => s.prologueQueue)
  const index = useGame((s) => s.prologueIndex)
  const moonPhase = useGame((s) => s.moonPhase)
  const gameMode = useGame((s) => s.gameMode)
  const nightEvent = useGame((s) => s.nightEvent)
  const beginNight = useGame((s) => s.beginNight)
  const advancePrologue = useGame((s) => s.advancePrologue)

  const phase = moonPhaseById(moonPhase)
  const mode = gameModeById(gameMode)
  const event = nightEventById(nightEvent)

  // Walk through the night's new poems at reading pace. The last card holds
  // until the player chooses to begin — the night never starts by surprise,
  // and a stray tap can no longer skip the poems unread.
  const item = index < queue.length ? queue[index] : null
  const isLast = queue.length === 0 || index >= queue.length - 1
  useEffect(() => {
    if (!item || isLast) return undefined
    const t = setTimeout(advancePrologue, PROLOGUE_DWELL[item.kind] || 4500)
    return () => clearTimeout(t)
  }, [item, isLast, advancePrologue])

  return (
    <div className="prologue-overlay" role="dialog" aria-label="The night begins">
      <div className="prologue-inner" onClick={advancePrologue}>
        <p className="prologue-kicker">Night {night}</p>
        <p className="prologue-sub">
          {phase?.name} · {mode?.name}
          {event && event.id !== 'none' ? ` · ${event.name}` : ''}
        </p>
        {item ? (
          <div className="prologue-card" key={`${item.kind}-${item.id}-${index}`}>
            {item.kind === 'verse' ? (
              <>
                <p className="prologue-card__overline">a verse of the chronicle</p>
                <p className="prologue-card__line">“{item.lines[0]}”</p>
                <p className="prologue-card__line">“{item.lines[1]}”</p>
              </>
            ) : (
              <>
                <p className="prologue-card__overline">a whisper of the night</p>
                <p className="prologue-card__line prologue-card__line--whisper">
                  <span aria-hidden="true">✦ </span>{item.text}
                </p>
              </>
            )}
          </div>
        ) : (
          <p className="prologue-quiet">The lake is quiet tonight.</p>
        )}
        {queue.length > 1 && (
          <div className="prologue-dots" aria-hidden="true">
            {queue.map((q, i) => (
              <span
                key={`${q.kind}-${q.id}`}
                className={i === index ? 'prologue-dot is-active' : i < index ? 'prologue-dot is-done' : 'prologue-dot'}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className={`prologue-begin${isLast ? ' prologue-begin--ready' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            beginNight()
          }}
        >
          Begin the night ▸
        </button>
        <p className="prologue-hint">
          {queue.length > 0 ? 'tap the card for the next poem' : 'the garden waits for you'}
        </p>
      </div>
    </div>
  )
}

// P3 — share one moon verse as a 1080x1350 card (Web Share, download fallback).
// P5 Shared Skies — signed with the gardener's name, with a caption for posts.
function VerseShareButton({ verse }) {
  const night = useGame((s) => s.night)
  const gardenerName = useGame((s) => s.gardenerName)
  const [sharing, setSharing] = useState(false)

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    try {
      const card = await composeVerseCard({ verse, night, gardenerName })
      const blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'))
      if (!blob) return
      const file = new File([blob], `moonlit-serpent-verse-${verse.id}.png`, { type: 'image/png' })
      const caption = `“${verse.lines.join(' ')}”\n— The Lunar Chronicle · Moonlit Serpent`
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Moonlit Serpent — a verse of the chronicle', text: caption })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch {
      // Share sheet dismissed — nothing to do
    } finally {
      setSharing(false)
    }
  }

  return (
    <button
      type="button"
      className="btn btn--ghost verse-share"
      onClick={handleShare}
      disabled={sharing}
      title="Share this verse as a card"
    >
      {sharing ? '…' : '⤴ Share'}
    </button>
  )
}

// P2+P3 storytelling — the collection overlay: whispers and moon verses,
// each with a tab. Heard verses can be shared as verse cards.
export function JournalOverlay() {
  const closeJournal = useGame((s) => s.closeJournal)
  const unlockedWhispers = useGame((s) => s.unlockedWhispers)
  const unlockedVerses = useGame((s) => s.unlockedVerses)
  const keepsakes = useGame((s) => s.keepsakes)
  const night = useGame((s) => s.night)
  const totals = useGame((s) => s.totals)
  const gardenerName = useGame((s) => s.gardenerName)
  const setGardenerName = useGame((s) => s.setGardenerName)
  const [tab, setTab] = useState('whispers')
  const heardWhispers = new Set(unlockedWhispers)
  const heardVerses = new Set(unlockedVerses)
  const verseById = Object.fromEntries(VERSES.map((v) => [v.id, v]))

  return (
    <div className="sheet" role="dialog" aria-label="Journal of whispers and verses">
      <div className="sheet-card journal">
        <p className="overline">the journal</p>
        <div className="name-row" title="Your signature on shared verse and highlight cards">
          <label htmlFor="gardener-name">✒ Sign your shared cards</label>
          <input
            id="gardener-name"
            className="name-row__input"
            value={gardenerName}
            onChange={(e) => setGardenerName(e.target.value)}
            maxLength={24}
            placeholder="the ink gardener"
            autoComplete="off"
          />
        </div>
        <div className="journal__tabs" role="tablist" aria-label="Journal sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'whispers'}
            className={`journal__tab${tab === 'whispers' ? ' is-active' : ''}`}
            onClick={() => setTab('whispers')}
          >
            Whispers · {unlockedWhispers.length}/{WHISPER_COUNT}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'verses'}
            className={`journal__tab${tab === 'verses' ? ' is-active' : ''}`}
            onClick={() => setTab('verses')}
          >
            Verses · {unlockedVerses.length}/{VERSE_COUNT}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'keepsakes'}
            className={`journal__tab${tab === 'keepsakes' ? ' is-active' : ''}`}
            onClick={() => setTab('keepsakes')}
          >
            Keepsakes · {keepsakes.length}
          </button>
        </div>
        {tab === 'whispers' ? (
          <>
            <h2>Whispers of the Night</h2>
            <p className="journal__stats">
              Night {night} · {unlockedWhispers.length}/{WHISPER_COUNT} whispers heard ·{' '}
              {totals.planets} stars gathered · {totals.supernovas} last lights
            </p>
            <div className="journal__grid">
              {WHISPERS.map((w) =>
                heardWhispers.has(w.id) ? (
                  <div key={w.id} className="journal__entry is-heard">
                    <p>“{w.text}”</p>
                  </div>
                ) : (
                  <div key={w.id} className="journal__entry is-unheard">
                    <p className="journal__locked">a whisper not yet heard…</p>
                  </div>
                ),
              )}
            </div>
          </>
        ) : tab === 'verses' ? (
          <>
            <h2>The Lunar Chronicle</h2>
            <p className="journal__stats">
              {unlockedVerses.length}/{VERSE_COUNT} verses earned · {totals.spiritCatches} carp
              caught · Night {night}
            </p>
            <div className="journal__grid journal__grid--verses">
              {VERSES.map((v) =>
                heardVerses.has(v.id) ? (
                  <div key={v.id} className="journal__entry is-heard">
                    <p>“{v.lines[0]}”</p>
                    <p>“{v.lines[1]}”</p>
                    <VerseShareButton verse={verseById[v.id]} />
                  </div>
                ) : (
                  <div key={v.id} className="journal__entry is-unheard">
                    <p className="journal__locked">a verse not yet earned…</p>
                  </div>
                ),
              )}
            </div>
          </>
        ) : (
          <>
            <h2>Moonrise Keepsakes</h2>
            <p className="journal__stats">
              {keepsakes.length} moonrise{keepsakes.length === 1 ? '' : 's'} lived · Night {night}
            </p>
            {keepsakes.length === 0 ? (
              <p className="journal__locked journal__empty">
                No keepsakes yet. Fill the Journey to the Moon in the Garden,
                and the moon will lean close for you.
              </p>
            ) : (
              <div className="journal__grid">
                {keepsakes.map((k) => (
                  <div key={k.id} className="journal__entry is-heard keepsake">
                    <p className="keepsake__moon">🌕</p>
                    <p>“The moon leaned close, and the sky rained stars.”</p>
                    <p className="keepsake__meta">Night {k.night} · {k.date}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={closeJournal}>
            Back to the garden
          </button>
        </div>
      </div>
    </div>
  )
}

function Chip({ label, value, highlight }) {
  return (
    <div className={`chip${highlight ? ' chip--highlight' : ''}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

/**
 * Direction-queue indicator chip.
 * Displays current active direction and queued next turn arrow.
 */
function QueueChip({ currentDir, queuedDir }) {
  const hasQueue = !!queuedDir
  return (
    <div
      className={`chip queue-chip ${hasQueue ? 'queue-chip--buffered' : ''}`}
      title={hasQueue ? `Turning: ${queuedDir}` : `Current direction: ${currentDir}`}
    >
      <span>Dir</span>
      <div className="queue-arrows">
        <b className="dir-main">{DIR_ARROW[currentDir] || '→'}</b>
        {hasQueue && <b className="dir-next">{DIR_ARROW[queuedDir]}</b>}
      </div>
    </div>
  )
}

function PlayingHud() {
  const score = useGame((s) => s.score)
  const length = useGame((s) => s.length)
  const best = useGame((s) => s.best)
  const isBoosting = useGame((s) => s.isBoosting)
  const currentDir = useGame((s) => s.currentDir)
  const queuedDir = useGame((s) => s.queuedDir)
  const gameMode = useGame((s) => s.gameMode)
  const timeLeft = useGame((s) => s.timeLeft)

  const showTimer = gameMode === 'lantern' && timeLeft != null
  const timerText = showTimer ? `0:${String(Math.max(0, timeLeft)).padStart(2, '0')}` : ''

  return (
    <div className="hud-top">
      <div className="chips">
        <Chip label="Score" value={score} highlight />
        <Chip label="Length" value={length} />
        <Chip label="Best" value={best} />
        {showTimer && (
          <div
            className={`chip chip--timer${timeLeft <= 10 ? ' chip--timer-low' : ''}`}
            title="Time remaining in this Lantern Rush"
            aria-live="off"
          >
            <span>🏮</span>
            <b>{timerText}</b>
          </div>
        )}
        <QueueChip currentDir={currentDir} queuedDir={queuedDir} />
        {isBoosting && <div className="chip chip--boost">⚡ DASH</div>}
      </div>
    </div>
  )
}

function Corners() {
  const muted = useGame((s) => s.muted)
  const setMuted = useGame((s) => s.setMuted)
  const status = useGame((s) => s.status)
  const togglePause = useGame((s) => s.togglePause)
  const cameraMode = useGame((s) => s.cameraMode)
  const toggleCameraMode = useGame((s) => s.toggleCameraMode)
  const showControls = useGame((s) => s.showControls)
  const toggleControls = useGame((s) => s.toggleControls)

  return (
    <div className="chrome-actions">
      <button
        type="button"
        className="icon-btn"
        aria-label="Change camera angle (C key)"
        title={`Camera: ${CAM_LABELS[cameraMode] || 'Classic 3D'} (C key)`}
        onClick={toggleCameraMode}
      >
        {icons.camera}
      </button>

      <button
        type="button"
        className={`icon-btn ${showControls ? 'icon-btn--active' : ''}`}
        aria-label="Toggle virtual controls"
        title="Toggle virtual controls"
        onClick={toggleControls}
      >
        {icons.gamepad}
      </button>

      <button
        type="button"
        className="icon-btn"
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute (M key)' : 'Mute (M key)'}
        aria-pressed={muted}
        onClick={() => setMuted(!muted)}
      >
        {muted ? icons.unmute : icons.mute}
      </button>

      {(status === 'playing' || status === 'paused') && (
        <button
          type="button"
          className="icon-btn"
          aria-label={status === 'paused' ? 'Resume' : 'Pause'}
          title="Pause / Resume (P key)"
          onClick={togglePause}
        >
          {icons.pause}
        </button>
      )}
    </div>
  )
}

function OnScreenControls() {
  const dirs = [
    ['up', 'up', icons.up],
    ['left', 'left', icons.left],
    ['right', 'right', icons.right],
    ['down', 'down', icons.down],
  ]

  return (
    <div className="touch-controls-wrapper">
      {/* Boost button */}
      <button
        type="button"
        className="btn-boost"
        aria-label="Dash"
        title="Hold to dash"
        onPointerDown={(e) => {
          e.preventDefault()
          inputBus.emit({ type: 'boost', boosting: true })
        }}
        onPointerUp={(e) => {
          e.preventDefault()
          inputBus.emit({ type: 'boost', boosting: false })
        }}
        onPointerCancel={() => {
          inputBus.emit({ type: 'boost', boosting: false })
        }}
      >
        {icons.zap}
        <span>Dash</span>
      </button>

      {/* D-Pad */}
      <div className="dpad" aria-label="Direction pad" role="group">
        {dirs.map(([key, cls, icon]) => (
          <button
            key={key}
            type="button"
            className={`dbtn dbtn--${cls}`}
            aria-label={`Go ${key}`}
            onPointerDown={(e) => {
              e.preventDefault()
              inputBus.emit({ type: 'turn', key })
            }}
          >
            {arr(icon)}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Hud() {
  const status = useGame((s) => s.status)
  const showHowTo = useGame((s) => s.showHowTo)
  const showJournal = useGame((s) => s.showJournal)
  const showGarden = useGame((s) => s.showGarden)
  const showControls = useGame((s) => s.showControls)
  const moonriseCoda = useGame((s) => s.moonriseCoda)

  return (
    <>
      <div className="vignette" />
      <Corners />
      {status === 'title' && !showHowTo && !showJournal && !showGarden && <TitleOverlay />}
      {status === 'title' && showHowTo && <HowToOverlay />}
      {status === 'title' && showJournal && !showHowTo && <JournalOverlay />}
      {status === 'title' && showGarden && !showHowTo && <GardenOverlay />}
      {status === 'prologue' && <PrologueOverlay />}
      {status === 'ready' && (
        <>
          <NightBanner />
          <ReadyVeil />
        </>
      )}
      {status === 'playing' && (
        <>
          <PlayingHud />
          <CoachMarks />
          <div className="toast-stack">
            <VerseToasts />
            <WhisperToasts />
          </div>
          <div className={showControls ? 'force-show-controls' : 'responsive-controls'}>
            <OnScreenControls />
          </div>
        </>
      )}
      {status === 'paused' && <PauseOverlay />}
      {status === 'dead' && (
        <>
          <GameOverOverlay />
          {moonriseCoda && <MoonriseCoda />}
        </>
      )}
    </>
  )
}
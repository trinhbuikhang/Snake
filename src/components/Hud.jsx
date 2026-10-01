import { useEffect, useState } from 'react'
import { useGame } from '../game/store.js'
import { inputBus } from '../game/inputBus.js'
import { MOON_PHASES, moonPhaseById, GAME_MODES, gameModeById } from '../game/logic.js'
import { WHISPERS, WHISPER_COUNT } from '../game/whispers.js'
import { composeMoonCard } from '../game/moonCard.js'

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

  return (
    <div className="sheet" role="dialog" aria-label="Moonlit Serpent title">
      <div className="lockup">
        <p className="overline">a moonlit nocturne in the jade garden</p>
        <h1>Moonlit Serpent</h1>
        <p className="tagline">
          <span>A poetic, razor-sharp 3D snake experience</span>
        </p>
        <div className="rule" />
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={start} autoFocus>
            Start playing
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
        <button type="button" className="btn btn--ghost journal-link" onClick={openJournal}>
          📖 Journal · {unlockedWhispers.length}/{WHISPER_COUNT} whispers
        </button>
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
              Every run is one <b>Night</b>. Listen for <b>whispers</b> — one-line poems the garden reveals as you play — and collect them all in your <b>Journal</b>.
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
  const start = useGame((s) => s.start)
  const toTitle = useGame((s) => s.toTitle)
  const [sharing, setSharing] = useState(false)

  const endCopy = END_COPY[deathCause] || END_COPY.unknown

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    try {
      const card = await composeMoonCard({
        snapshotDataURL: deathSnapshot,
        score,
        best,
        length,
        phaseName: moonPhaseById(moonPhase).name,
        modeName: gameModeById(gameMode).name,
        dateLabel: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      })
      const blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'))
      if (!blob) return
      const file = new File([blob], 'moonlit-serpent-card.png', { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Moonlit Serpent — my moon card' })
      } else {
        // Fallback: download the card image
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'moonlit-serpent-card.png'
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
        </div>
        <p className="hint">
          Press <kbd>Space</kbd> to glide again
        </p>
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

  useEffect(() => {
    if (!nightBanner) return undefined
    const t = setTimeout(clearNightBanner, 2600)
    return () => clearTimeout(t)
  }, [nightBanner, clearNightBanner])

  if (!nightBanner) return null
  const phaseName = moonPhaseById(moonPhase)?.name || moonPhase
  const modeName = gameModeById(gameMode)?.name || gameMode
  return (
    <div className="night-banner" role="status" aria-live="polite">
      <p className="night-banner__kicker">Night {nightBanner.night}</p>
      <p className="night-banner__sub">
        {phaseName} · {modeName}
      </p>
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

// P2 storytelling — the collection overlay: every whisper heard or yet to hear.
export function JournalOverlay() {
  const closeJournal = useGame((s) => s.closeJournal)
  const unlockedWhispers = useGame((s) => s.unlockedWhispers)
  const night = useGame((s) => s.night)
  const totals = useGame((s) => s.totals)
  const heard = new Set(unlockedWhispers)

  return (
    <div className="sheet" role="dialog" aria-label="Journal of whispers">
      <div className="sheet-card journal">
        <p className="overline">the journal</p>
        <h2>Whispers of the Night</h2>
        <p className="journal__stats">
          Night {night} · {unlockedWhispers.length}/{WHISPER_COUNT} whispers heard · {totals.planets}{' '}
          stars gathered · {totals.supernovas} last lights
        </p>
        <div className="journal__grid">
          {WHISPERS.map((w) =>
            heard.has(w.id) ? (
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
  const showControls = useGame((s) => s.showControls)

  return (
    <>
      <div className="vignette" />
      <Corners />
      {status === 'title' && !showHowTo && !showJournal && <TitleOverlay />}
      {status === 'title' && showHowTo && <HowToOverlay />}
      {status === 'title' && showJournal && !showHowTo && <JournalOverlay />}
      {status === 'playing' && (
        <>
          <PlayingHud />
          <NightBanner />
          <WhisperToasts />
          <div className={showControls ? 'force-show-controls' : 'responsive-controls'}>
            <OnScreenControls />
          </div>
        </>
      )}
      {status === 'paused' && <PauseOverlay />}
      {status === 'dead' && (
        <>
          <GameOverOverlay />
          <WhisperToasts />
        </>
      )}
    </>
  )
}
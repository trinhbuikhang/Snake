import { useGame } from '../game/store.js'
import { inputBus } from '../game/inputBus.js'

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
  aligned: '3D Chuẩn',
  topdown: '2D Trên Cao',
  cinematic: 'Góc Nghiêng',
}

export function TitleOverlay() {
  const best = useGame((s) => s.best)
  const start = useGame((s) => s.start)
  const openHowTo = useGame((s) => s.openHowTo)
  const cameraMode = useGame((s) => s.cameraMode)
  const toggleCameraMode = useGame((s) => s.toggleCameraMode)

  return (
    <div className="sheet" role="dialog" aria-label="Rắn Xinh title">
      <div className="lockup">
        <p className="overline">vũ khúc trăng đêm trong vườn ngọc</p>
        <h1 lang="vi">Rắn Xinh</h1>
        <p className="tagline">
          <span>Một trải nghiệm Rắn Săn Mồi 3D thi vị và sắc nét</span>
        </p>
        <div className="rule" />
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={start} autoFocus>
            Bắt đầu chơi
          </button>
          <button type="button" className="btn" onClick={openHowTo}>
            Cách chơi
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={toggleCameraMode}
            title="Đổi góc nhìn (Phím C)"
          >
            Góc nhìn: {CAM_LABELS[cameraMode] || '3D Chuẩn'}
          </button>
        </div>
        {best > 0 && <p className="best-note">kỷ lục · {best} điểm</p>}
      </div>
    </div>
  )
}

export function HowToOverlay() {
  const closeHowTo = useGame((s) => s.closeHowTo)
  return (
    <div className="sheet" role="dialog" aria-label="Cách chơi">
      <div className="sheet-card">
        <p className="overline">hướng dẫn</p>
        <h2>Cách chơi Rắn Xinh</h2>
        <div className="howto-list">
          <p>
            <span className="num">1</span>
            <span>
              Điều khiển bằng <kbd>W A S D</kbd> hoặc các phím <kbd>↑ ↓ ← →</kbd>. Góc nhìn 3D chuẩn được căn thẳng (Lên là Lên, Phải là Phải), rẽ cua chuẩn xác và không sợ nhầm hướng.
            </span>
          </p>
          <p>
            <span className="num">2</span>
            <span>
              <b>Tăng tốc (Dash)</b>: Giữ phím <kbd>Space</kbd> hoặc <kbd>Shift</kbd> (hoặc nút ⚡ trên màn hình) để rắn lướt nhanh gấp đôi qua khoảng trống.
            </span>
          </p>
          <p>
            <span className="num">3</span>
            <span>
              <b>Đổi góc nhìn</b>: Bấm phím <kbd>C</kbd> để chuyển giữa <b>3D Chuẩn</b>, <b>2D Trên Cao</b> (chiến thuật siêu dễ nhìn), hoặc <b>Góc Nghiêng</b>.
            </span>
          </p>
          <p>
            <span className="num">4</span>
            <span>
              Ăn <b>Hoa Sen Vàng</b> để dài ra (+1 điểm). Thỉnh thoảng sẽ xuất hiện <b>Bạch Ngọc Liên</b> rực sáng quý hiếm (+3 điểm).
            </span>
          </p>
          <p>
            <span className="num">5</span>
            <span>
              Hàng rào ngọc phát sáng và thân mình là những chướng ngại vật duy nhất.
            </span>
          </p>
          <p className="small">Trên điện thoại: Vuốt trên mặt hồ hoặc dùng cụm phím ảo bên dưới.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={closeHowTo}>
          Đã hiểu
        </button>
      </div>
    </div>
  )
}

export function PauseOverlay() {
  const resume = useGame((s) => s.resume)
  const toTitle = useGame((s) => s.toTitle)
  return (
    <div className="sheet" role="dialog" aria-label="Tạm dừng">
      <div className="sheet-card">
        <p className="overline">tạm nghỉ</p>
        <h2>Đang tạm dừng</h2>
        <p>Khu vườn nguyệt dạ đang chờ bạn.</p>
        <div className="sheet-actions">
          <button type="button" className="btn btn--primary" onClick={resume} autoFocus>
            Tiếp tục
          </button>
          <button type="button" className="btn" onClick={toTitle}>
            Về màn hình chính
          </button>
        </div>
        <p className="hint">
          Bấm <kbd>P</kbd> hoặc <kbd>Esc</kbd> để tiếp tục
        </p>
      </div>
    </div>
  )
}

export function GameOverOverlay() {
  const score = useGame((s) => s.score)
  const best = useGame((s) => s.best)
  const isNewBest = useGame((s) => s.isNewBest)
  const start = useGame((s) => s.start)
  const toTitle = useGame((s) => s.toTitle)

  return (
    <div className="sheet" role="dialog" aria-label="Kết thúc ván">
      <div className="sheet-card">
        <p className="overline">kết thúc</p>
        <h2>Mặt hồ phẳng lặng trở lại</h2>
        {isNewBest && <span className="best-badge">✦ Kỷ Lục Mới!</span>}
        <div className="result-score" aria-live="polite">
          {score}
        </div>
        <p className="result-best">kỷ lục cao nhất · {best} điểm</p>
        <div className="sheet-actions">
          <button type="button" className="btn btn--primary" onClick={start} autoFocus>
            Chơi lại ngay
          </button>
          <button type="button" className="btn" onClick={toTitle}>
            Về trang chủ
          </button>
        </div>
        <p className="hint">
          Bấm phím <kbd>Space</kbd> để lướt tiếp
        </p>
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
      title={hasQueue ? `Đang rẽ: ${queuedDir}` : `Hướng hiện tại: ${currentDir}`}
    >
      <span>Hướng</span>
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

  return (
    <div className="hud-top">
      <div className="chips">
        <Chip label="Điểm" value={score} highlight />
        <Chip label="Độ Dài" value={length} />
        <Chip label="Kỷ Lục" value={best} />
        {isBoosting && <div className="chip chip--boost">⚡ TĂNG TỐC</div>}
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
        aria-label="Đổi góc nhìn camera (Phím C)"
        title={`Góc nhìn: ${CAM_LABELS[cameraMode] || '3D Chuẩn'} (Phím C)`}
        onClick={toggleCameraMode}
      >
        {icons.camera}
      </button>

      <button
        type="button"
        className={`icon-btn ${showControls ? 'icon-btn--active' : ''}`}
        aria-label="Bật/Tắt phím điều khiển ảo"
        title="Bật/Tắt phím điều khiển ảo"
        onClick={toggleControls}
      >
        {icons.gamepad}
      </button>

      <button
        type="button"
        className="icon-btn"
        aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
        title={muted ? 'Bật âm thanh (Phím M)' : 'Tắt âm thanh (Phím M)'}
        aria-pressed={muted}
        onClick={() => setMuted(!muted)}
      >
        {muted ? icons.unmute : icons.mute}
      </button>

      {(status === 'playing' || status === 'paused') && (
        <button
          type="button"
          className="icon-btn"
          aria-label={status === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}
          title="Tạm dừng / Tiếp tục (Phím P)"
          onClick={togglePause}
        >
          {icons.pause}
        </button>
      )}
    </div>
  )
}

function KeyLegend() {
  return (
    <div className="legend" aria-hidden="true">
      <kbd>WASD</kbd> / <kbd>↑ ↓ ← →</kbd> lái · Giữ <kbd>Space</kbd> tăng tốc · <kbd>C</kbd> đổi góc nhìn · <kbd>P</kbd> tạm dừng
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
        aria-label="Tăng tốc"
        title="Giữ để tăng tốc"
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
        <span>Tăng tốc</span>
      </button>

      {/* D-Pad */}
      <div className="dpad" aria-label="Phím điều hướng" role="group">
        {dirs.map(([key, cls, icon]) => (
          <button
            key={key}
            type="button"
            className={`dbtn dbtn--${cls}`}
            aria-label={`Đi hướng ${key}`}
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
  const showControls = useGame((s) => s.showControls)

  return (
    <>
      <div className="vignette" />
      <Corners />
      {status === 'title' && !showHowTo && <TitleOverlay />}
      {status === 'title' && showHowTo && <HowToOverlay />}
      {status === 'playing' && (
        <>
          <PlayingHud />
          <div className={showControls ? 'force-show-controls' : 'responsive-controls'}>
            <OnScreenControls />
          </div>
        </>
      )}
      {status === 'paused' && <PauseOverlay />}
      {status === 'dead' && <GameOverOverlay />}
    </>
  )
}
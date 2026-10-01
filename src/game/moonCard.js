// moonCard.js — "Thiệp trăng": compose a shareable score card.
//
// A portrait ink-night card (1080x1350, good for stories/feeds) with the
// death-moment snapshot framed like a painting, the run's score, best,
// length, moon phase and date. Pure Canvas 2D — no React, no Three.

const W = 1080
const H = 1350

const INK_TOP = '#0c1a15'
const INK_BOTTOM = '#050d0a'
const CREAM = '#efe8d3'
const GOLD = '#d9b96a'
const JADE = '#7fe7c3'

// Deterministic stars so every card for the same run looks intentional.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SERIF = "'Cormorant Garamond', Georgia, serif"
const SANS = "'Inter', system-ui, sans-serif"

function paintBackground(ctx, seed) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, INK_TOP)
  g.addColorStop(1, INK_BOTTOM)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  // Moon glow, upper right
  const mx = W * 0.78
  const my = H * 0.16
  const halo = ctx.createRadialGradient(mx, my, 10, mx, my, 320)
  halo.addColorStop(0, 'rgba(245,240,225,0.55)')
  halo.addColorStop(0.25, 'rgba(245,240,225,0.18)')
  halo.addColorStop(1, 'rgba(245,240,225,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, H * 0.55)
  ctx.beginPath()
  ctx.arc(mx, my, 74, 0, Math.PI * 2)
  ctx.fillStyle = '#f5f0e1'
  ctx.fill()
  // Moon shadow bite for depth
  ctx.beginPath()
  ctx.arc(mx + 26, my - 14, 62, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(12,26,21,0.28)'
  ctx.fill()

  // Stars
  const rand = mulberry32(seed)
  for (let i = 0; i < 130; i++) {
    const x = rand() * W
    const y = rand() * H * 0.72
    const r = 0.6 + rand() * 1.8
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(240,236,220,${0.25 + rand() * 0.6})`
    ctx.fill()
  }

  // Vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, W, H)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function paintSnapshot(ctx, img) {
  const fx = 90
  const fy = 330
  const fw = W - fx * 2
  const fh = 600
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 12
  roundRect(ctx, fx, fy, fw, fh, 26)
  ctx.fillStyle = '#0a1512'
  ctx.fill()
  ctx.restore()

  // Cover-fit the snapshot into the frame
  const scale = Math.max(fw / img.width, fh / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = fx + (fw - dw) / 2
  const dy = fy + (fh - dh) / 2
  ctx.save()
  roundRect(ctx, fx, fy, fw, fh, 26)
  ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  // Ink-wash tint to blend the 3D shot into the card
  const tint = ctx.createLinearGradient(0, fy, 0, fy + fh)
  tint.addColorStop(0, 'rgba(12,26,21,0.12)')
  tint.addColorStop(1, 'rgba(5,13,10,0.35)')
  ctx.fillStyle = tint
  ctx.fillRect(fx, fy, fw, fh)
  ctx.restore()

  roundRect(ctx, fx, fy, fw, fh, 26)
  ctx.strokeStyle = GOLD
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.globalAlpha = 1
}

// Brush-stroke divider
function paintDivider(ctx, y) {
  ctx.save()
  ctx.strokeStyle = GOLD
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(W / 2 - 150, y)
  ctx.bezierCurveTo(W / 2 - 60, y - 10, W / 2 + 60, y + 10, W / 2 + 150, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(W / 2, y, 7, 0, Math.PI * 2)
  ctx.fillStyle = GOLD
  ctx.fill()
  ctx.restore()
}

function paintText(ctx, { score, best, length, phaseName, modeName, dateLabel, hasSnapshot }) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Title
  try {
    ctx.letterSpacing = '14px'
  } catch {
    /* older canvas — ignore */
  }
  ctx.fillStyle = CREAM
  ctx.font = `600 54px ${SERIF}`
  ctx.fillText('MOONLIT SERPENT', W / 2 + 7, 148)
  try {
    ctx.letterSpacing = '6px'
  } catch {
    /* ignore */
  }
  ctx.fillStyle = GOLD
  ctx.font = `500 30px ${SERIF}`
  const subtitle = modeName && modeName !== 'Classic' ? `· ${phaseName} · ${modeName} ·` : `· ${phaseName} ·`
  ctx.fillText(subtitle, W / 2 + 3, 205)

  const statsY = hasSnapshot ? 1085 : 560

  paintDivider(ctx, statsY - 130)

  // Score
  ctx.fillStyle = 'rgba(239,232,211,0.75)'
  ctx.font = `500 30px ${SANS}`
  try {
    ctx.letterSpacing = '8px'
  } catch {
    /* ignore */
  }
  ctx.fillText('SCORE', W / 2 + 4, statsY)
  try {
    ctx.letterSpacing = '0px'
  } catch {
    /* ignore */
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 150px ${SERIF}`
  ctx.fillText(String(score), W / 2, statsY + 140)

  // Stat row
  const rowY = statsY + 250
  const cols = [
    { label: 'BEST', value: String(best) },
    { label: 'LENGTH', value: String(length) },
    { label: 'NIGHT OF', value: dateLabel },
  ]
  ctx.font = `500 24px ${SANS}`
  cols.forEach((col, i) => {
    const x = W * (0.22 + i * 0.28)
    try {
      ctx.letterSpacing = '5px'
    } catch {
      /* ignore */
    }
    ctx.fillStyle = 'rgba(239,232,211,0.6)'
    ctx.fillText(col.label, x + 2, rowY)
    try {
      ctx.letterSpacing = '0px'
    } catch {
      /* ignore */
    }
    ctx.fillStyle = JADE
    ctx.font = `600 44px ${SERIF}`
    ctx.fillText(col.value, x, rowY + 58)
    ctx.font = `500 24px ${SANS}`
  })

  // Tagline
  ctx.fillStyle = 'rgba(239,232,211,0.5)'
  ctx.font = `italic 500 30px ${SERIF}`
  ctx.fillText('a night in the ink garden', W / 2, H - 72)
}

// ---------------------------------------------------------------------------
// Verse cards ("Biên niên trăng"): a shareable 1080x1350 card for one moon
// verse — same ink-night look as the score card, no snapshot needed.
// ---------------------------------------------------------------------------

function paintVerseText(ctx, { lines, night, title }) {
  const cx = W / 2

  // Overline
  try {
    ctx.letterSpacing = '6px'
  } catch {
    /* ignore */
  }
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(217,185,106,0.9)'
  ctx.font = `600 30px ${SANS}`
  ctx.fillText('THE LUNAR CHRONICLE', cx, H * 0.3)
  try {
    ctx.letterSpacing = '0px'
  } catch {
    /* ignore */
  }

  // The verse, centered, in large italic serif
  ctx.fillStyle = CREAM
  ctx.font = `italic 500 62px ${SERIF}`
  const lineH = 92
  const startY = H * 0.5 - ((lines.length - 1) * lineH) / 2
  lines.forEach((line, i) => {
    ctx.fillText(line, cx, startY + i * lineH)
  })

  // Verse title (its id made readable) — small caps-ish label
  ctx.fillStyle = 'rgba(239,232,211,0.55)'
  ctx.font = `italic 500 34px ${SERIF}`
  ctx.fillText(title, cx, H * 0.66)

  // Footer
  try {
    ctx.letterSpacing = '4px'
  } catch {
    /* ignore */
  }
  ctx.fillStyle = 'rgba(239,232,211,0.5)'
  ctx.font = `500 26px ${SANS}`
  ctx.fillText(`MOONLIT SERPENT · NIGHT ${night}`, cx, H - 72)
  try {
    ctx.letterSpacing = '0px'
  } catch {
    /* ignore */
  }
  ctx.textAlign = 'left'
}

// verse: { lines: [a, b], id }. Returns a Promise<canvas>.
export function composeVerseCard({ verse, night }) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    const seed = verse.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 7919
    paintBackground(ctx, seed >>> 0)
    const title = verse.id.replace(/^verse-/, '').replace(/-/g, ' ')
    paintVerseText(ctx, { lines: verse.lines, night, title })
    resolve(canvas)
  })
}

export function composeMoonCard({ snapshotDataURL, score, best, length, phaseName, modeName, dateLabel }) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    const seed = (score * 31 + best * 17 + length * 7) >>> 0
    paintBackground(ctx, seed || 1)

    const finish = (img) => {
      const hasSnapshot = !!img
      if (img) paintSnapshot(ctx, img)
      paintText(ctx, { score, best, length, phaseName, modeName, dateLabel, hasSnapshot })
      resolve(canvas)
    }

    if (snapshotDataURL) {
      const img = new Image()
      img.onload = () => finish(img)
      img.onerror = () => finish(null)
      img.src = snapshotDataURL
    } else {
      finish(null)
    }
  })
}

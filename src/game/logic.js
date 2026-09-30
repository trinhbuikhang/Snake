// Pure snake logic — grid state, stepping, turning, food, and the title-screen orbit demo.
// Everything here is framework-free so it can be unit-tested in node.

export const N = 20
export const INITIAL_LENGTH = 3
export const BASE_INTERVAL = 0.165 // seconds per cell at start (responsive, smooth)
export const MIN_INTERVAL = 0.08 // speed cap for high scores
export const SPEED_STEP_EVERY = 3 // foods per slight speed-up
export const SPEED_DECAY = 0.95
export const BOOST_MULTIPLIER = 0.52 // Holding Dash doubles speed

export const DIR = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const KEY_DIRS = {
  ArrowUp: 'up',
  KeyW: 'up',
  KeyK: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  KeyJ: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyH: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyL: 'right',
}

export const isOpposite = (a, b) => !!a && !!b && a.x === -b.x && a.y === -b.y

export function speedInterval(foodsEaten, isBoosting = false) {
  const steps = Math.floor(foodsEaten / SPEED_STEP_EVERY)
  const iv = BASE_INTERVAL * Math.pow(SPEED_DECAY, steps)
  const clamped = Math.max(iv, MIN_INTERVAL)
  return isBoosting ? clamped * BOOST_MULTIPLIER : clamped
}

export function gridToWorld(x, y) {
  return { x: x - (N - 1) / 2, z: y - (N - 1) / 2 }
}

function freeCells(game) {
  const taken = new Set(game.snake.map((s) => `${s.x},${s.y}`))
  const cells = []
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!taken.has(`${x},${y}`)) cells.push({ x, y })
    }
  }
  return cells
}

export const PLANETS = ['earth', 'mars', 'saturn', 'jupiter', 'neptune']
export const SUPERNOVA = 'sun'

export const PLANET_NAMES = {
  earth: 'Earth',
  mars: 'Mars',
  saturn: 'Saturn',
  jupiter: 'Jupiter',
  neptune: 'Neptune',
  sun: 'Supernova',
}

function placeFood(game) {
  const cells = freeCells(game)
  if (!cells.length) {
    game.food = null
    game.foodIsBloom = false
    game.foodPlanet = null
    return
  }
  const cell = cells[(Math.random() * cells.length) | 0]
  game.food = cell
  game.foodIsBloom = game.foodsEaten > 0 && game.foodsEaten % 5 === 0
  if (game.foodIsBloom) {
    game.foodPlanet = SUPERNOVA
  } else {
    // Pick a planet
    const idx = Math.floor(Math.random() * PLANETS.length)
    game.foodPlanet = PLANETS[idx]
  }
}

export function createGame() {
  const cx = Math.floor(N / 2)
  const snake = []
  for (let i = 0; i < INITIAL_LENGTH; i++) snake.push({ x: cx - i, y: cx })
  const game = {
    dir: 'right',
    queue: [],
    snake,
    food: null,
    foodIsBloom: false,
    foodPlanet: 'earth',
    foodsEaten: 0,
    score: 0,
    alive: true,
  }
  placeFood(game)
  return game
}

// Queue a turn with smart buffering:
// - Ignores reverse turns (prevent suicide).
// - Allows up to 2 queued turns (corner cut); extra taps while the buffer is
//   full are dropped. (Replacing the 2nd queued turn is impossible on a
//   4-direction grid: every alternative is either a no-op or a suicide turn.)
export function turn(game, key) {
  const d = DIR[key]
  if (!d) return false

  // Base the reference direction on the latest queued turn or current moving direction
  const refKey = game.queue.length > 0 ? game.queue[game.queue.length - 1] : game.dir
  const refDir = DIR[refKey]

  // Cannot turn opposite to the active/last pending direction
  if (isOpposite(d, refDir)) return false
  // Already heading in that direction
  if (d === refDir) return false

  if (game.queue.length >= 2) return false
  game.queue.push(key)
  return true
}

// Advance one discrete grid step. Returns { dead } or { ate, bloom, score, length }.
export function step(game) {
  if (!game.alive) return { dead: true }
  let dirKey = game.dir
  while (game.queue.length) {
    const q = game.queue.shift()
    const d = DIR[q]
    if (!isOpposite(d, DIR[dirKey])) {
      dirKey = q
      break
    }
  }
  const d = DIR[dirKey]
  const h = game.snake[0]
  const nh = { x: h.x + d.x, y: h.y + d.y }
  if (nh.x < 0 || nh.y < 0 || nh.x >= N || nh.y >= N) {
    game.alive = false
    return { dead: true, cause: 'wall' }
  }
  const eat = game.food && game.food.x === nh.x && game.food.y === nh.y
  const bodyLimit = game.snake.length - (eat ? 0 : 1)
  for (let i = 0; i < bodyLimit; i++) {
    const s = game.snake[i]
    if (s.x === nh.x && s.y === nh.y) {
      game.alive = false
      return { dead: true, cause: 'self' }
    }
  }
  game.dir = dirKey
  game.snake.unshift(nh)
  if (eat) {
    const bloom = game.foodIsBloom
    const planet = game.foodPlanet || (bloom ? SUPERNOVA : 'earth')
    game.score += bloom ? 3 : 1
    game.foodsEaten++
    placeFood(game)
    return { ate: true, bloom, planet, score: game.score, length: game.snake.length }
  }
  game.snake.pop()
  return { dead: false, ate: false }
}

// Title-screen wandering: a fixed orbit along a big interior ring.
export function createDemo(len = 14) {
  const m = 2
  const M = N - 3
  const path = []
  for (let x = m; x <= M; x++) path.push({ x, y: m })
  for (let y = m + 1; y <= M; y++) path.push({ x: M, y })
  for (let x = M - 1; x >= m; x--) path.push({ x, y: M })
  for (let y = M - 1; y >= m + 1; y--) path.push({ x: m, y })
  return { path, idx: 0, len: Math.min(len, path.length - 4) }
}

// Advance the orbit; returns the new body (head-first) plus movement direction.
export function stepDemo(demo) {
  demo.idx = (demo.idx + 1) % demo.path.length
  const cells = []
  for (let k = 0; k < demo.len; k++) {
    const i = ((demo.idx - k) % demo.path.length + demo.path.length) % demo.path.length
    cells.push(demo.path[i])
  }
  const head = cells[0]
  const prev = demo.path[((demo.idx - 1) % demo.path.length + demo.path.length) % demo.path.length]
  return { cells, dx: head.x - prev.x, dy: head.y - prev.y }
}
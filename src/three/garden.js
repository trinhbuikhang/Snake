import * as THREE from 'three'

const INK = 0x08100d
const POND_WATER = 0x0c1a16
const CREAM = 0xf3efe6
const JADE_GLOW = 0x4eedb8
const GOLD_CORE = 0xffc107
const GOLD_PETAL = 0xffd54f
const BLOOM_MAGENTA = 0xff2b75
const BLOOM_CYAN = 0x00f5d4
const MOSS = 0x22332a
const MOSS_DEEP = 0x16231c

// ---------- helpers ----------

function roundedRectPath(shape, half, r) {
  const s = half
  shape.moveTo(-s + r, -s)
  shape.lineTo(s - r, -s)
  shape.quadraticCurveTo(s, -s, s, -s + r)
  shape.lineTo(s, s - r)
  shape.quadraticCurveTo(s, s, s - r, s)
  shape.lineTo(-s + r, s)
  shape.quadraticCurveTo(-s, s, -s, s - r)
  shape.lineTo(-s, -s + r)
  shape.quadraticCurveTo(-s, -s, -s + r, -s)
  shape.closePath()
}

function padShape(r, notch = 0.42) {
  const s = new THREE.Shape()
  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const th = notch + (Math.PI * 2 - notch * 2) * (i / steps)
    s.lineTo(Math.cos(th) * r, Math.sin(th) * r)
  }
  s.closePath()
  return s
}

function softCircleTexture(innerAlpha = 1) {
  const size = 64
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, `rgba(255,255,255,${innerAlpha})`)
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)')
  g.addColorStop(0.8, 'rgba(255,255,255,0.15)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = g
  c.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function ringTexture() {
  const size = 128
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const c = cv.getContext('2d')
  const center = size / 2
  c.clearRect(0, 0, size, size)
  c.beginPath()
  c.arc(center, center, center * 0.76, 0, Math.PI * 2)
  c.lineWidth = 14
  c.strokeStyle = 'rgba(255,255,255,0.9)'
  c.stroke()

  c.beginPath()
  c.arc(center, center, center * 0.76, 0, Math.PI * 2)
  c.lineWidth = 26
  c.strokeStyle = 'rgba(255,255,255,0.25)'
  c.stroke()

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function createTextSprite(text, isBloom = false) {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 96
  const ctx = cv.getContext('2d')
  ctx.clearRect(0, 0, cv.width, cv.height)

  ctx.font = 'bold 36px "Inter", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.shadowColor = isBloom ? 'rgba(255, 43, 117, 0.9)' : 'rgba(255, 193, 7, 0.9)'
  ctx.shadowBlur = 18

  ctx.fillStyle = isBloom ? '#ff5ca1' : '#ffe066'
  ctx.fillText(text, 128, 48)

  ctx.shadowBlur = 0
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, 128, 48)

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(2.4, 0.9, 1)
  return sprite
}

// ---------- particle system ----------

class ParticleField {
  constructor(scene, { capacity, size, additive }) {
    this.capacity = capacity
    this.pos = new Float32Array(capacity * 3)
    this.col = new Float32Array(capacity * 3)
    this.vel = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity)
    this.max = new Float32Array(capacity)
    this.seed = new Float32Array(capacity)
    this.cursor = 0
    this.gravity = -3.2
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    const mat = new THREE.PointsMaterial({
      size,
      map: softCircleTexture(0.95),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    scene.add(this.points)
    this.tmp = new THREE.Color()
  }

  spawn(o) {
    const n = o.count | 0
    for (let k = 0; k < n; k++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % this.capacity
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const sp = o.speed * (0.6 + Math.random() * 0.8)
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp
      this.vel[i * 3 + 1] = (Math.abs(Math.cos(ph)) + o.upBias) * sp
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp
      this.life[i] = this.max[i] = o.life * (0.7 + Math.random() * 0.6)
      this.seed[i] = Math.random() * 6.28
      const c = o.colorA.clone().lerp(o.colorB, Math.random())
      this.col[i * 3] = c.r
      this.col[i * 3 + 1] = c.g
      this.col[i * 3 + 2] = c.b
      this.pos[i * 3] = o.at.x + (Math.random() - 0.5) * 0.15
      this.pos[i * 3 + 1] = o.at.y
      this.pos[i * 3 + 2] = o.at.z + (Math.random() - 0.5) * 0.15
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
  }

  update(dt, time) {
    const g = this.gravity
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      this.vel[i * 3 + 1] += g * dt
      const sway = Math.sin(time * 2.5 + this.seed[i]) * 0.4 * dt
      this.pos[i * 3] += (this.vel[i * 3] + sway) * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
    }
    this.points.geometry.attributes.position.needsUpdate = true
  }
}

// ---------- the garden ----------

export function buildGarden(scene, { envTex, reduced }) {
  const time = { t: 0, cam: new THREE.Vector3() }

  // Deep ground plane beyond pond
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0x090f0c, roughness: 0.98 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.85
  ground.receiveShadow = true
  scene.add(ground)

  // Pond bed
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(21.2, 0.45, 21.2),
    new THREE.MeshStandardMaterial({ color: 0x07110e, roughness: 0.95 }),
  )
  bed.position.y = -0.45
  scene.add(bed)

  // The water surface
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(20.4, 20.4),
    new THREE.MeshPhysicalMaterial({
      color: POND_WATER,
      roughness: 0.12,
      metalness: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      envMap: envTex,
      envMapIntensity: 0.75,
      emissive: 0x0a1c17,
      emissiveIntensity: 0.18,
    }),
  )
  water.rotation.x = -Math.PI / 2
  water.position.y = 0.002
  water.receiveShadow = true
  scene.add(water)

  // Clear, crisp, elegant grid lines
  const linePts = []
  for (let k = -10; k <= 10; k++) {
    linePts.push(new THREE.Vector3(k, 0.008, -10), new THREE.Vector3(k, 0.008, 10))
    linePts.push(new THREE.Vector3(-10, 0.008, k), new THREE.Vector3(10, 0.008, k))
  }
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x6bb89e,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  })
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(linePts), gridMat)
  scene.add(grid)

  // Subtle checkered stone stepping pads to make each cell instantly readable.
  // Rendered as two InstancedMeshes (one per shade): 2 draw calls instead of 400.
  const cellGeo = new THREE.PlaneGeometry(0.88, 0.88)
  const cellMat1 = new THREE.MeshBasicMaterial({
    color: 0x142b23,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  })
  const cellMat2 = new THREE.MeshBasicMaterial({
    color: 0x0e201a,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  })
  const altCells = []
  const mainCells = []
  for (let y = -9.5; y <= 9.5; y += 1) {
    for (let x = -9.5; x <= 9.5; x += 1) {
      const isAlt = (Math.round(x + 9.5) + Math.round(y + 9.5)) % 2 === 0
      ;(isAlt ? altCells : mainCells).push([x, y])
    }
  }
  const tileM4 = new THREE.Matrix4()
  const tileQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0))
  const tileScale = new THREE.Vector3(1, 1, 1)
  const tilePos = new THREE.Vector3()
  for (const [cells, mat] of [
    [altCells, cellMat1],
    [mainCells, cellMat2],
  ]) {
    const inst = new THREE.InstancedMesh(cellGeo, mat, cells.length)
    cells.forEach(([x, y], i) => {
      tilePos.set(x, 0.004, y)
      tileM4.compose(tilePos, tileQuat, tileScale)
      inst.setMatrixAt(i, tileM4)
    })
    inst.instanceMatrix.needsUpdate = true
    scene.add(inst)
  }


  // Flat, flush luminous perimeter line along the play-field boundary (completely flat at water level, never occludes the board or snake)
  const BOUND = 10
  const boundMat = new THREE.MeshBasicMaterial({
    color: 0x4eedb8,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  })
  const boundGroup = new THREE.Group()

  const addBorder = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1)
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), boundMat)
    tape.rotation.x = -Math.PI / 2
    tape.rotation.z = -Math.atan2(z2 - z1, x2 - x1)
    tape.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2)
    boundGroup.add(tape)
  }
  addBorder(-BOUND, -BOUND, BOUND, -BOUND)
  addBorder(BOUND, -BOUND, BOUND, BOUND)
  addBorder(BOUND, BOUND, -BOUND, BOUND)
  addBorder(-BOUND, BOUND, -BOUND, -BOUND)
  scene.add(boundGroup)

  // Reeds & banks
  const reedClusters = [
    [-12.0, -8.4],
    [11.6, -9.6],
    [-12.4, 8.8],
    [12.2, 8.4],
    [-13.4, -1.2],
  ]
  const stalkMat = new THREE.MeshStandardMaterial({ color: MOSS, roughness: 0.9 })
  const tuftMat = new THREE.MeshStandardMaterial({ color: MOSS_DEEP, roughness: 1 })
  for (const [rx, rz] of reedClusters) {
    const cluster = new THREE.Group()
    const count = 4 + ((Math.random() * 3) | 0)
    for (let i = 0; i < count; i++) {
      const h = 2.0 + Math.random() * 1.5
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.038, h, 6), stalkMat)
      stalk.position.set((Math.random() - 0.5) * 0.5, h / 2, (Math.random() - 0.5) * 0.5)
      stalk.rotation.z = (Math.random() - 0.5) * 0.14
      cluster.add(stalk)
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), tuftMat)
      tuft.position.set((Math.random() - 0.5) * 0.4, h - 0.03, (Math.random() - 0.5) * 0.4)
      cluster.add(tuft)
    }
    cluster.position.set(rx, -0.82, rz)
    cluster.castShadow = true
    scene.add(cluster)
  }

  // Decorative lotus pads
  const padPositions = [
    { x: 7.2, z: 7.0, s: 1, r: 0.4 },
    { x: -7.5, z: 7.3, s: 0.85, r: 2.1 },
    { x: 7.8, z: -6.8, s: 1.15, r: 5.2 },
    { x: -7.1, z: -7.7, s: 0.92, r: 3.7 },
    { x: -9.1, z: -1.8, s: 1.05, r: 1.2 },
    { x: 0.8, z: -9.4, s: 0.78, r: 0.9 },
  ]
  const padMat = new THREE.MeshStandardMaterial({ color: 0x243d31, roughness: 0.8 })
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0xa8f2d5,
    emissive: 0x4eedb8,
    emissiveIntensity: 0.5,
    roughness: 0.5,
  })
  for (const p of padPositions) {
    const pad = new THREE.Mesh(new THREE.ShapeGeometry(padShape(0.55)), padMat)
    pad.rotation.x = -Math.PI / 2
    pad.rotation.z = p.r
    pad.scale.setScalar(p.s)
    pad.position.set(p.x, 0.035, p.z)
    scene.add(pad)
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.55 * p.s, 0.016, 8, 40), edgeMat)
    edge.rotation.x = -Math.PI / 2
    edge.rotation.z = p.r
    edge.position.set(p.x, 0.042, p.z)
    scene.add(edge)
  }

  // Moon and soft halo
  const moonGroup = new THREE.Group()
  const moonCore = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 48),
    new THREE.MeshBasicMaterial({ color: CREAM, fog: false }),
  )
  const moonHalo = new THREE.Mesh(
    new THREE.CircleGeometry(11.0, 48),
    new THREE.MeshBasicMaterial({
      color: CREAM,
      fog: false,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  )
  moonGroup.add(moonHalo)
  moonGroup.add(moonCore)
  moonGroup.position.set(-6, 40, -28)
  scene.add(moonGroup)

  // Stars
  const starCount = 180
  const starPos = new Float32Array(starCount * 3)
  for (let i = 0; i < starCount; i++) {
    const th = Math.random() * Math.PI * 2
    const r = 55 + Math.random() * 40
    const ra = 6 + Math.random() * 30
    starPos[i * 3] = Math.cos(th) * r
    starPos[i * 3 + 1] = ra
    starPos[i * 3 + 2] = Math.sin(th) * r
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: CREAM,
      size: 1.3,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.6,
      fog: false,
      depthWrite: false,
    }),
  )
  scene.add(stars)

  // Floating Petals
  const PETALS = 36
  const petalData = []
  const petalMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.32, 0.2),
    new THREE.MeshStandardMaterial({
      color: CREAM,
      emissive: CREAM,
      emissiveIntensity: 0.12,
      roughness: 0.7,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      fog: false,
    }),
    PETALS,
  )
  const m4 = new THREE.Matrix4()
  const q4 = new THREE.Quaternion()
  const s4 = new THREE.Vector3()
  const e4 = new THREE.Euler()
  const v4 = new THREE.Vector3()
  for (let i = 0; i < PETALS; i++) {
    petalData.push({
      base: new THREE.Vector3((Math.random() - 0.5) * 17, 1.0 + Math.random() * 4.5, (Math.random() - 0.5) * 17),
      phase: Math.random() * 6.28,
      speed: 0.16 + Math.random() * 0.24,
      sway: 0.5 + Math.random() * 0.8,
      scale: 0.6 + Math.random() * 0.9,
      rot: Math.random() * 6.28,
    })
  }
  scene.add(petalMesh)

  // Floating Fireflies (Bioluminescent sparks over pond)
  const FIREFLIES = 28
  const fireflyPos = new Float32Array(FIREFLIES * 3)
  const fireflyData = []
  for (let i = 0; i < FIREFLIES; i++) {
    fireflyData.push({
      x: (Math.random() - 0.5) * 18,
      y: 0.3 + Math.random() * 2.2,
      z: (Math.random() - 0.5) * 18,
      phase: Math.random() * 6.28,
      speed: 0.4 + Math.random() * 0.6,
      radius: 0.5 + Math.random() * 1.5,
    })
  }
  const fireflyGeo = new THREE.BufferGeometry()
  fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3))
  const fireflyMat = new THREE.PointsMaterial({
    color: 0x76ffd6,
    size: 0.28,
    map: softCircleTexture(1),
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const fireflies = new THREE.Points(fireflyGeo, fireflyMat)
  scene.add(fireflies)

  // =========================================================================
  // WATER RIPPLES SYSTEM
  // =========================================================================
  const MAX_RIPPLES = 12
  const ripples = []
  const rippleGeo = new THREE.PlaneGeometry(1, 1)
  const rippleTex = ringTexture()
  const rippleGroup = new THREE.Group()
  scene.add(rippleGroup)

  for (let i = 0; i < MAX_RIPPLES; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: rippleTex,
      transparent: true,
      opacity: 0,
      color: 0x6eedc4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(rippleGeo, mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0.012
    mesh.visible = false
    rippleGroup.add(mesh)
    ripples.push({ mesh, mat, life: 0, maxLife: 1, scale: 0, maxScale: 4 })
  }

  function spawnRipple(x, z, maxScale = 3.2, maxLife = 1.2, color = 0x6eedc4) {
    if (reduced) return
    const free = ripples.find((r) => r.life <= 0) || ripples[0]
    free.life = maxLife
    free.maxLife = maxLife
    free.scale = 0.2
    free.maxScale = maxScale
    free.mesh.position.set(x, 0.012, z)
    free.mesh.scale.setScalar(free.scale)
    free.mat.color.set(color)
    free.mat.opacity = 0.75
    free.mesh.visible = true
  }

  // =========================================================================
  // PROCEDURAL PLANET TEXTURES GENERATOR
  // =========================================================================
  function createPlanetTexture(type) {
    const cv = document.createElement('canvas')
    cv.width = 512
    cv.height = 256
    const ctx = cv.getContext('2d')
    const w = cv.width
    const h = cv.height

    if (type === 'earth') {
      // Deep blue ocean
      ctx.fillStyle = '#0f3c66'
      ctx.fillRect(0, 0, w, h)
      // Continents
      ctx.fillStyle = '#2d8a4e'
      ctx.beginPath()
      ctx.ellipse(w * 0.46, h * 0.42, 60, 48, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(w * 0.50, h * 0.65, 44, 52, -0.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(w * 0.22, h * 0.38, 52, 42, -0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(w * 0.26, h * 0.68, 38, 52, 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(w * 0.74, h * 0.40, 78, 46, 0.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(w * 0.80, h * 0.70, 36, 28, 0, 0, Math.PI * 2)
      ctx.fill()
      // Polar ice caps
      ctx.fillStyle = '#e8f8ff'
      ctx.fillRect(0, 0, w, 18)
      ctx.fillRect(0, h - 18, w, 18)
      // Swirling white clouds
      ctx.fillStyle = 'rgba(255, 255, 255, 0.42)'
      for (let i = 0; i < 18; i++) {
        ctx.beginPath()
        ctx.ellipse((i * 44) % w, (i * 25) % h, 40, 12, 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (type === 'mars') {
      // Rust orange/red desert
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#bd4620')
      grad.addColorStop(0.5, '#db6230')
      grad.addColorStop(1, '#9e3312')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      // Dark canyons and impact basins
      ctx.fillStyle = '#661f0d'
      for (let i = 0; i < 26; i++) {
        const rx = (i * 57) % w
        const ry = 30 + (i * 31) % (h - 60)
        ctx.beginPath()
        ctx.ellipse(rx, ry, 16 + (i % 12), 9 + (i % 8), i * 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      // Polar ice
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, 14)
      ctx.fillRect(0, h - 12, w, 12)
    } else if (type === 'saturn') {
      // Golden amber bands
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#c7923e')
      grad.addColorStop(0.2, '#f2ca6b')
      grad.addColorStop(0.4, '#deb25b')
      grad.addColorStop(0.6, '#f7d88b')
      grad.addColorStop(0.8, '#c99642')
      grad.addColorStop(1, '#9e6d24')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      for (let y = 0; y < h; y += 8) {
        ctx.fillStyle = y % 16 === 0 ? 'rgba(120, 75, 20, 0.18)' : 'rgba(255, 255, 255, 0.12)'
        ctx.fillRect(0, y, w, 4)
      }
    } else if (type === 'jupiter') {
      // Swirling gas bands of ochre, caramel, cream
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#a35022')
      grad.addColorStop(0.2, '#e09858')
      grad.addColorStop(0.35, '#fadbb4')
      grad.addColorStop(0.5, '#ba5c25')
      grad.addColorStop(0.65, '#f5d2a8')
      grad.addColorStop(0.85, '#b05721')
      grad.addColorStop(1, '#783510')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      // The Great Red Spot
      ctx.fillStyle = '#a82c16'
      ctx.beginPath()
      ctx.ellipse(w * 0.62, h * 0.60, 36, 22, -0.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fadbb4'
      ctx.lineWidth = 3
      ctx.stroke()
    } else if (type === 'neptune') {
      // Deep royal blue & azure ice storm
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#023e8a')
      grad.addColorStop(0.3, '#0077b6')
      grad.addColorStop(0.7, '#0096c7')
      grad.addColorStop(1, '#03045e')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(180, 240, 255, 0.52)'
      for (let i = 0; i < 16; i++) {
        ctx.beginPath()
        ctx.ellipse((i * 64) % w, 35 + (i * 28) % (h - 70), 55, 7, -0.05, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (type === 'sun') {
      // Solar fiery plasma
      const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2)
      grad.addColorStop(0, '#ffffff')
      grad.addColorStop(0.2, '#fff176')
      grad.addColorStop(0.5, '#ff9800')
      grad.addColorStop(0.85, '#ff3d00')
      grad.addColorStop(1, '#b71c1c')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(255, 255, 200, 0.35)'
      for (let i = 0; i < 30; i++) {
        ctx.beginPath()
        ctx.arc((i * 47) % w, (i * 33) % h, 14 + (i % 10), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  function createRingTexture(type = 'saturn') {
    const size = 256
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const ctx = cv.getContext('2d')
    const center = size / 2

    ctx.clearRect(0, 0, size, size)
    for (let r = center * 0.48; r < center * 0.96; r += 1.6) {
      const norm = (r - center * 0.48) / (center * 0.48)
      if (norm > 0.62 && norm < 0.68) continue // Cassini gap

      ctx.beginPath()
      ctx.arc(center, center, r, 0, Math.PI * 2)
      ctx.lineWidth = 1.8
      if (type === 'saturn') {
        const alpha = 0.35 + Math.sin(norm * Math.PI) * 0.5
        ctx.strokeStyle = `rgba(242, 202, 107, ${alpha})`
      } else {
        const alpha = 0.32 + Math.sin(norm * Math.PI) * 0.45
        ctx.strokeStyle = `rgba(100, 220, 255, ${alpha})`
      }
      ctx.stroke()
    }

    const tex = new THREE.CanvasTexture(cv)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  // =========================================================================
  // FLOATING SCORE 3D POPUPS
  // =========================================================================
  const popups = []
  function spawnScorePopup(x, z, text, isBloom, planetType) {
    const sprite = createTextSprite(text, isBloom)
    sprite.position.set(x, 0.95, z)
    scene.add(sprite)
    popups.push({
      sprite,
      t: 0,
      dur: 1.15,
      startX: x,
      startY: 0.95,
      startZ: z,
    })
  }

  // =========================================================================
  // PLANETARY TARGETS SYSTEM
  // =========================================================================
  const foodGroup = new THREE.Group()
  scene.add(foodGroup)

  // Holographic target beacon on the ground (flat at water level)
  const beaconMat = new THREE.MeshBasicMaterial({
    map: ringTexture(),
    color: 0x4eedb8,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const beaconMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), beaconMat)
  beaconMesh.rotation.x = -Math.PI / 2
  beaconMesh.position.y = 0.014
  foodGroup.add(beaconMesh)

  const planetsHolder = new THREE.Group()
  planetsHolder.position.y = 0.56
  foodGroup.add(planetsHolder)

  const planets = {}
  const sphereGeo = new THREE.SphereGeometry(0.38, 28, 20)

  // 1. EARTH
  const earthGroup = new THREE.Group()
  const earthMat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture('earth'),
    roughness: 0.35,
    metalness: 0.05,
    emissive: new THREE.Color(0x0e3860),
    emissiveIntensity: 0.2,
  })
  const earthMesh = new THREE.Mesh(sphereGeo, earthMat)
  earthGroup.add(earthMesh)
  // Atmosphere glow
  const earthGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softCircleTexture(1), color: 0x48cae4, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  earthGlow.scale.setScalar(1.4)
  earthGroup.add(earthGlow)
  // Orbiting Moon
  const moonOrbit = new THREE.Group()
  moonOrbit.rotation.z = 0.3
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 }),
  )
  moonMesh.position.set(0.72, 0, 0)
  moonOrbit.add(moonMesh)
  earthGroup.add(moonOrbit)
  planetsHolder.add(earthGroup)
  planets.earth = { group: earthGroup, mesh: earthMesh, moonOrbit, speed: 1.4 }

  // 2. MARS
  const marsGroup = new THREE.Group()
  const marsMat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture('mars'),
    roughness: 0.55,
    metalness: 0.05,
    emissive: new THREE.Color(0xbd4620),
    emissiveIntensity: 0.22,
  })
  const marsMesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 20), marsMat)
  marsGroup.add(marsMesh)
  const marsGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softCircleTexture(1), color: 0xe67e22, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  marsGlow.scale.setScalar(1.3)
  marsGroup.add(marsGlow)
  // Phobos & Deimos
  const marsOrbit = new THREE.Group()
  marsOrbit.rotation.x = 0.4
  const phobos = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }))
  phobos.position.set(0.56, 0, 0)
  const deimos = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa1887f }))
  deimos.position.set(-0.76, 0, 0)
  marsOrbit.add(phobos, deimos)
  marsGroup.add(marsOrbit)
  planetsHolder.add(marsGroup)
  planets.mars = { group: marsGroup, mesh: marsMesh, moonOrbit: marsOrbit, speed: 1.5 }

  // 3. SATURN
  const saturnGroup = new THREE.Group()
  const saturnMat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture('saturn'),
    roughness: 0.4,
    emissive: new THREE.Color(0xc7923e),
    emissiveIntensity: 0.2,
  })
  const saturnMesh = new THREE.Mesh(new THREE.SphereGeometry(0.36, 28, 20), saturnMat)
  saturnGroup.add(saturnMesh)
  // Iconic Tilted Rings
  const saturnRingMat = new THREE.MeshStandardMaterial({
    map: createRingTexture('saturn'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    roughness: 0.3,
  })
  const saturnRing = new THREE.Mesh(new THREE.RingGeometry(0.50, 1.02, 48), saturnRingMat)
  saturnRing.rotation.x = Math.PI / 2 + 0.45
  saturnRing.rotation.y = 0.2
  saturnGroup.add(saturnRing)
  const saturnGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softCircleTexture(1), color: 0xf1c40f, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  saturnGlow.scale.setScalar(1.5)
  saturnGroup.add(saturnGlow)
  planetsHolder.add(saturnGroup)
  planets.saturn = { group: saturnGroup, mesh: saturnMesh, ring: saturnRing, speed: 1.2 }

  // 4. JUPITER
  const jupiterGroup = new THREE.Group()
  const jupiterMat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture('jupiter'),
    roughness: 0.4,
    emissive: new THREE.Color(0xa35022),
    emissiveIntensity: 0.2,
  })
  const jupiterMesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 20), jupiterMat)
  jupiterGroup.add(jupiterMesh)
  // Polar Auroral Rings
  const auroraMat = new THREE.MeshStandardMaterial({
    color: 0x4eedb8,
    emissive: 0x4eedb8,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  })
  const northAurora = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 8, 28), auroraMat)
  northAurora.position.y = 0.41
  northAurora.rotation.x = Math.PI / 2
  const southAurora = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 8, 28), auroraMat)
  southAurora.position.y = -0.41
  southAurora.rotation.x = Math.PI / 2
  jupiterGroup.add(northAurora, southAurora)
  const jupiterGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softCircleTexture(1), color: 0xe09858, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  jupiterGlow.scale.setScalar(1.55)
  jupiterGroup.add(jupiterGlow)
  planetsHolder.add(jupiterGroup)
  planets.jupiter = { group: jupiterGroup, mesh: jupiterMesh, speed: 1.6 }

  // 5. NEPTUNE
  const neptuneGroup = new THREE.Group()
  const neptuneMat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture('neptune'),
    roughness: 0.3,
    emissive: new THREE.Color(0x0077b6),
    emissiveIntensity: 0.25,
  })
  const neptuneMesh = new THREE.Mesh(new THREE.SphereGeometry(0.36, 28, 20), neptuneMat)
  neptuneGroup.add(neptuneMesh)
  // Thin crystalline ice ring
  const neptuneRingMat = new THREE.MeshStandardMaterial({
    map: createRingTexture('neptune'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    roughness: 0.2,
  })
  const neptuneRing = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.70, 40), neptuneRingMat)
  neptuneRing.rotation.x = Math.PI / 2 + 0.52
  neptuneGroup.add(neptuneRing)
  const neptuneGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softCircleTexture(1), color: 0x00b4d8, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  neptuneGlow.scale.setScalar(1.4)
  neptuneGroup.add(neptuneGlow)
  planetsHolder.add(neptuneGroup)
  planets.neptune = { group: neptuneGroup, mesh: neptuneMesh, ring: neptuneRing, speed: 1.3 }

  // 6. SUN (SUPERNOVA / BLOOM BONUS X3)
  const sunGroup = new THREE.Group()
  const sunMat = new THREE.MeshStandardMaterial({
    map: createPlanetTexture('sun'),
    roughness: 0.1,
    emissive: new THREE.Color(0xff5722),
    emissiveIntensity: 3.6,
  })
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.44, 32, 24), sunMat)
  sunGroup.add(sunMesh)
  // Dual spinning solar plasma rings
  const plasmaMat1 = new THREE.MeshStandardMaterial({
    color: 0xffea00,
    emissive: 0xffea00,
    emissiveIntensity: 3.2,
    roughness: 0.2,
  })
  const plasmaRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.70, 0.022, 8, 36), plasmaMat1)
  plasmaRing1.rotation.x = Math.PI / 2.2
  const plasmaMat2 = new THREE.MeshStandardMaterial({
    color: 0xff1744,
    emissive: 0xff1744,
    emissiveIntensity: 3.2,
    roughness: 0.2,
  })
  const plasmaRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.02, 8, 36), plasmaMat2)
  plasmaRing2.rotation.x = Math.PI / 1.7
  sunGroup.add(plasmaRing1, plasmaRing2)
  const sunCorona = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softCircleTexture(1), color: 0xff9800, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  sunCorona.scale.setScalar(2.6)
  sunGroup.add(sunCorona)
  planetsHolder.add(sunGroup)
  planets.sun = { group: sunGroup, mesh: sunMesh, ring1: plasmaRing1, ring2: plasmaRing2, speed: 2.0 }

  // Point Light for active planet
  const foodLight = new THREE.PointLight(0x48cae4, 3.2, 9, 2)
  foodLight.position.set(0, 0.65, 0)
  planetsHolder.add(foodLight)

  let activePlanetKey = 'earth'
  let foodGlowMult = 1 // moon-phase multiplier for the food beacon light

  // Particle systems
  const burst = new ParticleField(scene, { capacity: 450, size: 0.24, additive: true })
  burst.gravity = -2.6
  const falls = new ParticleField(scene, { capacity: 160, size: 0.45, additive: true })
  falls.gravity = -1.0

  const garden = {
    moonGroup,

    setFood(x, z, bloom, planetType = 'earth') {
      foodGroup.visible = true
      foodGroup.position.set(x, 0.02, z)

      const activeKey = bloom ? 'sun' : (planetType || 'earth')
      activePlanetKey = activeKey

      for (const [key, planetObj] of Object.entries(planets)) {
        planetObj.group.visible = key === activeKey
      }

      // Adapt light color & beacon to active planet
      if (activeKey === 'sun') {
        foodLight.color.set(0xff9800)
        foodLight.intensity = 4.5
        beaconMat.color.set(0xff9800)
      } else if (activeKey === 'earth') {
        foodLight.color.set(0x00b4d8)
        foodLight.intensity = 3.2
        beaconMat.color.set(0x00b4d8)
      } else if (activeKey === 'mars') {
        foodLight.color.set(0xff5722)
        foodLight.intensity = 3.0
        beaconMat.color.set(0xff5722)
      } else if (activeKey === 'saturn') {
        foodLight.color.set(0xffca28)
        foodLight.intensity = 3.2
        beaconMat.color.set(0xffca28)
      } else if (activeKey === 'jupiter') {
        foodLight.color.set(0xffa726)
        foodLight.intensity = 3.2
        beaconMat.color.set(0xffa726)
      } else if (activeKey === 'neptune') {
        foodLight.color.set(0x29b6f6)
        foodLight.intensity = 3.2
        beaconMat.color.set(0x29b6f6)
      }
      foodLight.intensity *= foodGlowMult // new moon: food shines brighter in the dark
    },

    // Moon-phase control: how strongly the food beacon glows (1 = normal)
    setFoodGlow(mult) {
      const next = mult > 0 ? mult : 1
      if (foodGroup.visible) foodLight.intensity = (foodLight.intensity / foodGlowMult) * next
      foodGlowMult = next
    },

    hideFood() {
      foodGroup.visible = false
    },

    addRipple(x, z, maxScale = 2.4, color = 0x6eedc4) {
      spawnRipple(x, z, maxScale, 1.0, color)
    },

    burstAt(x, y, z, bloom, planetType = 'earth', delta = null) {
      if (reduced) return
      const activeKey = bloom ? 'sun' : (planetType || 'earth')

      const planetNames = {
        earth: 'EARTH',
        mars: 'MARS',
        saturn: 'SATURN',
        jupiter: 'JUPITER',
        neptune: 'NEPTUNE',
        sun: 'SUPERNOVA!',
      }
      const pts = delta ?? (bloom ? 3 : 1) // moon phase can change the score value
      const label = `+${pts} ${planetNames[activeKey] || ''}`.trim()
      spawnScorePopup(x, z, label, bloom, activeKey)

      const rippleColor = bloom
        ? 0xff9800
        : activeKey === 'earth'
        ? 0x00b4d8
        : activeKey === 'mars'
        ? 0xff5722
        : activeKey === 'saturn'
        ? 0xffca28
        : activeKey === 'jupiter'
        ? 0xffa726
        : 0x29b6f6

      spawnRipple(x, z, bloom ? 4.5 : 3.2, 1.2, rippleColor)
      setTimeout(() => spawnRipple(x, z, bloom ? 3.4 : 2.4, 1.0, 0xffffff), 130)

      const colA = bloom
        ? new THREE.Color(0xffea00)
        : activeKey === 'earth'
        ? new THREE.Color(0x70d6ff)
        : activeKey === 'mars'
        ? new THREE.Color(0xff7043)
        : activeKey === 'saturn'
        ? new THREE.Color(0xffe082)
        : activeKey === 'jupiter'
        ? new THREE.Color(0xffcc80)
        : new THREE.Color(0x80d8ff)

      const colB = bloom
        ? new THREE.Color(0xff3d00)
        : activeKey === 'earth'
        ? new THREE.Color(0x2ecc71)
        : activeKey === 'mars'
        ? new THREE.Color(0xd84315)
        : activeKey === 'saturn'
        ? new THREE.Color(0xffa726)
        : activeKey === 'jupiter'
        ? new THREE.Color(0xe65100)
        : new THREE.Color(0x0288d1)

      burst.spawn({
        at: new THREE.Vector3(x, y + 0.1, z),
        count: bloom ? 42 : 24,
        speed: bloom ? 4.4 : 3.2,
        upBias: 1.4,
        life: 1.0,
        colorA: colA,
        colorB: colB,
      })
    },

    petalFall() {
      if (reduced) return
      const at = new THREE.Vector3()
      for (let i = 0; i < 40; i++) {
        at.set((Math.random() - 0.5) * 18, 6.5 + Math.random() * 3, (Math.random() - 0.5) * 18)
        falls.spawn({
          at,
          count: 1,
          speed: 0.65,
          upBias: 0,
          life: 2.6,
          colorA: new THREE.Color(CREAM),
          colorB: new THREE.Color(0xf5b5c0),
        })
      }
    },

    update(dt) {
      time.t += dt
      const nowT = time.t

      // Active planet self-rotation & moon orbits
      const cur = planets[activePlanetKey]
      if (cur) {
        cur.mesh.rotation.y += dt * (cur.speed || 1.2)
        if (cur.moonOrbit) cur.moonOrbit.rotation.y += dt * 2.2
        if (cur.ring1) cur.ring1.rotation.z += dt * 1.8
        if (cur.ring2) cur.ring2.rotation.z -= dt * 2.2
      }

      // Smooth floating bobbing of the planet
      planetsHolder.position.y = 0.56 + Math.sin(nowT * 2.5) * 0.06
      beaconMesh.rotation.z = nowT * 0.4
      beaconMat.opacity = 0.65 + Math.sin(nowT * 3.2) * 0.2

      if (!reduced) {
        // Floating petals animation
        for (let i = 0; i < PETALS; i++) {
          const d = petalData[i]
          const ph = nowT * d.speed + d.phase
          v4.set(
            d.base.x + Math.sin(ph * 1.3) * d.sway,
            d.base.y + Math.sin(ph * 2.1) * 0.15,
            d.base.z + Math.cos(ph) * d.sway,
          )
          e4.set(ph * 0.35 + d.phase, d.phase + Math.sin(ph) * 0.4, d.rot)
          q4.setFromEuler(e4)
          s4.setScalar(d.scale)
          m4.compose(v4, q4, s4)
          petalMesh.setMatrixAt(i, m4)
        }
        petalMesh.instanceMatrix.needsUpdate = true

        // Fireflies dancing
        const posAttr = fireflyGeo.attributes.position
        for (let i = 0; i < FIREFLIES; i++) {
          const f = fireflyData[i]
          const ang = nowT * f.speed + f.phase
          const fx = f.x + Math.sin(ang) * f.radius
          const fy = f.y + Math.sin(ang * 1.8) * 0.3
          const fz = f.z + Math.cos(ang) * f.radius
          posAttr.setXYZ(i, fx, fy, fz)
        }
        posAttr.needsUpdate = true

        // Update water ripples
        for (const r of ripples) {
          if (r.life > 0) {
            r.life -= dt
            const progress = 1 - r.life / r.maxLife
            const curScale = THREE.MathUtils.lerp(0.2, r.maxScale, Math.sqrt(progress))
            r.mesh.scale.setScalar(curScale)
            r.mat.opacity = Math.max(0, (1 - progress) * 0.8)
            if (r.life <= 0) r.mesh.visible = false
          }
        }

        // Update floating score popups
        for (let i = popups.length - 1; i >= 0; i--) {
          const p = popups[i]
          p.t += dt
          const prog = p.t / p.dur
          if (prog >= 1) {
            scene.remove(p.sprite)
            p.sprite.material.map?.dispose() // CanvasTexture per popup — must be freed, not just the material
            p.sprite.material.dispose()
            popups.splice(i, 1)
          } else {
            p.sprite.position.y = p.startY + Math.sin(prog * Math.PI * 0.5) * 1.4
            p.sprite.material.opacity = Math.max(0, 1 - prog * prog)
            const scaleFactor = THREE.MathUtils.lerp(1.2, 0.85, prog)
            p.sprite.scale.set(2.4 * scaleFactor, 0.9 * scaleFactor, 1)
          }
        }
      }

      burst.update(dt, nowT)
      falls.update(dt, nowT)
      moonGroup.lookAt(time.cam)
    },
  }

  Object.defineProperty(garden, 'camera', {
    set(v) {
      time.cam.copy(v)
    },
  })

  return garden
}
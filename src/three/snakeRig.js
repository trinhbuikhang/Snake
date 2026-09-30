import * as THREE from 'three'

const ROSE = new THREE.Color(0xd47585)
const ROSE_HEAD = new THREE.Color(0xe88a9a)
const ROSE_TAIL = new THREE.Color(0x993d52)
const CREAM = new THREE.Color(0xfff5ea)
const INK = new THREE.Color(0x0a1411)
const JADE_GLOW = new THREE.Color(0x4eedb8)
const GOLD_PULSE = new THREE.Color(0xffd54f)

const MAX_SEGMENTS = 300
const BODY_Y = 0.36
const HEAD_Y = 0.50
const HEAD_R = 0.64
const BODY_R = 0.58
const TAIL_R = 0.44

const easeOutQuad = (t) => 1 - (1 - t) * (1 - t)
const easeOutCubic = (t) => {
  const u = 1 - t
  return 1 - u * u * u
}

function roundedSphereGeometry(segIndex = 0, total = 30) {
  // Sphere with gradient vertex colors: rose on top, cream on underside
  const geo = new THREE.SphereGeometry(1, 24, 18)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)

  const t = segIndex / Math.max(total, 1)
  const topColor = ROSE_HEAD.clone().lerp(ROSE_TAIL, t)

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const mix = THREE.MathUtils.smoothstep(y, -0.65, 0.45)
    const c = topColor.clone().lerp(CREAM, 1 - mix)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

function bodyMaterial() {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.95,
    clearcoatRoughness: 0.14,
    emissive: new THREE.Color(0xd47585),
    emissiveIntensity: 0.18,
  })
}

function eyeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.8,
    roughness: 0.2,
  })
}

function pupilMaterial() {
  return new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 })
}

export function createSnakeRig(scene) {
  const sharedGeo = roundedSphereGeometry(5, 30)
  const sharedMat = bodyMaterial()

  // Scale ridge geometry (dorsal gem on each segment)
  const ridgeGeo = new THREE.OctahedronGeometry(0.12, 0)
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: 0xffe082,
    emissive: 0x4eedb8,
    emissiveIntensity: 0.85,
    roughness: 0.2,
  })

  const bodyMeshes = []
  const bodyRidges = []

  for (let i = 0; i < MAX_SEGMENTS; i++) {
    const m = new THREE.Mesh(sharedGeo, sharedMat.clone())
    m.visible = false
    m.castShadow = true
    scene.add(m)
    bodyMeshes.push(m)

    // Dorsal scale crest on each body segment
    const ridge = new THREE.Mesh(ridgeGeo, ridgeMat)
    ridge.position.y = 0.88
    ridge.scale.set(0.8, 1.4, 0.8)
    m.add(ridge)
    bodyRidges.push(ridge)
  }

  // ---- HEAD ----
  const head = new THREE.Group()
  const headMesh = new THREE.Mesh(sharedGeo, sharedMat.clone())
  headMesh.scale.set(HEAD_R * 1.05, HEAD_R * 0.86, HEAD_R * 1.1)
  headMesh.castShadow = true
  head.add(headMesh)

  // Cute glowing dragon/serpent crest on forehead
  const crestGeo = new THREE.ConeGeometry(0.08, 0.28, 4)
  const crestMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: JADE_GLOW,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  })
  const crest = new THREE.Mesh(crestGeo, crestMat)
  crest.position.set(0, 0.44, 0.1)
  crest.rotation.x = -0.35
  head.add(crest)

  // Little side horns
  for (const sx of [-0.24, 0.24]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), crestMat)
    horn.position.set(sx, 0.38, -0.05)
    horn.rotation.z = sx < 0 ? 0.4 : -0.4
    horn.rotation.x = -0.2
    head.add(horn)
  }

  // Cute expressive anime/chibi eyes
  const eyeGeo = new THREE.SphereGeometry(0.12, 16, 12)
  const pupilGeo = new THREE.SphereGeometry(0.065, 12, 10)
  const highlightGeo = new THREE.SphereGeometry(0.024, 8, 8)

  const eyeMat = eyeMaterial()
  const pupilMat = pupilMaterial()
  const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff })

  const eyes = []
  for (const sx of [-0.22, 0.22]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.scale.set(0.85, 1.25, 0.65)
    eye.position.set(sx, 0.24, 0.46)
    head.add(eye)

    const pupil = new THREE.Mesh(pupilGeo, pupilMat)
    pupil.position.set(sx, 0.25, 0.52)
    head.add(pupil)

    // Eye catch-light (sparkle)
    const hi = new THREE.Mesh(highlightGeo, hiMat)
    hi.position.set(sx + (sx > 0 ? 0.02 : -0.02), 0.27, 0.55)
    head.add(hi)

    eyes.push(eye)
  }

  // Cute smile
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.024, 10, 24, Math.PI),
    new THREE.MeshStandardMaterial({ color: INK, roughness: 0.6 }),
  )
  smile.position.set(0, -0.08, 0.55)
  smile.rotation.z = Math.PI
  head.add(smile)

  // Flickering forked tongue
  const tongue = new THREE.Group()
  const forkGeo = new THREE.BoxGeometry(0.018, 0.012, 0.28)
  const forkMat = new THREE.MeshStandardMaterial({ color: 0xba3c58, roughness: 0.4 })
  for (const sx of [-0.022, 0.022]) {
    const fork = new THREE.Mesh(forkGeo, forkMat)
    fork.position.set(sx, 0, 0.12)
    fork.rotation.y = sx < 0 ? -0.18 : 0.18
    tongue.add(fork)
  }
  tongue.position.set(0, -0.22, 0.5)
  head.add(tongue)

  scene.add(head)

  // Digestion pulses queue
  const eatPulses = []

  const rig = {
    cur: [],
    prev: [],
    yawView: 0,
    yawTarget: 0,
    rollView: 0,
    flick: 0,
    chomp: 0,
    death: null,
    group: head,

    setSnapshots(prev, cur) {
      rig.prev = prev
      rig.cur = cur
    },

    setDir(dx, dz) {
      const prevYaw = rig.yawTarget
      rig.yawTarget = Math.atan2(dx, dz)
      // Calculate angular delta for banking roll
      let diff = rig.yawTarget - prevYaw
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      rig.rollView = -Math.max(-0.45, Math.min(0.45, diff * 0.8))
    },

    onStep() {
      rig.flick = 1
    },

    onEat() {
      rig.chomp = 1.35 // Chomp squash & stretch
      eatPulses.push({ progress: 0, speed: 14 }) // Speed of digestion wave down body
    },

    startDeath(pose, center) {
      rig.death = { pose, center, t: 0 }
    },

    advanceDeath(dt, duration, reduced) {
      if (!rig.death) return
      rig.death.t = Math.min(1, rig.death.t + (reduced ? dt / Math.max(duration / 2, 0.001) : dt / duration))
    },

    reset(length) {
      rig.death = null
      rig.flick = 0
      rig.chomp = 0
      eatPulses.length = 0
      if (length) for (let i = 0; i < MAX_SEGMENTS; i++) bodyMeshes[i].visible = i < length - 1
    },

    deathCoil(i, n) {
      const d = rig.death
      const ring = Math.floor(i / 7)
      const k = i % 7
      const r = 0.46 + ring * 0.6 + k * 0.06
      const ang = i * 0.82 + ring * 0.44
      const y = 0.06 + ring * 0.08 + (k === 0 ? 0.02 : 0)
      return {
        x: d.center.x + Math.cos(ang) * r,
        y,
        z: d.center.z + Math.sin(ang) * r,
      }
    },

    paint({ cur, prev, t, death, animT, dt, isBoosting = false }) {
      const n = cur.length
      const liveBob = Math.sin(animT * 2.8) * 0.025
      rig.yawView = THREEEaseAngle(rig.yawView, rig.yawTarget, dt, 14)
      rig.rollView = THREE.MathUtils.lerp(rig.rollView, 0, dt * 5)
      rig.flick = Math.max(0, rig.flick - dt * 4.5)
      rig.chomp = Math.max(0, rig.chomp - dt * 3.8)

      tongue.scale.z = 1 + rig.flick * 0.85
      tongue.position.y = -0.22 + Math.sin(animT * 12) * 0.02 * rig.flick

      // Advance digestion pulse waves
      for (let p = eatPulses.length - 1; p >= 0; p--) {
        eatPulses[p].progress += dt * eatPulses[p].speed
        if (eatPulses[p].progress > n + 3) {
          eatPulses.splice(p, 1)
        }
      }

      // Head chomp bounce
      const headScaleBump = 1 + Math.sin(rig.chomp * Math.PI) * 0.22
      headMesh.scale.set(HEAD_R * 1.05 * headScaleBump, HEAD_R * 0.86 * headScaleBump, HEAD_R * 1.1 * headScaleBump)

      for (let i = 0; i < n; i++) {
        const c = cur[i]
        const p = prev[Math.min(i, prev.length - 1)]
        const px = p ? p.x : c.x
        const pz = p ? p.z : c.z
        const bt = easeOutQuad(t)
        let x = px + (c.x - px) * bt
        let z = pz + (c.z - pz) * bt
        let y = (i === 0 ? HEAD_Y : BODY_Y) + liveBob * (i === 0 ? 0.5 : 1)

        // Calculate digestion wave bulge on segment i
        let digestionBulge = 1
        for (const pulse of eatPulses) {
          const dist = Math.abs(pulse.progress - i)
          if (dist < 1.8) {
            const wave = 1 - dist / 1.8
            digestionBulge = Math.max(digestionBulge, 1 + wave * 0.28)
          }
        }

        if (death) {
          const dc = rig.deathCoil(i, n)
          const e = easeOutCubic(death.t)
          const bounce = Math.sin(Math.min(death.t, 1) * Math.PI) * 0.24 * (1 - death.t * 0.6)
          x = x + (dc.x - x) * e
          z = z + (dc.z - z) * e
          y = y + (dc.y + bounce - y) * e
        }

        if (i === 0) {
          head.position.set(x, y + 0.05 + Math.sin(animT * 2.6) * 0.02, z)
          head.rotation.y = rig.yawView
          head.rotation.z = rig.rollView
        } else {
          const m = bodyMeshes[i - 1]
          m.visible = true

          // Graceful taper from head to tail
          const baseR = BODY_R - (BODY_R - TAIL_R) * (i / Math.max(n - 1, 1))
          const finalR = baseR * digestionBulge

          m.position.set(x, y + Math.sin(animT * 2.8 + i * 0.48) * 0.015, z)
          m.scale.set(finalR, finalR * 0.84, finalR)

          // Glowing pulse on digestion
          if (digestionBulge > 1.05) {
            m.material.emissive.copy(GOLD_PULSE)
            m.material.emissiveIntensity = 0.65
          } else {
            m.material.emissive.set(0xd47585)
            m.material.emissiveIntensity = isBoosting ? 0.38 : 0.18
          }
        }
      }

      for (let i = n; i <= MAX_SEGMENTS; i++) {
        if (bodyMeshes[i - 1]) bodyMeshes[i - 1].visible = false
      }
    },
  }

  function THREEEaseAngle(cur, target, dt, speed) {
    let d = target - cur
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return cur + d * Math.min(1, dt * speed)
  }

  return rig
}

export { easeOutQuad }
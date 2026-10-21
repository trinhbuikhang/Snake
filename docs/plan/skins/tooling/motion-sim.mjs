// Drive the real snakeRig.paint() at a 60Hz display with the engine's own accum/interval math
import * as THREE from '/workspace/snake-perf/node_modules/three/build/three.module.js'
import { createSnakeRig } from '/workspace/snake-perf/src/three/snakeRig.js'
const scene = new THREE.Scene()
const rig = createSnakeRig(scene)
const interval = 0.165, fps = +process.argv[2] || 60, dt = 1 / fps
let cur = [{x:0,z:0},{x:-1,z:0},{x:-2,z:0}], prev = cur.map(c=>({...c}))
let accum = 0, last = null, out = []
for (let f = 0; f < Math.round(fps * interval * 3); f++) {
  accum += dt
  while (accum >= interval) { prev = cur.map(c=>({...c})); cur = cur.map(c=>({x:c.x+1,z:c.z})); accum -= interval }
  rig.paint({ cur, prev, t: Math.min(1, accum/interval), death:null, animT:f*dt, dt, isBoosting:false })
  const x = rig.group.position.x
  if (last !== null) out.push((x-last)/dt)
  last = x
}
const avg = 1/interval
console.log(`fps=${fps} interval=${interval}s  avg speed=${avg.toFixed(2)} cells/s`)
console.log('per-frame head speed (cells/s):', out.map(v=>v.toFixed(1)).join(' '))
console.log(`min=${Math.min(...out).toFixed(2)} max=${Math.max(...out).toFixed(2)} ratio max/avg=${(Math.max(...out)/avg).toFixed(2)}`)

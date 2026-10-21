// REFERENCE PROTOTYPE — not part of src/. Port it into PR-sized tasks per docs/plan/SKINS_PERF_PLAN.md.
// Skin rig registry (3D side). Data (names, unlock rules) lives in game/skins.js.
import { createMoonJadeRig } from './moonJade.js'
import { createPlushMoonRig } from './plushMoon.js'

export const SKIN_RIGS = {
  moonJade: createMoonJadeRig,
  plushMoon: createPlushMoonRig,
}

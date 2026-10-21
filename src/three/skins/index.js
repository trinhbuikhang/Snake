// Skin rig registry (3D side). Skin data (names, unlock rules)
// lives in game/skins.js.
import { createMoonJadeRig } from './moonJade.js'
import { createPlushMoonRig } from './plushMoon.js'

export const SKIN_RIGS = {
  moonJade: createMoonJadeRig,
  plushMoon: createPlushMoonRig,
}

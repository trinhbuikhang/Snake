// Skin rig registry (3D side). Skin data (names, unlock rules) will
// live in game/skins.js from S04.
import { createMoonJadeRig } from './moonJade.js'
import { createPlushMoonRig } from './plushMoon.js'

export const SKIN_RIGS = {
  moonJade: createMoonJadeRig,
  plushMoon: createPlushMoonRig,
}

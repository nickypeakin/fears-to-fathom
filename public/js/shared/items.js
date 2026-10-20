// Things that can be picked up and carried, and where they start.

import { CAB_Y, PLACES, KEY_HOOK, DESK } from './layout.js';

export const ITEMS = {
  box: { name: 'a box of supplies', heavy: true },
  jug: { name: 'the water jug', heavy: true },
  fuel: { name: 'the fuel can', heavy: true },
  binocs: { name: 'the binoculars', heavy: false },
  keys: { name: 'the truck keys', heavy: false },
  jar: { name: 'the jar', heavy: false },
};

const T = PLACES.truck;
// [kind, x, y, z, state]: the supplies ride up in the truck bed; the
// binoculars are on the desk, the keys on their hook, the fuel in the shed
export const START_ITEMS = [
  ['box', T.x - 0.45, 0.98, T.z + 2.05, 0],
  ['box', T.x + 0.45, 0.98, T.z + 2.05, 0],
  ['box', T.x - 0.4, 0.98, T.z + 1.3, 0],
  ['jug', T.x + 0.45, 0.98, T.z + 1.3, 1],
  ['binocs', DESK.x + 0.62, CAB_Y + 0.78, DESK.z + 0.15, 0],
  ['keys', KEY_HOOK.x, KEY_HOOK.y - 0.09, KEY_HOOK.z - 0.02, 0],
  ['fuel', PLACES.shed.x - 0.7, 0.93, PLACES.shed.z - 0.72, 1],
];

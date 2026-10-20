// Tuning numbers shared by the host simulation and every client.

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'gsgs-cinder-';
// bump whenever host and guest messages change: mismatched copies refuse to mix
export const PROTOCOL = 2;

// people
export const PLAYER_R = 0.24;
export const EYE = 1.6;
export const WALK = 2.3;
export const SPRINT = 4.1;
export const CARRY_SPEED = 0.75;    // walking pace while carrying something heavy
export const STAMINA_MAX = 5;       // seconds of sprinting
export const STAMINA_REGEN = 0.75;  // seconds of stamina regained per second
export const STEP_UP = 0.55;        // highest step you can walk up
export const GRAVITY = 16;
export const REACH = 2.2;           // how far away you can use things

// how far from the tower anyone may wander before the forest turns them back
export const BOUNDS_R = 132;

// the opening: the drive up the mountain and the ranger handing over the keys
export const INTRO_LEN = 52;

// him
export const WADE = {
  radius: 0.3,
  walk: 1.45,
  chase: 3.3,           // slower than a sprint, faster than a walk
  catchDist: 0.85,
  seeDark: 10,          // how far he spots you in the dark
  seeLit: 30,           // ... with your flashlight on
  seeDay: 45,
  fov: 0.45,            // cos of half his field of view
  giveUp: 5,            // seconds without seeing you before he stops chasing
};

// simulation
export const TICK = 1 / 20;
export const SNAP_EVERY = 3;        // ticks between snapshots (about 15 Hz)

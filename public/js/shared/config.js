// Tuning numbers shared by the host simulation and every client.

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'gsgs-floor50-';
// bump whenever host and guest messages change: mismatched copies refuse to mix
export const PROTOCOL = 1;

// people
export const PLAYER_R = 0.24;
export const EYE = 1.6;
export const WALK = 2.2;
export const SPRINT = 3.8;
export const STAMINA_MAX = 4;       // seconds of sprinting
export const STAMINA_REGEN = 0.7;   // seconds of stamina regained per second
export const BREATH_MAX = 7;        // seconds you can hold your breath while hiding

// the night runs from 8 PM to 6 AM: NIGHT_LEN seconds of play
export const NIGHT_LEN = 600;
export const NIGHT_START_HOUR = 20;
export const NIGHT_HOURS = 10;

// the opening: street, lobby, elevator, the walk to the door, the lock
export const INTRO_LEN = 56;

// him, at the door
export const KNOCKING = {
  stages: [14, 28, 42],  // seconds of being ignored before he knocks harder, bangs, then forces the lock
  force: 4,              // lock damage per second while he forces it (the lock starts at 100)
  unlockedRattle: 3,     // seconds after he finds the deadbolt open before the door gives
  chainHold: 3.2,        // seconds the chain holds against someone pushing
};

// him, inside
export const STALKER = {
  radius: 0.3,
  prowl: 1.35,
  chase: 3.3,
  catchDist: 0.72,
  seeDark: 5,            // how far he can see you in the dark
  seeLit: 13,            // ... with your flashlight on
  fov: 0.55,             // cos of half his field of view
  hearBreath: 2.6,       // he hears breathing from a hiding spot this close
  giveUp: 3.5,           // seconds without seeing you before he stops chasing
  hunt: 48,              // seconds he spends inside before he leaves
  rise: 6,               // seconds after he gets in before he starts looking
};

// simulation
export const TICK = 1 / 20;
export const SNAP_EVERY = 3;        // ticks between snapshots (about 15 Hz)

// Start-up and menu flow: title screen, solo / host / join, lobby, the
// night itself, pause and results.

import * as THREE from 'three';
import { Post } from './client/post.js';
import { Input } from './client/input.js';
import { Hud, showScreen, screenShown, renderLobby, renderResults, setMsg } from './client/ui.js';
import { HostLink, GuestLink, testConnection } from './client/net.js';
import { Tower } from './client/world.js';
import { Backdrop } from './client/city.js';
import { Ground } from './client/ground.js';
import { Game } from './client/game.js';
import { makePerson, LOOKS } from './client/humans.js';
import { Attract } from './client/attract.js';
import { sound } from './client/audio.js';
import { voice } from './client/voice.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch {
  setMsg('titleMsg', 'Your browser could not start WebGL, which this game needs. Try Chrome, Edge or Firefox on a computer.');
  throw new Error('WebGL unavailable');
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
const post = new Post(renderer);
const input = new Input(canvas);
const hud = new Hud();
// generating the city takes a moment: say so before the page goes quiet
showScreen('loading');
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
const world = new Tower(renderer);
let ground = null;
const attract = new Attract(world);

// ------------------------------------------------------------- settings --
const params = new URLSearchParams(location.search);
const SETTINGS_KEY = 'floor-50';
const settings = { name: '', sens: 1, vol: 0.8, invert: false, voices: true, grain: true, graphics: 'auto' };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ } };
sound.volume = settings.vol;
voice.volume = settings.vol;
voice.enabled = settings.voices && !params.has('autotest');
post.grainOn = settings.grain;

const DEFAULT_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Taylor'];
$('name').value = settings.name || DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
$('sens').value = settings.sens;
$('vol').value = settings.vol;
$('invert').checked = settings.invert;
$('voices').checked = settings.voices;
$('grain').checked = settings.grain;
$('sens').addEventListener('input', (e) => { settings.sens = +e.target.value; save(); });
$('vol').addEventListener('input', (e) => { settings.vol = +e.target.value; sound.setVolume(settings.vol); voice.volume = settings.vol; save(); });
$('invert').addEventListener('change', (e) => { settings.invert = e.target.checked; save(); });
$('voices').addEventListener('change', (e) => { settings.voices = e.target.checked; voice.enabled = settings.voices; if (!settings.voices) voice.stop(); save(); });
$('grain').addEventListener('change', (e) => { settings.grain = e.target.checked; post.grainOn = settings.grain; save(); });
$('graphics').value = settings.graphics;
$('graphics').addEventListener('change', (e) => { settings.graphics = e.target.value; save(); applyGraphics(); });

const invited = (params.get('join') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
if (invited) $('code').value = invited;
document.fonts?.load('40px "Special Elite"').catch(() => {});

// ---------------------------------------------------------------- state --
let link = null;
let game = null;
let solo = false;
let backTo = 'title';
let paused = false;

// Graphics: 'auto' adapts the resolution to the computer, 'high' starts
// sharp and keeps more detail, 'low' is for older laptops (smaller picture,
// no shadows, no glow). `?scale=0.5` fixes the resolution (used by tests).
const PRESETS = {
  auto: { start: 0.85, min: 0.5, max: 1, maxDpr: 1.25, samples: 2, bloom: true, shadows: true, sky: { size: 768, every: 2 } },
  high: { start: 1, min: 0.7, max: 1, maxDpr: 1.5, samples: 4, bloom: true, shadows: true, sky: { size: 1024, every: 1 } },
  low: { start: 0.6, min: 0.45, max: 0.75, maxDpr: 1, samples: 0, bloom: false, shadows: false, sky: { size: 512, every: 3 } },
};
const fixedScale = Number(params.get('scale')) || 0;
let preset = PRESETS[settings.graphics] || PRESETS.auto;
let quality = fixedScale || preset.start;
let frameAvg = 1 / 60, judgeT = 0, calmT = 0;

function applyGraphics() {
  preset = PRESETS[settings.graphics] || PRESETS.auto;
  quality = fixedScale || preset.start;
  post.configure(preset);
  Backdrop.configure(preset.sky);
  if (renderer.shadowMap.enabled !== preset.shadows) {
    renderer.shadowMap.enabled = preset.shadows;
    // every material has to be rebuilt with (or without) shadows
    for (const sc of [world.scene, ground && ground.scene]) sc?.traverse((o) => {
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }
  frameAvg = 1 / 60;
  calmT = 0;
  resize();
}

// If frames take too long the picture renders at a lower resolution, and
// climbs back once there's headroom.
function adaptQuality(dt) {
  if (fixedScale) return;
  frameAvg += (dt - frameAvg) * 0.08;
  judgeT += dt;
  calmT += dt;
  if (judgeT < 1.2) return;
  judgeT = 0;
  let next = quality;
  if (frameAvg > 1 / 48 && quality > preset.min) { next = Math.max(preset.min, quality - (frameAvg > 1 / 30 ? 0.2 : 0.1)); calmT = 0; }
  else if (frameAvg < 1 / 58 && quality < preset.max && calmT > 6) { next = Math.min(preset.max, quality + 0.05); calmT = 0; }
  if (next !== quality) {
    quality = next;
    post.setSize(innerWidth, innerHeight, quality);
  }
}

function resize() {
  const w = innerWidth, h = innerHeight;
  post.setSize(w, h, quality);
  attract.resize(w, h);
  if (game) game.resize(w, h);
}
addEventListener('resize', resize);
post.configure(preset);
Backdrop.configure(preset.sky);
renderer.shadowMap.enabled = preset.shadows;
resize();

// Compile every shader the night will need now, while the title is up, so
// the first visitor (or the lights going out) doesn't stall the game.
function prewarm(scene, camera) {
  const people = new THREE.Group();
  Object.keys(LOOKS).forEach((k, i) => {
    const p = makePerson(k);
    p.position.set(i * 0.8, -60, 0);
    if (k === 'neighbor') p.userData.rig.setPossessed(true);
    people.add(p);
  });
  scene.add(people);
  renderer.compile(scene, camera);
  scene.remove(people);
}
prewarm(world.scene, attract.camera);
// build the street for the opening while nobody's doing anything
function buildGround() {
  if (ground) return;
  ground = new Ground(renderer);
  prewarm(ground.scene, attract.camera);
}
setTimeout(() => (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(buildGround), 2500);

function playerName() {
  const n = $('name').value.trim() || 'Friend';
  settings.name = n;
  save();
  return n;
}

// the title screen breathes once the browser lets us make sound
addEventListener('pointerdown', () => {
  if (!sound.ready) { sound.init(); sound.setVolume(settings.vol); }
  if (!game) sound.setScene('title', 2);
}, { once: true });

function begin() {
  sound.init();
  sound.setVolume(settings.vol);
  if (link) link.close();
  link = null;
  setMsg('titleMsg', '');
  setMsg('lobbyMsg', '');
}

function wire(l) {
  l.on('lobby', (m) => {
    if (l !== link || game || solo) return;
    showScreen('lobby');
    renderLobby(m, l.id);
    showInvite(m);
  });
  l.on('status', (m) => { if (l === link && !game) setMsg(l.isHost ? 'lobbyMsg' : guestMsgId(), m.text); });
  l.on('start', (m) => { if (l === link) startGame(m); });
  l.on('over', (m) => { if (l === link) endGame(m.results, m.dawn); });
  l.on('closed', (m) => { if (l === link) { leave(); setMsg('titleMsg', m.text); } });
  l.on('neterror', (m) => { if (l === link) setMsg('lobbyMsg', m.text); });
}

const actions = {
  solo() {
    begin();
    solo = true;
    link = new HostLink(playerName());
    wire(link);
    link.send({ t: 'start', fill: true });
  },
  host() {
    begin();
    solo = false;
    link = new HostLink(playerName(), { online: true });
    wire(link);
    showScreen('lobby');
  },
  join() {
    const code = $('code').value.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 5) { setMsg('titleMsg', 'Lobby codes are 5 letters.', 'bad'); return; }
    begin();
    solo = false;
    const btn = $('inviteBtn');
    const msgId = guestMsgId();
    const l = (link = new GuestLink(playerName(), code));
    wire(l);
    btn.disabled = true;
    btn.textContent = 'JOINING...';
    l.connect().then(() => setMsg(msgId, '')).catch((e) => {
      if (link === l) link = null;
      setMsg(msgId, e.message, 'bad');
    }).finally(() => {
      btn.disabled = false;
      btn.textContent = 'TRY AGAIN';
    });
  },
  // from an invite link: one button, straight into the friend's lobby
  inviteJoin() {
    $('name').value = $('inviteName').value;
    $('code').value = invited;
    actions.join();
  },
  async nettest() {
    const id = screenShown('invite') ? 'inviteMsg' : 'titleMsg';
    setMsg(id, 'Testing your connection (this takes about 10 seconds)...');
    const r = await testConnection();
    if (!r.webrtc) setMsg(id, "This browser can't do online play. Try Chrome, Edge or Firefox.", 'bad');
    else if (!r.server) setMsg(id, "Can't reach the matchmaking server (0.peerjs.com). This network, an ad blocker or a school/work filter is blocking it. Try another network or a phone hotspot.", 'bad');
    else if (r.relay) setMsg(id, 'Online play should work on this network.', 'good');
    else if (r.direct) setMsg(id, "Online play should work with most friends. If it doesn't, one of you is probably on a school or work network: try a phone hotspot.", 'good');
    else setMsg(id, 'This network blocks the connections online play needs (common on school and work Wi-Fi). Try a different network or a phone hotspot.', 'bad');
  },
  help() { backTo = currentScreen(); showScreen('help'); },
  settings() { backTo = currentScreen(); showScreen('settings'); },
  back() { showScreen(backTo); },
  copy() {
    const url = $('inviteLink').value;
    if (!url) return;
    $('inviteLink').select();
    const done = () => setMsg('lobbyMsg', 'Invite link copied. Paste it to your friends.', 'good');
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => document.execCommand('copy') && done());
    else if (document.execCommand('copy')) done();
  },
  share() {
    navigator.share?.({ title: 'Floor 50', text: 'Spend the night on floor 50 with me.', url: $('inviteLink').value }).catch(() => {});
  },
  start() { link?.send({ t: 'start', fill: $('fill').checked }); },
  again() { link?.send({ t: 'start' }); },
  tolobby() { link?.send({ t: 'tolobby' }); },
  leave: () => leave(),
  menu: () => leave(),
  quit: () => leave(),
  resume() {
    showScreen(null);
    input.lock();
    setPaused(false);
  },
};

function guestMsgId() {
  return screenShown('invite') ? 'inviteMsg' : 'titleMsg';
}

// the invite link (and code) everyone in the lobby can pass on
function showInvite(m) {
  $('inviteBox').hidden = !m.code;
  if (!m.code) return;
  const host = m.players.find((p) => p.id === m.hostId);
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('join', m.code);
  if (host) url.searchParams.set('from', host.name);
  $('inviteLink').value = url.href;
  $('shareBtn').hidden = !navigator.share;
}

function currentScreen() {
  for (const id of ['title', 'lobby', 'pause', 'results']) if (screenShown(id)) return id;
  return 'title';
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (b && actions[b.dataset.act]) actions[b.dataset.act]();
});
$('fill').addEventListener('change', (e) => link?.send({ t: 'fill', fill: e.target.checked }));
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join(); });

// ---------------------------------------------------------------- night --
function startGame(m) {
  if (game) disposeGame();
  buildGround();
  hud.reset();
  game = new Game({ renderer, post, world, ground, link, start: m, hud, input, settings });
  game.resize(innerWidth, innerHeight);
  setPaused(false);
  showScreen(null);
  input.lock();
  setTimeout(() => { if (game && !input.locked && !screenShown('pause')) showScreen('clickToPlay'); }, 400);
  window.__game = game; // handle for automated browser tests
}

function endGame(results, dawn) {
  const amHost = !!link?.isHost;
  const show = () => {
    if (!game) return;
    disposeGame();
    input.unlock();
    renderResults(results, link?.id, amHost, dawn);
    $('toLobbyBtn').hidden = !amHost || solo;
    showScreen('results');
    sound.setScene('title', 2);
  };
  if (dawn && game) { game.dawn(); setTimeout(show, 4500); } else setTimeout(show, 1200);
}

function disposeGame() {
  game.dispose();
  game = null;
  window.__game = null;
  hud.hide();
  hud.reset();
}

function leave() {
  if (link) link.close();
  link = null;
  solo = false;
  if (invited && screenShown('invite')) history.replaceState(null, '', location.pathname);
  if (game) disposeGame();
  setPaused(false);
  input.unlock();
  showScreen('title');
  sound.quiet();
  if (sound.ready) sound.setScene('title', 2);
}

// solo games really pause; with friends the night goes on
function setPaused(on) {
  paused = on && solo;
  if (link && link.lobby) link.lobby.paused = paused;
}

document.addEventListener('pointerlockchange', () => {
  if (!game) return;
  if (input.locked) {
    showScreen(null);
    setPaused(false);
  } else {
    showScreen('pause');
    setMsg('pauseNote', solo ? '' : "Heads up: the night keeps going for everyone else while you're paused.");
    setPaused(true);
  }
});
canvas.addEventListener('click', () => { if (game && !input.locked) actions.resume(); });

// ----------------------------------------------------------------- loop --
let last = performance.now();
const titleFx = { fade: 0, bars: 0, exposure: 1.05 };
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  adaptQuality(dt);
  if (game) {
    if (!paused) game.update(dt);
    game.render();
  } else {
    attract.update(dt);
    sound.update(dt);
    titleFx.time = now / 1000;
    titleFx.fade = attract.fade;
    post.render((target) => world.render(renderer, attract.camera, target), titleFx);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (invited) {
  const from = (params.get('from') || '').slice(0, 16);
  $('inviteWho').textContent = `${from ? `${from}'s` : "A friend's"} game · lobby ${invited}`;
  $('inviteName').value = $('name').value;
  $('inviteName').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.inviteJoin(); });
  showScreen('invite');
} else showScreen('title');

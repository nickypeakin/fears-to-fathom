// The heads-up display and the menu screens.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const COLORS = ['#b8443a', '#5a7fa8', '#4f7a4c', '#c9932f'];

export class Hud {
  constructor() {
    this.root = $('hud');
    this.last = {};
  }

  show() { this.root.hidden = false; this.banner(null); }
  hide() { this.root.hidden = true; }

  // cutscenes show only subtitles, the title card and the skip hint
  cinematic(on) { this.root.classList.toggle('cinematic', on); }

  set(id, text) {
    if (this.last[id] === text) return;
    this.last[id] = text;
    $(id).textContent = text || '';
  }

  objective(text) { this.set('objective', text); }
  prompt(text) { this.set('prompt', text); }

  // hours on the night clock: 20.5 is 8:30 PM, 25.25 is 1:15 AM
  clock(h) {
    const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
    const pm = hh >= 12;
    this.set('clock', `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`);
  }

  meter(id, v) {
    const el = $(id);
    el.hidden = v == null;
    if (v == null) return;
    const w = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    if (this.last[id] !== w) { this.last[id] = w; el.querySelector('i').style.width = w; }
    el.classList.toggle('low', v < 0.3);
  }

  lock(v) { this.meter('lockMeter', v); }
  breath(v) { this.meter('breathMeter', v); }
  stamina(v) { this.meter('staminaMeter', v); }
  flashlight(on) { $('flashicon').classList.toggle('on', !!on); }
  crosshair(on) { $('cross').hidden = !on; }

  talk(list) {
    const html = list ? list.map((t, i) => `<span><b>${i + 1}</b> ${esc(t)}</span>`).join('') : '';
    if (html !== this.last.talk) { this.last.talk = html; $('talk').innerHTML = html; }
  }

  team(list) {
    const html = list.map((p) => `<li class="${p.me ? 'me' : ''} ${p.out ? 'out' : ''}">${esc(p.name)}${p.bot ? ' <small>(bot)</small>' : ''}</li>`).join('');
    if (html !== this.last.team) { this.last.team = html; $('team').innerHTML = html; }
  }

  // a line of dialogue; `creepy` lines are set apart
  say(name, text, creepy = false) {
    const d = document.createElement('div');
    if (creepy) d.className = 'creepy';
    d.innerHTML = name ? `<b>${esc(name)}</b> ${esc(text)}` : esc(text);
    const box = $('subs');
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 4200 + text.length * 45);
  }

  toast(text) {
    const d = document.createElement('div');
    d.textContent = text;
    const box = $('toasts');
    box.appendChild(d);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => d.remove(), 5000);
  }

  flash(text) {
    const f = $('flash');
    f.textContent = text;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  banner(title, sub) {
    const b = $('banner');
    b.hidden = !title;
    if (title) {
      b.querySelector('h1').textContent = title;
      b.querySelector('p').textContent = sub || '';
    }
  }

  reset() {
    this.last = {};
    this.cinematic(false);
    for (const id of ['objective', 'prompt', 'clock']) $(id).textContent = '';
    for (const id of ['subs', 'toasts', 'team', 'talk']) $(id).innerHTML = '';
    for (const id of ['lockMeter', 'breathMeter', 'staminaMeter']) $(id).hidden = true;
    this.banner(null);
  }
}

// --------------------------------------------------------------- screens --
export function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  document.body.classList.toggle('menu', !!id && id !== 'clickToPlay');
}

export function screenShown(id) {
  return !$(id).hidden;
}

export function renderLobby(msg, myId) {
  $('lobbyCode').textContent = msg.code || '·····';
  const amHost = msg.hostId === myId;
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const p = msg.players[i];
    if (p) slots.push(`<li style="--c:${COLORS[p.color % 4]}"><span>${esc(p.name)}${p.id === myId ? ' (you)' : ''}</span><span>${p.id === msg.hostId ? 'HOST' : 'HERE'}</span></li>`);
    else slots.push(`<li class="empty"><span>${msg.fill ? 'A friend (bot)' : 'Empty'}</span><span>${msg.fill ? 'BOT' : '-'}</span></li>`);
  }
  $('slots').innerHTML = slots.join('');
  $('fill').checked = msg.fill;
  $('fill').disabled = !amHost;
  $('startBtn').hidden = !amHost;
  $('lobbyWait').textContent = amHost ? '' : 'Waiting for the host to start...';
}

export function renderResults(results, myId, amHost, dawn) {
  const me = results.find((r) => r.id === myId);
  const any = results.some((r) => r.st === 'in');
  const people = results.filter((r) => !r.bot).length;
  let head;
  if (dawn) head = me && me.st === 'in' ? 'YOU MADE IT TO MORNING' : any ? 'SOME OF YOU MADE IT' : 'NOBODY SAW THE SUNRISE';
  else head = people > 1 ? 'HE TOOK ALL OF YOU' : 'HE TOOK YOU';
  $('resultHead').textContent = head;
  const clock = (t) => {
    const h = 20 + t / 60, hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
  };
  $('resultList').innerHTML = results.map((r) =>
    `<li class="${r.st}" style="--c:${COLORS[r.color % 4]}"><span>${esc(r.name)}${r.bot ? ' (bot)' : ''}${r.id === myId ? ' (you)' : ''}</span><span>${r.st === 'in' ? 'SURVIVED' : `TAKEN AT ${clock(r.time)}`}</span></li>`).join('');
  $('againBtn').hidden = !amHost;
  $('toLobbyBtn').hidden = !amHost;
  $('resultWait').textContent = amHost ? '' : 'Waiting for the host...';
}

// cls: 'good' or 'bad' to colour the message
export function setMsg(id, text, cls = '') {
  const el = $(id);
  el.textContent = text || '';
  el.className = `msg ${cls}`.trim();
}

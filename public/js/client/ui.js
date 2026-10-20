// The heads-up display and the menu screens.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const COLORS = ['#b8443a', '#5a7fa8', '#4f7a4c', '#c9932f'];

// hours as a clock: 19.5 is 7:30 PM, 26.25 is 2:15 AM
export function clockText(h) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h % 1) * 60);
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.last = {};
    this.cardTimers = [];
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
  html(id, html) {
    if (this.last[id] === html) return;
    this.last[id] = html;
    $(id).innerHTML = html;
  }

  prompt(text) { this.set('prompt', text); }
  clock(h, label) { this.set('clock', h == null ? '' : clockText(h)); this.set('dayName', label || ''); }
  carry(text) { this.set('carry', text); }
  hint(text) { this.set('hint', text); }
  bearing(b) {
    $('bearing').hidden = b == null;
    if (b != null) this.set('bearing', `BEARING ${String(Math.round(((b % 360) + 360) % 360)).padStart(3, '0')}°`);
  }

  // [{ id, text, n, of, done, optional }]
  objectives(list, flashId = null) {
    const html = (list || []).map((o) => {
      const count = o.of > 1 ? ` <span class="n">${Math.min(o.n, o.of)}/${o.of}</span>` : '';
      return `<li class="${o.done ? 'done' : ''} ${o.optional ? 'opt' : ''} ${o.id === flashId ? 'flash' : ''}">${esc(o.text)}${count}</li>`;
    }).join('');
    this.html('objectives', html);
  }

  meter(id, v) {
    const el = $(id);
    el.hidden = v == null;
    if (v == null) return;
    const w = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    if (this.last[id] !== w) { this.last[id] = w; el.querySelector('i').style.width = w; }
    el.classList.toggle('low', v < 0.3);
  }

  stamina(v) { this.meter('staminaMeter', v); }
  flashlight(on) { $('flashicon').classList.toggle('on', !!on); }
  crosshair(on) { $('cross').hidden = !on; }

  team(list) {
    const html = list.map((p) => `<li class="${p.me ? 'me' : ''} ${p.out ? 'out' : ''}" style="--c:${COLORS[p.color % 4]}">${esc(p.name)}</li>`).join('');
    this.html('team', html);
  }

  // choices: who's asking and what you can say (keys 1..n)
  ask(who, opts) {
    const html = opts ? `${who ? `<div class="who">${esc(who)}</div>` : ''}${opts.map((t, i) => `<span><b>${i + 1}</b> ${esc(t)}</span>`).join('')}` : '';
    this.html('ask', html);
  }

  // a line of dialogue. kind: '' (someone near), 'radio', 'creepy', 'narrate'
  say(name, text, kind = '') {
    const d = document.createElement('div');
    if (kind) d.className = kind;
    d.innerHTML = name ? `<b>${esc(name)}</b> ${esc(text)}` : esc(text);
    const box = $('subs');
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 4200 + text.length * 50);
  }

  toast(text) {
    const d = document.createElement('div');
    d.textContent = text;
    const box = $('toasts');
    box.appendChild(d);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => d.remove(), 5200);
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

  // a full-screen panel over the game (radio, logbook, photos, phone, notes)
  panel(html, cls = '') {
    const p = $('panel');
    p.hidden = !html;
    p.className = cls;
    if (html) p.innerHTML = html;
  }
  get panelOpen() { return !$('panel').hidden; }

  // the title card between parts of the story: a heading, then the
  // narrator's lines one at a time
  card(title, sub, lines, dur) {
    const c = $('card');
    for (const t of this.cardTimers) clearTimeout(t);
    this.cardTimers = [];
    if (!title && !(lines && lines.length)) { c.hidden = true; return; }
    c.hidden = false;
    c.querySelector('h1').textContent = title || '';
    c.querySelector('h2').textContent = sub || '';
    const box = c.querySelector('.lines');
    box.innerHTML = '';
    let at = title ? 1600 : 300;
    for (const ln of lines || []) {
      this.cardTimers.push(setTimeout(() => {
        const p = document.createElement('p');
        p.textContent = ln;
        box.appendChild(p);
      }, at));
      at += 1800 + ln.length * 45;
    }
    this.cardTimers.push(setTimeout(() => { c.hidden = true; }, dur * 1000));
  }

  reset() {
    this.last = {};
    this.cinematic(false);
    for (const id of ['prompt', 'clock', 'dayName', 'carry', 'hint']) $(id).textContent = '';
    for (const id of ['subs', 'toasts', 'team', 'objectives', 'ask']) $(id).innerHTML = '';
    $('staminaMeter').hidden = true;
    $('bearing').hidden = true;
    this.panel(null);
    this.card(null);
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
    else slots.push('<li class="empty"><span>Empty</span><span>-</span></li>');
  }
  $('slots').innerHTML = slots.join('');
  $('startBtn').hidden = !amHost;
  $('lobbyWait').textContent = amHost ? '' : 'Waiting for the host to start...';
}

const FATE = { escaped: 'GOT OUT', rescued: 'RESCUED', taken: 'TAKEN', gone: 'LEFT', in: 'SURVIVED' };
export function renderResults(over, myId, amHost) {
  $('resultHead').textContent = over.title;
  $('resultLines').innerHTML = over.lines.map((l) => `<p>${esc(l)}</p>`).join('');
  $('resultList').innerHTML = over.results.map((r) =>
    `<li class="${r.st}" style="--c:${COLORS[r.color % 4]}"><span>${esc(r.name)}${r.id === myId ? ' (you)' : ''}</span><span>${FATE[r.st] || ''}${r.st === 'taken' && r.time != null ? ` · ${clockText(r.time)}` : ''}</span></li>`).join('');
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

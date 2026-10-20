// Wade, as the host runs him. Most of the time the story moves him along
// paths (walk up the road, climb the stairs, round the catwalk) and he
// does what the scene needs. Some of the time he hunts: anyone he spots on
// the ground in the dark, or on the last day anyone at all. He's a little
// slower than someone sprinting, and he follows you up the tower if you
// don't get the trapdoor bolted behind you.

import { WADE } from '../shared/config.js';
import { CAB_Y, floorAt, UP_STAIRS, UNDER_HATCH, INTO_CAB, TREELINE, upTop } from '../shared/layout.js';
import { TREES } from '../shared/forest.js';

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

// how many trunks stand between two points on the ground
function treesBetween(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let n = 0;
  for (const t of TREES) {
    if (Math.abs(t.x - (ax + bx) / 2) > Math.abs(dx) / 2 + 2 || Math.abs(t.z - (az + bz) / 2) > Math.abs(dz) / 2 + 2) continue;
    const k = Math.max(0, Math.min(1, ((t.x - ax) * dx + (t.z - az) * dz) / l2));
    if (Math.hypot(t.x - ax - dx * k, t.z - az - dz * k) < t.w + 0.35) n++;
  }
  return n;
}

export class Wade {
  constructor(match) {
    this.m = match;
    this.on = false;
    this.x = this.y = this.z = 0;
    this.ry = 0;
    this.anim = 'stand';
    this.mode = 'off';
    this.path = null;
    this.speed = WADE.walk;
    this.stuckT = 0;
    this.sideT = 0;
    this.lastSeen = 0;
  }

  spawn(x, y, z, ry = 0) {
    Object.assign(this, { on: true, x, y, z, ry, mode: 'stand', anim: 'stand', path: null, target: null });
  }

  despawn() {
    this.on = false;
    this.mode = 'off';
    this.path = null;
    this.target = null;
  }

  // follow waypoints [[x, y, z], ...]; `ground` means stick to the ground
  // (y comes from the terrain), otherwise y follows the waypoints
  walk(path, { speed = WADE.walk, then = null, ground = false } = {}) {
    if (!this.on) this.spawn(...path[0]);
    this.mode = 'walk';
    this.path = path.map((p) => [...p]);
    this.from = [this.x, this.y, this.z];
    this.pi = 0;
    this.speed = speed;
    this.then = then;
    this.ground = ground;
    this.anim = 'walk';
  }

  stand(ry = this.ry, anim = 'stand') {
    this.mode = 'stand';
    this.path = null;
    this.ry = ry;
    this.anim = anim;
  }

  face(x, z) { this.ry = yawTo(x - this.x, z - this.z); }

  // chase someone until he catches them, loses them, or `until` says stop
  hunt(p, { until = null } = {}) {
    if (!this.on) return;
    this.mode = 'hunt';
    this.target = p.id;
    this.until = until;
    this.lostT = 0;
    this.anim = 'walk';
    this.stairs = null;
  }

  // can he see this person from where he stands?
  sees(p) {
    if (!this.on || p.st !== 'in' || p.truck) return false;
    const dx = p.x - this.x, dz = p.z - this.z, dy = p.y - this.y;
    const d = Math.hypot(dx, dz, dy);
    const night = this.m.isDark();
    const range = !night ? WADE.seeDay : p.fl ? WADE.seeLit : WADE.seeDark;
    if (d > range) return false;
    if (d < 2.5) return true;
    const fx = -Math.sin(this.ry), fz = -Math.cos(this.ry);
    if ((fx * dx + fz * dz) / Math.max(1e-6, Math.hypot(dx, dz)) < WADE.fov && d > 6) return false;
    if (Math.abs(dy) < 2 && treesBetween(this.x, this.z, p.x, p.z) > 1) return false;
    return true;
  }

  step(dt) {
    if (!this.on) return;
    if (this.mode === 'walk' || this.mode === 'hunt-climb') this.stepWalk(dt);
    else if (this.mode === 'hunt') this.stepHunt(dt);
  }

  stepWalk(dt) {
    const tgt = this.path[this.pi];
    const [tx, ty, tz] = tgt;
    const dx = tx - this.x, dz = tz - this.z, dy = this.ground ? 0 : ty - this.y;
    const d = Math.hypot(dx, dz, dy);
    const stepLen = this.speed * dt;
    if (d <= stepLen + 1e-4) {
      this.x = tx; this.z = tz;
      if (!this.ground) this.y = ty;
      this.pi++;
      if (this.pi >= this.path.length) {
        this.mode = 'stand';
        this.anim = 'stand';
        const f = this.then;
        this.then = null;
        if (f) f();
        return;
      }
    } else {
      this.x += (dx / d) * stepLen;
      this.z += (dz / d) * stepLen;
      if (!this.ground) this.y += (dy / d) * stepLen;
      if (Math.hypot(dx, dz) > 0.05) this.ry = yawTo(dx, dz);
    }
    if (this.ground) this.y = floorAt(this.x, this.z, this.y + 0.3, true);
    this.anim = Math.abs(dy) > Math.hypot(dx, dz) * 2 ? 'climb' : 'walk';
  }

  stepHunt(dt) {
    const m = this.m;
    const p = m.player(this.target);
    if (!p || p.st !== 'in' || p.truck || (this.until && this.until())) { this.giveUp(); return; }
    if (this.sees(p)) { this.lastSeen = m.t; this.lostT = 0; } else this.lostT += dt;
    if (this.lostT > WADE.giveUp && !upTop(p.x, p.y, p.z) && !this.stairs) { this.giveUp(); return; }
    const d3 = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
    if (d3 < WADE.catchDist) { m.capture(p, 'wade'); this.giveUp(true); return; }

    // up top: straight at them round the catwalk or into the cab; if they
    // get back down the stairs past him, he lets them go
    if (this.y > CAB_Y - 0.5 && !this.stairs?.down) {
      if (p.y < CAB_Y - 1) { this.giveUp(); return; }
      this.moveToward(p.x, p.z, WADE.chase * 0.75, dt, true);
      return;
    }
    // on the tower, or heading for it: follow the stairs
    const onTower = p.y > 0.7;
    if (onTower || this.stairs) {
      if (!this.stairs) {
        // join the stairs at the bottom, or wherever along them he is
        let best = 0, bd = Infinity;
        UP_STAIRS.forEach((w, i) => { const dd = Math.hypot(w[0] - this.x, w[1] - this.y, w[2] - this.z); if (dd < bd) { bd = dd; best = i; } });
        this.stairs = { i: this.y < 0.5 ? 0 : best };
      }
      const st = this.stairs;
      if (!onTower) {
        // they came back down: chase them on the ground again
        if (this.y < 0.6) this.stairs = null;
        else this.followStairs(-1, dt);
        return;
      }
      if (st.i >= UP_STAIRS.length) {
        // at the top: through the trapdoor if it's open, otherwise he knocks
        const h = m.hatch;
        if (h.open > 0.6) {
          this.walk([UNDER_HATCH, ...INTO_CAB], { speed: WADE.chase * 0.7, then: () => { this.mode = 'hunt'; } });
          this.mode = 'hunt-climb';
          m.breach(this);
          return;
        }
        if (!this.knockAt || m.t > this.knockAt + 9) {
          this.knockAt = m.t;
          m.hatchKnocked(this);
        }
        this.x = UNDER_HATCH[0]; this.y = UNDER_HATCH[1]; this.z = UNDER_HATCH[2];
        this.anim = 'reach';
        if (m.t > this.knockAt + 8 && h.bolt) this.giveUp();
        return;
      }
      this.followStairs(1, dt);
      return;
    }
    this.moveToward(p.x, p.z, WADE.chase, dt, false);
  }

  followStairs(dir, dt) {
    const st = this.stairs;
    const i = Math.max(0, Math.min(UP_STAIRS.length - 1, dir > 0 ? st.i : st.i - 1));
    const [tx, ty, tz] = UP_STAIRS[i];
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z, d = Math.hypot(dx, dy, dz);
    const s = WADE.chase * 0.85 * dt;
    if (d <= s) {
      this.x = tx; this.y = ty; this.z = tz;
      st.i += dir;
      if (st.i < 0) { this.stairs = null; this.y = 0; }
    } else {
      this.x += (dx / d) * s; this.y += (dy / d) * s; this.z += (dz / d) * s;
      if (Math.hypot(dx, dz) > 0.05) this.ry = yawTo(dx, dz);
    }
    this.anim = 'walk';
  }

  // straight at them across open ground, stepping round trees when stuck
  moveToward(x, z, speed, dt, inside) {
    let dx = x - this.x, dz = z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    dx /= d; dz /= d;
    if (this.sideT > 0) {
      this.sideT -= dt;
      const sx = -dz * this.side, sz = dx * this.side;
      dx = dx * 0.3 + sx; dz = dz * 0.3 + sz;
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    }
    const ox = this.x, oz = this.z;
    const pos = { x: this.x + dx * speed * dt, z: this.z + dz * speed * dt };
    this.m.solids.resolve(pos, WADE.radius, this.y);
    this.x = pos.x; this.z = pos.z;
    if (!inside) this.y = floorAt(this.x, this.z, this.y + 0.3, true);
    const moved = Math.hypot(this.x - ox, this.z - oz);
    if (moved < speed * dt * 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.35 && this.sideT <= 0) { this.sideT = 0.7; this.side = Math.random() < 0.5 ? -1 : 1; this.stuckT = 0; }
    this.ry = yawTo(x - this.x, z - this.z);
    this.anim = speed > WADE.walk * 1.5 ? 'run' : 'walk';
  }

  giveUp(caught = false) {
    this.target = null;
    this.stairs = null;
    this.mode = 'stand';
    this.anim = 'stand';
    this.m.wadeDone(caught);
  }

  // back into the trees, out of sight, then gone
  retreat(then = null) {
    if (!this.on) { if (then) then(); return; }
    let best = TREELINE[0], bd = -1;
    for (const p of TREELINE) {
      // the treeline spot furthest from everyone
      const dmin = Math.min(...this.m.players.filter((q) => q.st === 'in').map((q) => Math.hypot(q.x - p[0], q.z - p[2])), 999);
      if (dmin > bd) { bd = dmin; best = p; }
    }
    const route = [];
    if (this.y > 0.6) {
      // back down the stairs first
      let i = UP_STAIRS.length - 1, bdd = Infinity;
      UP_STAIRS.forEach((w, k) => { const dd = Math.hypot(w[0] - this.x, w[1] - this.y, w[2] - this.z); if (dd < bdd) { bdd = dd; i = k; } });
      for (let k = i; k >= 0; k--) route.push(UP_STAIRS[k]);
    }
    const far = [best[0] * 1.6, 0, best[2] * 1.6];
    this.walk(route.length ? route : [best], { speed: WADE.walk * 1.4, then: () => this.walk([best, far], { speed: WADE.walk * 1.4, ground: true, then: () => { this.despawn(); if (then) then(); } }) });
  }

  row() {
    return [Math.round(this.x * 100) / 100, Math.round(this.y * 100) / 100, Math.round(this.z * 100) / 100, Math.round(this.ry * 100) / 100, this.anim];
  }
}


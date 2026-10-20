// 2D collision on the floor plane: people are circles, walls and furniture
// are axis-aligned boxes { x0, z0, x1, z1 }.

// Pushes the circle at pos ({x, z}) out of every box. Returns true if it
// touched anything.
export function resolveCircle(pos, r, boxes) {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        // centre is inside the box: leave by the nearest side
        const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) pos.x = b.x0 - r;
        else if (m === rr) pos.x = b.x1 + r;
        else if (m === t) pos.z = b.z0 - r;
        else pos.z = b.z1 + r;
      }
    }
  }
  return hit;
}

export function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.x0, Math.min(x, b.x1));
  const cz = Math.max(b.z0, Math.min(z, b.z1));
  const dx = x - cx, dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function box(cx, cz, w, d) {
  return { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 };
}

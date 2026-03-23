export function triPointString(points) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export function centroid(points) {
  return {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3,
  };
}

export function lineBetween(a, b) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

export function quadPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

export function edgeMidpoints(points) {
  return {
    ab: quadPoint(points[0], points[1], 0.5),
    bc: quadPoint(points[1], points[2], 0.5),
    ca: quadPoint(points[2], points[0], 0.5),
  };
}

export function inwardPoint(from, to, amount) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

export function quadOpenPath(from, ctrl, to) {
  const f = (n) => +n.toFixed(3);
  return `M ${f(from.x)} ${f(from.y)} Q ${f(ctrl.x)} ${f(ctrl.y)} ${f(to.x)} ${f(to.y)}`;
}

export function inwardNormalTowardOpposite(pFrom, pTo, pOpp) {
  const mx = (pFrom.x + pTo.x) / 2;
  const my = (pFrom.y + pTo.y) / 2;
  const ex = pTo.x - pFrom.x;
  const ey = pTo.y - pFrom.y;
  const elen = Math.hypot(ex, ey);
  if (elen < 1e-9) return null;
  const nx = -ey / elen;
  const ny = ex / elen;
  const vx = pOpp.x - mx;
  const vy = pOpp.y - my;
  const sign = nx * vx + ny * vy >= 0 ? 1 : -1;
  return { nx: nx * sign, ny: ny * sign, mx, my, elen };
}

export function circularChordArcPath(pFrom, pTo, pOpp, cen, sagittaRatio, segments = 24) {
  const base = inwardNormalTowardOpposite(pFrom, pTo, pOpp);
  if (!base) {
    return `M ${pFrom.x} ${pFrom.y} L ${pTo.x} ${pTo.y}`;
  }
  const { nx, ny, mx, my, elen } = base;
  const half = elen / 2;
  const h = sagittaRatio * elen;
  if (h < 1e-6) {
    return `M ${pFrom.x} ${pFrom.y} L ${pTo.x} ${pTo.y}`;
  }
  const R = (half * half + h * h) / (2 * h);
  const dm = R - h;
  const ox = mx - nx * dm;
  const oy = my - ny * dm;
  const r = Math.hypot(pFrom.x - ox, pFrom.y - oy);

  const a0 = Math.atan2(pFrom.y - oy, pFrom.x - ox);
  const a1 = Math.atan2(pTo.y - oy, pTo.x - ox);
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const alt = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;

  const midPt = (delta) => {
    const am = a0 + delta / 2;
    return { x: ox + r * Math.cos(am), y: oy + r * Math.sin(am) };
  };
  const dist2 = (p) => {
    const dx = p.x - cen.x;
    const dy = p.y - cen.y;
    return dx * dx + dy * dy;
  };
  const delta = dist2(midPt(d)) <= dist2(midPt(alt)) ? d : alt;

  const f = (n) => +n.toFixed(3);
  let path = `M ${f(pFrom.x)} ${f(pFrom.y)}`;
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const ang = a0 + delta * t;
    path += ` L ${f(ox + r * Math.cos(ang))} ${f(oy + r * Math.sin(ang))}`;
  }
  return path;
}

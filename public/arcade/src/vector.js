export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(v, k) {
  return { x: v.x * k, y: v.y * k };
}

export function length(v) {
  return Math.hypot(v.x, v.y);
}

export function normalize(v) {
  const len = length(v);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function limit(v, max) {
  const len = length(v);
  if (len <= max) return { x: v.x, y: v.y };
  return scale(v, max / len);
}
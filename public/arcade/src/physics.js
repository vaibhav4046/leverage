import { add, sub, scale, length, normalize } from './vector.js';

export function gravityAt(pos, wellPos, strength) {
  const delta = sub(wellPos, pos);
  const dist = length(delta);
  const mag = strength / (dist * dist + 1);
  return scale(normalize(delta), mag);
}

export function integrate(body, accel, dt) {
  const vel = add(body.vel, scale(accel, dt));
  const pos = add(body.pos, scale(vel, dt));
  return { pos, vel };
}

export function circlesOverlap(aPos, aR, bPos, bR) {
  return length(sub(aPos, bPos)) <= aR + bR;
}

export function wrap(pos, w, h) {
  return {
    x: ((pos.x % w) + w) % w,
    y: ((pos.y % h) + h) % h,
  };
}
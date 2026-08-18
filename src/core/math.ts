/**
 * Allocation-free scalar math helpers.
 * Every function here takes and returns primitives only, so they are safe to
 * call from inside animation / tick loops.
 */

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI * 0.5;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const EPSILON = 1e-6;

/** Clamps `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Clamps `value` into the inclusive `[0, 1]` range. */
export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Linear interpolation. `t` is not clamped. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse of {@link lerp}. Returns 0 when `a === b` instead of dividing by zero. */
export function inverseLerp(a: number, b: number, value: number): number {
  const range = b - a;
  if (range > -EPSILON && range < EPSILON) return 0;
  return (value - a) / range;
}

/** Maps `value` from the `[inMin, inMax]` range onto `[outMin, outMax]`. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

/** Classic Hermite smoothstep, clamped to `[0, 1]`. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(inverseLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/** Ken Perlin's smootherstep — zero first *and* second derivative at the edges. */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(inverseLerp(edge0, edge1, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Frame-rate independent exponential decay towards `target`.
 *
 * `lambda` is the decay rate: higher converges faster. Unlike a raw
 * `lerp(current, target, 0.1)` this produces identical motion at 30 fps and
 * 144 fps, which matters for deterministic animation.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(target, current, Math.exp(-lambda * dt));
}

/** Moves `current` towards `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (delta > -maxDelta && delta < maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

/** Wraps `value` into `[min, max)`. Handles negative values correctly. */
export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) return min;
  return min + (((value - min) % range) + range) % range;
}

/** Wraps an angle in radians into `[0, TAU)`. */
export function wrapAngle(radians: number): number {
  return wrap(radians, 0, TAU);
}

/** Shortest signed angular difference from `from` to `to`, in `(-PI, PI]`. */
export function deltaAngle(from: number, to: number): number {
  return wrap(to - from + Math.PI, 0, TAU) - Math.PI;
}

/** Triangle wave: ramps 0 → length → 0 with a period of `2 * length`. */
export function pingPong(t: number, length: number): number {
  if (length <= 0) return 0;
  const wrapped = wrap(t, 0, length * 2);
  return length - Math.abs(wrapped - length);
}

/** True when `a` and `b` are within `epsilon` of each other. */
export function approximately(a: number, b: number, epsilon: number = EPSILON): boolean {
  const d = a - b;
  return d < epsilon && d > -epsilon;
}

/**
 * Rectified sine — the positive half of `sin(x)`, zero elsewhere.
 * Useful for joints that only bend one way (knees, elbows).
 */
export function halfSin(x: number): number {
  const s = Math.sin(x);
  return s > 0 ? s : 0;
}

import { Box3, Color, Euler, Matrix4, Quaternion, Vector2, Vector3 } from 'three';

/**
 * Pre-allocated temporaries for use inside tick / update loops.
 *
 * Rule of engagement: a scratch value is only valid until the next call that
 * might use the same slot. Never store a reference to one — copy the result
 * into owned state instead. Slots are named (A, B, C...) so that a function
 * calling into another can pick disjoint slots.
 */

/**
 * A fixed-size ring of reusable instances. `next()` hands out the following
 * item and wraps around, so a loop can grab several temporaries without ever
 * allocating. Sized generously; if a call site needs more live temporaries
 * than the ring holds, it will silently reuse — keep usage short-lived.
 */
export class RingPool<T> {
  private readonly items: T[];
  private cursor = 0;

  constructor(size: number, factory: () => T) {
    if (size <= 0) {
      throw new Error('RingPool: size must be greater than zero.');
    }
    this.items = new Array<T>(size);
    for (let i = 0; i < size; i++) {
      this.items[i] = factory();
    }
  }

  /** Number of instances held by the ring. */
  get size(): number {
    return this.items.length;
  }

  /** Returns the next instance in the ring. Never allocates. */
  next(): T {
    const item = this.items[this.cursor] as T;
    this.cursor = this.cursor + 1 >= this.items.length ? 0 : this.cursor + 1;
    return item;
  }

  /** Rewinds the cursor. Purely cosmetic — useful at frame boundaries. */
  rewind(): void {
    this.cursor = 0;
  }
}

const VEC3_RING = new RingPool<Vector3>(32, () => new Vector3());
const VEC2_RING = new RingPool<Vector2>(16, () => new Vector2());
const QUAT_RING = new RingPool<Quaternion>(16, () => new Quaternion());
const MAT4_RING = new RingPool<Matrix4>(8, () => new Matrix4());
const COLOR_RING = new RingPool<Color>(16, () => new Color());

/** Borrows the next pooled `Vector3`. Valid until 32 further borrows. */
export function tempVec3(x = 0, y = 0, z = 0): Vector3 {
  return VEC3_RING.next().set(x, y, z);
}

/** Borrows the next pooled `Vector2`. Valid until 16 further borrows. */
export function tempVec2(x = 0, y = 0): Vector2 {
  return VEC2_RING.next().set(x, y);
}

/** Borrows the next pooled `Quaternion`, reset to identity. */
export function tempQuat(): Quaternion {
  return QUAT_RING.next().identity();
}

/** Borrows the next pooled `Matrix4`, reset to identity. */
export function tempMat4(): Matrix4 {
  return MAT4_RING.next().identity();
}

/** Borrows the next pooled `Color`. */
export function tempColor(hex = 0xffffff): Color {
  return COLOR_RING.next().setHex(hex);
}

/**
 * Named scratch slots for code that needs stable, non-rotating temporaries
 * within a single function body.
 */
export const Scratch = Object.freeze({
  vec3A: new Vector3(),
  vec3B: new Vector3(),
  vec3C: new Vector3(),
  vec3D: new Vector3(),
  vec3E: new Vector3(),
  vec3F: new Vector3(),

  vec2A: new Vector2(),
  vec2B: new Vector2(),

  quatA: new Quaternion(),
  quatB: new Quaternion(),
  quatC: new Quaternion(),

  mat4A: new Matrix4(),
  mat4B: new Matrix4(),

  eulerA: new Euler(),
  eulerB: new Euler(),

  colorA: new Color(),
  colorB: new Color(),

  boxA: new Box3(),
  boxB: new Box3(),
});

/** Read-only unit axes. Never mutate these — copy first. */
export const AXIS_X: Readonly<Vector3> = Object.freeze(new Vector3(1, 0, 0));
export const AXIS_Y: Readonly<Vector3> = Object.freeze(new Vector3(0, 1, 0));
export const AXIS_Z: Readonly<Vector3> = Object.freeze(new Vector3(0, 0, 1));

/** The forward direction every character and prop in this library faces. */
export const ASSET_FORWARD: Readonly<Vector3> = AXIS_Z;

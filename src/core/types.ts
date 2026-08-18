/** Shared structural types. Runtime-free — this module compiles away. */

/**
 * Recursively optional version of `T`.
 *
 * Every asset in this library takes a fully-specified options object
 * internally and a `DeepPartial` of it at the public boundary, so callers only
 * state what they want to change.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** Recursively read-only version of `T`. */
export type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

/** Anything holding GPU resources that must be explicitly freed. */
export interface Releasable {
  dispose(): void;
}

/** Anything driven by the frame loop. */
export interface Tickable {
  /** @param dt Seconds since the previous frame. */
  update(dt: number): void;
}

/**
 * Deep-merges `override` onto a copy of `base`.
 *
 * Plain objects recurse; arrays and primitives replace wholesale. Build-time
 * only — it allocates, so never call it per frame.
 */
export function mergeOptions<T extends object>(base: T, override?: DeepPartial<T>): T {
  const result = { ...base } as T;
  if (override === undefined) return result;

  const source = override as Record<string, unknown>;
  const target = result as unknown as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value === undefined) continue;

    const current = target[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      target[key] = mergeOptions(current, value as DeepPartial<typeof current>);
    } else {
      target[key] = value;
    }
  }

  return result;
}

/** `true` for object literals only — arrays and class instances are excluded. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

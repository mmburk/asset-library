import type { BufferGeometry, Material } from 'three';

/** Anything the cache can own must know how to free its GPU resources. */
export interface Disposable {
  dispose(): void;
}

interface CacheEntry<TResource> {
  resource: TResource;
  refCount: number;
}

/**
 * Reference-counted resource cache.
 *
 * Procedural assets create the *same* geometry and material over and over —
 * a hundred goblins share one head geometry and one skin material. This cache
 * makes that sharing explicit and, crucially, safe: a resource is only
 * disposed once every holder has released it, so disposing one goblin never
 * corrupts the other ninety-nine.
 */
export abstract class ResourceCache<TResource extends Disposable> {
  private readonly entries = new Map<string, CacheEntry<TResource>>();
  private readonly keyByResource = new Map<TResource, string>();

  /**
   * Returns the cached resource for `key`, creating it via `factory` on the
   * first request. Increments the reference count either way.
   */
  acquire<T extends TResource>(key: string, factory: () => T): T {
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      existing.refCount++;
      return existing.resource as T;
    }
    const resource = factory();
    this.entries.set(key, { resource, refCount: 1 });
    this.keyByResource.set(resource, key);
    return resource;
  }

  /**
   * Decrements the reference count for `key` and disposes the resource when it
   * reaches zero.
   * @returns `true` when the resource was actually disposed.
   */
  release(key: string): boolean {
    const entry = this.entries.get(key);
    if (entry === undefined) return false;
    entry.refCount--;
    if (entry.refCount > 0) return false;
    this.entries.delete(key);
    this.keyByResource.delete(entry.resource);
    entry.resource.dispose();
    return true;
  }

  /** Same as {@link release} but looks the key up from the resource itself. */
  releaseResource(resource: TResource): boolean {
    const key = this.keyByResource.get(resource);
    if (key === undefined) return false;
    return this.release(key);
  }

  /** `true` when `key` is currently cached. */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Current reference count for `key`, or `0` when not cached. */
  refCount(key: string): number {
    return this.entries.get(key)?.refCount ?? 0;
  }

  /** Number of distinct resources held. */
  get size(): number {
    return this.entries.size;
  }

  /** Snapshot of every cached key. Allocates — do not call per frame. */
  listKeys(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Disposes every resource regardless of reference count and empties the
   * cache. Call this on scene teardown, never mid-scene.
   */
  disposeAll(): void {
    for (const entry of this.entries.values()) {
      entry.resource.dispose();
    }
    this.entries.clear();
    this.keyByResource.clear();
  }
}

/** Reference-counted cache for shared {@link BufferGeometry} instances. */
export class GeometryCache extends ResourceCache<BufferGeometry> {}

/** Reference-counted cache for shared {@link Material} instances. */
export class MaterialCache extends ResourceCache<Material> {}

/** Formats a number for use inside a cache key, avoiding float noise. */
export function keyNum(value: number): string {
  return value.toFixed(4);
}

/** Formats a boolean for use inside a cache key. */
export function keyBool(value: boolean): string {
  return value ? '1' : '0';
}

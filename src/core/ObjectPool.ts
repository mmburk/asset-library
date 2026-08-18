/** Configuration for {@link ObjectPool}. */
export interface ObjectPoolOptions<T> {
  /** Creates a brand new instance. Called only when the pool runs dry. */
  factory: () => T;
  /** Restores an instance to a clean state before it is handed out again. */
  reset?: (item: T) => void;
  /** Frees an instance permanently — called by {@link ObjectPool.clear}. */
  destroy?: (item: T) => void;
  /** Instances to create up front. */
  initialSize?: number;
  /**
   * Upper bound on retained free instances. Releases beyond this cap destroy
   * the instance instead of retaining it, so a burst does not permanently
   * inflate memory.
   */
  maxSize?: number;
}

/**
 * Generic free-list pool.
 *
 * `acquire` / `release` use `pop` / `push` on a plain array, neither of which
 * allocates, so a steady-state pool produces zero garbage. Use it for
 * projectiles, particles, damage numbers, footstep decals — anything spawned
 * and despawned during play.
 */
export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly factory: () => T;
  private readonly resetItem: ((item: T) => void) | undefined;
  private readonly destroyItem: ((item: T) => void) | undefined;
  private readonly maxSize: number;
  private liveCount = 0;
  private createdCount = 0;

  constructor(options: ObjectPoolOptions<T>) {
    this.factory = options.factory;
    this.resetItem = options.reset;
    this.destroyItem = options.destroy;
    this.maxSize = options.maxSize ?? Number.POSITIVE_INFINITY;
    const initial = options.initialSize ?? 0;
    if (initial > 0) this.preallocate(initial);
  }

  /** Instances currently checked out. */
  get active(): number {
    return this.liveCount;
  }

  /** Instances currently sitting in the free list. */
  get available(): number {
    return this.free.length;
  }

  /** Total instances ever created by the factory — a leak indicator. */
  get created(): number {
    return this.createdCount;
  }

  /** Grows the free list to hold at least `count` instances. */
  preallocate(count: number): void {
    while (this.free.length < count) {
      this.free.push(this.createOne());
    }
  }

  /** Checks out an instance, creating one only if the free list is empty. */
  acquire(): T {
    const item = this.free.pop();
    this.liveCount++;
    if (item !== undefined) {
      this.resetItem?.(item);
      return item;
    }
    return this.createOne();
  }

  /**
   * Returns an instance to the pool. Destroys it instead when the pool is
   * already at `maxSize`.
   */
  release(item: T): void {
    if (this.liveCount > 0) this.liveCount--;
    if (this.free.length >= this.maxSize) {
      this.destroyItem?.(item);
      return;
    }
    this.free.push(item);
  }

  /** Destroys every free instance and empties the pool. */
  clear(): void {
    if (this.destroyItem !== undefined) {
      for (let i = 0; i < this.free.length; i++) {
        this.destroyItem(this.free[i] as T);
      }
    }
    this.free.length = 0;
  }

  private createOne(): T {
    this.createdCount++;
    return this.factory();
  }
}

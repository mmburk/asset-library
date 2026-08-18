import { Group, type BufferGeometry, type Material } from 'three';
import type { AssetContext } from './AssetContext';
import { disposeObject3D } from './GeometryUtils';

/**
 * Base class for every procedural asset.
 *
 * Two responsibilities beyond holding a `Group`:
 *
 * 1. **Leak-proof resource ownership.** Subclasses route every geometry and
 *    material through {@link acquireGeometry} / {@link acquireMaterial} /
 *    {@link track}, which records the borrow. `dispose()` then returns exactly
 *    what was taken — shared resources survive because the cache is
 *    reference-counted, orphaned ones are freed. Duplicates are kept on
 *    purpose: two borrows require two releases.
 * 2. **Explicit build step.** `build()` is a separate call rather than
 *    constructor work, so subclass fields are fully initialised before any
 *    geometry is produced.
 */
export abstract class Asset<TOptions extends object = Record<string, never>> {
  /** Scene-graph root. Parent this to your world. */
  readonly root: Group;

  protected readonly context: AssetContext;
  protected readonly options: Readonly<TOptions>;

  /** Borrow ledger — duplicates are significant, do not de-duplicate. */
  private readonly borrowedGeometries: BufferGeometry[] = [];
  private readonly borrowedMaterials: Material[] = [];

  /** Distinct resources, used to shield cached items from `disposeObject3D`. */
  private readonly sharedGeometries = new Set<BufferGeometry>();
  private readonly sharedMaterials = new Set<Material>();

  private hasBuilt = false;
  private hasDisposed = false;

  constructor(context: AssetContext, options: TOptions) {
    this.context = context;
    this.options = options;
    this.root = new Group();
    this.root.name = this.constructor.name;
  }

  /** `true` once {@link build} has run. */
  get built(): boolean {
    return this.hasBuilt;
  }

  /** `true` once {@link dispose} has run. */
  get disposed(): boolean {
    return this.hasDisposed;
  }

  /**
   * Produces the asset's geometry. Idempotent — calling it twice is a no-op.
   * @throws when the asset has already been disposed.
   */
  build(): this {
    if (this.hasDisposed) {
      throw new Error(`${this.constructor.name}: cannot build a disposed asset.`);
    }
    if (this.hasBuilt) return this;
    this.onBuild();
    this.hasBuilt = true;
    return this;
  }

  /**
   * Releases every cached resource this asset borrowed, empties the scene
   * graph and detaches from the parent. Safe to call more than once.
   */
  dispose(): void {
    if (this.hasDisposed) return;
    this.hasDisposed = true;

    this.onDispose();

    // Cached resources are reference-counted, so they are skipped here and
    // released below. Anything else under the root — a weapon a caller
    // attached, say — is freed outright.
    disposeObject3D(this.root, {
      skipGeometries: this.sharedGeometries,
      skipMaterials: this.sharedMaterials,
    });

    for (let i = 0; i < this.borrowedGeometries.length; i++) {
      this.context.geometry.releaseResource(this.borrowedGeometries[i] as BufferGeometry);
    }
    for (let i = 0; i < this.borrowedMaterials.length; i++) {
      this.context.material.releaseResource(this.borrowedMaterials[i] as Material);
    }

    this.borrowedGeometries.length = 0;
    this.borrowedMaterials.length = 0;
    this.sharedGeometries.clear();
    this.sharedMaterials.clear();
  }

  /** Requests a shared geometry and records the borrow. */
  protected acquireGeometry(key: string, factory: () => BufferGeometry): BufferGeometry {
    return this.trackGeometry(this.context.geometry.acquire(key, factory));
  }

  /** Requests a shared material and records the borrow. */
  protected acquireMaterial<T extends Material>(key: string, factory: () => T): T {
    return this.trackMaterial(this.context.material.acquire(key, factory));
  }

  /**
   * Records a geometry that was acquired through an external helper which
   * builds its own cache key.
   */
  protected trackGeometry<T extends BufferGeometry>(geometry: T): T {
    this.borrowedGeometries.push(geometry);
    this.sharedGeometries.add(geometry);
    return geometry;
  }

  /**
   * Records a material that was acquired through an external helper such as
   * `acquireFlatMaterial`, which builds its own cache key.
   */
  protected trackMaterial<T extends Material>(material: T): T {
    this.borrowedMaterials.push(material);
    this.sharedMaterials.add(material);
    return material;
  }

  /** Builds the asset. Called exactly once, from {@link build}. */
  protected abstract onBuild(): void;

  /** Subclass teardown. Called before borrowed resources are released. */
  protected abstract onDispose(): void;
}

import { Rng } from './Rng';
import { GeometryCache, MaterialCache } from './ResourceCache';

/** Construction options for {@link AssetContext}. */
export interface AssetContextOptions {
  /** Seed for the shared generator. Defaults to `1`. */
  seed?: number | string;
  /** Share an existing geometry cache across contexts. */
  geometryCache?: GeometryCache;
  /** Share an existing material cache across contexts. */
  materialCache?: MaterialCache;
}

/**
 * The shared environment every asset is built against.
 *
 * One context per world (or per level) is the intended usage: assets built
 * through the same context automatically share geometries and materials, which
 * is where the draw-call and memory savings come from. Disposing the context
 * frees everything it handed out.
 */
export class AssetContext {
  /** Deterministic generator. Fork it per subsystem to keep streams isolated. */
  readonly rng: Rng;
  readonly geometry: GeometryCache;
  readonly material: MaterialCache;

  private readonly ownsGeometryCache: boolean;
  private readonly ownsMaterialCache: boolean;

  constructor(options: AssetContextOptions = {}) {
    this.rng = new Rng(options.seed ?? 1);
    this.ownsGeometryCache = options.geometryCache === undefined;
    this.ownsMaterialCache = options.materialCache === undefined;
    this.geometry = options.geometryCache ?? new GeometryCache();
    this.material = options.materialCache ?? new MaterialCache();
  }

  /** Cached geometries and materials currently held, for HUD / debug overlays. */
  stats(): { geometries: number; materials: number } {
    return { geometries: this.geometry.size, materials: this.material.size };
  }

  /**
   * Disposes the caches this context created. Caches passed in from outside
   * are left alone — their owner is responsible for them.
   */
  dispose(): void {
    if (this.ownsGeometryCache) this.geometry.disposeAll();
    if (this.ownsMaterialCache) this.material.disposeAll();
  }
}

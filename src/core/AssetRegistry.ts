import type { Asset } from './Asset';
import type { AssetContext } from './AssetContext';
import type { DeepPartial } from './types';

/**
 * A named, self-describing asset type.
 *
 * The definition carries its own defaults and factory, which is what lets a
 * level file say `{ "type": "character.goblin", "options": { ... } }` and get
 * a real, typed asset back.
 */
export interface AssetDefinition<TOptions extends object, TAsset extends Asset<TOptions>> {
  /** Stable identifier, e.g. `"character.humanoid"`. */
  readonly id: string;
  /** Fully-specified option set applied before any override. */
  readonly defaults: Readonly<TOptions>;
  /** Builds — but does not `build()` — a new instance. */
  create(context: AssetContext, overrides?: DeepPartial<TOptions>): TAsset;
}

/**
 * Type-erased view of a definition, so registrations of different asset types
 * can live in one map without reaching for `any`.
 */
export interface ErasedAssetDefinition {
  readonly id: string;
  readonly defaults: Readonly<object>;
  create(context: AssetContext, overrides?: DeepPartial<object>): Asset<object>;
}

/** Helper that pins the generic parameters at the definition site. */
export function defineAsset<TOptions extends object, TAsset extends Asset<TOptions>>(
  definition: AssetDefinition<TOptions, TAsset>,
): AssetDefinition<TOptions, TAsset> {
  return definition;
}

/**
 * String-keyed lookup of asset definitions.
 *
 * Needed the moment assets come from data rather than code — saved levels,
 * spawn tables, an in-game editor. Keeping typed construction available
 * through {@link createTyped} means the registry never forces callers to give
 * up type safety.
 */
export class AssetRegistry {
  private readonly definitions = new Map<string, ErasedAssetDefinition>();

  /**
   * Registers a definition under its own id.
   * @throws when the id is already taken — silent overwrites hide bugs.
   */
  register<TOptions extends object, TAsset extends Asset<TOptions>>(
    definition: AssetDefinition<TOptions, TAsset>,
  ): this {
    if (this.definitions.has(definition.id)) {
      throw new Error(`AssetRegistry: "${definition.id}" is already registered.`);
    }
    this.definitions.set(
      definition.id,
      definition as unknown as ErasedAssetDefinition,
    );
    return this;
  }

  /** Removes a registration. @returns `true` when something was removed. */
  unregister(id: string): boolean {
    return this.definitions.delete(id);
  }

  /** `true` when `id` is registered. */
  has(id: string): boolean {
    return this.definitions.has(id);
  }

  /** Every registered id, sorted. Allocates — for tooling, not the frame loop. */
  listIds(): string[] {
    return Array.from(this.definitions.keys()).sort();
  }

  /** Looks a definition up without constructing anything. */
  get(id: string): ErasedAssetDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Constructs an asset from a string id — the data-driven path.
   * The result is unbuilt; call `.build()` on it.
   * @throws when `id` is not registered.
   */
  create(
    id: string,
    context: AssetContext,
    overrides?: DeepPartial<object>,
  ): Asset<object> {
    const definition = this.definitions.get(id);
    if (definition === undefined) {
      throw new Error(
        `AssetRegistry: unknown asset id "${id}". Registered: ${this.listIds().join(', ') || '(none)'}`,
      );
    }
    return definition.create(context, overrides);
  }

  /**
   * Constructs an asset from a definition object, preserving its concrete
   * type. Prefer this whenever the definition is known at compile time.
   */
  createTyped<TOptions extends object, TAsset extends Asset<TOptions>>(
    definition: AssetDefinition<TOptions, TAsset>,
    context: AssetContext,
    overrides?: DeepPartial<TOptions>,
  ): TAsset {
    return definition.create(context, overrides);
  }

  /** Empties the registry. Does not touch already-constructed assets. */
  clear(): void {
    this.definitions.clear();
  }
}

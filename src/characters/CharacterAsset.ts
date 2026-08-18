import type { Mesh, Object3D } from 'three';
import { Asset } from '../core/Asset';
import type { AssetContext } from '../core/AssetContext';
import { defineAsset, type AssetDefinition } from '../core/AssetRegistry';
import { acquireFlatMaterial, type FlatMaterialOptions } from '../core/materials';
import {
  CLOTH_COLORS,
  EYE_COLORS,
  FANTASY_SKIN_TONES,
  HAIR_COLORS,
  LEATHER_COLORS,
  METAL_COLORS,
  SKIN_TONES,
  pickShadedColor,
  shadeColor,
} from '../core/Palette';
import type { Rng } from '../core/Rng';
import { mergeOptions, type DeepPartial } from '../core/types';
import { HumanoidBuilder, type ResourceBinder } from './HumanoidBuilder';
import type { HumanoidRig } from './HumanoidRig';
import { HUMANOID_ARCHETYPES, HUMANOID_PROPORTION_PRESETS } from './proportions';
import type {
  AttachmentSlot,
  CharacterOptions,
  EyeStyle,
  HairStyle,
  HumanoidArchetype,
  HumanoidMeasurements,
} from './types';

/** Bone tones, used for the skeleton archetype. */
export const BONE_COLORS: readonly number[] = [0xe8e4d9, 0xdcd6c6, 0xf1ede3, 0xcfc8b6];

/** Baseline character configuration — a `hero`-proportioned humanoid. */
export const DEFAULT_CHARACTER_OPTIONS: CharacterOptions = {
  proportions: HUMANOID_PROPORTION_PRESETS.hero,
  palette: {
    skin: 0xf1c27d,
    hair: 0x3b2416,
    eye: 0x2e5a88,
    shirt: 0x3b5f8f,
    pants: 0x3f3f4a,
    shoes: 0x4a2f1a,
    accent: 0x8b5a2b,
  },
  style: {
    hair: 'short',
    eyes: 'dot',
    beard: false,
    shoulderPads: false,
    belt: true,
    bareLimbs: true,
  },
  limbSegments: 6,
  castShadow: true,
  receiveShadow: true,
  flatShading: true,
};

/**
 * A procedurally built low-poly humanoid.
 *
 * The asset owns the rig, the meshes and the borrowed cache entries. Drive it
 * with a {@link LocomotionAnimator}, or pose `asset.rig` yourself — the rig is
 * plain `Object3D`s, nothing is hidden behind an animation system.
 */
export class CharacterAsset extends Asset<CharacterOptions> {
  private rigInstance: HumanoidRig | null = null;
  private meshList: readonly Mesh[] = [];
  private readonly binder: ResourceBinder;

  constructor(context: AssetContext, options: CharacterOptions) {
    super(context, options);

    // Routing the builder's resource requests through the asset is what keeps
    // dispose() exact: every borrow made here is recorded against this asset.
    this.binder = {
      geometry: (key, factory) => this.acquireGeometry(key, factory),
      material: (materialOptions: FlatMaterialOptions) =>
        this.trackMaterial(acquireFlatMaterial(this.context.material, materialOptions)),
    };
  }

  /**
   * The skeleton.
   * @throws when accessed before {@link build} or after {@link dispose}.
   */
  get rig(): HumanoidRig {
    if (this.rigInstance === null) {
      throw new Error('CharacterAsset: rig is unavailable — call build() first.');
    }
    return this.rigInstance;
  }

  /** Absolute body measurements this character was laid out from. */
  get measurements(): HumanoidMeasurements {
    return this.rig.measurements;
  }

  /** Every part mesh, in creation order. */
  get meshes(): readonly Mesh[] {
    return this.meshList;
  }

  /** Total standing height in world units. */
  get height(): number {
    return this.rig.measurements.height;
  }

  /**
   * Parents `object` to an equipment socket.
   *
   * The object keeps its own local transform, so a sword modelled pointing
   * along `+Y` will point out of the fist. Attached objects are *not* owned by
   * the character: `dispose()` frees them along with the rest of the graph, so
   * detach anything you intend to reuse.
   */
  attach(slot: AttachmentSlot, object: Object3D): void {
    this.rig.getAttachment(slot).add(object);
  }

  /** Removes `object` from whichever socket holds it. */
  detach(object: Object3D): void {
    object.removeFromParent();
  }

  /** Returns the socket for `slot`, for direct manipulation. */
  getAttachment(slot: AttachmentSlot): Object3D {
    return this.rig.getAttachment(slot);
  }

  protected override onBuild(): void {
    const builder = new HumanoidBuilder(this.binder);
    const result = builder.build(this.options);
    this.rigInstance = result.rig;
    this.meshList = result.meshes;
    this.root.add(result.rig.root);
  }

  protected override onDispose(): void {
    this.rigInstance = null;
    this.meshList = [];
  }
}

/** Creates an unbuilt character from the defaults plus `overrides`. */
export function createCharacter(
  context: AssetContext,
  overrides?: DeepPartial<CharacterOptions>,
): CharacterAsset {
  return new CharacterAsset(context, mergeOptions(DEFAULT_CHARACTER_OPTIONS, overrides));
}

/** Creates an unbuilt character using an archetype's body proportions. */
export function createArchetypeCharacter(
  context: AssetContext,
  archetype: HumanoidArchetype,
  overrides?: DeepPartial<CharacterOptions>,
): CharacterAsset {
  const base = mergeOptions(DEFAULT_CHARACTER_OPTIONS, {
    proportions: HUMANOID_PROPORTION_PRESETS[archetype],
  });
  return new CharacterAsset(context, mergeOptions(base, overrides));
}

const HAIR_STYLES: readonly HairStyle[] = [
  'none',
  'short',
  'short',
  'long',
  'ponytail',
  'bun',
  'mohawk',
  'hood',
  'helmet',
];

const EYE_STYLES: readonly EyeStyle[] = ['dot', 'dot', 'box'];

/** Skin palette appropriate to the archetype. */
function skinPaletteFor(archetype: HumanoidArchetype): readonly number[] {
  switch (archetype) {
    case 'goblin':
    case 'ogre':
      return FANTASY_SKIN_TONES;
    case 'skeleton':
      return BONE_COLORS;
    default:
      return SKIN_TONES;
  }
}

/**
 * Rolls a complete, plausible character configuration.
 *
 * Height gets a few percent of jitter so a crowd built from one archetype
 * still reads as a crowd of individuals rather than a row of clones.
 */
export function randomCharacterOptions(
  rng: Rng,
  archetype?: HumanoidArchetype,
): CharacterOptions {
  const chosen = archetype ?? rng.pick(HUMANOID_ARCHETYPES);
  const preset = HUMANOID_PROPORTION_PRESETS[chosen];
  const isSkeleton = chosen === 'skeleton';

  const shirt = pickShadedColor(rng, CLOTH_COLORS);
  const accent = rng.bool(0.5)
    ? pickShadedColor(rng, LEATHER_COLORS)
    : pickShadedColor(rng, METAL_COLORS);

  return mergeOptions(DEFAULT_CHARACTER_OPTIONS, {
    proportions: {
      ...preset,
      height: preset.height * (1 + rng.spread(0.05)),
    },
    palette: {
      skin: pickShadedColor(rng, skinPaletteFor(chosen), 0.08),
      hair: pickShadedColor(rng, HAIR_COLORS),
      eye: isSkeleton ? 0x101014 : rng.pick(EYE_COLORS),
      shirt,
      // Trousers echo the shirt, darkened — reads as a coordinated outfit.
      pants: rng.bool(0.6) ? shadeColor(shirt, 0.65) : pickShadedColor(rng, CLOTH_COLORS),
      shoes: pickShadedColor(rng, LEATHER_COLORS),
      accent,
    },
    style: {
      hair: isSkeleton ? (rng.bool(0.5) ? 'helmet' : 'none') : rng.pick(HAIR_STYLES),
      eyes: rng.pick(EYE_STYLES),
      beard: !isSkeleton && rng.bool(0.3),
      shoulderPads: rng.bool(0.35),
      belt: rng.bool(0.75),
      bareLimbs: rng.bool(0.6),
    },
    limbSegments: rng.intInclusive(5, 8),
  });
}

/** Creates an unbuilt character with randomised proportions, palette and style. */
export function createRandomCharacter(
  context: AssetContext,
  rng?: Rng,
  archetype?: HumanoidArchetype,
): CharacterAsset {
  return new CharacterAsset(context, randomCharacterOptions(rng ?? context.rng, archetype));
}

/** Registry entry, for data-driven spawning. */
export const CHARACTER_ASSET: AssetDefinition<CharacterOptions, CharacterAsset> = defineAsset({
  id: 'character.humanoid',
  defaults: DEFAULT_CHARACTER_OPTIONS,
  create: (context, overrides) => createCharacter(context, overrides),
});

import type { Object3D } from 'three';
import type { AssetContext } from '../core/AssetContext';
import { hslColor, mixColor, shadeColor } from '../core/Palette';
import { Rng } from '../core/Rng';
import type { AimOptions } from '../equipment/AimController';
import type { RecoilOptions } from '../equipment/RecoilController';
import type {
  BladeOptions,
  BladeSweepOptions,
  MeleeHitHandler,
} from '../equipment/BladeSweep';
import type { SwingOptions, SwingStyle } from '../equipment/SwingController';
import { EquipmentHolder, type EquipOptions } from '../equipment/EquipmentHolder';
import type { GhostHandOptions } from '../equipment/types';
import { CreatureAsset, type CreatureOptions } from './CreatureAsset';
import type { CreatureRig } from './CreatureRig';
import {
  createAnimatorForPlan,
  type AnyCreatureAnimatorOptions,
} from './animators/createAnimator';
import type { CreatureAnimator } from './animators/CreatureAnimator';
import { createBallerinaSkeleton } from './skeletons/ballerina';
import { createBombardinoSkeleton } from './skeletons/bombardino';
import { createCactusSkeleton } from './skeletons/cactus';
import { createDoggoSkeleton } from './skeletons/doggo';
import { createFrigoSkeleton } from './skeletons/frigo';
import { createGigaChadSkeleton } from './skeletons/gigachad';
import { createNinjaCupSkeleton } from './skeletons/ninjacup';
import { createPatapimSkeleton } from './skeletons/patapim';
import { createBrrBrrDengDengSkeleton } from './skeletons/dengdeng';
import { createPropellerSkeleton } from './skeletons/propeller';
import { createSharkSkeleton } from './skeletons/shark';
import { createTungTungSkeleton } from './skeletons/tungtung';
import { createUdinSkeleton } from './skeletons/udin';
import { createVaccaSkeleton } from './skeletons/vacca';
import {
  SIZE_TIER_HEIGHTS,
  type BodyPlan,
  type CreaturePalette,
  type DeathStyle,
  type SizeTier,
  type SkeletonDefinition,
} from './types';

/** The archetypes shipped in phase one. */
export type BrainrotRecipeId =
  | 'gigachad'
  | 'mewing-doggo'
  | 'skibidi-propeller'
  | 'tralalero-shark'
  | 'cactus-walker'
  | 'tung-tung-sahur'
  | 'bombardino-crocodilo'
  | 'la-vacca-saturno'
  | 'frigo-camelo'
  | 'udin-din-din-dun'
  | 'ninja-coffee'
  | 'ballerina-cappuccina'
  | 'brr-brr-patapim'
  | 'brr-brr-deng-deng';

/** A complete, spawnable creature description. */
export interface CreatureRecipe {
  readonly id: BrainrotRecipeId;
  readonly displayName: string;
  readonly plan: BodyPlan;
  /** Size bracket this creature is designed around. */
  readonly defaultTier: SizeTier;
  readonly palette: CreaturePalette;
  readonly deathStyle: DeathStyle;
  /** Per-recipe animator overrides. */
  readonly animator?: AnyCreatureAnimatorOptions;
  /** Built fresh on every spawn, so recipes stay immutable. */
  createSkeleton(): SkeletonDefinition;
}

export const BRAINROT_RECIPES: Readonly<Record<BrainrotRecipeId, CreatureRecipe>> = Object.freeze({
  gigachad: {
    id: 'gigachad',
    displayName: 'GigaChad',
    plan: 'biped',
    defaultTier: 'player',
    deathStyle: 'collapse',
    palette: {
      primary: 0xe0a96d,
      secondary: 0x2e3440,
      accent: 0x2b1b12,
      detail: 0xf2f2f2,
      eye: 0x2e5a88,
      metal: 0xc8a951,
      organic: 0x4f7d3a,
    },
    animator: { moveSpeed: 1.7, fastSpeed: 5.2 },
    createSkeleton: createGigaChadSkeleton,
  },

  'mewing-doggo': {
    id: 'mewing-doggo',
    displayName: 'Mewing Doggo',
    plan: 'quadruped',
    defaultTier: 'minion',
    deathStyle: 'collapse',
    palette: {
      primary: 0x5a8f4a,
      secondary: 0xcfcf9e,
      accent: 0x3f6b32,
      detail: 0xf5f2e6,
      eye: 0xe0b23a,
      metal: 0x9aa3ad,
      organic: 0x6b4a2f,
    },
    animator: { moveSpeed: 1.9, fastSpeed: 6.0 },
    createSkeleton: createDoggoSkeleton,
  },

  'skibidi-propeller': {
    id: 'skibidi-propeller',
    displayName: 'Skibidi Propeller',
    plan: 'flyer',
    defaultTier: 'player',
    deathStyle: 'deflate',
    palette: {
      primary: 0x6b8f3f,
      secondary: 0xd8d0b8,
      accent: 0x8f3b3b,
      detail: 0xf5f2e6,
      eye: 0x2e5a88,
      metal: 0xb8bec7,
      organic: 0x4f7d3a,
    },
    animator: { moveSpeed: 2.4, fastSpeed: 8.0 },
    createSkeleton: createPropellerSkeleton,
  },

  'tralalero-shark': {
    id: 'tralalero-shark',
    displayName: 'Tralalero Shark',
    plan: 'swimmer',
    defaultTier: 'player',
    deathStyle: 'melt',
    palette: {
      primary: 0x4a6fa5,
      secondary: 0xe8eef5,
      accent: 0x2e4a72,
      detail: 0xfafafa,
      eye: 0x101014,
      metal: 0x9aa3ad,
      organic: 0x3f6b32,
    },
    animator: { moveSpeed: 2.0, fastSpeed: 6.5 },
    createSkeleton: createSharkSkeleton,
  },

  'tung-tung-sahur': {
    id: 'tung-tung-sahur',
    displayName: 'Tung Tung Tung Sahur',
    plan: 'biped',
    defaultTier: 'player',
    deathStyle: 'collapse',
    palette: {
      // Warm polished wood, matched to the reference renders.
      organic: 0xc07a42,
      primary: 0xdda76a,
      secondary: 0xa85f30,
      accent: 0x4a2a17,
      detail: 0xf2ece0,
      eye: 0x2a1810,
      metal: 0x8a6b3d,
    },
    // Heavier and more deliberate than GigaChad, and barely leans: a rigid log
    // that pitches forward swings the head pivot far enough to sink the face
    // into its own surface.
    animator: { moveSpeed: 1.45, fastSpeed: 4.4, cycleScale: 0.92, torsoLean: 0.08 },
    createSkeleton: createTungTungSkeleton,
  },

  'bombardino-crocodilo': {
    id: 'bombardino-crocodilo',
    displayName: 'Bombardino Crocodilo',
    plan: 'flyer',
    defaultTier: 'boss',
    // Not deflate: a bomber goes down, it does not shrivel. `collapse` rolls it
    // onto a wingtip and drives it into the ground, which is the shape of the
    // thing.
    deathStyle: 'collapse',
    palette: {
      // Matched to the reference render: olive hide over bare aluminium.
      primary: 0x5f7a45,
      secondary: 0xd6d2bc,
      accent: 0x3d4a26,
      detail: 0xf2efe2,
      eye: 0xd8b03c,
      metal: 0xb4bac1,
      organic: 0x3f5230,
    },
    // An airframe, not a bird: it barely beats its wings and locks into a glide
    // almost immediately, the gear folds well clear of the fuselage, and both
    // engines turn faster than the single-engine archetype's.
    animator: {
      moveSpeed: 2.6,
      fastSpeed: 9.0,
      flapAmount: 0.1,
      flapRate: 1.4,
      glideSpeed: 2.2,
      bankAmount: 0.55,
      bobAmount: 0.05,
      legTuck: 1.15,
      propellerIdleRps: 3.2,
      propellerSpeedRps: 2.0,
      payloadSwing: 0.75,
    },
    createSkeleton: createBombardinoSkeleton,
  },

  'la-vacca-saturno': {
    id: 'la-vacca-saturno',
    displayName: 'La Vacca Saturno Saturnita',
    plan: 'biped',
    defaultTier: 'boss',
    // A planet does not shrivel and it does not liquefy: it topples.
    deathStyle: 'collapse',
    palette: {
      // Matched to the reference render: a pale sage gas giant, warm grey
      // rings, Holstein head, bare skin on the legs and feet.
      primary: 0xccd4c9,
      secondary: 0xa8a396,
      accent: 0x2b2724,
      detail: 0xf3f0e7,
      eye: 0x120e0c,
      metal: 0x66727a,
      organic: 0xdda386,
    },
    // Heavy and unhurried, with a wide waddle. `strideLength` is set by hand
    // because the automatic estimate follows hip height, and this creature's
    // hips sit at a quarter of its height — left to itself it would trot at
    // three strides a second under a body the size of a planet. The torso
    // barely leans and barely twists for the same reason it does on
    // `tung-tung-sahur`: the trunk is one rigid piece, so any real rotation
    // swings the head pivot far enough to bury the muzzle in the sphere.
    animator: {
      moveSpeed: 1.5,
      fastSpeed: 4.4,
      cycleScale: 0.85,
      strideLength: 0.9,
      legSwing: 0.42,
      legSwingFast: 0.72,
      kneeBend: 0.55,
      hipBob: 0.055,
      hipSway: 0.14,
      torsoLean: 0.07,
      torsoCounterRotate: 0.06,
    },
    createSkeleton: createVaccaSkeleton,
  },

  'frigo-camelo': {
    id: 'frigo-camelo',
    displayName: 'Frigo Camelo',
    plan: 'biped',
    defaultTier: 'player',
    // An appliance falls over. It does not shrivel and it does not liquefy.
    deathStyle: 'collapse',
    palette: {
      // Matched to the reference: warm camel hide, an off-white enamel carcass
      // with paler doors, tan leather boots on black rubber.
      primary: 0xb08050,
      secondary: 0xb9c1c8,
      accent: 0x9c6434,
      detail: 0xeef1f3,
      eye: 0x140f0b,
      metal: 0x6c757d,
      organic: 0x40301f,
    },
    // Slow and top-heavy. `strideLength` is set by hand for the same reason it
    // is on `la-vacca-saturno`: the automatic estimate follows hip height, and
    // this creature's hips sit at a fifth of its height, so left alone it
    // scurries. The torso barely leans and barely twists because it is one
    // rigid box — real rotation creases a shape that visibly cannot crease.
    animator: {
      moveSpeed: 1.4,
      fastSpeed: 4.2,
      cycleScale: 0.9,
      strideLength: 0.62,
      legSwing: 0.38,
      legSwingFast: 0.62,
      kneeBend: 0.5,
      hipBob: 0.05,
      hipSway: 0.11,
      torsoLean: 0.06,
      torsoCounterRotate: 0.05,
    },
    createSkeleton: createFrigoSkeleton,
  },

  'udin-din-din-dun': {
    id: 'udin-din-din-dun',
    displayName: 'Udin Din Din Dun',
    plan: 'biped',
    defaultTier: 'player',
    // A body with legs falls over. Fruit would argue for `melt`, but this one
    // is built like a weightlifter and reads as one.
    deathStyle: 'collapse',
    palette: {
      // Matched to the reference: ripe orange rind over deeper orange shading,
      // brick red and off-white on the sneakers, a green leaf.
      primary: 0xf2912a,
      secondary: 0xcd6d12,
      accent: 0x92301d,
      detail: 0xf4eee2,
      eye: 0x140c06,
      // Doubles as the shorts and the black of the sneakers — the palette has
      // seven slots and this creature needs eight, and these are the two dark
      // masses nobody reads as the same material.
      metal: 0x2b1c33,
      organic: 0x6e9c37,
    },
    // Heavy and wide. `strideLength` is set by hand because the automatic
    // estimate follows hip height, and this creature's hips sit at under a
    // third of its height — left alone it scurries under a body the size of a
    // beach ball. The arms swing less than a humanoid's for the same reason a
    // real heavyweight's do: there is too much of them. Torso lean and twist
    // are damped because the face is planted on the torso itself, and a big
    // lean swings it off the front of the sphere.
    animator: {
      moveSpeed: 1.55,
      fastSpeed: 4.8,
      cycleScale: 0.9,
      strideLength: 0.82,
      legSwing: 0.46,
      legSwingFast: 0.78,
      kneeBend: 0.7,
      armSwing: 0.3,
      armSwingFast: 0.55,
      elbowBend: 0.45,
      hipBob: 0.05,
      hipSway: 0.13,
      torsoLean: 0.1,
      torsoCounterRotate: 0.07,
    },
    createSkeleton: createUdinSkeleton,
  },

  'ninja-coffee': {
    id: 'ninja-coffee',
    displayName: 'Ninja Coffee Cup',
    plan: 'biped',
    defaultTier: 'player',
    // A cup on legs topples. It does not melt and it does not shrivel.
    deathStyle: 'collapse',
    palette: {
      // Matched to the reference: warm off-white paper, near-black cloth,
      // brushed steel on the forehead plate.
      primary: 0xe9e4d7,
      secondary: 0xcfc7b5,
      accent: 0x1b1b20,
      detail: 0xfaf8f3,
      eye: 0x101013,
      metal: 0xb7bcc3,
      organic: 0x33333a,
    },
    // Quick and light — the one creature here that is *supposed* to move like a
    // fighter. `strideLength` is set by hand for the same reason it is on the
    // other top-heavy archetypes: the automatic estimate follows hip height,
    // and this one's hips sit at a fifth of its height, so left alone it takes
    // four steps a second. Lean and twist are damped because the cup is a
    // single rigid cone and a real torso bend would crease it — and because the
    // swing pose does the torso work now.
    animator: {
      moveSpeed: 1.7,
      fastSpeed: 5.6,
      cycleScale: 1.05,
      strideLength: 0.5,
      legSwing: 0.5,
      legSwingFast: 0.92,
      kneeBend: 0.62,
      armSwing: 0.4,
      armSwingFast: 0.72,
      elbowBend: 0.5,
      hipBob: 0.05,
      hipSway: 0.1,
      torsoLean: 0.09,
      torsoCounterRotate: 0.07,
    },
    createSkeleton: createNinjaCupSkeleton,
  },

  'ballerina-cappuccina': {
    id: 'ballerina-cappuccina',
    displayName: 'Ballerina Cappuccina',
    plan: 'biped',
    defaultTier: 'player',
    // Porcelain on two thin legs topples. It does not melt and it does not
    // shrivel.
    deathStyle: 'collapse',
    palette: {
      // Matched to the reference: glazed off-white china, warm skin, rose-pink
      // satin, dark lashes and a caramel crema under white foam.
      primary: 0xf6f1e7,
      secondary: 0xf0c2a2,
      accent: 0xe89ab4,
      detail: 0xfffdf7,
      eye: 0x6b3a1c,
      // The crema in the cup. Nothing on this creature is metal, and the drink
      // is the one mass that needs a colour of its own.
      metal: 0xc08144,
      organic: 0x3f2417,
    },
    // Light and quick, and barely leans. `strideLength` is set by hand because
    // the automatic estimate follows hip height, and hers sit high — left alone
    // she takes strides a third longer than a dancer's step. The arms swing far
    // less than a walker's: the port de bras is a held position, and an arm that
    // swings out of it stops reading as ballet. Lean and twist are damped
    // because the head is a rigid bowl of liquid balanced on a thin neck.
    animator: {
      moveSpeed: 1.6,
      fastSpeed: 5.0,
      cycleScale: 1.15,
      strideLength: 0.62,
      legSwing: 0.5,
      legSwingFast: 0.88,
      kneeBend: 0.5,
      armSwing: 0.16,
      armSwingFast: 0.3,
      elbowBend: 0.18,
      hipBob: 0.045,
      hipSway: 0.1,
      torsoLean: 0.07,
      torsoCounterRotate: 0.06,
    },
    createSkeleton: createBallerinaSkeleton,
  },

  'brr-brr-patapim': {
    id: 'brr-brr-patapim',
    displayName: 'Brr Brr Patapim',
    plan: 'biped',
    defaultTier: 'player',
    // A tree topples. `melt` would suit the moss and nothing else about it.
    deathStyle: 'collapse',
    palette: {
      // Matched to the reference: pale bark-skin on the face and the feet,
      // darker wood in the hollows, near-black root ends, white hair.
      primary: 0xd9b183,
      secondary: 0xb1855a,
      accent: 0x4a3520,
      detail: 0xece7d8,
      eye: 0xe0c22c,
      // The deep green of the foliage. Nothing on this creature is metal, and
      // the moss is the one mass that needs a second colour of its own — a
      // single flat green over the crown, the mantle and the trunk reads as a
      // painted lump rather than as growth.
      metal: 0x2f5326,
      organic: 0x5d8f3a,
    },
    // Slow, flat-footed and barely leaning. `strideLength` is set by hand for
    // the same reason it is on the other squat archetypes: the automatic
    // estimate follows hip height, and this creature's hips sit at a third of
    // its height. The leg swing is damped harder than any of them because the
    // feet are enormous — the toes sit four tenths of a unit ahead of the ankle,
    // there is no foot IK anywhere in the library, and a humanoid's stride
    // drives the front half of both feet through the floor. The trunk barely
    // leans or twists because it is one rigid mossy log, and because a real bend
    // swings the head pivot far enough to bury that nose in its own chest.
    animator: {
      moveSpeed: 1.35,
      fastSpeed: 4.0,
      cycleScale: 0.82,
      strideLength: 0.7,
      legSwing: 0.32,
      legSwingFast: 0.52,
      kneeBend: 0.44,
      armSwing: 0.34,
      armSwingFast: 0.6,
      elbowBend: 0.3,
      hipBob: 0.04,
      hipSway: 0.12,
      torsoLean: 0.07,
      torsoCounterRotate: 0.06,
    },
    createSkeleton: createPatapimSkeleton,
  },

  'brr-brr-deng-deng': {
    id: 'brr-brr-deng-deng',
    displayName: 'Brr Brr Deng Deng',
    plan: 'biped',
    defaultTier: 'player',
    deathStyle: 'collapse',
    palette: {
      // Warm monkey face & bare foot skin
      primary: 0xd49b78,
      // Deep wood hollows, dorsal foot tendon ridges & root bodies
      secondary: 0x8a5d3b,
      // Rosy proboscis nose bulb & fleshy snout tones
      accent: 0xc84c4c,
      // Fluffy white/grey beard, side whiskers & toenails
      detail: 0xede8dc,
      // Warm amber monkey eye iris
      eye: 0xd49f28,
      // Dark curly hair cap & deep bark accents
      metal: 0x1f241d,
      // Lush forest moss mantle, brow ridge & leg moss
      organic: 0x3b6326,
    },
    animator: {
      moveSpeed: 1.35,
      fastSpeed: 4.0,
      cycleScale: 0.82,
      strideLength: 0.7,
      legSwing: 0.32,
      legSwingFast: 0.52,
      kneeBend: 0.44,
      armSwing: 0.34,
      armSwingFast: 0.6,
      elbowBend: 0.3,
      hipBob: 0.04,
      hipSway: 0.12,
      torsoLean: 0.07,
      torsoCounterRotate: 0.06,
    },
    createSkeleton: createBrrBrrDengDengSkeleton,
  },

  'cactus-walker': {
    id: 'cactus-walker',
    displayName: 'Cactus Walker',
    plan: 'hybrid',
    defaultTier: 'boss',
    deathStyle: 'melt',
    palette: {
      primary: 0x4f7d3a,
      secondary: 0xb8873b,
      accent: 0xe0c341,
      detail: 0xf0ead2,
      eye: 0x1c1410,
      metal: 0x9aa3ad,
      organic: 0x4f7d3a,
    },
    animator: { moveSpeed: 1.3, fastSpeed: 3.6 },
    createSkeleton: createCactusSkeleton,
  },
});

/** Every recipe id. */
export const BRAINROT_RECIPE_IDS: readonly BrainrotRecipeId[] = Object.keys(
  BRAINROT_RECIPES,
) as BrainrotRecipeId[];

/**
 * Looks a recipe up.
 * @throws when the id is unknown.
 */
export function getRecipe(id: BrainrotRecipeId | string): CreatureRecipe {
  const recipe = (BRAINROT_RECIPES as Record<string, CreatureRecipe | undefined>)[id];
  if (recipe === undefined) {
    throw new Error(
      `getRecipe: unknown recipe "${id}". Available: ${BRAINROT_RECIPE_IDS.join(', ')}`,
    );
  }
  return recipe;
}

/**
 * Derives a coherent palette variation from a base.
 *
 * Rolling seven independent colours produces noise, not a character. Instead
 * one hue is rolled and every slot is nudged toward it, which keeps the
 * creature recognisable while making each spawn distinct.
 */
export function randomCreaturePalette(rng: Rng, base: CreaturePalette): CreaturePalette {
  const hue = rng.next();
  const tint = hslColor(hue, 0.55, 0.5);
  const strength = rng.range(0.18, 0.42);
  const brightness = 1 + rng.spread(0.12);

  return {
    primary: shadeColor(mixColor(base.primary, tint, strength), brightness),
    secondary: shadeColor(mixColor(base.secondary, tint, strength * 0.5), brightness),
    accent: shadeColor(mixColor(base.accent, tint, strength * 0.8), brightness),
    // Teeth, eyes and hardware stay close to the original, or the creature
    // stops reading as itself.
    detail: shadeColor(base.detail, 1 + rng.spread(0.05)),
    eye: base.eye,
    metal: shadeColor(base.metal, 1 + rng.spread(0.08)),
    organic: shadeColor(mixColor(base.organic, tint, strength * 0.4), brightness),
  };
}

/** Options for {@link spawnFromRecipe}. */
export interface SpawnOptions {
  recipeId: BrainrotRecipeId | string;
  /**
   * `'random'` derives a variation from the recipe's palette, an object
   * overrides individual slots, and omitting it keeps the recipe's own colours.
   */
  colorPalette?: Partial<CreaturePalette> | 'random';
  /**
   * A {@link SizeTier} or an explicit world-space height. Omit to keep the
   * creature's natural authored size.
   */
  scale?: SizeTier | number;
  /** Uniform multiplier applied on top of `scale`. Defaults to `1`. */
  scaleMultiplier?: number;
  /**
   * `true` also jitters the size within the tier, so a crowd of one recipe
   * still reads as a crowd of individuals.
   */
  randomize?: boolean;
  seed?: number | string;
  segments?: number;
  flatShading?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  animator?: AnyCreatureAnimatorOptions;
  /** Look of the hands conjured for a handless creature that picks something up. */
  ghostHand?: Partial<GhostHandOptions>;
  /** Tuning for the raise-to-aim pose. */
  aim?: Partial<AimOptions>;
  /** Tuning for the recoil spring. */
  recoil?: Partial<RecoilOptions>;
  /** Tuning for the melee swing. */
  swing?: Partial<SwingOptions>;
  /** Tuning for melee hit detection. */
  sweep?: Partial<BladeSweepOptions>;
}

/** A spawned creature, ready to be parented and ticked. */
export interface BrainrotInstance {
  readonly id: BrainrotRecipeId;
  readonly displayName: string;
  readonly plan: BodyPlan;
  readonly asset: CreatureAsset;
  /** Parent this to your scene. */
  readonly root: Object3D;
  readonly rig: CreatureRig;
  readonly animator: CreatureAnimator;
  /** Final world-space height. */
  readonly height: number;
  /** Per-frame movement inputs. */
  setState(speed: number, grounded: boolean, turnRate?: number): void;
  /** Starts the death animation. */
  die(): void;
  /** Advances the animation. */
  update(dt: number): void;
  /**
   * Puts something in the creature's hand.
   *
   * Creatures with hands take it in one. Creatures without — which is most of
   * them — grow a ghost forearm around it, and lose it again on
   * {@link BrainrotInstance.unequip}. The holder is built on first use, so a
   * creature that never picks anything up costs nothing for this.
   */
  equip(weapon: Object3D, options?: EquipOptions): void;
  /** Takes the weapon back and dissolves any conjured hands. */
  unequip(): Object3D | null;
  /** `true` while something is held. */
  isHolding(): boolean;
  /**
   * Raises or lowers the held weapon into the aim pose.
   *
   * The blend is what makes it read as an animation, so this is a state change,
   * not a trigger: set it and keep calling {@link BrainrotInstance.update}.
   */
  setAiming(on: boolean): void;
  /** Points the weapon, in radians relative to the creature's own facing. */
  setAim(yaw: number, pitch: number): void;
  /** Points the weapon at a world-space position. */
  aimAt(x: number, y: number, z: number): void;
  /** How far into the aim pose, `0` (carried) to `1` (presented). */
  aimWeight(): number;
  /**
   * Fires the held weapon.
   *
   * @returns `false` when nothing is held or the cooldown has not elapsed, so a
   * held trigger can call this every frame and get the weapon's rate of fire.
   */
  fire(): boolean;
  /** Current recoil, `0` at rest and `1` at the peak of a single shot. */
  recoil(): number;
  /**
   * Swings the held weapon.
   *
   * @param style Omit to let the combo alternate, which is what a held attack
   * button should produce.
   * @returns `false` when nothing is held, when a cut is already committed, or
   * when the cooldown has not elapsed — so this can be called every frame.
   */
  swing(style?: SwingStyle): boolean;
  /** `true` from the first frame of a wind-up to the last of a recovery. */
  isSwinging(): boolean;
  /** `true` only while the edge is travelling — the window a hit can land in. */
  isStriking(): boolean;
  /** How far through the current swing, `0`–`1`. */
  swingProgress(): number;
  /**
   * Registers something the blade can hit.
   *
   * @param radius World-space radius of the target's hit sphere.
   * @param data Handed straight back on the hit — this is where your own enemy
   * object goes.
   */
  addHitTarget(object: Object3D, radius: number, data?: unknown): void;
  /** Stops `object` being hittable. */
  removeHitTarget(object: Object3D): void;
  /** Forgets every target. */
  clearHitTargets(): void;
  /**
   * Registers a second blade the creature carries in a socket rather than in
   * its hand — the off-hand sword of a two-sword archetype, a spur, a horn.
   *
   * The equipped weapon is registered automatically; this is for everything
   * that swings with the body without being held.
   */
  addBlade(object: Object3D, options?: BladeOptions): void;
  /** Stops `object` cutting. */
  removeBlade(object: Object3D): void;
  /**
   * Called for every hit, with a *reused* record — copy anything that has to
   * outlive the call. `null` ignores hits.
   */
  onHit(handler: MeleeHitHandler | null): void;
  /** Hits this creature has landed since it was spawned. */
  hitCount(): number;
  /** Frees every borrowed resource. The held weapon is handed back, not freed. */
  dispose(): void;
}

/**
 * Builds a creature from a recipe id.
 *
 * The single entry point for spawning: it resolves the recipe, applies palette
 * and size choices, builds the asset and wires up the animator its body plan
 * calls for.
 *
 * ```ts
 * const shark = spawnFromRecipe(context, {
 *   recipeId: 'tralalero-shark',
 *   colorPalette: 'random',
 *   scale: 'boss',
 * });
 * scene.add(shark.root);
 * ```
 */
export function spawnFromRecipe(
  context: AssetContext,
  options: SpawnOptions,
): BrainrotInstance {
  const recipe = getRecipe(options.recipeId);
  const rng = options.seed === undefined ? context.rng : new Rng(options.seed);

  // --- Palette -----------------------------------------------------------
  let palette: CreaturePalette;
  if (options.colorPalette === 'random') {
    palette = randomCreaturePalette(rng, recipe.palette);
  } else if (options.colorPalette !== undefined) {
    palette = { ...recipe.palette, ...options.colorPalette };
  } else {
    palette = { ...recipe.palette };
  }

  // --- Size --------------------------------------------------------------
  const requested = options.scale ?? null;
  let targetHeight = 0;
  if (typeof requested === 'string') {
    targetHeight = SIZE_TIER_HEIGHTS[requested];
  } else if (typeof requested === 'number' && requested > 0) {
    targetHeight = requested;
  }

  let multiplier = options.scaleMultiplier ?? 1;
  if (options.randomize === true) {
    multiplier *= 1 + rng.spread(0.12);
  }

  const creatureOptions: CreatureOptions = {
    skeleton: recipe.createSkeleton(),
    palette,
    segments: options.segments ?? 7,
    flatShading: options.flatShading ?? true,
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true,
    targetHeight,
    scaleMultiplier: multiplier,
  };

  const asset = new CreatureAsset(context, creatureOptions).build();

  const animator = createAnimatorForPlan(asset.rig, {
    ...recipe.animator,
    ...options.animator,
    death: {
      style: recipe.deathStyle,
      fallDirection: rng.sign(),
      ...recipe.animator?.death,
      ...options.animator?.death,
    },
  });

  // Built on first equip. Most creatures never hold anything, and an unused
  // holder is two null fields rather than a second object per spawn.
  let holder: EquipmentHolder | null = null;
  const ensureHolder = (): EquipmentHolder => {
    if (holder === null) {
      holder = new EquipmentHolder(context, asset.rig, {
        ghost: options.ghostHand,
        aim: options.aim,
        recoil: options.recoil,
        swing: options.swing,
        sweep: options.sweep,
      });
    }
    return holder;
  };

  return {
    id: recipe.id,
    displayName: recipe.displayName,
    plan: recipe.plan,
    asset,
    root: asset.root,
    rig: asset.rig,
    animator,
    height: asset.height,
    setState: (speed, grounded, turnRate = 0) => animator.setState(speed, grounded, turnRate),
    die: () => animator.die(),
    update: (dt) => {
      animator.update(dt);
      // After the animator: the hands hang off bones the animator just moved,
      // and their own float is applied on top of that.
      if (holder !== null) holder.update(dt);
    },
    equip: (weapon, equipOptions) => ensureHolder().equip(weapon, equipOptions),
    unequip: () => (holder === null ? null : holder.unequip()),
    isHolding: () => holder !== null && holder.holding,
    setAiming: (on) => ensureHolder().aim.setAiming(on),
    setAim: (yaw, pitch) => ensureHolder().aim.setAim(yaw, pitch),
    aimAt: (x, y, z) => ensureHolder().aim.aimAt(x, y, z),
    aimWeight: () => (holder === null ? 0 : holder.aim.weight),
    fire: () => holder !== null && holder.fire(),
    recoil: () => (holder === null ? 0 : holder.recoil.level),
    swing: (style) => ensureHolder().strike(style),
    isSwinging: () => holder !== null && holder.swing.active,
    isStriking: () => holder !== null && holder.swing.striking,
    swingProgress: () => (holder === null ? 0 : holder.swing.progress),
    addHitTarget: (object, radius, data) => ensureHolder().blades.addTarget(object, radius, data),
    removeHitTarget: (object) => {
      if (holder !== null) holder.blades.removeTarget(object);
    },
    clearHitTargets: () => {
      if (holder !== null) holder.blades.clearTargets();
    },
    addBlade: (object, bladeOptions) => ensureHolder().blades.addBlade(object, bladeOptions),
    removeBlade: (object) => {
      if (holder !== null) holder.blades.removeBlade(object);
    },
    onHit: (handler) => {
      ensureHolder().blades.onHit = handler;
    },
    hitCount: () => (holder === null ? 0 : holder.blades.hits),
    dispose: () => {
      if (holder !== null) {
        holder.dispose();
        holder = null;
      }
      asset.dispose();
    },
  };
}

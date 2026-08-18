import type { Object3D } from 'three';

/**
 * Generic creature type surface.
 *
 * The `characters/` module is a hand-tuned humanoid. This module is the general
 * case: any skeleton, declared as data, with a body plan that decides which
 * animator drives it. Orientation is unchanged — creatures face `+Z`, up is
 * `+Y`, a creature's own left is `+X`, and limbs extend along `-Y` from their
 * pivot.
 */

/** Which animator a skeleton is meant to be driven by. */
export type BodyPlan = 'biped' | 'quadruped' | 'flyer' | 'swimmer' | 'hybrid';

/** Standard size brackets. */
export type SizeTier = 'minion' | 'player' | 'boss';

/**
 * Target height per tier, in world units.
 *
 * `player` is the reference: 1.8 units, matching the humanoid module. Creatures
 * are authored at their own natural size and then scaled to hit these numbers,
 * so a recipe never has to be redrawn to serve as both a minion and a boss.
 */
export const SIZE_TIER_HEIGHTS: Readonly<Record<SizeTier, number>> = Object.freeze({
  minion: 0.8,
  player: 1.8,
  boss: 3.75,
});

/** Named colour slots a recipe can paint its shapes with. */
export type PaletteRole =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'detail'
  | 'eye'
  | 'metal'
  | 'organic';

/** Colour set for one creature. */
export interface CreaturePalette {
  /** Main body colour. */
  primary: number;
  /** Belly, underside, inner surfaces. */
  secondary: number;
  /** Fins, trim, straps. */
  accent: number;
  /** Teeth, claws, highlights. */
  detail: number;
  eye: number;
  /** Propellers, buckles, hardware. */
  metal: number;
  /** Wood, leaves, plant matter. */
  organic: number;
}

/** Primitive families the declarative shape system can emit. */
export type ShapeKind = 'box' | 'cylinder' | 'sphere' | 'cone';

/**
 * One piece of geometry hung off a bone.
 *
 * Shapes are authored centred on their own origin and positioned via `offset`,
 * which is what lets the geometry cache collapse a left and a right wing — or a
 * hundred identical sharks — into a single buffer.
 */
export interface BoneShape {
  readonly kind: ShapeKind;
  /**
   * Dimensions, interpreted per kind:
   * - `box`: `[width, height, depth]`
   * - `cylinder`: `[radiusTop, radiusBottom, height]`
   * - `sphere`: `[radius, _, _]`
   * - `cone`: `[radius, height, _]`
   */
  readonly size: readonly [number, number, number];
  /** Local offset from the bone pivot. Defaults to the origin. */
  readonly offset?: readonly [number, number, number];
  /** Local Euler rotation in radians. Defaults to none. */
  readonly rotation?: readonly [number, number, number];
  /** Cross-section scale along Y, `[atBottom, atTop]`. Box and cylinder only. */
  readonly taper?: readonly [number, number];
  readonly color: PaletteRole;
  /** Radial segment override. Falls back to the build-wide default. */
  readonly segments?: number;
}

/** A joint in the skeleton graph. */
export interface BoneDefinition {
  readonly name: string;
  /** Parent bone name, or `null` for the root. Parents must be declared first. */
  readonly parent: string | null;
  /** Local position relative to the parent. */
  readonly position: readonly [number, number, number];
  /** Local rest rotation in radians. */
  readonly rotation?: readonly [number, number, number];
  /** Geometry attached to this bone. */
  readonly shapes?: readonly BoneShape[];
}

/** An attachment point for equipment and swappable modules. */
export interface SocketDefinition {
  readonly name: string;
  /** Bone this socket hangs from. */
  readonly bone: string;
  readonly position: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

/** A complete, self-describing skeleton. */
export interface SkeletonDefinition {
  readonly name: string;
  readonly plan: BodyPlan;
  /**
   * Height the skeleton was authored at, in world units. Scaling to a
   * {@link SizeTier} is `tierHeight / nominalHeight`.
   */
  readonly nominalHeight: number;
  readonly bones: readonly BoneDefinition[];
  readonly sockets: readonly SocketDefinition[];
}

/**
 * The structural contract every animator works against.
 *
 * Declared structurally rather than as a base class on purpose: `HumanoidRig`
 * already satisfies it without inheriting from anything here, so the death
 * overlay and any future cross-cutting animation works on both rig families
 * without touching the humanoid code.
 */
export interface PosableRig {
  readonly root: Object3D;
  /** Every joint, index-aligned with the rest-pose arrays. */
  readonly joints: readonly Object3D[];
  /** Rest local positions, three floats per joint. */
  readonly restPositions: Float32Array;
  /** Rest local Euler rotations in radians, three floats per joint. */
  readonly restRotations: Float32Array;
}

/** How a creature leaves the world. */
export type DeathStyle = 'collapse' | 'melt' | 'deflate';

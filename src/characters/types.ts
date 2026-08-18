/**
 * Character type surface.
 *
 * Orientation convention for the whole library: **a character faces `+Z`**,
 * up is `+Y`, and the character's own left is `+X` (because `left = up ×
 * forward = Y × Z = X`). Limbs are modelled extending along `-Y` from their
 * joint pivot, which makes a positive `rotation.x` swing a limb *backwards*
 * and lean the torso *forwards*.
 */

/** Every joint in the humanoid rig, in hierarchy order. */
export type HumanoidJointName =
  | 'root'
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'shoulderL'
  | 'upperArmL'
  | 'lowerArmL'
  | 'handL'
  | 'shoulderR'
  | 'upperArmR'
  | 'lowerArmR'
  | 'handR'
  | 'upperLegL'
  | 'lowerLegL'
  | 'footL'
  | 'upperLegR'
  | 'lowerLegR'
  | 'footR';

/**
 * Canonical joint order. Array indices into `HumanoidRig.joints`,
 * `restPositions` and `restRotations` all follow this list.
 */
export const HUMANOID_JOINT_NAMES: readonly HumanoidJointName[] = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'lowerArmL',
  'handL',
  'shoulderR',
  'upperArmR',
  'lowerArmR',
  'handR',
  'upperLegL',
  'lowerLegL',
  'footL',
  'upperLegR',
  'lowerLegR',
  'footR',
];

/** Number of joints in the rig. */
export const HUMANOID_JOINT_COUNT = HUMANOID_JOINT_NAMES.length;

/** Reverse lookup from joint name to its index. */
export const HUMANOID_JOINT_INDEX: Readonly<Record<HumanoidJointName, number>> = (() => {
  const map = {} as Record<HumanoidJointName, number>;
  for (let i = 0; i < HUMANOID_JOINT_NAMES.length; i++) {
    map[HUMANOID_JOINT_NAMES[i] as HumanoidJointName] = i;
  }
  return Object.freeze(map);
})();

/** Sockets that equipment can be parented to. */
export type AttachmentSlot =
  | 'head'
  | 'chest'
  | 'back'
  | 'handL'
  | 'handR'
  | 'hipL'
  | 'hipR';

/** Every attachment slot, for iteration. */
export const ATTACHMENT_SLOTS: readonly AttachmentSlot[] = [
  'head',
  'chest',
  'back',
  'handL',
  'handR',
  'hipL',
  'hipR',
];

/**
 * Body-shape ratios.
 *
 * The four vertical ratios (`legRatio`, `torsoRatio`, `neckRatio`,
 * `headRatio`) are normalised at build time so they always sum to the full
 * `height` — you can express them loosely and still get an exactly
 * `height`-tall character. All other ratios are multiples of `height`.
 */
export interface HumanoidProportions {
  /** Total standing height, in world units. */
  height: number;

  /** Ground → hip pivot. */
  legRatio: number;
  /** Hip pivot → base of neck. */
  torsoRatio: number;
  /** Base of neck → base of skull. */
  neckRatio: number;
  /** Base of skull → crown. */
  headRatio: number;

  /** Shoulder-to-shoulder width. */
  shoulderWidthRatio: number;
  /** Hip width. */
  hipWidthRatio: number;
  /** Front-to-back chest depth. */
  chestDepthRatio: number;

  /** Shoulder → wrist, as a fraction of height. */
  armRatio: number;
  /** Arm radius. */
  armThicknessRatio: number;
  /** Leg radius. */
  legThicknessRatio: number;
  /** Foot length. */
  footLengthRatio: number;
}

/**
 * Absolute measurements derived from {@link HumanoidProportions}.
 * Computed once per character and stored on the rig — the animator reads
 * `legLength` and `hipHeight` from here every frame.
 */
export interface HumanoidMeasurements {
  height: number;

  legLength: number;
  torsoLength: number;
  neckLength: number;
  headHeight: number;

  hipHeight: number;
  upperLegLength: number;
  lowerLegLength: number;
  legRadius: number;

  armLength: number;
  upperArmLength: number;
  lowerArmLength: number;
  handLength: number;
  armRadius: number;

  shoulderWidth: number;
  hipWidth: number;
  chestDepth: number;
  hipDepth: number;
  waistWidth: number;

  headWidth: number;
  headDepth: number;
  neckRadius: number;

  handWidth: number;
  footLength: number;
  footWidth: number;
  footHeight: number;

  /** Shoulder pivot height, measured from the hip pivot. */
  shoulderHeight: number;
}

/** Ready-made body types. */
export type HumanoidArchetype =
  | 'hero'
  | 'heavy'
  | 'slender'
  | 'child'
  | 'chibi'
  | 'goblin'
  | 'ogre'
  | 'skeleton';

/** Hair silhouettes, all built from boxes. */
export type HairStyle =
  | 'none'
  | 'short'
  | 'long'
  | 'ponytail'
  | 'bun'
  | 'mohawk'
  | 'hood'
  | 'helmet';

/** Eye treatments. */
export type EyeStyle = 'dot' | 'box' | 'visor' | 'none';

/** Per-character colour set. */
export interface HumanoidPalette {
  skin: number;
  hair: number;
  eye: number;
  shirt: number;
  pants: number;
  shoes: number;
  /** Belts, shoulder pads, trim. */
  accent: number;
}

/** Cosmetic choices layered on top of the body shape. */
export interface HumanoidStyle {
  hair: HairStyle;
  eyes: EyeStyle;
  beard: boolean;
  shoulderPads: boolean;
  belt: boolean;
  /** Skin-coloured forearms and shins instead of clothed ones. */
  bareLimbs: boolean;
}

/** Full option set for {@link CharacterAsset}. */
export interface CharacterOptions {
  proportions: HumanoidProportions;
  palette: HumanoidPalette;
  style: HumanoidStyle;
  /** Radial segments on limb cylinders. 5–8 keeps the faceted look. */
  limbSegments: number;
  castShadow: boolean;
  receiveShadow: boolean;
  /** Faceted (`true`) or smooth (`false`) shading. */
  flatShading: boolean;
}

import type {
  HumanoidArchetype,
  HumanoidMeasurements,
  HumanoidProportions,
} from './types';

/**
 * Body-shape presets and the ratio → absolute measurement conversion.
 *
 * Heights are quoted in metres on the assumption that one world unit is one
 * metre. Scale the whole preset by overriding `height`; every other dimension
 * follows automatically because they are all ratios.
 */

export const HUMANOID_PROPORTION_PRESETS: Readonly<
  Record<HumanoidArchetype, HumanoidProportions>
> = Object.freeze({
  /** Balanced adult, roughly six-and-a-half heads tall. */
  hero: {
    height: 1.8,
    legRatio: 0.48,
    torsoRatio: 0.32,
    neckRatio: 0.04,
    headRatio: 0.16,
    shoulderWidthRatio: 0.25,
    hipWidthRatio: 0.18,
    chestDepthRatio: 0.115,
    armRatio: 0.4,
    armThicknessRatio: 0.028,
    legThicknessRatio: 0.038,
    footLengthRatio: 0.14,
  },

  /** Broad and stocky — shorter legs, deeper chest, thicker limbs. */
  heavy: {
    height: 1.78,
    legRatio: 0.44,
    torsoRatio: 0.35,
    neckRatio: 0.033,
    headRatio: 0.177,
    shoulderWidthRatio: 0.3,
    hipWidthRatio: 0.23,
    chestDepthRatio: 0.15,
    armRatio: 0.39,
    armThicknessRatio: 0.038,
    legThicknessRatio: 0.048,
    footLengthRatio: 0.15,
  },

  /** Tall and lean. */
  slender: {
    height: 1.85,
    legRatio: 0.5,
    torsoRatio: 0.3,
    neckRatio: 0.045,
    headRatio: 0.155,
    shoulderWidthRatio: 0.21,
    hipWidthRatio: 0.155,
    chestDepthRatio: 0.095,
    armRatio: 0.42,
    armThicknessRatio: 0.022,
    legThicknessRatio: 0.03,
    footLengthRatio: 0.135,
  },

  /** Young — larger head, shorter limbs. */
  child: {
    height: 1.15,
    legRatio: 0.44,
    torsoRatio: 0.3,
    neckRatio: 0.035,
    headRatio: 0.225,
    shoulderWidthRatio: 0.22,
    hipWidthRatio: 0.18,
    chestDepthRatio: 0.115,
    armRatio: 0.36,
    armThicknessRatio: 0.03,
    legThicknessRatio: 0.038,
    footLengthRatio: 0.13,
  },

  /** Extreme stylisation — head is roughly 40% of total height. */
  chibi: {
    height: 1.0,
    legRatio: 0.3,
    torsoRatio: 0.26,
    neckRatio: 0.02,
    headRatio: 0.42,
    shoulderWidthRatio: 0.24,
    hipWidthRatio: 0.2,
    chestDepthRatio: 0.14,
    armRatio: 0.28,
    armThicknessRatio: 0.045,
    legThicknessRatio: 0.055,
    footLengthRatio: 0.16,
  },

  /** Small, wiry, long-armed. */
  goblin: {
    height: 1.1,
    legRatio: 0.38,
    torsoRatio: 0.32,
    neckRatio: 0.035,
    headRatio: 0.265,
    shoulderWidthRatio: 0.26,
    hipWidthRatio: 0.19,
    chestDepthRatio: 0.13,
    armRatio: 0.46,
    armThicknessRatio: 0.032,
    legThicknessRatio: 0.038,
    footLengthRatio: 0.17,
  },

  /** Large brute — massive shoulders, small head relative to body. */
  ogre: {
    height: 2.7,
    legRatio: 0.41,
    torsoRatio: 0.37,
    neckRatio: 0.028,
    headRatio: 0.192,
    shoulderWidthRatio: 0.34,
    hipWidthRatio: 0.25,
    chestDepthRatio: 0.18,
    armRatio: 0.44,
    armThicknessRatio: 0.05,
    legThicknessRatio: 0.058,
    footLengthRatio: 0.155,
  },

  /** Gaunt undead — same skeleton, minimal mass. */
  skeleton: {
    height: 1.75,
    legRatio: 0.49,
    torsoRatio: 0.31,
    neckRatio: 0.045,
    headRatio: 0.155,
    shoulderWidthRatio: 0.22,
    hipWidthRatio: 0.15,
    chestDepthRatio: 0.085,
    armRatio: 0.42,
    armThicknessRatio: 0.016,
    legThicknessRatio: 0.022,
    footLengthRatio: 0.14,
  },
});

/** Every archetype name, for iteration and random selection. */
export const HUMANOID_ARCHETYPES: readonly HumanoidArchetype[] = Object.keys(
  HUMANOID_PROPORTION_PRESETS,
) as HumanoidArchetype[];

/**
 * Converts ratios into absolute measurements.
 *
 * The four vertical ratios are normalised so their sum reproduces `height`
 * exactly — meaning a preset can be authored by feel without its author having
 * to make the numbers add to 1.0, and a character asked for 1.8 units is
 * exactly 1.8 units tall.
 */
export function computeMeasurements(p: HumanoidProportions): HumanoidMeasurements {
  const height = p.height;
  const verticalSum = p.legRatio + p.torsoRatio + p.neckRatio + p.headRatio;
  if (verticalSum <= 0) {
    throw new Error('computeMeasurements: vertical ratios must sum to a positive value.');
  }
  const k = height / verticalSum;

  const legLength = p.legRatio * k;
  const torsoLength = p.torsoRatio * k;
  const neckLength = p.neckRatio * k;
  const headHeight = p.headRatio * k;

  const footHeight = height * 0.028;
  const usableLeg = Math.max(legLength - footHeight, height * 0.05);
  const upperLegLength = usableLeg * 0.52;
  const lowerLegLength = usableLeg * 0.48;

  const armLength = height * p.armRatio;
  const upperArmLength = armLength * 0.48;
  const lowerArmLength = armLength * 0.4;
  const handLength = armLength * 0.12;

  const shoulderWidth = height * p.shoulderWidthRatio;
  const hipWidth = height * p.hipWidthRatio;
  const chestDepth = height * p.chestDepthRatio;
  const legRadius = height * p.legThicknessRatio;
  const armRadius = height * p.armThicknessRatio;

  return {
    height,

    legLength,
    torsoLength,
    neckLength,
    headHeight,

    hipHeight: legLength,
    upperLegLength,
    lowerLegLength,
    legRadius,

    armLength,
    upperArmLength,
    lowerArmLength,
    handLength,
    armRadius,

    shoulderWidth,
    hipWidth,
    chestDepth,
    hipDepth: chestDepth * 0.86,
    waistWidth: (shoulderWidth + hipWidth) * 0.42,

    headWidth: headHeight * 0.84,
    headDepth: headHeight * 0.9,
    neckRadius: headHeight * 0.24,

    handWidth: armRadius * 2.1,
    footLength: height * p.footLengthRatio,
    footWidth: legRadius * 2.15,
    footHeight,

    // The shoulder pivot sits just below the top of the torso.
    shoulderHeight: torsoLength * 0.97,
  };
}

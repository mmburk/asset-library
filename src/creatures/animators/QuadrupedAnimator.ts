import type { Object3D } from 'three';
import { TAU, clamp, halfSin, lerp, smoothstep, wrap } from '../../core/math';
import type { CreatureRig } from '../CreatureRig';
import { CreatureAnimator, type CreatureAnimatorOptions } from './CreatureAnimator';

/** Bone names a quadruped skeleton is expected to declare. */
export const QUADRUPED_BONES = {
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  jaw: 'jaw',
  tailA: 'tailA',
  tailB: 'tailB',
  tailC: 'tailC',
} as const;

/** The four legs, in gait order. */
export const QUADRUPED_LEGS = ['legFL', 'legFR', 'legBL', 'legBR'] as const;

/** Extra tuning on top of the shared creature options. */
export interface QuadrupedAnimatorOptions extends CreatureAnimatorOptions {
  legSwing: number;
  legSwingFast: number;
  kneeBend: number;
  /** Vertical travel of the body, as a fraction of leg length. */
  bodyBob: number;
  /** Spine yaw as the body swings between diagonal pairs. */
  spineSway: number;
  /** Forward pitch at full speed. */
  bodyPitch: number;
  tailWagRate: number;
  tailWagAmount: number;
  headBob: number;
  /** Distance covered per half stride. Derived from the rig when `0`. */
  strideLength: number;
}

/** One leg's resolved bones and rest angles. */
interface LegChain {
  upper: Object3D;
  lower: Object3D;
  paw: Object3D;
  restUpper: number;
  restLower: number;
  restPaw: number;
  /** Phase offset in radians. */
  offset: number;
  /** `+1` for a knee that folds backward, `-1` for one that folds forward. */
  kneeSign: number;
}

/**
 * Diagonal-gait animation for four-legged creatures.
 *
 * The gait is a trot: front-left and back-right move together, front-right and
 * back-left move together half a cycle later. That diagonal pairing is what
 * separates a quadruped from four legs walking independently, and it is why
 * the body sways in yaw rather than bobbing symmetrically.
 *
 * Front knees fold forward and back knees fold backward, matching how real
 * quadruped elbows and hocks bend in opposite directions.
 */
export class QuadrupedAnimator extends CreatureAnimator {
  private readonly quad: QuadrupedAnimatorOptions;

  private readonly hips: Object3D;
  private readonly spine: Object3D;
  private readonly chest: Object3D;
  private readonly neck: Object3D;
  private readonly head: Object3D;
  private readonly jaw: Object3D;
  private readonly tailA: Object3D;
  private readonly tailB: Object3D;
  private readonly tailC: Object3D;

  private readonly legs: readonly LegChain[];

  private readonly restHipsY: number;
  private readonly restSpineY: number;
  private readonly restChestX: number;
  private readonly restNeckX: number;
  private readonly restHeadX: number;
  private readonly restJawX: number;

  private readonly baseStride: number;

  constructor(rig: CreatureRig, options?: Partial<QuadrupedAnimatorOptions>) {
    super(rig, options);

    this.quad = {
      ...this.options,
      legSwing: 0.5,
      legSwingFast: 0.85,
      kneeBend: 0.55,
      bodyBob: 0.05,
      spineSway: 0.1,
      bodyPitch: 0.12,
      tailWagRate: 0.9,
      tailWagAmount: 0.18,
      headBob: 0.07,
      strideLength: 0,
      ...options,
    };

    this.hips = this.requireBone(QUADRUPED_BONES.hips);
    this.spine = this.optionalBone(QUADRUPED_BONES.spine);
    this.chest = this.optionalBone(QUADRUPED_BONES.chest);
    this.neck = this.optionalBone(QUADRUPED_BONES.neck);
    this.head = this.optionalBone(QUADRUPED_BONES.head);
    this.jaw = this.optionalBone(QUADRUPED_BONES.jaw);
    this.tailA = this.optionalBone(QUADRUPED_BONES.tailA);
    this.tailB = this.optionalBone(QUADRUPED_BONES.tailB);
    this.tailC = this.optionalBone(QUADRUPED_BONES.tailC);

    // Diagonal pairs: FL + BR lead, FR + BL follow half a cycle later.
    const offsets: Readonly<Record<string, number>> = {
      legFL: 0,
      legFR: Math.PI,
      legBL: Math.PI,
      legBR: 0,
    };
    const kneeSigns: Readonly<Record<string, number>> = {
      legFL: -1,
      legFR: -1,
      legBL: 1,
      legBR: 1,
    };

    const legs: LegChain[] = [];
    for (let i = 0; i < QUADRUPED_LEGS.length; i++) {
      const name = QUADRUPED_LEGS[i] as string;
      legs.push({
        upper: this.requireBone(`${name}Upper`),
        lower: this.optionalBone(`${name}Lower`),
        paw: this.optionalBone(`${name}Paw`),
        restUpper: rig.restRotationX(`${name}Upper`),
        restLower: rig.restRotationX(`${name}Lower`),
        restPaw: rig.restRotationX(`${name}Paw`),
        offset: offsets[name] ?? 0,
        kneeSign: kneeSigns[name] ?? 1,
      });
    }
    this.legs = legs;

    this.restHipsY = rig.restPositionY(QUADRUPED_BONES.hips);
    this.restSpineY = rig.restRotationY(QUADRUPED_BONES.spine);
    this.restChestX = rig.restRotationX(QUADRUPED_BONES.chest);
    this.restNeckX = rig.restRotationX(QUADRUPED_BONES.neck);
    this.restHeadX = rig.restRotationX(QUADRUPED_BONES.head);
    this.restJawX = rig.restRotationX(QUADRUPED_BONES.jaw);

    const derived = Math.max(this.restHipsY * 1.4, 0.05);
    this.baseStride = this.quad.strideLength > 0 ? this.quad.strideLength : derived;
  }

  protected override applyLocomotion(dt: number): void {
    const o = this.quad;
    const ground = 1 - this.airBlend;
    const moveBlend = smoothstep(0.05, o.moveSpeed, this.speed) * ground;
    const fastBlend = smoothstep(o.moveSpeed, o.fastSpeed, this.speed) * ground;
    const idleBlend = (1 - moveBlend) * ground;

    const stride = this.baseStride * (1 + fastBlend * 0.4);
    const frequency = clamp(this.speed / stride, 0, 7) * o.cycleScale;
    this.phase = wrap(this.phase + dt * frequency * TAU, 0, TAU);

    const legAmp = lerp(o.legSwing, o.legSwingFast, fastBlend) * moveBlend;
    const kneeAmp = o.kneeBend * moveBlend * (1 + fastBlend * 0.6);
    const tuck = this.airBlend;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i] as LegChain;
      const p = this.phase + leg.offset;
      const sinP = Math.sin(p);

      const upper = lerp(leg.restUpper - sinP * legAmp, leg.restUpper - 0.5 * tuck, tuck);
      const lower = lerp(
        leg.restLower + leg.kneeSign * halfSin(p + 2.2) * kneeAmp,
        leg.restLower + leg.kneeSign * 0.7,
        tuck,
      );

      leg.upper.rotation.x = upper;
      leg.lower.rotation.x = lower;
      // The paw cancels most of the chain so the pad stays flat on the ground.
      leg.paw.rotation.x = leg.restPaw - (upper + lower) * 0.7;
    }

    const sinBody = Math.sin(this.phase);
    const absSin = sinBody < 0 ? -sinBody : sinBody;

    // The body yaws between the diagonal pairs and rises as they pass under it.
    this.hips.position.y =
      this.restHipsY - (absSin - 0.5) * o.bodyBob * this.restHipsY * 2 * moveBlend;
    this.hips.rotation.z = -this.turnRate * o.turnLean * moveBlend;

    this.spine.rotation.y = this.restSpineY + sinBody * o.spineSway * moveBlend;
    this.chest.rotation.x = this.restChestX + fastBlend * o.bodyPitch;

    const breathe = Math.sin(this.clock * o.idleRate * TAU) * o.idleAmount * idleBlend;

    // The head bobs at twice the stride rate — once per diagonal pair landing.
    this.neck.rotation.x =
      this.restNeckX + Math.sin(this.phase * 2) * o.headBob * moveBlend - fastBlend * 0.12 + breathe;
    this.head.rotation.x = this.restHeadX - Math.sin(this.phase * 2) * o.headBob * 0.6 * moveBlend;
    this.head.rotation.y = this.turnRate * 0.25;

    this.jaw.rotation.x = this.restJawX + fastBlend * 0.35 + breathe * 3;

    // The tail wags on its own clock and lags further down the chain.
    const wag = this.clock * o.tailWagRate * TAU;
    const wagAmount = o.tailWagAmount * (0.6 + moveBlend * 0.8);
    this.tailA.rotation.y = Math.sin(wag) * wagAmount;
    this.tailB.rotation.y = Math.sin(wag - 0.6) * wagAmount * 1.25;
    this.tailC.rotation.y = Math.sin(wag - 1.2) * wagAmount * 1.5;
  }
}

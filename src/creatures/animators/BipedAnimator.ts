import type { Object3D } from 'three';
import { TAU, clamp, halfSin, lerp, smoothstep, wrap } from '../../core/math';
import type { CreatureRig } from '../CreatureRig';
import { CreatureAnimator, type CreatureAnimatorOptions } from './CreatureAnimator';

/** Bone names a biped skeleton is expected to declare. */
export const BIPED_BONES = {
  hips: 'hips',
  spine: 'spine',
  chest: 'chest',
  neck: 'neck',
  head: 'head',
  jaw: 'jaw',
  shoulderL: 'shoulderL',
  shoulderR: 'shoulderR',
  upperArmL: 'upperArmL',
  upperArmR: 'upperArmR',
  lowerArmL: 'lowerArmL',
  lowerArmR: 'lowerArmR',
  upperLegL: 'upperLegL',
  upperLegR: 'upperLegR',
  lowerLegL: 'lowerLegL',
  lowerLegR: 'lowerLegR',
  footL: 'footL',
  footR: 'footR',
} as const;

/** Extra tuning on top of the shared creature options. */
export interface BipedAnimatorOptions extends CreatureAnimatorOptions {
  legSwing: number;
  legSwingFast: number;
  kneeBend: number;
  armSwing: number;
  armSwingFast: number;
  elbowBend: number;
  hipBob: number;
  hipSway: number;
  torsoCounterRotate: number;
  torsoLean: number;
  /** Distance covered per half stride. Derived from the rig when `0`. */
  strideLength: number;
}

/**
 * Walk / run / idle / airborne for two-legged creatures on a {@link CreatureRig}.
 *
 * Same closed-form approach as the humanoid module's `LocomotionAnimator` —
 * one stride phase driving every joint — but resolving bones by name instead of
 * through a fixed 20-joint layout, so it drives any skeleton that declares the
 * {@link BIPED_BONES} names. Optional bones (jaw, shoulders) may be omitted.
 */
export class BipedAnimator extends CreatureAnimator {
  private readonly biped: BipedAnimatorOptions;

  private readonly hips: Object3D;
  private readonly spine: Object3D;
  private readonly chest: Object3D;
  private readonly head: Object3D;
  private readonly jaw: Object3D;
  private readonly shoulderL: Object3D;
  private readonly shoulderR: Object3D;
  private readonly upperArmL: Object3D;
  private readonly upperArmR: Object3D;
  private readonly lowerArmL: Object3D;
  private readonly lowerArmR: Object3D;
  private readonly upperLegL: Object3D;
  private readonly upperLegR: Object3D;
  private readonly lowerLegL: Object3D;
  private readonly lowerLegR: Object3D;
  private readonly footL: Object3D;
  private readonly footR: Object3D;

  private readonly restHipsY: number;
  private readonly restSpineX: number;
  private readonly restChestX: number;
  private readonly restHeadX: number;
  private readonly restShoulderZL: number;
  private readonly restShoulderZR: number;
  private readonly restUpperArmX: number;
  private readonly restLowerArmX: number;
  private readonly restUpperLegX: number;
  private readonly restLowerLegX: number;
  private readonly restFootX: number;
  private readonly restJawX: number;

  private readonly baseStride: number;

  constructor(rig: CreatureRig, options?: Partial<BipedAnimatorOptions>) {
    super(rig, options);

    this.biped = {
      ...this.options,
      legSwing: 0.55,
      legSwingFast: 0.95,
      kneeBend: 0.95,
      armSwing: 0.42,
      armSwingFast: 0.85,
      elbowBend: 0.7,
      hipBob: 0.035,
      hipSway: 0.09,
      torsoCounterRotate: 0.13,
      torsoLean: 0.28,
      strideLength: 0,
      ...options,
    };

    this.hips = this.requireBone(BIPED_BONES.hips);
    this.spine = this.optionalBone(BIPED_BONES.spine);
    this.chest = this.optionalBone(BIPED_BONES.chest);
    this.head = this.optionalBone(BIPED_BONES.head);
    this.jaw = this.optionalBone(BIPED_BONES.jaw);
    this.shoulderL = this.optionalBone(BIPED_BONES.shoulderL);
    this.shoulderR = this.optionalBone(BIPED_BONES.shoulderR);
    this.upperArmL = this.optionalBone(BIPED_BONES.upperArmL);
    this.upperArmR = this.optionalBone(BIPED_BONES.upperArmR);
    this.lowerArmL = this.optionalBone(BIPED_BONES.lowerArmL);
    this.lowerArmR = this.optionalBone(BIPED_BONES.lowerArmR);
    this.upperLegL = this.requireBone(BIPED_BONES.upperLegL);
    this.upperLegR = this.requireBone(BIPED_BONES.upperLegR);
    this.lowerLegL = this.optionalBone(BIPED_BONES.lowerLegL);
    this.lowerLegR = this.optionalBone(BIPED_BONES.lowerLegR);
    this.footL = this.optionalBone(BIPED_BONES.footL);
    this.footR = this.optionalBone(BIPED_BONES.footR);

    this.restHipsY = rig.restPositionY(BIPED_BONES.hips);
    this.restSpineX = rig.restRotationX(BIPED_BONES.spine);
    this.restChestX = rig.restRotationX(BIPED_BONES.chest);
    this.restHeadX = rig.restRotationX(BIPED_BONES.head);
    this.restShoulderZL = rig.restRotationZ(BIPED_BONES.shoulderL);
    this.restShoulderZR = rig.restRotationZ(BIPED_BONES.shoulderR);
    this.restUpperArmX = rig.restRotationX(BIPED_BONES.upperArmL);
    this.restLowerArmX = rig.restRotationX(BIPED_BONES.lowerArmL);
    this.restUpperLegX = rig.restRotationX(BIPED_BONES.upperLegL);
    this.restLowerLegX = rig.restRotationX(BIPED_BONES.lowerLegL);
    this.restFootX = rig.restRotationX(BIPED_BONES.footL);
    this.restJawX = rig.restRotationX(BIPED_BONES.jaw);

    // Cadence follows leg length: the hip pivot height is the best available
    // proxy on a skeleton whose proportions are not known in advance.
    const derived = Math.max(this.restHipsY * 1.15, 0.05);
    this.baseStride = this.biped.strideLength > 0 ? this.biped.strideLength : derived;
  }

  protected override applyLocomotion(dt: number): void {
    const o = this.biped;
    const ground = 1 - this.airBlend;
    const moveBlend = smoothstep(0.05, o.moveSpeed, this.speed) * ground;
    const fastBlend = smoothstep(o.moveSpeed, o.fastSpeed, this.speed) * ground;
    const idleBlend = (1 - moveBlend) * ground;

    const stride = this.baseStride * (1 + fastBlend * 0.35);
    const frequency = clamp(this.speed / stride, 0, 6) * o.cycleScale;
    this.phase = wrap(this.phase + dt * frequency * TAU, 0, TAU);

    const p = this.phase;
    const sinP = Math.sin(p);
    const absSin = sinP < 0 ? -sinP : sinP;

    // --- Legs --------------------------------------------------------------
    const legAmp = lerp(o.legSwing, o.legSwingFast, fastBlend) * moveBlend;
    const kneeAmp = o.kneeBend * moveBlend * (1 + fastBlend * 0.5);
    const kneeBase = fastBlend * 0.22;

    const thighL = lerp(this.restUpperLegX - sinP * legAmp, -0.35, this.airBlend);
    const thighR = lerp(this.restUpperLegX + sinP * legAmp, 0.2, this.airBlend);
    const kneeL = lerp(
      this.restLowerLegX + kneeBase + halfSin(p + 2.2) * kneeAmp,
      0.95,
      this.airBlend,
    );
    const kneeR = lerp(
      this.restLowerLegX + kneeBase + halfSin(p + 2.2 + Math.PI) * kneeAmp,
      0.66,
      this.airBlend,
    );

    this.upperLegL.rotation.x = thighL;
    this.upperLegR.rotation.x = thighR;
    this.lowerLegL.rotation.x = kneeL;
    this.lowerLegR.rotation.x = kneeR;

    this.footL.rotation.x =
      this.restFootX - (thighL + kneeL) * 0.8 + halfSin(p + Math.PI * 0.5) * 0.3 * moveBlend;
    this.footR.rotation.x =
      this.restFootX - (thighR + kneeR) * 0.8 + halfSin(p + Math.PI * 1.5) * 0.3 * moveBlend;

    // --- Arms --------------------------------------------------------------
    const armAmp = lerp(o.armSwing, o.armSwingFast, fastBlend) * moveBlend;
    const idleSway = Math.sin(this.clock * o.idleRate * TAU) * o.idleAmount * idleBlend;

    this.upperArmL.rotation.x = lerp(this.restUpperArmX + sinP * armAmp + idleSway, -1.1, this.airBlend);
    this.upperArmR.rotation.x = lerp(this.restUpperArmX - sinP * armAmp + idleSway, -0.95, this.airBlend);

    const elbow = this.restLowerArmX + o.elbowBend * fastBlend * moveBlend;
    this.lowerArmL.rotation.x = lerp(elbow + halfSin(p + Math.PI) * 0.28 * moveBlend, 0.85, this.airBlend);
    this.lowerArmR.rotation.x = lerp(elbow + halfSin(p) * 0.28 * moveBlend, 0.85, this.airBlend);

    const shoulderOpen = fastBlend * 0.14 + this.airBlend * 0.2;
    this.shoulderL.rotation.z = this.restShoulderZL + shoulderOpen;
    this.shoulderR.rotation.z = this.restShoulderZR - shoulderOpen;

    // --- Torso and head ----------------------------------------------------
    const lean = moveBlend * 0.05 + fastBlend * o.torsoLean;
    const breath = Math.sin(this.clock * o.idleRate * TAU) * o.idleAmount * idleBlend;
    const twist = sinP * moveBlend;

    this.spine.rotation.x = lerp(this.restSpineX + lean, this.restSpineX + 0.12, this.airBlend);
    this.chest.rotation.x = this.restChestX + lean * 0.35 + breath;
    this.chest.rotation.y = -twist * o.torsoCounterRotate;

    this.hips.rotation.y = twist * o.hipSway;
    this.hips.rotation.z = -this.turnRate * o.turnLean * moveBlend;
    this.hips.position.y = this.restHipsY - (absSin - 0.5) * o.hipBob * this.restHipsY * 2 * moveBlend;

    this.head.rotation.x = this.restHeadX - (lean + breath) * 0.65 + this.airBlend * 0.1;
    this.head.rotation.y = twist * o.torsoCounterRotate * 0.4;

    // A slack jaw that drifts open at speed sells the brainrot look.
    this.jaw.rotation.x = this.restJawX + fastBlend * 0.28 + breath * 2;
  }
}

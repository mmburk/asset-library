import type { Object3D } from 'three';
import { TAU, clamp, halfSin, lerp, smoothstep, wrap } from '../../core/math';
import type { CreatureRig } from '../CreatureRig';
import { CreatureAnimator, type CreatureAnimatorOptions } from './CreatureAnimator';

/** Bone names a hybrid/rooted skeleton is expected to declare. */
export const HYBRID_BONES = {
  trunk: 'trunk',
  crown: 'crown',
  head: 'head',
  jaw: 'jaw',
  armL: 'armL',
  armR: 'armR',
} as const;

/** Root-leg prefixes, in wave-gait order. */
export const HYBRID_LEGS = ['rootA', 'rootB', 'rootC', 'rootD'] as const;

/** Extra tuning on top of the shared creature options. */
export interface HybridWalkAnimatorOptions extends CreatureAnimatorOptions {
  legSwing: number;
  legSwingFast: number;
  kneeBend: number;
  /** How far each root lifts off the ground during its swing, in radians. */
  legLift: number;
  /** Vertical travel of the trunk. */
  trunkBob: number;
  /** Side-to-side trunk sway. */
  trunkSway: number;
  /** Forward lean at full speed. */
  trunkLean: number;
  /** Idle bob of the arms. */
  armBob: number;
  /** Crown wobble, which lags behind the trunk. */
  crownLag: number;
  /** Distance covered per gait cycle. Derived from the rig when `0`. */
  strideLength: number;
}

/** One root leg's resolved bones and rest angles. */
interface RootLeg {
  upper: Object3D;
  lower: Object3D;
  tip: Object3D;
  restUpper: number;
  restLower: number;
  restTip: number;
  /** Phase offset in radians. */
  offset: number;
  /** Outward direction, `+1` on the creature's left. */
  side: number;
}

/**
 * Wave-gait animation for rooted, many-legged absurdities.
 *
 * Unlike the quadruped's diagonal trot, the roots fire in a staggered wave —
 * offsets of 0, ¼, ½, ¾ of a cycle — so at any moment three of the four are
 * planted. That is what keeps a top-heavy trunk on something that has no
 * business walking, and it is deliberately unsettling to watch, which is the
 * point for this class of creature.
 *
 * The crown lags the trunk by a fixed phase, giving the whole thing the
 * top-heavy wobble of a plant carrying more mass than its stem should allow.
 */
export class HybridWalkAnimator extends CreatureAnimator {
  private readonly hybrid: HybridWalkAnimatorOptions;

  private readonly trunk: Object3D;
  private readonly crown: Object3D;
  private readonly head: Object3D;
  private readonly jaw: Object3D;
  private readonly armL: Object3D;
  private readonly armR: Object3D;
  private readonly legs: readonly RootLeg[];

  private readonly restTrunkY: number;
  private readonly restTrunkX: number;
  private readonly restCrownX: number;
  private readonly restArmZL: number;
  private readonly restArmZR: number;
  private readonly restJawX: number;

  private readonly baseStride: number;

  constructor(rig: CreatureRig, options?: Partial<HybridWalkAnimatorOptions>) {
    super(rig, options);

    this.hybrid = {
      ...this.options,
      legSwing: 0.42,
      legSwingFast: 0.7,
      kneeBend: 0.5,
      legLift: 0.3,
      trunkBob: 0.04,
      trunkSway: 0.07,
      trunkLean: 0.16,
      armBob: 0.12,
      crownLag: 0.9,
      strideLength: 0,
      ...options,
    };

    this.trunk = this.requireBone(HYBRID_BONES.trunk);
    this.crown = this.optionalBone(HYBRID_BONES.crown);
    this.head = this.optionalBone(HYBRID_BONES.head);
    this.jaw = this.optionalBone(HYBRID_BONES.jaw);
    this.armL = this.optionalBone(HYBRID_BONES.armL);
    this.armR = this.optionalBone(HYBRID_BONES.armR);

    // A staggered wave rather than paired legs: at any instant three roots are
    // down and one is swinging.
    const offsets: readonly number[] = [0, 0.5, 0.25, 0.75];
    const sides: readonly number[] = [1, -1, 1, -1];

    const legs: RootLeg[] = [];
    for (let i = 0; i < HYBRID_LEGS.length; i++) {
      const name = HYBRID_LEGS[i] as string;
      if (!rig.hasBone(`${name}Upper`)) continue;
      legs.push({
        upper: this.requireBone(`${name}Upper`),
        lower: this.optionalBone(`${name}Lower`),
        tip: this.optionalBone(`${name}Tip`),
        restUpper: rig.restRotationX(`${name}Upper`),
        restLower: rig.restRotationX(`${name}Lower`),
        restTip: rig.restRotationX(`${name}Tip`),
        offset: (offsets[i] ?? 0) * TAU,
        side: sides[i] ?? 1,
      });
    }
    if (legs.length === 0) {
      throw new Error(
        `HybridWalkAnimator: skeleton "${rig.definition.name}" declares no "rootAUpper" leg.`,
      );
    }
    this.legs = legs;

    this.restTrunkY = rig.restPositionY(HYBRID_BONES.trunk);
    this.restTrunkX = rig.restRotationX(HYBRID_BONES.trunk);
    this.restCrownX = rig.restRotationX(HYBRID_BONES.crown);
    this.restArmZL = rig.restRotationZ(HYBRID_BONES.armL);
    this.restArmZR = rig.restRotationZ(HYBRID_BONES.armR);
    this.restJawX = rig.restRotationX(HYBRID_BONES.jaw);

    const derived = Math.max(rig.nominalHeight * 0.4, 0.05);
    this.baseStride = this.hybrid.strideLength > 0 ? this.hybrid.strideLength : derived;
  }

  protected override applyLocomotion(dt: number): void {
    const o = this.hybrid;
    const ground = 1 - this.airBlend;
    const moveBlend = smoothstep(0.05, o.moveSpeed, this.speed) * ground;
    const fastBlend = smoothstep(o.moveSpeed, o.fastSpeed, this.speed) * ground;
    const idleBlend = (1 - moveBlend) * ground;

    const stride = this.baseStride * (1 + fastBlend * 0.3);
    const frequency = clamp(this.speed / stride, 0, 6) * o.cycleScale;
    this.phase = wrap(this.phase + dt * frequency * TAU, 0, TAU);

    const legAmp = lerp(o.legSwing, o.legSwingFast, fastBlend) * moveBlend;
    const kneeAmp = o.kneeBend * moveBlend;
    const liftAmp = o.legLift * moveBlend;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i] as RootLeg;
      const p = this.phase + leg.offset;

      const upper = leg.restUpper - Math.sin(p) * legAmp;
      const lower = leg.restLower + halfSin(p + 2.0) * kneeAmp;

      leg.upper.rotation.x = lerp(upper, leg.restUpper - 0.4, this.airBlend);
      // Roots splay outward as they lift, like a plant pulling itself free.
      leg.upper.rotation.z = leg.side * halfSin(p + 1.6) * liftAmp;
      leg.lower.rotation.x = lower;
      leg.tip.rotation.x = leg.restTip - (upper + lower) * 0.6;
    }

    // --- Trunk -------------------------------------------------------------
    const sinP = Math.sin(this.phase);
    const absSin = sinP < 0 ? -sinP : sinP;
    const idle = Math.sin(this.clock * o.idleRate * TAU);

    this.trunk.position.y =
      this.restTrunkY - (absSin - 0.5) * o.trunkBob * this.restTrunkY * 2 * moveBlend;
    this.trunk.rotation.x = this.restTrunkX + fastBlend * o.trunkLean + idle * o.idleAmount * idleBlend;
    this.trunk.rotation.z =
      sinP * o.trunkSway * moveBlend - this.turnRate * o.turnLean * moveBlend;
    this.trunk.rotation.y = -sinP * o.trunkSway * 0.5 * moveBlend;

    // --- Crown and head ----------------------------------------------------
    // Lagging the trunk by a fixed phase is what produces the top-heavy wobble.
    const lagged = Math.sin(this.phase - o.crownLag);
    this.crown.rotation.x = this.restCrownX - lagged * o.trunkSway * 0.8 * moveBlend;
    this.crown.rotation.z = -lagged * o.trunkSway * 1.2 * moveBlend;

    this.head.rotation.y = this.turnRate * 0.3;
    this.head.rotation.x = -this.trunk.rotation.x * 0.5;
    this.jaw.rotation.x = this.restJawX + fastBlend * 0.3 + idle * 0.05;

    // --- Arms --------------------------------------------------------------
    const armWave = Math.sin(this.phase + Math.PI) * o.armBob * moveBlend + idle * 0.05 * idleBlend;
    this.armL.rotation.z = this.restArmZL + armWave;
    this.armR.rotation.z = this.restArmZR - armWave;
  }
}

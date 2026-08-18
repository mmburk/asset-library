import type { Object3D } from 'three';
import { TAU, clamp, damp, halfSin, lerp, smoothstep, wrap } from '../../core/math';
import type { CreatureRig } from '../CreatureRig';
import { CreatureAnimator, type CreatureAnimatorOptions } from './CreatureAnimator';

/** Bone names a swimmer skeleton is expected to declare. */
export const SWIMMER_BONES = {
  head: 'head',
  jaw: 'jaw',
  tailFin: 'tailFin',
  finDorsal: 'finDorsal',
  finL: 'finL',
  finR: 'finR',
} as const;

/** Leg prefixes probed by the amphibious walk cycle. */
export const SWIMMER_LEGS = ['legA', 'legB', 'legC'] as const;

/** Highest body segment index probed when discovering the spine chain. */
const MAX_BODY_SEGMENTS = 12;

/** Extra tuning on top of the shared creature options. */
export interface SwimAnimatorOptions extends CreatureAnimatorOptions {
  /** Peak yaw of the body wave, in radians. */
  waveAmount: number;
  /** Phase lag between consecutive body segments, in radians. */
  waveLag: number;
  /** Wave frequency at rest, in Hz. */
  waveRate: number;
  /** Additional wave frequency per unit of speed. */
  waveSpeedRate: number;
  /** Extra yaw applied to the tail fin on top of the last segment. */
  tailFinAmount: number;
  /** Pectoral fin flutter amplitude. */
  finFlutter: number;
  /** Roll into a turn while swimming. */
  bankAmount: number;
  /** Leg swing amplitude while walking on land. */
  legSwing: number;
  kneeBend: number;
  /** Distance covered per half stride on land. Derived from the rig when `0`. */
  strideLength: number;
}

/** One walking leg's resolved bones and rest angles. */
interface SwimmerLeg {
  upper: Object3D;
  lower: Object3D;
  foot: Object3D;
  restUpper: number;
  restLower: number;
  restFoot: number;
  offset: number;
}

/**
 * Amphibious animation: a travelling body wave in water, a walk cycle on land,
 * and a continuous blend between them.
 *
 * The wave is the whole trick. Each body segment runs the same sine a little
 * later than the one in front of it, so the curve visibly travels from head to
 * tail and pushes the creature forward. Amplitude ramps up toward the tail
 * because that is where a real swimmer generates thrust — a uniform amplitude
 * looks like a wobbling tube.
 *
 * Segments are discovered by probing `body0`, `body1`, … so the same animator
 * drives a three-segment amphibian and a ten-segment eel.
 */
export class SwimAnimator extends CreatureAnimator {
  private readonly swim: SwimAnimatorOptions;

  private readonly bodySegments: readonly Object3D[];
  private readonly bodyRestY: Float32Array;
  private readonly head: Object3D;
  private readonly jaw: Object3D;
  private readonly tailFin: Object3D;
  private readonly finDorsal: Object3D;
  private readonly finL: Object3D;
  private readonly finR: Object3D;
  private readonly legs: readonly SwimmerLeg[];

  private readonly restFinZL: number;
  private readonly restFinZR: number;
  private readonly restJawX: number;
  private readonly restTailFinY: number;
  private readonly baseStride: number;

  private targetInWater = true;
  /** `1` fully swimming, `0` fully walking. */
  private waterBlend = 1;
  /** Walk-cycle phase, independent of the swim wave phase. */
  private walkPhase = 0;

  constructor(rig: CreatureRig, options?: Partial<SwimAnimatorOptions>) {
    super(rig, options);

    this.swim = {
      ...this.options,
      waveAmount: 0.26,
      waveLag: 0.7,
      waveRate: 0.7,
      waveSpeedRate: 0.35,
      tailFinAmount: 0.3,
      finFlutter: 0.22,
      bankAmount: 0.3,
      legSwing: 0.5,
      kneeBend: 0.8,
      strideLength: 0,
      ...options,
    };

    // Discover the spine chain by probing until a segment is missing.
    const segments: Object3D[] = [];
    const restY: number[] = [];
    for (let i = 0; i < MAX_BODY_SEGMENTS; i++) {
      const bone = rig.findBone(`body${i}`);
      if (bone === undefined) break;
      segments.push(bone);
      restY.push(rig.restRotationY(`body${i}`));
    }
    if (segments.length === 0) {
      throw new Error(
        `SwimAnimator: skeleton "${rig.definition.name}" declares no "body0" segment.`,
      );
    }
    this.bodySegments = segments;
    this.bodyRestY = new Float32Array(restY);

    this.head = this.optionalBone(SWIMMER_BONES.head);
    this.jaw = this.optionalBone(SWIMMER_BONES.jaw);
    this.tailFin = this.optionalBone(SWIMMER_BONES.tailFin);
    this.finDorsal = this.optionalBone(SWIMMER_BONES.finDorsal);
    this.finL = this.optionalBone(SWIMMER_BONES.finL);
    this.finR = this.optionalBone(SWIMMER_BONES.finR);

    this.restFinZL = rig.restRotationZ(SWIMMER_BONES.finL);
    this.restFinZR = rig.restRotationZ(SWIMMER_BONES.finR);
    this.restJawX = rig.restRotationX(SWIMMER_BONES.jaw);
    this.restTailFinY = rig.restRotationY(SWIMMER_BONES.tailFin);

    // Legs are optional: a plain fish declares none, Tralalero declares three.
    const legs: SwimmerLeg[] = [];
    for (let i = 0; i < SWIMMER_LEGS.length; i++) {
      const name = SWIMMER_LEGS[i] as string;
      if (!rig.hasBone(`${name}Upper`)) continue;
      legs.push({
        upper: this.requireBone(`${name}Upper`),
        lower: this.optionalBone(`${name}Lower`),
        foot: this.optionalBone(`${name}Foot`),
        restUpper: rig.restRotationX(`${name}Upper`),
        restLower: rig.restRotationX(`${name}Lower`),
        restFoot: rig.restRotationX(`${name}Foot`),
        offset: (i / SWIMMER_LEGS.length) * TAU,
      });
    }
    this.legs = legs;

    const derived = Math.max(rig.nominalHeight * 0.45, 0.05);
    this.baseStride = this.swim.strideLength > 0 ? this.swim.strideLength : derived;
  }

  /** Whether the creature is currently in water. Blended, not switched. */
  setInWater(inWater: boolean): void {
    this.targetInWater = inWater;
  }

  /** `1` when fully swimming, `0` when fully walking. */
  get swimBlend(): number {
    return this.waterBlend;
  }

  override reset(): void {
    super.reset();
    this.walkPhase = 0;
    this.waterBlend = this.targetInWater ? 1 : 0;
  }

  protected override applyLocomotion(dt: number): void {
    const o = this.swim;
    this.waterBlend = damp(this.waterBlend, this.targetInWater ? 1 : 0, o.blendRate * 0.5, dt);

    const water = this.waterBlend;
    const land = 1 - water;
    const fastBlend = smoothstep(o.moveSpeed, o.fastSpeed, this.speed);

    // --- Body wave ---------------------------------------------------------
    const waveFrequency = (o.waveRate + this.speed * o.waveSpeedRate) * o.cycleScale;
    this.phase = wrap(this.phase + dt * waveFrequency * TAU, 0, TAU);

    const count = this.bodySegments.length;
    const divisor = count > 1 ? count - 1 : 1;
    // Idling in water still undulates gently; swimming hard doubles it.
    const amplitude = o.waveAmount * water * (0.35 + smoothstep(0, o.fastSpeed, this.speed) * 0.9);

    for (let i = 0; i < count; i++) {
      const segment = this.bodySegments[i] as Object3D;
      // Amplitude ramps toward the tail — that is where the thrust comes from.
      const weight = 0.25 + 0.75 * (i / divisor);
      segment.rotation.y =
        (this.bodyRestY[i] as number) + Math.sin(this.phase - i * o.waveLag) * amplitude * weight;
      // A slight counter-roll keeps the body from looking like flat cardboard.
      segment.rotation.z = i === 0 ? -this.turnRate * o.bankAmount * water : 0;
    }

    this.tailFin.rotation.y =
      this.restTailFinY + Math.sin(this.phase - count * o.waveLag) * o.tailFinAmount * water;

    // --- Fins --------------------------------------------------------------
    const flutter = Math.sin(this.clock * 1.7 * TAU) * o.finFlutter * water;
    this.finL.rotation.z = this.restFinZL + flutter + this.turnRate * 0.25;
    this.finR.rotation.z = this.restFinZR - flutter + this.turnRate * 0.25;
    this.finDorsal.rotation.y = Math.sin(this.phase - 0.4) * amplitude * 0.6;

    // --- Head --------------------------------------------------------------
    this.head.rotation.y = -Math.sin(this.phase + 0.5) * amplitude * 0.5 + this.turnRate * 0.2;
    this.jaw.rotation.x =
      this.restJawX + fastBlend * 0.35 + Math.sin(this.clock * 0.5 * TAU) * 0.06;

    // --- Legs --------------------------------------------------------------
    if (this.legs.length === 0) return;

    const stride = this.baseStride * (1 + fastBlend * 0.35);
    const frequency = clamp(this.speed / stride, 0, 7) * o.cycleScale;
    this.walkPhase = wrap(this.walkPhase + dt * frequency * TAU, 0, TAU);

    const walkBlend = smoothstep(0.05, o.moveSpeed, this.speed) * land;
    const legAmp = o.legSwing * walkBlend;
    const kneeAmp = o.kneeBend * walkBlend;
    // In water the legs trail behind instead of walking.
    const trail = water * 0.45;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i] as SwimmerLeg;
      const p = this.walkPhase + leg.offset;
      const upper = lerp(leg.restUpper - Math.sin(p) * legAmp, leg.restUpper + trail, water);
      const lower = lerp(
        leg.restLower + halfSin(p + 2.2) * kneeAmp,
        leg.restLower + 0.35,
        water,
      );
      leg.upper.rotation.x = upper;
      leg.lower.rotation.x = lower;
      leg.foot.rotation.x = leg.restFoot - (upper + lower) * 0.7 * land;
    }
  }
}

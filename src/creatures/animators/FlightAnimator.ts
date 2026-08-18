import type { Object3D } from 'three';
import { TAU, clamp, damp, smoothstep, wrap } from '../../core/math';
import type { CreatureRig } from '../CreatureRig';
import { CreatureAnimator, type CreatureAnimatorOptions } from './CreatureAnimator';

/** Bone names a flyer skeleton is expected to declare. */
export const FLYER_BONES = {
  body: 'body',
  neck: 'neck',
  head: 'head',
  jaw: 'jaw',
  wingL: 'wingL',
  wingR: 'wingR',
  /** Nose propeller on a single-engine airframe. */
  propeller: 'propeller',
  /** Wing-mounted engines on a multi-engine airframe. */
  propellerL: 'propellerL',
  propellerR: 'propellerR',
  tail: 'tail',
  tailFin: 'tailFin',
  legL: 'legL',
  legR: 'legR',
  /** Slung store — a bomb, a cargo pod, anything that hangs and swings. */
  payload: 'payload',
} as const;

/** Extra tuning on top of the shared creature options. */
export interface FlightAnimatorOptions extends CreatureAnimatorOptions {
  /** Hover oscillation frequency, in Hz. */
  bobRate: number;
  /** Hover oscillation amplitude, in world units at nominal scale. */
  bobAmount: number;
  /** Roll into a turn, in radians per rad/s of yaw. */
  bankAmount: number;
  /** Pitch per unit of climb rate. */
  pitchAmount: number;
  /** Wing flap amplitude while slow. */
  flapAmount: number;
  /** Wing flap frequency at hover, in Hz. */
  flapRate: number;
  /**
   * Speed at which flapping fully gives way to a fixed-wing glide. Below it the
   * creature beats its wings; above it they lock out.
   */
  glideSpeed: number;
  /** Propeller revolutions per second at idle. */
  propellerIdleRps: number;
  /** Additional propeller revolutions per second per unit of speed. */
  propellerSpeedRps: number;
  /** How far the legs tuck up once airborne. */
  legTuck: number;
  /**
   * How much of the airframe's own bank and pitch a slung payload refuses to
   * follow, `0`–`1`. `0` welds the store to the fuselage; `1` keeps it hanging
   * perfectly plumb.
   */
  payloadSwing: number;
}

/**
 * Powered flight: hover, glide, bank and propeller spin.
 *
 * Two things make this read as flight rather than as a hovering statue. First,
 * the wings cross-fade from flapping to a locked glide as speed rises, so slow
 * flight looks laboured and fast flight looks committed. Second, the body banks
 * into turns — an aircraft that yaws without rolling looks like it is on rails.
 *
 * The propeller keeps its own wrapped angle rather than accumulating onto the
 * bone, so it can spin for hours without losing float precision.
 */
export class FlightAnimator extends CreatureAnimator {
  private readonly flight: FlightAnimatorOptions;

  private readonly body: Object3D;
  private readonly neck: Object3D;
  private readonly head: Object3D;
  private readonly jaw: Object3D;
  private readonly wingL: Object3D;
  private readonly wingR: Object3D;
  private readonly propeller: Object3D;
  private readonly propellerL: Object3D;
  private readonly propellerR: Object3D;
  private readonly tail: Object3D;
  private readonly tailFin: Object3D;
  private readonly legL: Object3D;
  private readonly legR: Object3D;
  private readonly payload: Object3D;

  private readonly restBodyY: number;
  private readonly restWingZL: number;
  private readonly restWingZR: number;
  private readonly restTailX: number;
  private readonly restLegXL: number;
  private readonly restLegXR: number;
  private readonly restJawX: number;
  private readonly restPayloadX: number;
  private readonly restPayloadZ: number;

  /** Propeller angle in radians, wrapped to `[0, TAU)`. */
  private propellerAngle = 0;
  private targetClimbRate = 0;
  private climbRate = 0;

  constructor(rig: CreatureRig, options?: Partial<FlightAnimatorOptions>) {
    super(rig, options);

    this.flight = {
      ...this.options,
      bobRate: 0.55,
      bobAmount: 0.045,
      bankAmount: 0.45,
      pitchAmount: 0.28,
      flapAmount: 0.55,
      flapRate: 2.4,
      glideSpeed: 4.5,
      propellerIdleRps: 2.5,
      propellerSpeedRps: 1.6,
      legTuck: 0.9,
      payloadSwing: 0.6,
      ...options,
    };

    this.body = this.requireBone(FLYER_BONES.body);
    this.neck = this.optionalBone(FLYER_BONES.neck);
    this.head = this.optionalBone(FLYER_BONES.head);
    this.jaw = this.optionalBone(FLYER_BONES.jaw);
    this.wingL = this.optionalBone(FLYER_BONES.wingL);
    this.wingR = this.optionalBone(FLYER_BONES.wingR);
    this.propeller = this.optionalBone(FLYER_BONES.propeller);
    this.propellerL = this.optionalBone(FLYER_BONES.propellerL);
    this.propellerR = this.optionalBone(FLYER_BONES.propellerR);
    this.tail = this.optionalBone(FLYER_BONES.tail);
    this.tailFin = this.optionalBone(FLYER_BONES.tailFin);
    this.legL = this.optionalBone(FLYER_BONES.legL);
    this.legR = this.optionalBone(FLYER_BONES.legR);
    this.payload = this.optionalBone(FLYER_BONES.payload);

    this.restBodyY = rig.restPositionY(FLYER_BONES.body);
    this.restWingZL = rig.restRotationZ(FLYER_BONES.wingL);
    this.restWingZR = rig.restRotationZ(FLYER_BONES.wingR);
    this.restTailX = rig.restRotationX(FLYER_BONES.tail);
    this.restLegXL = rig.restRotationX(FLYER_BONES.legL);
    this.restLegXR = rig.restRotationX(FLYER_BONES.legR);
    this.restJawX = rig.restRotationX(FLYER_BONES.jaw);
    this.restPayloadX = rig.restRotationX(FLYER_BONES.payload);
    this.restPayloadZ = rig.restRotationZ(FLYER_BONES.payload);
  }

  /** Vertical velocity in units per second. Positive climbs. */
  setClimbRate(rate: number): void {
    this.targetClimbRate = rate;
  }

  override setState(speed: number, grounded: boolean, turnRate = 0): void {
    super.setState(speed, grounded, turnRate);
  }

  override reset(): void {
    super.reset();
    this.propellerAngle = 0;
    this.climbRate = 0;
    this.targetClimbRate = 0;
  }

  protected override applyLocomotion(dt: number): void {
    const o = this.flight;
    this.climbRate = damp(this.climbRate, this.targetClimbRate, o.blendRate * 0.7, dt);

    // Airborne blend is inverted here relative to walkers: a flyer is "at rest"
    // when it is on the ground, and everything interesting happens in the air.
    const air = this.airBlend;
    const fastBlend = smoothstep(o.moveSpeed, o.fastSpeed, this.speed);
    const glide = smoothstep(o.moveSpeed * 0.5, o.glideSpeed, this.speed);
    const flapBlend = (1 - glide) * air;

    // Flap phase runs on its own clock: wingbeat frequency rises as the
    // creature slows down and has to work harder to stay up.
    const flapFrequency = o.flapRate * (0.6 + (1 - glide) * 0.8) * o.cycleScale;
    this.phase = wrap(this.phase + dt * flapFrequency * TAU, 0, TAU);
    const flap = Math.sin(this.phase);

    // --- Body --------------------------------------------------------------
    const bob = Math.sin(this.clock * o.bobRate * TAU) * o.bobAmount * air;
    this.body.position.y = this.restBodyY + bob;
    this.body.rotation.z = -this.turnRate * o.bankAmount * air;
    this.body.rotation.x = clamp(-this.climbRate * o.pitchAmount, -0.6, 0.6) + fastBlend * 0.1;
    this.body.rotation.y = 0;

    // --- Wings -------------------------------------------------------------
    // Positive Z on the left wing lifts it; the right mirrors.
    const flapL = flap * o.flapAmount * flapBlend;
    const spread = glide * air * 0.12;
    this.wingL.rotation.z = this.restWingZL + flapL + spread;
    this.wingR.rotation.z = this.restWingZR - flapL - spread;
    // Wings twist slightly on the downstroke, which reads as bite into the air.
    this.wingL.rotation.x = flap * 0.2 * flapBlend;
    this.wingR.rotation.x = flap * 0.2 * flapBlend;

    // --- Propellers --------------------------------------------------------
    const rps = o.propellerIdleRps + this.speed * o.propellerSpeedRps;
    this.propellerAngle = wrap(this.propellerAngle + dt * rps * TAU, 0, TAU);
    this.propeller.rotation.z = this.propellerAngle;
    // Wing engines share the one angle — a second accumulator would only be a
    // second thing to drift — but the right-hand disc turns the other way, the
    // way a twin cancels its own torque. It also stops the two discs from
    // strobing in lockstep, which is what makes a shared angle look shared.
    this.propellerL.rotation.z = this.propellerAngle;
    this.propellerR.rotation.z = -this.propellerAngle;

    // --- Tail and head -----------------------------------------------------
    this.tail.rotation.x = this.restTailX + this.climbRate * 0.08 + bob * 0.5;
    this.tail.rotation.y = -this.turnRate * 0.2;
    this.tailFin.rotation.y = -this.turnRate * 0.35;

    this.neck.rotation.x = -this.body.rotation.x * 0.6;
    this.head.rotation.y = this.turnRate * 0.3;
    this.head.rotation.x = -this.body.rotation.x * 0.3;
    this.jaw.rotation.x = this.restJawX + fastBlend * 0.3;

    // --- Legs --------------------------------------------------------------
    const tuck = o.legTuck * air;
    this.legL.rotation.x = this.restLegXL + tuck;
    this.legR.rotation.x = this.restLegXR + tuck;

    // --- Payload -----------------------------------------------------------
    // A slung store hangs from a pivot rather than being welded on, so it lags
    // the airframe: it stays nearer plumb through a bank and trails through a
    // climb. The signs are the negation of what the body was just given, which
    // is what makes the lag read as weight instead of as a second animation.
    this.payload.rotation.z = this.restPayloadZ - this.body.rotation.z * o.payloadSwing;
    this.payload.rotation.x = this.restPayloadX - this.body.rotation.x * o.payloadSwing;
  }
}

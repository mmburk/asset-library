import { TAU, clamp, damp, halfSin, lerp, smoothstep, wrap } from '../core/math';
import { mergeOptions, type DeepPartial, type Tickable } from '../core/types';
import type { HumanoidRig } from './HumanoidRig';
import { HUMANOID_JOINT_INDEX, type HumanoidJointName } from './types';

/** Coarse description of what the animator is currently playing. */
export type LocomotionMode = 'idle' | 'walk' | 'run' | 'air';

/** Tuning for {@link LocomotionAnimator}. Angles are radians unless noted. */
export interface LocomotionOptions {
  /** Speed (units/s) at which the walk cycle is fully blended in. */
  walkSpeed: number;
  /** Speed (units/s) at which the run cycle is fully blended in. */
  runSpeed: number;
  /** Multiplier on the natural stride frequency. */
  strideScale: number;

  /** Thigh swing amplitude at walking pace. */
  legSwing: number;
  /** Thigh swing amplitude at running pace. */
  legSwingRun: number;
  /** Peak knee flexion during the swing phase. */
  kneeBend: number;
  /** How hard the ankle works to keep the sole level. `0`–`1`. */
  ankleCompensation: number;

  /** Upper-arm swing amplitude at walking pace. */
  armSwing: number;
  /** Upper-arm swing amplitude at running pace. */
  armSwingRun: number;
  /** Elbow flexion added while running. */
  elbowBend: number;

  /** Vertical hip travel, as a fraction of leg length. */
  hipBob: number;
  /** Hip yaw amplitude. */
  hipSway: number;
  /** Chest counter-rotation against the hips. */
  torsoCounterRotate: number;
  /** Forward lean at full running speed. */
  torsoLean: number;
  /** How much the head cancels torso lean. `0`–`1`. */
  headStabilise: number;

  /** Idle breathing frequency, in Hz. */
  breathRate: number;
  /** Idle breathing amplitude. */
  breathAmount: number;
  /** Idle weight-shift frequency, in Hz. */
  idleSwayRate: number;
  /** Idle weight-shift amplitude, as a fraction of height. */
  idleSwayAmount: number;

  /** Bank angle per unit of turn rate (rad per rad/s). */
  turnLean: number;

  /** Exponential blend rate for speed and grounded transitions. Higher is snappier. */
  blendRate: number;

  /** Knee flexion held in the air. */
  airLegBend: number;
  /** How far the arms come up in the air. */
  airArmRaise: number;
}

/** Sensible defaults for a human-scaled character. */
export const DEFAULT_LOCOMOTION_OPTIONS: LocomotionOptions = {
  walkSpeed: 1.6,
  runSpeed: 5.0,
  strideScale: 1.0,

  legSwing: 0.55,
  legSwingRun: 0.95,
  kneeBend: 0.95,
  ankleCompensation: 0.8,

  armSwing: 0.42,
  armSwingRun: 0.85,
  elbowBend: 0.7,

  hipBob: 0.035,
  hipSway: 0.09,
  torsoCounterRotate: 0.13,
  torsoLean: 0.28,
  headStabilise: 0.65,

  breathRate: 0.28,
  breathAmount: 0.035,
  idleSwayRate: 0.17,
  idleSwayAmount: 0.008,

  turnLean: 0.18,

  blendRate: 8,

  airLegBend: 0.95,
  airArmRaise: 1.1,
};

/**
 * Procedural walk / run / idle / airborne animation for a {@link HumanoidRig}.
 *
 * There are no clips and no keyframes: every joint angle is a closed-form
 * function of a single stride phase, so the cycle stays in sync with actual
 * movement speed at any velocity, blends continuously, and costs a few dozen
 * `Math.sin` calls per character.
 *
 * **`update()` allocates nothing.** Every intermediate is a number local and
 * every write targets an existing `Euler` or `Vector3`. It also writes
 * *absolute* angles rather than accumulating deltas, so the pose can never
 * drift no matter how long the game runs or how erratic the frame timing is.
 */
export class LocomotionAnimator implements Tickable {
  private readonly rig: HumanoidRig;
  private readonly options: LocomotionOptions;

  // --- Inputs ------------------------------------------------------------
  private targetSpeed = 0;
  private grounded = true;
  private targetTurnRate = 0;

  // --- Smoothed state ----------------------------------------------------
  private speed = 0;
  private airBlend = 0;
  private turnRate = 0;

  /** Stride phase in radians, wrapped to `[0, TAU)`. */
  private stridePhase = 0;
  /** Wall clock for the idle oscillators, wrapped to keep float precision. */
  private clock = 0;

  // --- Cached rest pose --------------------------------------------------
  // Read once so the per-frame path never touches the rest arrays.
  private readonly restHipsX: number;
  private readonly restHipsY: number;
  private readonly restSpineX: number;
  private readonly restChestX: number;
  private readonly restHeadX: number;
  private readonly restShoulderZL: number;
  private readonly restShoulderZR: number;
  private readonly restUpperArmX: number;
  private readonly restLowerArmX: number;
  private readonly restUpperLegX: number;
  private readonly restUpperLegZL: number;
  private readonly restUpperLegZR: number;
  private readonly restLowerLegX: number;
  private readonly restFootX: number;

  /** Distance covered per half stride — sets the natural cadence. */
  private readonly baseStrideLength: number;

  constructor(rig: HumanoidRig, options?: DeepPartial<LocomotionOptions>) {
    this.rig = rig;
    this.options = mergeOptions(DEFAULT_LOCOMOTION_OPTIONS, options);

    const rot = rig.restRotations;
    const pos = rig.restPositions;
    const rx = (name: HumanoidJointName): number =>
      rot[HUMANOID_JOINT_INDEX[name] * 3] as number;
    const rz = (name: HumanoidJointName): number =>
      rot[HUMANOID_JOINT_INDEX[name] * 3 + 2] as number;

    this.restHipsX = pos[HUMANOID_JOINT_INDEX.hips * 3] as number;
    this.restHipsY = pos[HUMANOID_JOINT_INDEX.hips * 3 + 1] as number;
    this.restSpineX = rx('spine');
    this.restChestX = rx('chest');
    this.restHeadX = rx('head');
    this.restShoulderZL = rz('shoulderL');
    this.restShoulderZR = rz('shoulderR');
    this.restUpperArmX = rx('upperArmL');
    this.restLowerArmX = rx('lowerArmL');
    this.restUpperLegX = rx('upperLegL');
    this.restUpperLegZL = rz('upperLegL');
    this.restUpperLegZR = rz('upperLegR');
    this.restLowerLegX = rx('lowerLegL');
    this.restFootX = rx('footL');

    this.baseStrideLength = Math.max(rig.measurements.legLength * 1.15, 0.05);
  }

  /** Current stride phase in radians. */
  get phase(): number {
    return this.stridePhase;
  }

  /** Smoothed speed the animation is currently built around. */
  get currentSpeed(): number {
    return this.speed;
  }

  /** Coarse label for the active cycle — useful for footstep audio and UI. */
  get mode(): LocomotionMode {
    if (this.airBlend > 0.5) return 'air';
    if (this.speed >= this.options.runSpeed * 0.55) return 'run';
    if (this.speed > 0.08) return 'walk';
    return 'idle';
  }

  /** Horizontal speed in units per second. */
  setSpeed(speed: number): void {
    this.targetSpeed = speed < 0 ? -speed : speed;
  }

  /** Whether the character's feet are on the ground. */
  setGrounded(grounded: boolean): void {
    this.grounded = grounded;
  }

  /** Yaw rate in radians per second; drives the banking lean. */
  setTurnRate(turnRate: number): void {
    this.targetTurnRate = turnRate;
  }

  /** Sets every input at once — the usual per-frame call. */
  setState(speed: number, grounded: boolean, turnRate = 0): void {
    this.setSpeed(speed);
    this.setGrounded(grounded);
    this.setTurnRate(turnRate);
  }

  /**
   * Snaps the smoothed state to the current inputs, skipping the blend.
   * Call after a teleport or a respawn so the character does not visibly ease
   * into its new state.
   */
  snapToState(): void {
    this.speed = this.targetSpeed;
    this.airBlend = this.grounded ? 0 : 1;
    this.turnRate = this.targetTurnRate;
  }

  /** Returns the rig to its rest pose and zeroes the cycle. */
  reset(): void {
    this.stridePhase = 0;
    this.clock = 0;
    this.speed = 0;
    this.airBlend = 0;
    this.turnRate = 0;
    this.targetSpeed = 0;
    this.targetTurnRate = 0;
    this.grounded = true;
    this.rig.resetPose();
  }

  /**
   * Advances and applies the animation.
   * @param dt Seconds since the previous frame.
   */
  update(dt: number): void {
    if (dt <= 0) return;
    const o = this.options;
    const rig = this.rig;

    // --- Smooth the inputs -------------------------------------------------
    this.speed = damp(this.speed, this.targetSpeed, o.blendRate, dt);
    this.airBlend = damp(this.airBlend, this.grounded ? 0 : 1, o.blendRate, dt);
    this.turnRate = damp(this.turnRate, this.targetTurnRate, o.blendRate * 0.6, dt);

    // Wrapped rather than unbounded, so float precision never degrades in a
    // session that runs for hours.
    this.clock = wrap(this.clock + dt, 0, 3600);

    const groundBlend = 1 - this.airBlend;
    const moveBlend = smoothstep(0.05, o.walkSpeed, this.speed) * groundBlend;
    const runBlend = smoothstep(o.walkSpeed, o.runSpeed, this.speed) * groundBlend;
    const idleBlend = (1 - moveBlend) * groundBlend;

    // --- Advance the stride phase -----------------------------------------
    // Pendulum model: cadence follows speed / stride length, and the stride
    // itself lengthens as the character speeds up. This is why the feet do not
    // skate — the cycle is derived from velocity rather than played back at a
    // fixed rate.
    const strideLength = this.baseStrideLength * (1 + runBlend * 0.35);
    const frequency = clamp(this.speed / strideLength, 0, 6) * o.strideScale;
    this.stridePhase = wrap(this.stridePhase + dt * frequency * TAU, 0, TAU);

    const phase = this.stridePhase;
    const sinP = Math.sin(phase);
    const absSin = sinP < 0 ? -sinP : sinP;

    // --- Legs --------------------------------------------------------------
    const legAmp = lerp(o.legSwing, o.legSwingRun, runBlend) * moveBlend;
    const kneeAmp = o.kneeBend * moveBlend * (1 + runBlend * 0.5);
    const kneeIdleBase = runBlend * 0.22;

    // A positive rotation.x swings a `-Y` limb backwards, so forward swing is
    // negative. Left leg leads while sin(phase) is positive.
    const thighGroundL = this.restUpperLegX - sinP * legAmp;
    const thighGroundR = this.restUpperLegX + sinP * legAmp;
    const kneeGroundL = this.restLowerLegX + kneeIdleBase + halfSin(phase + 2.2) * kneeAmp;
    const kneeGroundR =
      this.restLowerLegX + kneeIdleBase + halfSin(phase + 2.2 + Math.PI) * kneeAmp;

    const thighL = lerp(thighGroundL, -0.35, this.airBlend);
    const thighR = lerp(thighGroundR, 0.2, this.airBlend);
    const kneeL = lerp(kneeGroundL, o.airLegBend, this.airBlend);
    const kneeR = lerp(kneeGroundR, o.airLegBend * 0.7, this.airBlend);

    rig.upperLegL.rotation.x = thighL;
    rig.upperLegR.rotation.x = thighR;
    rig.lowerLegL.rotation.x = kneeL;
    rig.lowerLegR.rotation.x = kneeR;

    // Legs converge slightly as speed rises, which reads as purposeful gait.
    const legConverge = runBlend * 0.05;
    rig.upperLegL.rotation.z = this.restUpperLegZL - legConverge;
    rig.upperLegR.rotation.z = this.restUpperLegZR + legConverge;

    // The ankle cancels most of the accumulated leg rotation to keep the sole
    // level, then adds a toe-off kick as the foot leaves the ground.
    const toeOffL = halfSin(phase + Math.PI * 0.5) * 0.3 * moveBlend;
    const toeOffR = halfSin(phase + Math.PI * 1.5) * 0.3 * moveBlend;
    rig.footL.rotation.x =
      this.restFootX - (thighL + kneeL) * o.ankleCompensation + toeOffL;
    rig.footR.rotation.x =
      this.restFootX - (thighR + kneeR) * o.ankleCompensation + toeOffR;

    // --- Arms --------------------------------------------------------------
    // Arms counter-swing against the legs: the left arm goes back as the left
    // leg comes forward.
    const armAmp = lerp(o.armSwing, o.armSwingRun, runBlend) * moveBlend;
    const idleArmSway = Math.sin(this.clock * o.breathRate * TAU) * 0.03 * idleBlend;

    const armGroundL = this.restUpperArmX + sinP * armAmp + idleArmSway;
    const armGroundR = this.restUpperArmX - sinP * armAmp + idleArmSway;
    rig.upperArmL.rotation.x = lerp(armGroundL, -o.airArmRaise, this.airBlend);
    rig.upperArmR.rotation.x = lerp(armGroundR, -o.airArmRaise * 0.85, this.airBlend);

    // The elbow only ever bends one way.
    const elbowBase = this.restLowerArmX + o.elbowBend * runBlend * moveBlend;
    const elbowGroundL = elbowBase + halfSin(phase + Math.PI) * 0.28 * moveBlend;
    const elbowGroundR = elbowBase + halfSin(phase) * 0.28 * moveBlend;
    rig.lowerArmL.rotation.x = lerp(elbowGroundL, 0.85, this.airBlend);
    rig.lowerArmR.rotation.x = lerp(elbowGroundR, 0.85, this.airBlend);

    // Shoulders lift and open as the pace picks up.
    const shoulderOpen = runBlend * 0.14 + this.airBlend * 0.2;
    rig.shoulderL.rotation.z = this.restShoulderZL + shoulderOpen;
    rig.shoulderR.rotation.z = this.restShoulderZR - shoulderOpen;

    // --- Torso -------------------------------------------------------------
    const lean = moveBlend * 0.05 + runBlend * o.torsoLean;
    const breath = Math.sin(this.clock * o.breathRate * TAU) * o.breathAmount * idleBlend;

    rig.spine.rotation.x = lerp(this.restSpineX + lean, this.restSpineX + 0.12, this.airBlend);
    rig.chest.rotation.x = this.restChestX + lean * 0.35 + breath;

    // Hips and chest twist against each other — the single most effective cue
    // that a walk is a walk and not a shuffle.
    const twist = sinP * moveBlend;
    rig.hips.rotation.y = twist * o.hipSway;
    rig.chest.rotation.y = -twist * o.torsoCounterRotate;

    // Vertical travel: the hips sit lowest when the legs are furthest apart.
    const bob = -(absSin - 0.5) * o.hipBob * rig.measurements.legLength * 2 * moveBlend;
    rig.hips.position.y = this.restHipsY + bob;

    // Idle weight shift plus turn banking, combined into one write.
    const idleSway = Math.sin(this.clock * o.idleSwayRate * TAU) * idleBlend;
    rig.hips.position.x =
      this.restHipsX + idleSway * o.idleSwayAmount * rig.measurements.height;
    rig.hips.rotation.z = idleSway * 0.018 - this.turnRate * o.turnLean * moveBlend;

    // --- Head --------------------------------------------------------------
    // Counteracting the torso keeps the eyeline steady, which is what stops a
    // procedural walk from looking seasick.
    const headNod = Math.sin(this.clock * o.breathRate * TAU + 1.1) * 0.02 * idleBlend;
    rig.head.rotation.x =
      this.restHeadX - (lean + breath) * o.headStabilise + headNod + this.airBlend * 0.1;
    rig.head.rotation.y = twist * o.torsoCounterRotate * 0.4;
  }
}

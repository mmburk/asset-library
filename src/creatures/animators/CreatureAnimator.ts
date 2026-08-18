import { Object3D } from 'three';
import { damp, wrap } from '../../core/math';
import type { Tickable } from '../../core/types';
import type { CreatureRig } from '../CreatureRig';
import type { BodyPlan } from '../types';
import { DeathOverlay, type DeathOptions } from './DeathOverlay';

/** Coarse description of what a creature animator is currently playing. */
export type CreatureMotionMode = 'idle' | 'move' | 'fast' | 'air' | 'dead';

/** Options shared by every creature animator. */
export interface CreatureAnimatorOptions {
  /** Speed (units/s) at which the movement cycle is fully blended in. */
  moveSpeed: number;
  /** Speed (units/s) at which the fast cycle is fully blended in. */
  fastSpeed: number;
  /** Multiplier on the natural cycle frequency. */
  cycleScale: number;
  /** Exponential blend rate for speed and grounded transitions. */
  blendRate: number;
  /** Idle oscillator frequency, in Hz. */
  idleRate: number;
  /** Idle oscillator amplitude, in radians. */
  idleAmount: number;
  /** Bank angle per unit of turn rate (rad per rad/s). */
  turnLean: number;
  /** Death animation tuning. */
  death: Partial<DeathOptions>;
}

export const DEFAULT_CREATURE_ANIMATOR_OPTIONS: CreatureAnimatorOptions = {
  moveSpeed: 1.6,
  fastSpeed: 5.0,
  cycleScale: 1.0,
  blendRate: 8,
  idleRate: 0.3,
  idleAmount: 0.04,
  turnLean: 0.18,
  death: {},
};

/**
 * Shared skeleton for every body-plan animator.
 *
 * Owns the parts that do not vary between plans — input smoothing, the cycle
 * clock, and the death overlay — and leaves the actual pose to
 * {@link applyLocomotion}. Subclasses resolve the bones they care about once in
 * their constructor, then only write numbers.
 *
 * The contract subclasses must honour: write **absolute** joint values every
 * frame, never accumulate deltas. That is what makes the pose immune to frame
 * timing and lets the death overlay blend cleanly on top.
 */
export abstract class CreatureAnimator implements Tickable {
  protected readonly rig: CreatureRig;
  protected readonly options: CreatureAnimatorOptions;
  protected readonly death: DeathOverlay;

  // --- Inputs ------------------------------------------------------------
  private targetSpeed = 0;
  private targetTurnRate = 0;
  private targetGrounded = true;

  // --- Smoothed state ----------------------------------------------------
  /** Smoothed horizontal speed the animation is built around. */
  protected speed = 0;
  /** Smoothed yaw rate, drives banking. */
  protected turnRate = 0;
  /** `0` on the ground, `1` fully airborne. */
  protected airBlend = 0;
  /** Wrapped wall clock for idle oscillators. */
  protected clock = 0;
  /** Primary cycle phase in radians, wrapped to `[0, TAU)`. */
  protected phase = 0;

  constructor(rig: CreatureRig, options?: Partial<CreatureAnimatorOptions>) {
    this.rig = rig;
    this.options = { ...DEFAULT_CREATURE_ANIMATOR_OPTIONS, ...options };
    this.death = new DeathOverlay(rig, this.options.death);
  }

  /** Body plan this animator drives. */
  get plan(): BodyPlan {
    return this.rig.plan;
  }

  /** `true` once {@link die} has been called. */
  get isDead(): boolean {
    return this.death.active;
  }

  /** Death animation progress, `0`–`1`. */
  get deathProgress(): number {
    return this.death.progress;
  }

  /** `true` once the death animation has fully played out. */
  get deathFinished(): boolean {
    return this.death.finished;
  }

  /** Coarse label for the active cycle — useful for footstep audio and AI. */
  get mode(): CreatureMotionMode {
    if (this.death.active) return 'dead';
    if (this.airBlend > 0.5) return 'air';
    if (this.speed >= this.options.fastSpeed * 0.55) return 'fast';
    if (this.speed > 0.08) return 'move';
    return 'idle';
  }

  /** Horizontal speed in units per second. */
  setSpeed(speed: number): void {
    this.targetSpeed = speed < 0 ? -speed : speed;
  }

  /** Whether the creature is supported by the ground. */
  setGrounded(grounded: boolean): void {
    this.targetGrounded = grounded;
  }

  /** Yaw rate in radians per second. */
  setTurnRate(turnRate: number): void {
    this.targetTurnRate = turnRate;
  }

  /** Sets every input at once — the usual per-frame call. */
  setState(speed: number, grounded: boolean, turnRate = 0): void {
    this.setSpeed(speed);
    this.setGrounded(grounded);
    this.setTurnRate(turnRate);
  }

  /** Starts the death animation. */
  die(): void {
    this.death.trigger();
  }

  /** Cancels death and restores the rig root transform. */
  revive(): void {
    this.death.revive();
  }

  /** Returns the rig to rest and zeroes every cycle. */
  reset(): void {
    this.death.revive();
    this.speed = 0;
    this.turnRate = 0;
    this.airBlend = 0;
    this.clock = 0;
    this.phase = 0;
    this.targetSpeed = 0;
    this.targetTurnRate = 0;
    this.targetGrounded = true;
    this.rig.resetPose();
  }

  /**
   * Advances and applies the animation. Allocation-free.
   * @param dt Seconds since the previous frame.
   */
  update(dt: number): void {
    if (dt <= 0) return;

    this.speed = damp(this.speed, this.targetSpeed, this.options.blendRate, dt);
    this.turnRate = damp(this.turnRate, this.targetTurnRate, this.options.blendRate * 0.6, dt);
    this.airBlend = damp(this.airBlend, this.targetGrounded ? 0 : 1, this.options.blendRate, dt);

    // Wrapped so float precision never degrades in a long session.
    this.clock = wrap(this.clock + dt, 0, 3600);

    const deathBlend = this.death.advance(dt);
    if (deathBlend < 1) {
      this.applyLocomotion(dt);
    }
    if (deathBlend > 0) {
      this.death.apply(deathBlend);
    }
  }

  /**
   * Resolves a bone the animator cannot work without.
   * @throws when the skeleton does not declare it.
   */
  protected requireBone(name: string): Object3D {
    return this.rig.getBone(name);
  }

  /**
   * Resolves a bone that may or may not exist on this skeleton.
   *
   * Missing bones resolve to a detached scrap node, so a plan animator can
   * write to an optional jaw or tail unconditionally. That keeps the per-frame
   * path free of null checks — the writes simply land somewhere nothing reads.
   */
  protected optionalBone(name: string): Object3D {
    return this.rig.findBone(name) ?? this.scrap;
  }

  /** Shared sink for writes to bones this skeleton does not have. */
  private readonly scrap: Object3D = new Object3D();

  /** Writes the living pose. Called every frame until death completes. */
  protected abstract applyLocomotion(dt: number): void;
}

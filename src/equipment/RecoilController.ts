import { clamp } from '../core/math';

/** Tuning for {@link RecoilController}. */
export interface RecoilOptions {
  /** Peak muzzle rise for a single shot, radians. */
  kick: number;
  /** Peak rearward push, as a fraction of the skeleton's authored height. */
  push: number;
  /** Peak roll away from the firing hand, radians. */
  twist: number;
  /** Spring stiffness. Higher snaps back sooner. */
  stiffness: number;
  /** Spring damping. At or above critical the weapon returns without dipping. */
  damping: number;
  /** Seconds between shots. `0` fires as fast as it is asked to. */
  cooldown: number;
  /** How far repeated shots are allowed to stack, in single-shot peaks. */
  maxStack: number;
}

export const DEFAULT_RECOIL: Readonly<RecoilOptions> = Object.freeze({
  kick: 0.22,
  push: 0.035,
  twist: 0.06,
  // Underdamped on purpose: a weapon that returns to rest and stops dead reads
  // as a rewind. The small dip past centre is what makes it read as a spring
  // taking the shot.
  stiffness: 260,
  damping: 24,
  cooldown: 0.11,
  maxStack: 2.2,
});

/**
 * Recoil as a struck spring.
 *
 * A shot is an impulse rather than a keyframe, which buys three things that an
 * envelope would have to special-case: rapid fire stacks by itself, the weapon
 * is always somewhere sensible when the next shot lands mid-recovery, and the
 * settle has a real overshoot instead of an eased ramp.
 *
 * The impulse is normalised at construction so that one shot peaks at exactly
 * `1`, which is what lets {@link RecoilOptions.kick} and friends be stated as
 * plain peak amounts rather than as spring units nobody can picture.
 */
export class RecoilController {
  private readonly options: RecoilOptions;
  private readonly impulse: number;

  /** Exact one-step propagator for {@link FIXED_STEP}. See {@link solveStep}. */
  private readonly stepDecay: number;
  private readonly stepCos: number;
  private readonly stepSinOverW: number;
  private readonly alpha: number;
  private readonly omegaSquared: number;

  private displacement = 0;
  private velocity = 0;
  private cooldownLeft = 0;
  private shotCount = 0;
  /** Leftover frame time, held until it adds up to a whole fixed step. */
  private carry = 0;

  constructor(options: Partial<RecoilOptions> = {}) {
    this.options = { ...DEFAULT_RECOIL, ...options };

    const step = solveStep(this.options.stiffness, this.options.damping, FIXED_STEP);
    this.stepDecay = step.decay;
    this.stepCos = step.cos;
    this.stepSinOverW = step.sinOverW;
    this.alpha = step.alpha;
    this.omegaSquared = this.options.stiffness;

    this.impulse = normalisedImpulse(this.options.stiffness, this.options.damping);
  }

  /** Current recoil, `0` at rest and `1` at the peak of a single shot. */
  get level(): number {
    return this.displacement;
  }

  /** `true` while the weapon is still moving. */
  get active(): boolean {
    return this.displacement !== 0 || this.velocity !== 0;
  }

  /** `true` when {@link fire} would be accepted right now. */
  get ready(): boolean {
    return this.cooldownLeft <= 0;
  }

  /** Seconds until the next shot is allowed. */
  get cooldownRemaining(): number {
    return this.cooldownLeft;
  }

  /** Shots fired since construction. Handy for driving ammo or audio. */
  get shots(): number {
    return this.shotCount;
  }

  /**
   * Fires one shot.
   *
   * @returns `false` when the cooldown has not elapsed, so a caller holding the
   * trigger down can simply call this every frame and get the weapon's own rate
   * of fire.
   */
  fire(): boolean {
    if (this.cooldownLeft > 0) return false;
    this.cooldownLeft = this.options.cooldown;
    this.velocity += this.impulse;
    this.shotCount++;
    return true;
  }

  /** Drops the weapon back to rest immediately — for teleports and respawns. */
  reset(): void {
    this.displacement = 0;
    this.velocity = 0;
    this.cooldownLeft = 0;
    this.carry = 0;
  }

  /** Advances the spring. Allocation-free. */
  update(dt: number): void {
    if (this.cooldownLeft > 0) this.cooldownLeft -= dt;

    if (this.displacement === 0 && this.velocity === 0) return;

    // Advanced in whole fixed steps, each one an *exact* solution of the spring
    // rather than an Euler step. This matters more than it looks: at this
    // stiffness, integrating numerically undershot the peak by 9% on the
    // default spring and 29% on a soft one, which would have made `kick` a
    // number that does not mean what it says.
    //
    // Anything past 100 ms of frame time is dropped rather than caught up on.
    // A recoil that keeps kicking through a stall is worse than one that
    // skipped it.
    let remaining = dt > 0.1 ? 0.1 : dt;
    while (remaining >= FIXED_STEP) {
      this.advance();
      remaining -= FIXED_STEP;
    }
    // The sub-step remainder is carried rather than integrated at the wrong
    // step size, so the propagator only ever runs at the size it was solved for.
    this.carry += remaining;
    while (this.carry >= FIXED_STEP) {
      this.advance();
      this.carry -= FIXED_STEP;
    }

    const o = this.options;
    this.displacement = clamp(this.displacement, -o.maxStack, o.maxStack);

    // Park it once the motion is below anything the eye could resolve, so an
    // idle creature is not stepping a spring forever. The threshold is in
    // recoil units, where 1 is a full shot — this is four ten-thousandths of a
    // kick.
    if (Math.abs(this.displacement) < 4e-4 && Math.abs(this.velocity) < 6e-3) {
      this.displacement = 0;
      this.velocity = 0;
      this.carry = 0;
    }
  }

  /** One exact fixed step of the spring. */
  private advance(): void {
    const x = this.displacement;
    const v = this.velocity;
    const c = this.stepCos;
    const s = this.stepSinOverW;
    const e = this.stepDecay;

    this.displacement = e * (x * c + (v + this.alpha * x) * s);
    this.velocity = e * (v * c - (this.omegaSquared * x + this.alpha * v) * s);
  }

  /** Muzzle rise for the current frame, radians. Negative is up. */
  pitchOffset(): number {
    return -this.options.kick * this.displacement;
  }

  /** Rearward push for the current frame, as a fraction of authored height. */
  pushOffset(): number {
    return this.options.push * this.displacement;
  }

  /** Roll for the current frame, radians. */
  twistOffset(): number {
    return this.options.twist * this.displacement;
  }
}

const FIXED_STEP = 1 / 240;

/** How close to `ζ = 1` counts as critical damping. */
const CRITICAL_EPSILON = 1e-6;

/** Precomputed exact one-step propagator. */
interface StepSolution {
  /** `e^(-ζω h)`. */
  decay: number;
  /** `cos(ωd h)`, or `cosh(ωh h)` when over-damped, or `1` when critical. */
  cos: number;
  /** `sin(ωd h) / ωd`, and its hyperbolic or linear limit. */
  sinOverW: number;
  /** `ζω`. */
  alpha: number;
}

/**
 * Solves one fixed step of `x'' + 2ζω x' + ω² x = 0` exactly.
 *
 * All three damping regimes collapse to the same two lines once the oscillating
 * term is written as `(cos, sin/W)`: under-damped gives the circular pair,
 * over-damped the hyperbolic pair, and critical damping is the limit `W → 0`
 * where `cos → 1` and `sin/W → h`. Writing it this way means the step function
 * has no branches in it, only the constants do.
 */
function solveStep(stiffness: number, damping: number, h: number): StepSolution {
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  const alpha = zeta * omega;
  const decay = Math.exp(-alpha * h);

  if (Math.abs(zeta - 1) < CRITICAL_EPSILON) {
    return { decay, cos: 1, sinOverW: h, alpha };
  }

  if (zeta < 1) {
    const w = omega * Math.sqrt(1 - zeta * zeta);
    return { decay, cos: Math.cos(w * h), sinOverW: Math.sin(w * h) / w, alpha };
  }

  const w = omega * Math.sqrt(zeta * zeta - 1);
  return { decay, cos: Math.cosh(w * h), sinOverW: Math.sinh(w * h) / w, alpha };
}

/**
 * The impulse that makes a single shot peak at exactly `1`.
 *
 * Solved rather than tuned. From rest, `x(t) = (v/W) e^(-αt) sin(Wt)`, whose
 * peak is at `tan(Wt) = W/α` — so the peak is a fixed multiple of the impulse
 * and the multiple can simply be divided out. The over-damped case is the same
 * identity with `tanh`, and the critical case peaks at `t = 1/ω`.
 *
 * The point of doing this at all: `kick`, `push` and `twist` are then stated as
 * plain peak amounts rather than as spring units nobody can picture, and they
 * keep meaning that when the spring is retuned.
 */
function normalisedImpulse(stiffness: number, damping: number): number {
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  const alpha = zeta * omega;

  let peak: number;
  if (Math.abs(zeta - 1) < CRITICAL_EPSILON) {
    peak = (1 / omega) * Math.exp(-1);
  } else if (zeta < 1) {
    const w = omega * Math.sqrt(1 - zeta * zeta);
    const t = Math.atan2(w, alpha) / w;
    peak = (Math.exp(-alpha * t) * Math.sin(w * t)) / w;
  } else {
    const w = omega * Math.sqrt(zeta * zeta - 1);
    const t = Math.atanh(w / alpha) / w;
    peak = (Math.exp(-alpha * t) * Math.sinh(w * t)) / w;
  }

  return peak > 0 ? 1 / peak : 1;
}

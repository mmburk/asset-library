import { clamp01, lerp, smoothstep } from '../../core/math';
import type { DeathStyle, PosableRig } from '../types';

/** Tuning for {@link DeathOverlay}. */
export interface DeathOptions {
  style: DeathStyle;
  /** Seconds from trigger to fully dead. */
  duration: number;
  /** `-1` topples toward the creature's right, `+1` toward its left. */
  fallDirection: number;
  /** How far the root sinks, as a fraction of the rig's own scale. */
  sinkDepth: number;
  /** How far joints drift from the rest pose as they go limp, in radians. */
  limpAmount: number;
  /** Puddle spread for the `melt` style. */
  meltSpread: number;
  /** Remaining height for the `melt` style. */
  meltFlatten: number;
}

export const DEFAULT_DEATH_OPTIONS: DeathOptions = {
  style: 'collapse',
  duration: 0.9,
  fallDirection: 1,
  sinkDepth: 0.12,
  limpAmount: 0.35,
  meltSpread: 1.75,
  meltFlatten: 0.12,
};

/**
 * Death animation applied on top of whatever the locomotion animator produced.
 *
 * Works against {@link PosableRig}, which both `CreatureRig` and the humanoid
 * module's `HumanoidRig` satisfy structurally — so one implementation covers
 * every rig family without either of them inheriting from the other.
 *
 * The limp pose is precomputed once into a `Float32Array`, and `apply()` only
 * ever interpolates between existing numbers, so dying costs no allocations
 * either.
 */
export class DeathOverlay {
  private readonly rig: PosableRig;
  private readonly options: DeathOptions;

  /** Target rotations the joints relax into, three floats per joint. */
  private readonly limpRotations: Float32Array;

  // Rest transform of the rig root, so `revive()` can put it back exactly.
  private readonly restRootRotationX: number;
  private readonly restRootRotationZ: number;
  private readonly restRootPositionY: number;
  private readonly restRootScaleX: number;
  private readonly restRootScaleY: number;
  private readonly restRootScaleZ: number;

  private elapsed = 0;
  private dying = false;

  constructor(rig: PosableRig, options?: Partial<DeathOptions>) {
    this.rig = rig;
    this.options = { ...DEFAULT_DEATH_OPTIONS, ...options };

    const root = rig.root;
    this.restRootRotationX = root.rotation.x;
    this.restRootRotationZ = root.rotation.z;
    this.restRootPositionY = root.position.y;
    this.restRootScaleX = root.scale.x;
    this.restRootScaleY = root.scale.y;
    this.restRootScaleZ = root.scale.z;

    // Deterministic per-joint drift. A hashed sine rather than a random draw so
    // two creatures sharing a seed still die identically, which matters for
    // replays and networked play.
    const count = rig.joints.length;
    this.limpRotations = new Float32Array(count * 3);
    const amount = this.options.limpAmount;
    for (let i = 0; i < count; i++) {
      const o = i * 3;
      this.limpRotations[o] = (rig.restRotations[o] as number) + hashedOffset(i, 0) * amount;
      this.limpRotations[o + 1] =
        (rig.restRotations[o + 1] as number) + hashedOffset(i, 1) * amount * 0.4;
      this.limpRotations[o + 2] =
        (rig.restRotations[o + 2] as number) + hashedOffset(i, 2) * amount;
    }
  }

  /** `true` once {@link trigger} has been called. */
  get active(): boolean {
    return this.dying;
  }

  /** Raw progress through the animation, `0`–`1`. */
  get progress(): number {
    return this.options.duration <= 0 ? 1 : clamp01(this.elapsed / this.options.duration);
  }

  /** `true` once the death animation has fully played out. */
  get finished(): boolean {
    return this.dying && this.progress >= 1;
  }

  /** Starts dying. Ignored if already triggered. */
  trigger(): void {
    if (this.dying) return;
    this.dying = true;
    this.elapsed = 0;
  }

  /** Cancels death and restores the root transform. */
  revive(): void {
    if (!this.dying) return;
    this.dying = false;
    this.elapsed = 0;
    const root = this.rig.root;
    root.rotation.x = this.restRootRotationX;
    root.rotation.z = this.restRootRotationZ;
    root.position.y = this.restRootPositionY;
    root.scale.set(this.restRootScaleX, this.restRootScaleY, this.restRootScaleZ);
  }

  /**
   * Advances the timer.
   * @returns the eased blend weight, `0` when alive and `1` when fully dead.
   */
  advance(dt: number): number {
    if (!this.dying) return 0;
    this.elapsed += dt;
    return smoothstep(0, 1, this.progress);
  }

  /**
   * Blends the rig toward the death pose.
   *
   * Called after the locomotion animator has written its absolute pose, so
   * `blend` interpolates from a live walk cycle into the collapse rather than
   * snapping.
   */
  apply(blend: number): void {
    if (blend <= 0) return;
    const joints = this.rig.joints;
    const limp = this.limpRotations;

    for (let i = 0; i < joints.length; i++) {
      const joint = joints[i];
      if (joint === undefined) continue;
      const o = i * 3;
      const rotation = joint.rotation;
      rotation.set(
        lerp(rotation.x, limp[o] as number, blend),
        lerp(rotation.y, limp[o + 1] as number, blend),
        lerp(rotation.z, limp[o + 2] as number, blend),
      );
    }

    const root = this.rig.root;

    switch (this.options.style) {
      case 'collapse':
        // Topple sideways and settle into the ground.
        root.rotation.z = lerp(
          this.restRootRotationZ,
          this.restRootRotationZ + this.options.fallDirection * Math.PI * 0.5,
          blend,
        );
        root.rotation.x = lerp(this.restRootRotationX, this.restRootRotationX + 0.12, blend);
        root.position.y = lerp(
          this.restRootPositionY,
          this.restRootPositionY - this.options.sinkDepth,
          blend,
        );
        break;

      case 'melt':
        // Spread outward and flatten into a puddle.
        root.scale.set(
          lerp(this.restRootScaleX, this.restRootScaleX * this.options.meltSpread, blend),
          lerp(this.restRootScaleY, this.restRootScaleY * this.options.meltFlatten, blend),
          lerp(this.restRootScaleZ, this.restRootScaleZ * this.options.meltSpread, blend),
        );
        root.position.y = lerp(this.restRootPositionY, this.restRootPositionY, blend);
        break;

      case 'deflate':
        root.scale.set(
          lerp(this.restRootScaleX, this.restRootScaleX * 0.06, blend),
          lerp(this.restRootScaleY, this.restRootScaleY * 0.06, blend),
          lerp(this.restRootScaleZ, this.restRootScaleZ * 0.06, blend),
        );
        break;
    }
  }
}

/** Stable pseudo-random value in `[-1, 1]` from a joint index and axis. */
function hashedOffset(index: number, axis: number): number {
  const x = Math.sin((index + 1) * 12.9898 + axis * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

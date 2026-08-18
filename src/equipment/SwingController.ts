import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { lerp, smoothstep } from '../core/math';
import type { CreatureRig } from '../creatures/CreatureRig';
import type { Handedness } from './types';

/** Which cut is being played. */
export type SwingStyle = 'slash' | 'reverse' | 'overhead' | 'thrust';

/** Where a swing is in its cycle. */
export type SwingPhase = 'idle' | 'windup' | 'strike' | 'recover';

/** Tuning for {@link SwingController}. */
export interface SwingOptions {
  /** Seconds spent drawing the weapon back. */
  windup: number;
  /** Seconds spent cutting. The blade only does damage during this window. */
  strike: number;
  /** Seconds spent returning to the carry pose. */
  recover: number;
  /**
   * Minimum seconds between swings. A swing may be started during another's
   * recovery — that is what chains a combo — but never faster than this.
   */
  cooldown: number;
  /**
   * `true` alternates {@link SwingStyle} on every swing that does not name one,
   * so holding the attack button produces a back-and-forth combo rather than
   * the same cut over and over.
   */
  chain: boolean;
  /** How much of the swing the free arm mirrors, `0`–`1`. */
  offArmFollow: number;
  /** How far the torso turns into the cut, radians. */
  bodyTwist: number;
  /** How far the hips follow the torso, as a fraction of {@link bodyTwist}. */
  hipFollow: number;
  /**
   * Overall size of a conjured hand's travel, as a fraction of authored height.
   *
   * Worth more than it looks on a handless creature: a ghost hand *is* the arm,
   * so this is the only thing that carries the weapon across the body. Wound
   * down to nothing, a cut becomes a wrist flick at a hand floating in place.
   */
  handTravel: number;
}

export const DEFAULT_SWING: Readonly<SwingOptions> = Object.freeze({
  // A cut is not a symmetric animation. The wind-up is the slowest part, the
  // cut itself is over before the eye can track it, and the recovery is longer
  // than both — that ratio is most of what makes a swing read as heavy rather
  // than as a wave.
  windup: 0.16,
  strike: 0.09,
  recover: 0.26,
  cooldown: 0.14,
  chain: true,
  offArmFollow: 0.62,
  bodyTwist: 0.34,
  hipFollow: 0.45,
  handTravel: 1,
});

/**
 * One end of a cut, as everything that has to be posed to reach it.
 *
 * Lateral values are stated *toward the lead hand's side* rather than toward
 * `+X`, so one table drives a right-handed and a left-handed creature. The sign
 * is applied once, when the pose is read.
 */
interface SwingKey {
  /** Weapon: pitch (down is positive), lateral yaw, roll. */
  readonly weapon: readonly [number, number, number];
  /** Lead arm: shoulder pitch, shoulder lateral, elbow bend. */
  readonly arm: readonly [number, number, number];
  /** Conjured hand: lateral, up, forward — fractions of the authored height. */
  readonly hand: readonly [number, number, number];
}

interface SwingShape {
  readonly windup: SwingKey;
  readonly strike: SwingKey;
}

/**
 * The cuts.
 *
 * Four, because four is what it takes to cover the directions a sword can
 * travel: down across, up across, straight down, and straight ahead. Everything
 * else a game needs is one of these mirrored or replayed.
 */
const SWING_SHAPES: Readonly<Record<SwingStyle, SwingShape>> = Object.freeze({
  // Kesa-giri: over the lead shoulder, down across the body.
  slash: {
    windup: { weapon: [-1.25, 0.72, 0.85], arm: [-1.95, 0.55, 1.15], hand: [0.14, 0.26, -0.1] },
    // The pitch stops short of where a full kesa would finish. On a creature
    // whose hands hang at a third of its height — most of them — the last tenth
    // of a radian is what puts the tip through the floor.
    strike: { weapon: [0.76, -0.78, -0.95], arm: [0.5, -0.62, 0.3], hand: [-0.34, -0.06, 0.26] },
  },
  // The same cut travelling the other way, which is what a chained second swing
  // has to be: recovering to the start of another kesa costs more time than the
  // cut itself.
  reverse: {
    windup: { weapon: [0.9, -0.7, -0.8], arm: [0.6, -0.55, 0.75], hand: [-0.26, -0.12, 0.04] },
    strike: { weapon: [-0.8, 0.8, 0.95], arm: [-1.5, 0.6, 0.4], hand: [0.3, 0.22, 0.22] },
  },
  // Shomen: straight down the centre line.
  overhead: {
    windup: { weapon: [-1.5, 0.16, 0.12], arm: [-2.25, 0.16, 1.4], hand: [0.02, 0.32, -0.08] },
    strike: { weapon: [1.1, -0.1, -0.06], arm: [0.85, 0.04, 0.14], hand: [0, -0.1, 0.3] },
  },
  // Tsuki: no arc at all, just reach. The hand carries this one, not the wrist.
  thrust: {
    windup: { weapon: [-0.2, 0.3, 0.18], arm: [-0.55, 0.32, 1.55], hand: [0.08, 0.08, -0.16] },
    strike: { weapon: [0.02, -0.04, 0], arm: [-1.15, 0.08, 0.12], hand: [-0.04, 0.04, 0.44] },
  },
});

/** Rest end of every blend: the carry pose the animator is already producing. */
const REST_KEY: SwingKey = { weapon: [0, 0, 0], arm: [0, 0, 0], hand: [0, 0, 0] };

/** Index layout of the pose arrays. */
const W_PITCH = 0;
const W_LATERAL = 1;
const W_ROLL = 2;
const A_PITCH = 3;
const A_LATERAL = 4;
const A_ELBOW = 5;
const H_LATERAL = 6;
const H_UP = 7;
const H_FORWARD = 8;

/** One resolved arm, with the rest values the pose blends out of. */
interface ArmChain {
  readonly side: Handedness;
  readonly upper: Object3D;
  readonly lower: Object3D | null;
  readonly restY: number;
  readonly restZ: number;
}

const scratchSwing = new Quaternion();
const scratchParent = new Quaternion();
const scratchWorld = new Quaternion();
const scratchTarget = new Quaternion();
const scratchEuler = new Euler(0, 0, 0, 'YXZ');
const scratchOffset = new Vector3();

/**
 * Swinging a melee weapon: the timing, and the pose that goes with it.
 *
 * Split from {@link BladeSweep} on purpose. This class knows how a cut *looks*
 * and how long each part of it lasts; the sweep knows what the edge passes
 * through. They meet at one boolean — {@link striking} — which is the window in
 * which a blade is allowed to do damage. Keeping them apart is what lets a game
 * drive its own hit detection off this controller, or drive this pose from its
 * own state machine, without taking the other half.
 *
 * The pose is applied the same way {@link AimController}'s is, and for the same
 * reason: the locomotion animators write arm rotation absolutely every frame, so
 * anything written before them is simply erased. Both must run *after* the
 * animator, and this one runs after the aim — a creature that swings stops
 * aiming for as long as the cut lasts.
 *
 * ```ts
 * const swing = new SwingController(rig);
 * swing.swing();            // on the attack button
 * // per frame, after the animator:
 * swing.update(dt);
 * swing.poseArms('right');
 * swing.orient(weaponMount);
 * ```
 */
export class SwingController {
  private readonly rig: CreatureRig;
  private readonly options: SwingOptions;

  /**
   * Arm chains, resolved once.
   *
   * Looked up in the constructor rather than per frame because the lookup key
   * is built from a side suffix, and doing that in `update` would allocate a
   * string every frame for every creature holding a sword.
   */
  private readonly arms: readonly ArmChain[];

  private readonly chest: Object3D | null;
  private readonly hips: Object3D | null;
  private readonly restChestY: number;
  private readonly restHipsY: number;

  /** Where this swing's current segment started. Nine values, see the indices. */
  private readonly from = new Float32Array(9);
  /** This frame's pose. */
  private readonly cur = new Float32Array(9);

  private phaseValue: SwingPhase = 'idle';
  private styleValue: SwingStyle = 'slash';
  private elapsed = 0;
  private weightValue = 0;
  private cooldownLeft = 0;
  private swingCount = 0;
  private flip = false;

  constructor(rig: CreatureRig, options: Partial<SwingOptions> = {}) {
    this.rig = rig;
    this.options = { ...DEFAULT_SWING, ...options };

    const arms: ArmChain[] = [];
    for (let i = 0; i < 2; i++) {
      const side: Handedness = i === 0 ? 'left' : 'right';
      const suffix = i === 0 ? 'L' : 'R';
      // `upperArm` is the humanoid layout; `arm` covers rigs whose limb is a
      // single bone, like the cactus.
      const upper = rig.findBone(`upperArm${suffix}`) ?? rig.findBone(`arm${suffix}`);
      if (upper === undefined) continue;
      arms.push({
        side,
        upper,
        lower: rig.findBone(`lowerArm${suffix}`) ?? null,
        // The rest pose is the other end of the blend for both axes the
        // animators never write. Blending those from the previous frame instead
        // would ratchet: nothing resets them, so the arm would walk into the
        // pose and stay there.
        restY: upper.rotation.y,
        restZ: upper.rotation.z,
      });
    }
    this.arms = arms;

    this.chest = rig.findBone('chest') ?? rig.findBone('spine') ?? null;
    this.hips = rig.findBone('hips') ?? null;
    this.restChestY = this.chest === null ? 0 : this.chest.rotation.y;
    this.restHipsY = this.hips === null ? 0 : this.hips.rotation.y;
  }

  /** What the swing is doing right now. */
  get phase(): SwingPhase {
    return this.phaseValue;
  }

  /** The cut being played. */
  get style(): SwingStyle {
    return this.styleValue;
  }

  /** `true` between the first frame of the wind-up and the last of the recovery. */
  get active(): boolean {
    return this.phaseValue !== 'idle';
  }

  /**
   * `true` only while the edge is travelling.
   *
   * This is the damage window, and it is deliberately short: a blade that can
   * hit for the whole animation hits things it visibly passed nowhere near.
   */
  get striking(): boolean {
    return this.phaseValue === 'strike';
  }

  /** How far into the whole swing, `0`–`1`. `0` when idle. */
  get progress(): number {
    const o = this.options;
    const total = o.windup + o.strike + o.recover;
    if (total <= 0 || this.phaseValue === 'idle') return 0;
    const done =
      this.phaseValue === 'windup'
        ? 0
        : this.phaseValue === 'strike'
          ? o.windup
          : o.windup + o.strike;
    return Math.min(1, (done + this.elapsed) / total);
  }

  /** How far the pose is blended over the animator's output, `0`–`1`. */
  get weight(): number {
    return this.weightValue;
  }

  /** Swings started since construction. Also the current swing's id. */
  get swings(): number {
    return this.swingCount;
  }

  /** `true` when {@link swing} would be accepted right now. */
  get ready(): boolean {
    return (
      this.cooldownLeft <= 0 && this.phaseValue !== 'windup' && this.phaseValue !== 'strike'
    );
  }

  /**
   * Starts a cut.
   *
   * A swing may be started while a previous one is recovering, which is what
   * chains a combo — the new cut blends out of wherever the last one left the
   * weapon rather than snapping back to the carry pose first. It may *not*
   * interrupt a wind-up or a strike: a cut that can be cancelled halfway
   * through can hit twice on one button press.
   *
   * @param style Omit to let {@link SwingOptions.chain} pick, which alternates.
   * @returns `false` when the swing was refused.
   */
  swing(style?: SwingStyle): boolean {
    if (!this.ready) return false;

    if (style !== undefined) {
      this.styleValue = style;
    } else if (this.options.chain) {
      this.flip = !this.flip;
      this.styleValue = this.flip ? 'slash' : 'reverse';
    } else {
      this.styleValue = 'slash';
    }

    this.beginPhase('windup');
    this.cooldownLeft = this.options.cooldown;
    this.swingCount++;
    return true;
  }

  /** Drops the weapon back to the carry pose immediately. */
  reset(): void {
    this.phaseValue = 'idle';
    this.elapsed = 0;
    this.weightValue = 0;
    this.cooldownLeft = 0;
    this.cur.fill(0);
    this.from.fill(0);
    this.settle();
  }

  /** Advances the swing and composes this frame's pose. Allocation-free. */
  update(dt: number): void {
    if (this.cooldownLeft > 0) this.cooldownLeft -= dt;
    if (this.phaseValue === 'idle') return;

    this.elapsed += dt;

    // Phases are advanced in a loop rather than one per frame: at 30 fps a
    // 0.09-second strike can start and finish inside a single frame, and a
    // controller that could only move one phase per update would stretch every
    // swing to the frame rate.
    let guard = 4;
    while (guard-- > 0) {
      const duration = this.phaseDuration();
      if (this.elapsed < duration || duration <= 0) break;
      this.elapsed -= duration;
      if (this.phaseValue === 'windup') this.beginPhase('strike');
      else if (this.phaseValue === 'strike') this.beginPhase('recover');
      else {
        this.phaseValue = 'idle';
        this.elapsed = 0;
        this.weightValue = 0;
        this.cur.fill(0);
        this.settle();
        return;
      }
    }

    const duration = this.phaseDuration();
    const t = duration > 0 ? Math.min(1, this.elapsed / duration) : 1;
    const shape = SWING_SHAPES[this.styleValue] as SwingShape;

    let target: SwingKey;
    let eased: number;
    if (this.phaseValue === 'windup') {
      target = shape.windup;
      // Ease out: the weapon leaves fast and settles into the raised pose, so
      // the wind-up reads as a preparation rather than as a slow lift.
      eased = t * (2 - t);
      this.weightValue = smoothstep(0, 1, t);
    } else if (this.phaseValue === 'strike') {
      target = shape.strike;
      eased = smoothstep(0, 1, t);
      this.weightValue = 1;
    } else {
      target = REST_KEY;
      eased = smoothstep(0, 1, t);
      this.weightValue = 1 - eased;
    }

    this.blend(target, eased);
  }

  /**
   * Turns `node` into the swing, blended over whatever pose it is already in.
   *
   * Slerped from the node's current orientation rather than from identity, so a
   * creature that swings while aiming leaves the aim pose smoothly instead of
   * snapping to centre on the first frame of the wind-up.
   */
  orient(node: Object3D, handedness: Handedness = 'right'): void {
    if (this.weightValue <= 0) return;
    const parent = node.parent;
    if (parent === null) return;

    const lead = handedness === 'left' ? 1 : -1;
    scratchEuler.set(
      this.cur[W_PITCH] as number,
      (this.cur[W_LATERAL] as number) * lead,
      (this.cur[W_ROLL] as number) * lead,
      'YXZ',
    );
    scratchSwing.setFromEuler(scratchEuler);

    // Composed in the creature's own space and taken back into the parent's,
    // which is what makes the cut immune to whatever the animator is doing to
    // the bone the weapon hangs from.
    this.rig.root.getWorldQuaternion(scratchWorld);
    scratchWorld.multiply(scratchSwing);
    parent.getWorldQuaternion(scratchParent);
    scratchTarget.copy(scratchParent.invert()).multiply(scratchWorld);

    node.quaternion.slerp(scratchTarget, this.weightValue);
  }

  /**
   * Carries a conjured hand along the cut.
   *
   * Only meaningful for creatures that have no arms to pose — a ghost hand *is*
   * the arm, so the swing has to be in its travel or the weapon pivots on a
   * hand hanging motionless in the air.
   *
   * @param side `+1` for the hand on the creature's `+X` side.
   */
  placeHand(node: Object3D, side: number): void {
    if (this.weightValue <= 0) return;
    const parent = node.parent;
    if (parent === null) return;

    const unit = this.rig.nominalHeight * this.options.handTravel;
    // `side` already carries which way this hand is: a lateral value stated
    // toward the lead hand is toward that hand's own outboard direction.
    scratchOffset.set(
      (this.cur[H_LATERAL] as number) * unit * side,
      (this.cur[H_UP] as number) * unit,
      (this.cur[H_FORWARD] as number) * unit,
    );

    this.rig.root.getWorldQuaternion(scratchWorld);
    scratchOffset.applyQuaternion(scratchWorld);
    parent.getWorldQuaternion(scratchParent);
    scratchOffset.applyQuaternion(scratchParent.invert());

    node.position.lerp(scratchOffset, this.weightValue);
  }

  /**
   * Poses real arms and the torso, over whatever the animator just wrote.
   *
   * `x` is blended out of the animator's own output, which is rewritten every
   * frame. `y` and `z` are blended out of the captured rest pose instead,
   * because nothing rewrites those — blending them from the previous frame
   * leaves the arm stuck in the pose after the swing ends.
   *
   * The free arm follows at {@link SwingOptions.offArmFollow}, mirrored. That is
   * not decoration: a creature holding a second blade in that hand swings it,
   * and a creature holding nothing still reads as a body committing to a cut
   * rather than an arm moving on its own.
   */
  poseArms(handedness: Handedness = 'right'): void {
    const w = this.weightValue;
    if (w <= 0) return;

    const lead = handedness === 'left' ? 1 : -1;
    const pitch = this.cur[A_PITCH] as number;
    const lateral = this.cur[A_LATERAL] as number;
    const elbow = this.cur[A_ELBOW] as number;

    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i] as ArmChain;
      const isLead = arm.side === handedness;
      const follow = isLead ? 1 : this.options.offArmFollow;
      // The off arm mirrors: its outboard is the other way round.
      const sign = isLead ? lead : -lead;

      arm.upper.rotation.x = lerp(arm.upper.rotation.x, pitch * follow, w);
      arm.upper.rotation.y = lerp(arm.upper.rotation.y, arm.restY, w);
      arm.upper.rotation.z = lerp(arm.restZ, arm.restZ + lateral * sign * follow, w);

      if (arm.lower === null) continue;
      arm.lower.rotation.x = lerp(arm.lower.rotation.x, -elbow * follow, w);
    }

    // The torso turns into the cut. Written from rest rather than from the
    // animator's twist so it lands back exactly where it started, and applied
    // to the hips at a fraction so the feet do not swivel with it.
    const twist = -lateral * lead * this.options.bodyTwist;
    if (this.chest !== null) {
      this.chest.rotation.y = lerp(this.restChestY, this.restChestY + twist, w);
    }
    if (this.hips !== null) {
      this.hips.rotation.y = lerp(
        this.restHipsY,
        this.restHipsY + twist * this.options.hipFollow,
        w,
      );
    }
  }

  /**
   * Puts back everything the pose wrote that nothing else will.
   *
   * The blend lands within a thousandth of rest on its own, but "within a
   * thousandth" is a residual that survives until the creature is disposed and
   * grows by one more residual on every swing. Writing the captured rest values
   * once, on the frame the swing ends, makes the return exact.
   */
  private settle(): void {
    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i] as ArmChain;
      arm.upper.rotation.y = arm.restY;
      arm.upper.rotation.z = arm.restZ;
    }
    if (this.chest !== null) this.chest.rotation.y = this.restChestY;
    if (this.hips !== null) this.hips.rotation.y = this.restHipsY;
  }

  /** Length of the phase currently playing. */
  private phaseDuration(): number {
    const o = this.options;
    return this.phaseValue === 'windup'
      ? o.windup
      : this.phaseValue === 'strike'
        ? o.strike
        : o.recover;
  }

  /**
   * Enters a phase, freezing the current pose as the blend's starting point.
   *
   * Every phase interpolates from wherever the last one left off rather than
   * from a fixed key, which is what lets a chained swing start out of a
   * half-recovered pose without a jump.
   */
  private beginPhase(phase: SwingPhase): void {
    this.phaseValue = phase;
    if (phase === 'windup') this.elapsed = 0;
    this.from.set(this.cur);
  }

  /** Interpolates the whole pose from the segment's start toward `target`. */
  private blend(target: SwingKey, t: number): void {
    const c = this.cur;
    const f = this.from;
    c[W_PITCH] = lerp(f[W_PITCH] as number, target.weapon[0], t);
    c[W_LATERAL] = lerp(f[W_LATERAL] as number, target.weapon[1], t);
    c[W_ROLL] = lerp(f[W_ROLL] as number, target.weapon[2], t);
    c[A_PITCH] = lerp(f[A_PITCH] as number, target.arm[0], t);
    c[A_LATERAL] = lerp(f[A_LATERAL] as number, target.arm[1], t);
    c[A_ELBOW] = lerp(f[A_ELBOW] as number, target.arm[2], t);
    c[H_LATERAL] = lerp(f[H_LATERAL] as number, target.hand[0], t);
    c[H_UP] = lerp(f[H_UP] as number, target.hand[1], t);
    c[H_FORWARD] = lerp(f[H_FORWARD] as number, target.hand[2], t);
  }
}

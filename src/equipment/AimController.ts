import { Euler, Object3D, Quaternion, Vector3 } from 'three';
import { clamp, damp, lerp } from '../core/math';
import type { CreatureRig } from '../creatures/CreatureRig';
import type { RecoilController } from './RecoilController';
import type { Handedness } from './types';

/** One resolved arm, with the rest values the aim pose blends out of. */
interface ArmChain {
  readonly side: Handedness;
  readonly upper: Object3D;
  readonly lower: Object3D | null;
  readonly restY: number;
  readonly restZ: number;
}

/** Tuning for {@link AimController}. */
export interface AimOptions {
  /** Raise/lower responsiveness. Higher snaps up faster. */
  blendLambda: number;
  /** How far a conjured hand rises, as a fraction of the authored height. */
  rise: number;
  /** How far it draws in toward the centre line. */
  inward: number;
  /** How far it pushes forward. */
  forward: number;
  /** Pitch limits, radians. Negative is up. */
  minPitch: number;
  maxPitch: number;
  /** Yaw limit either side, radians. */
  maxYaw: number;
  /** Breathing sway while a pose is held, radians. `0` disables it. */
  sway: number;
  /** Sway rate, cycles per second. */
  swayRate: number;
  /** How far a real upper arm swings up to present the weapon, radians. */
  armRaise: number;
  /** How far the off arm crosses the body, radians. */
  armAcross: number;
  /** Elbow bend at full aim, radians. */
  elbowBend: number;
  /** Idle float left in a conjured hand at full aim, `0`–`1`. */
  aimedBob: number;
}

export const DEFAULT_AIM: Readonly<AimOptions> = Object.freeze({
  blendLambda: 12,
  rise: 0.12,
  inward: 0.1,
  forward: 0.08,
  // Up is negative. A creature can look further up than down, as everything it
  // is likely to shoot at is either level with it or in the air.
  minPitch: -1.0,
  maxPitch: 0.6,
  maxYaw: 1.1,
  sway: 0.012,
  swayRate: 0.55,
  armRaise: 1.3,
  armAcross: 0.42,
  elbowBend: 0.55,
  aimedBob: 0.3,
});

const scratchAim = new Quaternion();
const scratchParent = new Quaternion();
const scratchWorld = new Quaternion();
const scratchOffset = new Vector3();
const scratchPoint = new Vector3();
const scratchEuler = new Euler(0, 0, 0, 'YXZ');
const scratchRecoil = new Quaternion();
const scratchRecoilEuler = new Euler(0, 0, 0, 'XYZ');
const IDENTITY = new Quaternion();

/**
 * Raise-to-aim pose, shared by both ways of holding something.
 *
 * The controller owns only the *state* — where the creature is aiming and how
 * far into the pose it is. {@link EquipmentHolder} decides what that state is
 * applied to, because the two hand paths need different things done to them:
 *
 * - Conjured hands are free-floating, so they are simply moved: up, inward and
 *   forward into a braced position, and turned to face the aim direction.
 * - Real arms have to be posed at the shoulder and elbow, and then the weapon
 *   itself has to be turned back. This is the part that is easy to get wrong —
 *   a weapon parented to a hand inherits the whole arm chain, so raising the
 *   arm by 75° pitches the barrel 75° at the sky. The weapon hangs off its own
 *   mount for exactly this reason, and {@link orient} drives that mount in
 *   creature space rather than bone space.
 *
 * Aim is always expressed relative to the creature's own facing, so a creature
 * that turns keeps aiming where it was told to.
 */
export class AimController {
  private readonly rig: CreatureRig;
  private readonly options: AimOptions;

  /**
   * Arm chains, resolved once.
   *
   * Looked up in the constructor rather than per frame because the lookup key
   * is built from a side suffix — doing that in `update` would allocate a
   * string every frame, for every armed creature in the scene.
   */
  private readonly arms: readonly ArmChain[];

  /**
   * Read-only recoil source, composed into the pose.
   *
   * Recoil is applied in each posed node's *own* space, after the aim, which is
   * what lets a creature kick correctly while firing from the hip: the aim part
   * is scaled by the aim weight and vanishes at rest, the recoil part is not.
   */
  private readonly recoil: RecoilController | null;

  private wanted = false;
  private weightValue = 0;
  private yawValue = 0;
  private pitchValue = 0;
  private clock = 0;

  constructor(
    rig: CreatureRig,
    options: Partial<AimOptions> = {},
    recoil: RecoilController | null = null,
  ) {
    this.rig = rig;
    this.options = { ...DEFAULT_AIM, ...options };
    this.recoil = recoil;

    const arms: ArmChain[] = [];
    for (let i = 0; i < 2; i++) {
      const side: Handedness = i === 0 ? 'left' : 'right';
      const suffix = i === 0 ? 'L' : 'R';
      // `upperArm` is the humanoid layout; `arm` covers rigs whose limb is a
      // single bone, like the cactus.
      const upper = rig.findBone(`upperArm${suffix}`) ?? rig.findBone(`arm${suffix}`);
      if (upper === undefined) continue;
      const lower = rig.findBone(`lowerArm${suffix}`);

      arms.push({
        side,
        upper,
        lower: lower ?? null,
        // The rest pose is the blend's other end. Blending from the *current*
        // value instead would ratchet: nothing resets `y` and `z` between
        // frames, so even a weight of 0.05 would walk the arm all the way into
        // the pose over a second or two.
        restY: upper.rotation.y,
        restZ: upper.rotation.z,
      });
    }
    this.arms = arms;
  }

  /** How far into the aim pose, `0` (carried) to `1` (presented). */
  get weight(): number {
    return this.weightValue;
  }

  /** `true` while the pose is being held or raised. */
  get aiming(): boolean {
    return this.wanted;
  }

  /** Current yaw, radians, relative to the creature's facing. */
  get yaw(): number {
    return this.yawValue;
  }

  /** Current pitch, radians. Negative is up. */
  get pitch(): number {
    return this.pitchValue;
  }

  /** Raises or lowers the weapon. The blend is what makes it an animation. */
  setAiming(on: boolean): void {
    this.wanted = on;
  }

  /** Points the weapon, relative to the creature's facing. Clamped to the limits. */
  setAim(yaw: number, pitch: number): void {
    this.yawValue = clamp(yaw, -this.options.maxYaw, this.options.maxYaw);
    this.pitchValue = clamp(pitch, this.options.minPitch, this.options.maxPitch);
  }

  /**
   * Points the weapon at a world-space position.
   *
   * Convenience over {@link setAim}: the point is taken into the creature's own
   * space first, so a creature that is facing away ends up with a yaw outside
   * its limits and visibly refuses to aim behind itself, rather than snapping
   * its arms through its body.
   */
  aimAt(x: number, y: number, z: number): void {
    const root = this.rig.root;
    root.updateMatrixWorld(true);
    scratchPoint.set(x, y, z);
    root.worldToLocal(scratchPoint);

    const flat = Math.sqrt(scratchPoint.x * scratchPoint.x + scratchPoint.z * scratchPoint.z);
    // Straight up or straight down has no yaw to speak of; keep the last one.
    const yaw = flat > 1e-4 ? Math.atan2(scratchPoint.x, scratchPoint.z) : this.yawValue;
    this.setAim(yaw, -Math.atan2(scratchPoint.y, flat));
  }

  /** Advances the raise/lower blend and the breathing sway. Allocation-free. */
  update(dt: number): void {
    this.weightValue = damp(this.weightValue, this.wanted ? 1 : 0, this.options.blendLambda, dt);
    if (this.weightValue < 0.0005 && !this.wanted) this.weightValue = 0;
    this.clock += dt;
  }

  /** Idle float multiplier for a conjured hand at the current weight. */
  bobScale(): number {
    return lerp(1, this.options.aimedBob, this.weightValue);
  }

  /**
   * Turns `node` to face the aim direction, blended in by the current weight.
   *
   * The result is expressed in the node's parent space but *derived* from the
   * creature's, which is what makes the pose immune to whatever the animator is
   * doing to the bone the node hangs from: at full weight the weapon points
   * where it was told to, however much the body underneath it is swaying.
   */
  orient(node: Object3D): void {
    const kicking = this.recoil !== null && this.recoil.active;
    if (this.weightValue <= 0 && !kicking) {
      node.quaternion.identity();
      return;
    }

    const parent = node.parent;
    if (parent === null) return;

    if (this.weightValue > 0) {
      this.aimQuaternion(scratchAim);
      this.rig.root.getWorldQuaternion(scratchWorld);
      scratchWorld.multiply(scratchAim);

      parent.getWorldQuaternion(scratchParent);
      scratchParent.invert().multiply(scratchWorld);

      node.quaternion.copy(IDENTITY).slerp(scratchParent, this.weightValue);
    } else {
      node.quaternion.identity();
    }

    // Post-multiplied, so the kick happens about the weapon's own axes rather
    // than the creature's. A weapon aimed 60° off to one side then has to rise
    // along its own barrel, not along the body's forward.
    if (kicking) {
      const recoil = this.recoil as RecoilController;
      scratchRecoilEuler.set(recoil.pitchOffset(), 0, recoil.twistOffset());
      node.quaternion.multiply(scratchRecoil.setFromEuler(scratchRecoilEuler));
    }
  }

  /**
   * Moves a conjured hand from its socket into the braced position.
   *
   * @param side `+1` for the hand on the creature's `+X` side.
   */
  placeHand(node: Object3D, side: number): void {
    const kicking = this.recoil !== null && this.recoil.active;
    // The push is applied along the socket's own `-Z`, not the aim's, so a hand
    // still jerks back when the weapon is fired from the hip.
    const push =
      kicking ? (this.recoil as RecoilController).pushOffset() * this.rig.nominalHeight : 0;

    if (this.weightValue <= 0) {
      node.position.set(0, 0, -push);
      return;
    }

    const parent = node.parent;
    if (parent === null) return;

    const o = this.options;
    const unit = this.rig.nominalHeight;
    scratchOffset.set(-side * o.inward * unit, o.rise * unit, o.forward * unit);

    // Carried along by the aim, so aiming up lifts the hands rather than just
    // tilting them.
    this.aimQuaternion(scratchAim);
    scratchOffset.applyQuaternion(scratchAim);

    this.rig.root.getWorldQuaternion(scratchWorld);
    scratchOffset.applyQuaternion(scratchWorld);
    parent.getWorldQuaternion(scratchParent);
    scratchOffset.applyQuaternion(scratchParent.invert());

    node.position.set(
      scratchOffset.x * this.weightValue,
      scratchOffset.y * this.weightValue,
      scratchOffset.z * this.weightValue - push,
    );
  }

  /**
   * Poses real arms, blended over whatever the locomotion animator just wrote.
   *
   * Runs after the animator on purpose — the biped animator writes arm rotation
   * absolutely every frame, so an aim pose applied before it would simply be
   * erased.
   */
  poseArms(handedness: Handedness): void {
    if (this.weightValue <= 0) return;

    const o = this.options;
    const w = this.weightValue;
    // The shoulder absorbs some of the kick. Only some: the arm rides the
    // recoil, the weapon's own mount takes the rest.
    const kick = this.recoil === null ? 0 : this.recoil.pitchOffset() * 0.45;
    const pitch = this.pitchValue + this.swayOffset() + kick;
    const yaw = this.yawValue * 0.7;

    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i] as ArmChain;
      const isPrimary = arm.side === handedness;
      // Positive `rotation.z` swings a limb toward `+X`, so the sign has to be
      // flipped per side for both arms to come *in* across the chest rather
      // than splay outward.
      const inward = arm.side === 'left' ? -1 : 1;

      // The off arm comes further up and bends further: it is the one reaching
      // past the creature's own centre line for the fore-grip.
      const raise = isPrimary ? o.armRaise : o.armRaise + 0.12;
      const across = isPrimary ? o.armAcross * 0.4 : o.armAcross;

      // `x` blends over the animator's output, which is rewritten every frame;
      // `y` and `z` blend from the captured rest pose, which is not.
      // Only part of the pitch reaches the shoulder. The weapon's own mount
      // takes the exact angle, so the arm only has to follow convincingly —
      // and a shoulder that tracked the full range would swing past vertical
      // on a steep shot.
      arm.upper.rotation.x = lerp(arm.upper.rotation.x, -raise + pitch * 0.6, w);
      arm.upper.rotation.y = lerp(arm.restY, yaw, w);
      arm.upper.rotation.z = lerp(arm.restZ, inward * across, w);

      if (arm.lower === null) continue;
      const bend = isPrimary ? o.elbowBend : o.elbowBend * 1.7;
      arm.lower.rotation.x = lerp(arm.lower.rotation.x, -bend, w);
    }
  }

  /** The aim rotation in the creature's own space, sway included. */
  private aimQuaternion(target: Quaternion): Quaternion {
    scratchEuler.set(this.pitchValue + this.swayOffset(), this.yawValue, 0, 'YXZ');
    return target.setFromEuler(scratchEuler);
  }

  /**
   * Breathing.
   *
   * A held aim that is perfectly still reads as a frozen frame rather than a
   * creature concentrating, and it costs one sine to fix. Scaled by weight so
   * it is not applied to a lowered weapon.
   */
  private swayOffset(): number {
    if (this.options.sway <= 0) return 0;
    return (
      Math.sin(this.clock * this.options.swayRate * Math.PI * 2) *
      this.options.sway *
      this.weightValue
    );
  }
}

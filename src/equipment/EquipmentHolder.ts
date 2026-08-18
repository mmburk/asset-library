import { Object3D } from 'three';
import type { AssetContext } from '../core/AssetContext';
import { Scratch } from '../core/Scratch';
import type { CreatureRig } from '../creatures/CreatureRig';
import { AimController, type AimOptions } from './AimController';
import { BladeSweep, type BladeOptions, type BladeSweepOptions } from './BladeSweep';
import { GhostHandAsset } from './GhostHandAsset';
import { RecoilController, type RecoilOptions } from './RecoilController';
import { SwingController, type SwingOptions, type SwingStyle } from './SwingController';
import {
  GHOST_HAND_REFERENCE_HEIGHT,
  GHOST_HAND_SOCKETS,
  REAL_HAND_SOCKETS,
  type GhostHandOptions,
  type GripStyle,
  type Handedness,
} from './types';

/** Per-equip settings. */
export interface EquipOptions {
  /** Defaults to `'one-handed'`. */
  grip?: GripStyle;
  /** Which hand takes the weapon. Defaults to `'right'`. */
  handedness?: Handedness;
  /**
   * How far along the weapon's own `+Z` the support hand grabs, in the weapon's
   * units. Only used by a two-handed grip.
   */
  supportOffset?: number;
  /** Skip the fade — the creature is spawning already armed. */
  immediate?: boolean;
  /**
   * `false` keeps the weapon out of the melee sweep.
   *
   * On by default: anything put in a creature's hand can be swung, and a rifle
   * that cannot be used as a club is a special case nobody asked for. Set it
   * when the "weapon" is a torch, a mug or a sign.
   */
  cuts?: boolean;
  /** Per-weapon damage and hit radius. Ignored when `cuts` is `false`. */
  blade?: BladeOptions;
}

/** Construction settings for {@link EquipmentHolder}. */
export interface EquipmentHolderOptions {
  /** Look of the conjured hands. Merged over the defaults. */
  ghost?: Partial<GhostHandOptions>;
  /**
   * Overrides the automatic hand size. By default a hand is scaled by the
   * skeleton's authored height against a 1.8-unit humanoid, so a doggo gets
   * doggo-sized hands.
   */
  handScale?: number;
  /** Tuning for the raise-to-aim pose. */
  aim?: Partial<AimOptions>;
  /** Tuning for the recoil spring. */
  recoil?: Partial<RecoilOptions>;
  /** Tuning for the melee swing. */
  swing?: Partial<SwingOptions>;
  /** Tuning for melee hit detection. */
  sweep?: Partial<BladeSweepOptions>;
}

const REST_BONE_PREFERENCE = ['chest', 'spine', 'torso', 'body', 'body0', 'hips'];

/**
 * Puts a weapon in a creature's hand, conjuring the hand when there isn't one.
 *
 * Two paths, decided by the skeleton rather than by the caller:
 *
 * - The skeleton declares `handL` / `handR` — GigaChad, Tung Tung, the cactus —
 *   and the weapon is simply parented to that socket. Nothing is conjured.
 * - The skeleton has no hands, which is most of them. A pair of
 *   {@link GhostHandAsset}s fades in at the `ghostHandL` / `ghostHandR`
 *   sockets, one of them takes the weapon, and both fade out again when the
 *   weapon is dropped. The hands exist exactly as long as something is held.
 *
 * A skeleton that declares neither still works: the placement is derived from
 * the creature's own bounds, so a new archetype gets usable ghost hands before
 * anyone authors sockets for it.
 *
 * ```ts
 * const holder = new EquipmentHolder(context, creature.rig);
 * holder.equip(rifle, { grip: 'two-handed' });
 * // per frame:
 * holder.update(dt);
 * ```
 */
export class EquipmentHolder {
  private readonly context: AssetContext;
  private readonly rig: CreatureRig;
  private readonly options: EquipmentHolderOptions;

  /** Raise-to-aim state. Drives whichever hands are in play. */
  readonly aim: AimController;

  /** Recoil spring. Fires shots and settles them. */
  readonly recoil: RecoilController;

  /** Melee swing state and pose. */
  readonly swing: SwingController;

  /**
   * Melee hit detection.
   *
   * Separate from the swing on purpose: a game can register targets, add a
   * second blade the creature is holding in a socket rather than in the
   * holder, or drive its own hit detection off {@link SwingController.striking}
   * and ignore this entirely.
   */
  readonly blades: BladeSweep;

  private primaryHand: GhostHandAsset | null = null;
  private offHand: GhostHandAsset | null = null;
  /** `true` while the off hand rides the weapon rather than its own socket. */
  private offHandOnWeapon = false;
  /**
   * Weapon mount for creatures with real hands.
   *
   * The weapon does not go on the hand socket directly, because a socket
   * inherits the whole arm chain: raise the shoulder to aim and the barrel
   * pitches up with it. The mount is turned back to the aim direction in
   * creature space, so the arm can be posed freely and the weapon still points
   * where it was aimed.
   */
  private mount: Object3D | null = null;
  /** Sockets invented for a skeleton that does not declare any. Owned here. */
  private readonly derivedSockets = new Map<Handedness, Object3D>();
  /** Which hand took the weapon, remembered so the aim pose knows which arm leads. */
  private mountHandedness: Handedness = 'right';
  private weaponObject: Object3D | null = null;
  private disposedFlag = false;

  constructor(context: AssetContext, rig: CreatureRig, options: EquipmentHolderOptions = {}) {
    this.context = context;
    this.rig = rig;
    this.options = options;
    this.recoil = new RecoilController(options.recoil);
    this.aim = new AimController(rig, options.aim, this.recoil);
    this.swing = new SwingController(rig, options.swing);
    this.blades = new BladeSweep(options.sweep);
  }

  /**
   * Swings the held weapon.
   *
   * @returns `false` when nothing is held or the swing was refused — a wind-up
   * or a strike cannot be interrupted, and the cooldown still applies — so a
   * held attack button can call this every frame and get the weapon's own
   * attack rate.
   */
  strike(style?: SwingStyle): boolean {
    if (this.weaponObject === null) return false;
    return this.swing.swing(style);
  }

  /**
   * Fires the held weapon.
   *
   * @returns `false` when nothing is held or the weapon's cooldown has not
   * elapsed, so a caller holding the trigger down can call this every frame and
   * get the weapon's own rate of fire.
   */
  fire(): boolean {
    if (this.weaponObject === null) return false;
    return this.recoil.fire();
  }

  /** `true` while a weapon is held. */
  get holding(): boolean {
    return this.weaponObject !== null;
  }

  /** The held weapon, or `null`. */
  get weapon(): Object3D | null {
    return this.weaponObject;
  }

  /** `true` when this creature has no hands of its own and has to conjure them. */
  get needsGhostHands(): boolean {
    return (
      this.rig.findSocket(REAL_HAND_SOCKETS.left) === undefined &&
      this.rig.findSocket(REAL_HAND_SOCKETS.right) === undefined
    );
  }

  /** The conjured hands currently in play, primary first. Empty when unused. */
  get ghostHands(): readonly GhostHandAsset[] {
    if (this.primaryHand === null) return EMPTY_HANDS;
    return this.offHand === null ? [this.primaryHand] : [this.primaryHand, this.offHand];
  }

  /**
   * Puts `weapon` in the creature's hand, conjuring one if it has none.
   *
   * The weapon is parented, not owned: {@link unequip} hands it straight back,
   * and {@link dispose} leaves it alone.
   *
   * @throws when a weapon is already held — unequip first, so a dropped weapon
   * is never leaked into the scene graph.
   */
  equip(weapon: Object3D, options: EquipOptions = {}): void {
    this.assertLive();
    if (this.weaponObject !== null) {
      throw new Error('EquipmentHolder: already holding a weapon — call unequip() first.');
    }

    const handedness = options.handedness ?? 'right';
    this.mountHandedness = handedness;
    const realSocket = this.rig.findSocket(REAL_HAND_SOCKETS[handedness]);

    if (realSocket !== undefined) {
      // It has hands. Nothing to conjure — but the weapon still gets its own
      // mount, so the aim pose has something to turn that is not the arm.
      const mount = new Object3D();
      mount.name = 'equip:mount';
      realSocket.add(mount);
      mount.add(weapon);
      this.mount = mount;
      this.weaponObject = weapon;
      this.armBlade(weapon, options);
      return;
    }

    const immediate = options.immediate === true;
    const twoHanded = (options.grip ?? 'one-handed') === 'two-handed';
    const otherSide: Handedness = handedness === 'right' ? 'left' : 'right';

    // Both hands, always. A single hand appearing on its own reads as a missing
    // limb; a pair reads as the creature's hands, which is what they are.
    const primary = this.conjure(handedness, immediate);
    primary.grip.add(weapon);
    this.primaryHand = primary;
    this.weaponObject = weapon;
    this.armBlade(weapon, options);

    if (twoHanded) {
      // The off hand hangs off the weapon rather than off the creature, so it
      // stays welded to the fore-grip however the weapon is aimed. Its own idle
      // float is switched off for the same reason — two hands bobbing out of
      // phase on one rifle reads as a loose grip.
      const off = this.createHand(otherSide, { bobAmount: 0 });
      off.root.position.set(0, 0, options.supportOffset ?? 0.24);
      weapon.add(off.root);
      if (immediate) off.showImmediate();
      else off.show();
      this.offHand = off;
      this.offHandOnWeapon = true;
    } else {
      // Nothing to hold, so it floats at its own socket and idles there.
      this.offHand = this.conjure(otherSide, immediate);
      this.offHandOnWeapon = false;
    }
  }

  /**
   * Takes the weapon back and dissolves any conjured hands.
   *
   * The hands are kept alive until their fade finishes, which is why
   * {@link update} must keep being called for a few frames after this.
   *
   * @returns the weapon that was held, or `null`.
   */
  unequip(): Object3D | null {
    const weapon = this.weaponObject;
    if (weapon === null) return null;

    // On a two-handed grip the off hand hangs off the weapon, so it has to come
    // off before the weapon leaves or it rides away with it. `attach` rather
    // than `add`: the hand keeps its world transform and dissolves where it
    // stood, instead of snapping back to the creature's origin for the last few
    // frames.
    if (this.offHand !== null && this.offHand.root.parent === weapon) {
      const parent = this.primaryHand === null ? null : this.primaryHand.root.parent;
      if (parent !== null) parent.attach(this.offHand.root);
      else this.offHand.root.removeFromParent();
    }
    if (this.offHand !== null) this.offHand.hide();

    weapon.removeFromParent();
    this.weaponObject = null;
    if (this.mount !== null) {
      this.mount.removeFromParent();
      this.mount = null;
    }
    // Lowered on the way out, so a creature that drops its weapon does not
    // stand there still holding the pose — or still shaking off the last shot,
    // or halfway through a cut with nothing in its hand.
    this.aim.setAiming(false);
    this.recoil.reset();
    this.swing.reset();
    this.blades.removeBlade(weapon);
    this.blades.resetSwing();
    if (this.primaryHand !== null) this.primaryHand.hide();
    return weapon;
  }

  /**
   * Advances the fades, the idle float and the aim pose. Allocation-free.
   *
   * Must run *after* the creature's animator: the aim pose is written over
   * bones the locomotion animators drive absolutely, so anything applied before
   * them is simply erased.
   */
  update(dt: number): void {
    // Recoil first: the aim pose reads it as it composes this frame's pose.
    this.recoil.update(dt);
    this.aim.update(dt);

    if (this.primaryHand !== null) {
      this.primaryHand.setBobScale(this.aim.bobScale());
      this.primaryHand.update(dt);
      this.poseHand(this.primaryHand);
      if (this.primaryHand.hidden && this.weaponObject === null) {
        this.primaryHand.dispose();
        this.primaryHand = null;
      }
    }
    if (this.offHand !== null) {
      this.offHand.setBobScale(this.aim.bobScale());
      this.offHand.update(dt);
      // A hand riding the weapon is already aimed by the weapon it holds.
      if (!this.offHandOnWeapon) this.poseHand(this.offHand);
      if (this.offHand.hidden && this.weaponObject === null) {
        this.offHand.dispose();
        this.offHand = null;
      }
    }

    if (this.mount !== null) {
      this.aim.poseArms(this.mountHandedness);
      this.aim.orient(this.mount);
    }

    // The cut goes on last, over everything: a creature that swings while
    // aiming leaves the aim pose for as long as the swing lasts, rather than
    // trying to hold both at once and reaching neither.
    this.swing.update(dt);
    this.applySwing();

    // And the sweep after that, because it reads world matrices the pose has
    // only just written.
    if (this.swing.striking) this.blades.sweep(this.swing.swings, this.swing.style);
    else this.blades.rest();
  }

  /** Lays the swing pose over whatever is holding the weapon. */
  private applySwing(): void {
    if (this.swing.weight <= 0) return;

    this.swing.poseArms(this.mountHandedness);

    if (this.primaryHand !== null) {
      const side = this.primaryHand.handedness === 'left' ? 1 : -1;
      this.swing.placeHand(this.primaryHand.root, side);
      this.swing.orient(this.primaryHand.root, this.mountHandedness);
    }

    // The free hand travels with the swing but is not turned by it: it is not
    // holding the weapon, and pointing it down the blade makes it read as a
    // second hand on a sword it is nowhere near. A hand riding a two-handed
    // grip is already carried by the weapon it holds.
    if (this.offHand !== null && !this.offHandOnWeapon) {
      this.swing.placeHand(this.offHand.root, this.offHand.handedness === 'left' ? 1 : -1);
    }

    if (this.mount !== null) this.swing.orient(this.mount, this.mountHandedness);
  }

  /**
   * Registers a newly equipped weapon as something that can cut.
   *
   * Every weapon is a blade unless the caller says otherwise. A sword publishes
   * where its edge is and gets an exact one; anything else is measured, which
   * gives a rifle a hit box down the barrel — which is what swinging a rifle
   * should do.
   */
  private armBlade(weapon: Object3D, options: EquipOptions): void {
    if (options.cuts === false) return;
    this.blades.addBlade(weapon, options.blade ?? EMPTY_BLADE_OPTIONS);
  }

  /** Lifts one conjured hand into the braced position and turns it to the aim. */
  private poseHand(hand: GhostHandAsset): void {
    this.aim.placeHand(hand.root, hand.handedness === 'left' ? 1 : -1);
    this.aim.orient(hand.root);
  }

  /**
   * Releases the conjured hands immediately. The held weapon is detached and
   * returned to the caller rather than disposed — the holder never owned it.
   */
  dispose(): Object3D | null {
    if (this.disposedFlag) return null;
    this.disposedFlag = true;

    const weapon = this.weaponObject;
    if (weapon !== null) weapon.removeFromParent();
    this.weaponObject = null;

    this.blades.clearBlades();
    this.blades.clearTargets();
    this.blades.onHit = null;

    if (this.mount !== null) {
      this.mount.removeFromParent();
      this.mount = null;
    }

    if (this.offHand !== null) {
      this.offHand.dispose();
      this.offHand = null;
    }
    if (this.primaryHand !== null) {
      this.primaryHand.dispose();
      this.primaryHand = null;
    }

    for (const node of this.derivedSockets.values()) node.removeFromParent();
    this.derivedSockets.clear();

    return weapon;
  }

  private conjure(handedness: Handedness, immediate: boolean): GhostHandAsset {
    const hand = this.createHand(handedness);
    // Position stays at the origin of whatever it hangs from: the aim pose
    // moves the hand *out* of its rest, and rest has to mean zero for that to
    // blend back cleanly.
    hand.root.position.set(0, 0, 0);
    this.resolveSocket(handedness).add(hand.root);
    if (immediate) hand.showImmediate();
    else hand.show();
    return hand;
  }

  private createHand(
    handedness: Handedness,
    overrides: Partial<GhostHandOptions> = {},
  ): GhostHandAsset {
    return new GhostHandAsset(this.context, {
      ...this.options.ghost,
      ...overrides,
      handedness,
      scale: this.handScale(),
    }).build();
  }

  /**
   * A hand is authored for a 1.8-unit humanoid and hangs inside the rig, so it
   * is measured against the skeleton's *authored* height — the root scale that
   * turns a creature into a boss carries the hand along with everything else.
   */
  private handScale(): number {
    const override = this.options.handScale;
    if (override !== undefined && override > 0) return override;

    const nominal = this.rig.nominalHeight;
    if (!(nominal > 0)) return 1;
    const scale = nominal / GHOST_HAND_REFERENCE_HEIGHT;
    return scale < 0.25 ? 0.25 : scale > 3 ? 3 : scale;
  }

  /**
   * Finds where a conjured hand should float.
   *
   * An authored `ghostHand*` socket wins, always — it was placed by eye against
   * the creature's silhouette. The fallback exists so an unauthored skeleton is
   * still usable: it puts the hand outboard of the widest part of the body, at
   * roughly two thirds height and forward of the chest, which is where a hand
   * would be if the creature had one.
   */
  private resolveSocket(handedness: Handedness): Object3D {
    const authored = this.rig.findSocket(GHOST_HAND_SOCKETS[handedness]);
    if (authored !== undefined) return authored;

    const existing = this.derivedSockets.get(handedness);
    if (existing !== undefined) return existing;

    const anchor = this.findAnchorBone();
    const root = this.rig.root;
    root.updateMatrixWorld(true);

    const bounds = Scratch.boxA.setFromObject(root);
    const size = bounds.getSize(Scratch.vec3A);
    const center = bounds.getCenter(Scratch.vec3B);

    const side = handedness === 'left' ? 1 : -1;
    const point = Scratch.vec3C.set(
      center.x + side * size.x * 0.42,
      bounds.min.y + size.y * 0.62,
      center.z + size.z * 0.36,
    );
    anchor.worldToLocal(point);

    // Made into a real socket rather than baked into the hand's own position,
    // so a derived placement behaves exactly like an authored one — including
    // being the zero the aim pose blends back to.
    const node = new Object3D();
    node.name = `socket:${GHOST_HAND_SOCKETS[handedness]}(derived)`;
    node.position.copy(point);
    anchor.add(node);
    this.derivedSockets.set(handedness, node);
    return node;
  }

  private findAnchorBone(): Object3D {
    for (let i = 0; i < REST_BONE_PREFERENCE.length; i++) {
      const bone = this.rig.findBone(REST_BONE_PREFERENCE[i] as string);
      if (bone !== undefined) return bone;
    }
    return this.rig.joints[0] as Object3D;
  }

  private assertLive(): void {
    if (this.disposedFlag) {
      throw new Error('EquipmentHolder: the holder has been disposed.');
    }
  }
}

const EMPTY_HANDS: readonly GhostHandAsset[] = Object.freeze([]);

/** Shared, so arming a weapon with no per-blade settings allocates nothing. */
const EMPTY_BLADE_OPTIONS: BladeOptions = Object.freeze({});

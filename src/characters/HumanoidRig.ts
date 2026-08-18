import { Group, Object3D } from 'three';
import {
  ATTACHMENT_SLOTS,
  HUMANOID_JOINT_COUNT,
  HUMANOID_JOINT_INDEX,
  HUMANOID_JOINT_NAMES,
  type AttachmentSlot,
  type HumanoidJointName,
  type HumanoidMeasurements,
} from './types';

/**
 * Segmented humanoid skeleton.
 *
 * Deliberately **not** a `SkinnedMesh`. For faceted low-poly characters a
 * hierarchy of rigid parts looks identical to skinning, costs nothing on the
 * CPU (no bone matrix upload, no skinning shader), and lets the animator work
 * by writing plain Euler angles — which is what makes the whole animation path
 * allocation-free.
 *
 * Rest pose is stored in flat `Float32Array`s rather than as `Euler` objects:
 * index-aligned with {@link HUMANOID_JOINT_NAMES}, three floats per joint,
 * cache-friendly, and `resetPose()` becomes a straight loop over contiguous
 * memory.
 *
 * Orientation: the character faces `+Z`, its left is `+X`, limbs extend
 * along `-Y` from their pivots.
 */
export class HumanoidRig {
  /** Rig root. Position and rotate this to move the character in the world. */
  readonly root: Group;

  /** Every joint, index-aligned with {@link HUMANOID_JOINT_NAMES}. */
  readonly joints: readonly Object3D[];

  /** Rest local positions: `[x, y, z]` per joint. */
  readonly restPositions: Float32Array;

  /** Rest local Euler rotations in radians: `[x, y, z]` per joint. */
  readonly restRotations: Float32Array;

  /** The measurements this rig was laid out from. */
  readonly measurements: HumanoidMeasurements;

  /** Equipment sockets, already positioned in their parent joint's space. */
  readonly attachments: Readonly<Record<AttachmentSlot, Object3D>>;

  // Direct references — the animator touches these every frame and should not
  // pay for a map lookup or an array index bounds check to do it.
  readonly hips: Object3D;
  readonly spine: Object3D;
  readonly chest: Object3D;
  readonly neck: Object3D;
  readonly head: Object3D;

  readonly shoulderL: Object3D;
  readonly upperArmL: Object3D;
  readonly lowerArmL: Object3D;
  readonly handL: Object3D;

  readonly shoulderR: Object3D;
  readonly upperArmR: Object3D;
  readonly lowerArmR: Object3D;
  readonly handR: Object3D;

  readonly upperLegL: Object3D;
  readonly lowerLegL: Object3D;
  readonly footL: Object3D;

  readonly upperLegR: Object3D;
  readonly lowerLegR: Object3D;
  readonly footR: Object3D;

  constructor(measurements: HumanoidMeasurements) {
    this.measurements = measurements;

    const m = measurements;
    const joints = new Array<Object3D>(HUMANOID_JOINT_COUNT);

    this.root = new Group();
    this.root.name = 'root';
    joints[0] = this.root;

    /** Creates a joint, parents it and slots it into the index-aligned array. */
    const makeJoint = (name: HumanoidJointName, parent: Object3D): Object3D => {
      const joint = new Object3D();
      joint.name = name;
      parent.add(joint);
      joints[HUMANOID_JOINT_INDEX[name]] = joint;
      return joint;
    };

    // --- Spine chain -------------------------------------------------------
    // The torso is split into three pivots so the character can bend at the
    // waist and twist at the chest independently.
    this.hips = makeJoint('hips', this.root);
    this.hips.position.set(0, m.hipHeight, 0);

    this.spine = makeJoint('spine', this.hips);
    this.spine.position.set(0, m.torsoLength * 0.35, 0);

    this.chest = makeJoint('chest', this.spine);
    this.chest.position.set(0, m.torsoLength * 0.35, 0);

    this.neck = makeJoint('neck', this.chest);
    this.neck.position.set(0, m.torsoLength * 0.3, 0);

    this.head = makeJoint('head', this.neck);
    this.head.position.set(0, m.neckLength, 0);

    // --- Arms --------------------------------------------------------------
    // Shoulder pivots sit inboard by one arm radius so the limb's outer
    // surface lands on the nominal shoulder width.
    const shoulderX = Math.max(m.shoulderWidth * 0.5 - m.armRadius, m.armRadius);
    const shoulderY = m.shoulderHeight - m.torsoLength * 0.7;

    this.shoulderL = makeJoint('shoulderL', this.chest);
    this.shoulderL.position.set(shoulderX, shoulderY, 0);

    this.upperArmL = makeJoint('upperArmL', this.shoulderL);

    this.lowerArmL = makeJoint('lowerArmL', this.upperArmL);
    this.lowerArmL.position.set(0, -m.upperArmLength, 0);

    this.handL = makeJoint('handL', this.lowerArmL);
    this.handL.position.set(0, -m.lowerArmLength, 0);

    this.shoulderR = makeJoint('shoulderR', this.chest);
    this.shoulderR.position.set(-shoulderX, shoulderY, 0);

    this.upperArmR = makeJoint('upperArmR', this.shoulderR);

    this.lowerArmR = makeJoint('lowerArmR', this.upperArmR);
    this.lowerArmR.position.set(0, -m.upperArmLength, 0);

    this.handR = makeJoint('handR', this.lowerArmR);
    this.handR.position.set(0, -m.lowerArmLength, 0);

    // --- Legs --------------------------------------------------------------
    const legX = m.hipWidth * 0.27;

    this.upperLegL = makeJoint('upperLegL', this.hips);
    this.upperLegL.position.set(legX, 0, 0);

    this.lowerLegL = makeJoint('lowerLegL', this.upperLegL);
    this.lowerLegL.position.set(0, -m.upperLegLength, 0);

    this.footL = makeJoint('footL', this.lowerLegL);
    this.footL.position.set(0, -m.lowerLegLength, 0);

    this.upperLegR = makeJoint('upperLegR', this.hips);
    this.upperLegR.position.set(-legX, 0, 0);

    this.lowerLegR = makeJoint('lowerLegR', this.upperLegR);
    this.lowerLegR.position.set(0, -m.upperLegLength, 0);

    this.footR = makeJoint('footR', this.lowerLegR);
    this.footR.position.set(0, -m.lowerLegLength, 0);

    // --- Rest pose offsets -------------------------------------------------
    // A dead-vertical arm reads as a mannequin, so the shoulders splay
    // slightly and the elbows carry a token bend.
    this.shoulderL.rotation.z = 0.1;
    this.shoulderR.rotation.z = -0.1;
    this.lowerArmL.rotation.x = 0.06;
    this.lowerArmR.rotation.x = 0.06;
    this.upperLegL.rotation.z = 0.015;
    this.upperLegR.rotation.z = -0.015;

    this.joints = joints;

    this.restPositions = new Float32Array(HUMANOID_JOINT_COUNT * 3);
    this.restRotations = new Float32Array(HUMANOID_JOINT_COUNT * 3);
    this.captureRestPose();

    this.attachments = this.createAttachments(m);
  }

  /** Looks a joint up by name. Prefer the direct properties in hot code. */
  getJoint(name: HumanoidJointName): Object3D {
    return this.joints[HUMANOID_JOINT_INDEX[name]] as Object3D;
  }

  /** Returns the socket for `slot`. Parent equipment to it directly. */
  getAttachment(slot: AttachmentSlot): Object3D {
    return this.attachments[slot];
  }

  /**
   * Stores the current local transforms as the rest pose.
   * Call after adjusting a rig by hand; the constructor already does it once.
   */
  captureRestPose(): void {
    const joints = this.joints;
    for (let i = 0; i < joints.length; i++) {
      const joint = joints[i] as Object3D;
      const o = i * 3;
      this.restPositions[o] = joint.position.x;
      this.restPositions[o + 1] = joint.position.y;
      this.restPositions[o + 2] = joint.position.z;
      this.restRotations[o] = joint.rotation.x;
      this.restRotations[o + 1] = joint.rotation.y;
      this.restRotations[o + 2] = joint.rotation.z;
    }
  }

  /** Restores every joint to its rest pose. Allocation-free. */
  resetPose(): void {
    const joints = this.joints;
    const positions = this.restPositions;
    const rotations = this.restRotations;
    for (let i = 0; i < joints.length; i++) {
      const joint = joints[i] as Object3D;
      const o = i * 3;
      joint.position.set(positions[o] as number, positions[o + 1] as number, positions[o + 2] as number);
      joint.rotation.set(rotations[o] as number, rotations[o + 1] as number, rotations[o + 2] as number);
    }
  }

  /** Rest local rotation of one joint, written into `out`. Allocation-free. */
  readRestRotation(name: HumanoidJointName, out: { x: number; y: number; z: number }): void {
    const o = HUMANOID_JOINT_INDEX[name] * 3;
    out.x = this.restRotations[o] as number;
    out.y = this.restRotations[o + 1] as number;
    out.z = this.restRotations[o + 2] as number;
  }

  private createAttachments(m: HumanoidMeasurements): Readonly<Record<AttachmentSlot, Object3D>> {
    const chestY = m.torsoLength * 0.2;

    const parents: Readonly<Record<AttachmentSlot, Object3D>> = {
      head: this.head,
      chest: this.chest,
      back: this.chest,
      handL: this.handL,
      handR: this.handR,
      hipL: this.hips,
      hipR: this.hips,
    };

    const offsets: Readonly<Record<AttachmentSlot, readonly [number, number, number]>> = {
      // Crown of the head — hats, helmets, horns.
      head: [0, m.headHeight, 0],
      // Chest front — badges, amulets.
      chest: [0, chestY, m.chestDepth * 0.5],
      // Between the shoulder blades — backpacks, sheathed weapons.
      back: [0, chestY, -m.chestDepth * 0.5],
      // Grip point, at the middle of the palm.
      handL: [0, -m.handLength * 0.5, 0],
      handR: [0, -m.handLength * 0.5, 0],
      // Belt line — holsters, pouches.
      hipL: [m.hipWidth * 0.5, 0, 0],
      hipR: [-m.hipWidth * 0.5, 0, 0],
    };

    const result = {} as Record<AttachmentSlot, Object3D>;
    for (let i = 0; i < ATTACHMENT_SLOTS.length; i++) {
      const slot = ATTACHMENT_SLOTS[i] as AttachmentSlot;
      const socket = new Object3D();
      socket.name = `attach:${slot}`;
      const offset = offsets[slot];
      socket.position.set(offset[0], offset[1], offset[2]);
      parents[slot].add(socket);
      result[slot] = socket;
    }
    return result;
  }
}

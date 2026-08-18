import { Group, Object3D } from 'three';
import type { BoneDefinition, PosableRig, SkeletonDefinition, SocketDefinition } from './types';

/**
 * Skeleton built from a {@link SkeletonDefinition}.
 *
 * The generic counterpart to `HumanoidRig`: same storage strategy — joints in
 * an index-aligned array with the rest pose in flat `Float32Array`s, so
 * `resetPose()` is a straight walk over contiguous memory — but the shape of
 * the hierarchy comes from data rather than being hard-coded.
 *
 * Anything an animator needs to move is a bone. A propeller, a jaw and a tail
 * segment are all bones, which keeps the animators free of any knowledge of
 * the visual part system.
 */
export class CreatureRig implements PosableRig {
  /** Rig root. Position and rotate this to move the creature in the world. */
  readonly root: Group;

  /** Every bone, index-aligned with {@link SkeletonDefinition.bones}. */
  readonly joints: readonly Object3D[];

  /** Rest local positions: `[x, y, z]` per bone. */
  readonly restPositions: Float32Array;

  /** Rest local Euler rotations in radians: `[x, y, z]` per bone. */
  readonly restRotations: Float32Array;

  /** The definition this rig was built from. */
  readonly definition: SkeletonDefinition;

  private readonly indexByName: Map<string, number>;
  private readonly socketByName: Map<string, Object3D>;

  constructor(definition: SkeletonDefinition) {
    if (definition.bones.length === 0) {
      throw new Error(`CreatureRig: skeleton "${definition.name}" declares no bones.`);
    }

    this.definition = definition;
    this.root = new Group();
    this.root.name = definition.name;

    const count = definition.bones.length;
    const joints = new Array<Object3D>(count);
    this.indexByName = new Map<string, number>();

    for (let i = 0; i < count; i++) {
      const bone = definition.bones[i] as BoneDefinition;

      if (this.indexByName.has(bone.name)) {
        throw new Error(
          `CreatureRig: skeleton "${definition.name}" declares bone "${bone.name}" twice.`,
        );
      }

      const joint = new Object3D();
      joint.name = bone.name;
      joint.position.set(bone.position[0], bone.position[1], bone.position[2]);
      if (bone.rotation !== undefined) {
        joint.rotation.set(bone.rotation[0], bone.rotation[1], bone.rotation[2]);
      }

      // Parents are resolved by name against what has already been created, so
      // a forward reference fails loudly here instead of producing a rig that
      // is silently missing a limb.
      if (bone.parent === null) {
        this.root.add(joint);
      } else {
        const parentIndex = this.indexByName.get(bone.parent);
        if (parentIndex === undefined) {
          throw new Error(
            `CreatureRig: bone "${bone.name}" references parent "${bone.parent}", which is not declared before it.`,
          );
        }
        (joints[parentIndex] as Object3D).add(joint);
      }

      joints[i] = joint;
      this.indexByName.set(bone.name, i);
    }

    this.joints = joints;
    this.restPositions = new Float32Array(count * 3);
    this.restRotations = new Float32Array(count * 3);
    this.captureRestPose();

    this.socketByName = new Map<string, Object3D>();
    for (let i = 0; i < definition.sockets.length; i++) {
      const socket = definition.sockets[i] as SocketDefinition;
      if (this.socketByName.has(socket.name)) {
        throw new Error(
          `CreatureRig: skeleton "${definition.name}" declares socket "${socket.name}" twice.`,
        );
      }
      const node = new Object3D();
      node.name = `socket:${socket.name}`;
      node.position.set(socket.position[0], socket.position[1], socket.position[2]);
      if (socket.rotation !== undefined) {
        node.rotation.set(socket.rotation[0], socket.rotation[1], socket.rotation[2]);
      }
      this.getBone(socket.bone).add(node);
      this.socketByName.set(socket.name, node);
    }
  }

  /** Body plan this skeleton was authored for. */
  get plan(): SkeletonDefinition['plan'] {
    return this.definition.plan;
  }

  /** Height the skeleton was authored at, before any scaling. */
  get nominalHeight(): number {
    return this.definition.nominalHeight;
  }

  /** Number of bones. */
  get boneCount(): number {
    return this.joints.length;
  }

  /** `true` when the skeleton declares `name`. */
  hasBone(name: string): boolean {
    return this.indexByName.has(name);
  }

  /** Returns the bone, or `undefined` when the skeleton does not declare it. */
  findBone(name: string): Object3D | undefined {
    const index = this.indexByName.get(name);
    return index === undefined ? undefined : (this.joints[index] as Object3D);
  }

  /**
   * Returns the bone.
   * @throws when the skeleton does not declare it — an animator asking for a
   * bone that is not there is a wiring bug, not a runtime condition.
   */
  getBone(name: string): Object3D {
    const bone = this.findBone(name);
    if (bone === undefined) {
      throw new Error(
        `CreatureRig: skeleton "${this.definition.name}" has no bone "${name}". Available: ${this.listBones().join(', ')}`,
      );
    }
    return bone;
  }

  /** Index of `name` in {@link joints}, or `-1` when absent. */
  boneIndex(name: string): number {
    return this.indexByName.get(name) ?? -1;
  }

  /** Returns the socket, or `undefined` when absent. */
  findSocket(name: string): Object3D | undefined {
    return this.socketByName.get(name);
  }

  /**
   * Returns the socket. Parent equipment to it directly.
   * @throws when the skeleton does not declare it.
   */
  getSocket(name: string): Object3D {
    const socket = this.socketByName.get(name);
    if (socket === undefined) {
      throw new Error(
        `CreatureRig: skeleton "${this.definition.name}" has no socket "${name}". Available: ${this.listSockets().join(', ')}`,
      );
    }
    return socket;
  }

  /** Every bone name, in declaration order. Allocates — tooling only. */
  listBones(): string[] {
    return this.definition.bones.map((bone) => bone.name);
  }

  /** Every socket name. Allocates — tooling only. */
  listSockets(): string[] {
    return Array.from(this.socketByName.keys());
  }

  /** Stores the current local transforms as the rest pose. */
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

  /** Restores every bone to its rest pose. Allocation-free. */
  resetPose(): void {
    const joints = this.joints;
    const positions = this.restPositions;
    const rotations = this.restRotations;
    for (let i = 0; i < joints.length; i++) {
      const joint = joints[i] as Object3D;
      const o = i * 3;
      joint.position.set(
        positions[o] as number,
        positions[o + 1] as number,
        positions[o + 2] as number,
      );
      joint.rotation.set(
        rotations[o] as number,
        rotations[o + 1] as number,
        rotations[o + 2] as number,
      );
    }
  }

  /** Rest local rotation X of one bone. Returns `0` when the bone is absent. */
  restRotationX(name: string): number {
    const index = this.indexByName.get(name);
    return index === undefined ? 0 : (this.restRotations[index * 3] as number);
  }

  /** Rest local rotation Y of one bone. Returns `0` when the bone is absent. */
  restRotationY(name: string): number {
    const index = this.indexByName.get(name);
    return index === undefined ? 0 : (this.restRotations[index * 3 + 1] as number);
  }

  /** Rest local rotation Z of one bone. Returns `0` when the bone is absent. */
  restRotationZ(name: string): number {
    const index = this.indexByName.get(name);
    return index === undefined ? 0 : (this.restRotations[index * 3 + 2] as number);
  }

  /** Rest local position Y of one bone. Returns `0` when the bone is absent. */
  restPositionY(name: string): number {
    const index = this.indexByName.get(name);
    return index === undefined ? 0 : (this.restPositions[index * 3 + 1] as number);
  }
}

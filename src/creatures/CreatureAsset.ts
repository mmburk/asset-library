import { Box3, Vector3, type Mesh, type Object3D } from 'three';
import { Asset } from '../core/Asset';
import type { AssetContext } from '../core/AssetContext';
import { acquireFlatMaterial, type FlatMaterialOptions } from '../core/materials';
import type { ResourceBinder } from '../characters/HumanoidBuilder';
import { CreatureBuilder } from './CreatureBuilder';
import type { CreatureRig } from './CreatureRig';
import type { CreaturePalette, SkeletonDefinition } from './types';

/** Full option set for {@link CreatureAsset}. */
export interface CreatureOptions {
  skeleton: SkeletonDefinition;
  palette: CreaturePalette;
  /** Radial segments on round primitives. 5–8 keeps the faceted look. */
  segments: number;
  flatShading: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  /**
   * Height to scale the built creature to, in world units. `0` keeps the
   * authored size.
   */
  targetHeight: number;
  /** Extra uniform multiplier applied on top of any retargeting. */
  scaleMultiplier: number;
}

/**
 * A procedurally built creature of any body plan.
 *
 * Geometry is always produced at the size the skeleton was authored at and
 * then scaled on the root. That is deliberate: a minion, a player-sized
 * creature and a boss built from the same recipe differ only by one number on
 * `root.scale`, so all three share every cached geometry and material between
 * them.
 */
export class CreatureAsset extends Asset<CreatureOptions> {
  private rigInstance: CreatureRig | null = null;
  private meshList: readonly Mesh[] = [];
  private authoredHeightValue = 0;
  private appliedScale = 1;

  private readonly binder: ResourceBinder;

  constructor(context: AssetContext, options: CreatureOptions) {
    super(context, options);

    // Routing resource requests through the asset is what keeps dispose()
    // exact: every borrow made by the builder is recorded against this asset.
    this.binder = {
      geometry: (key, factory) => this.acquireGeometry(key, factory),
      material: (materialOptions: FlatMaterialOptions) =>
        this.trackMaterial(acquireFlatMaterial(this.context.material, materialOptions)),
    };
  }

  /**
   * The skeleton.
   * @throws when accessed before {@link build} or after {@link dispose}.
   */
  get rig(): CreatureRig {
    if (this.rigInstance === null) {
      throw new Error('CreatureAsset: rig is unavailable — call build() first.');
    }
    return this.rigInstance;
  }

  /** Every part mesh, in creation order. */
  get meshes(): readonly Mesh[] {
    return this.meshList;
  }

  /** Measured height of the geometry as authored, before scaling. */
  get authoredHeight(): number {
    return this.authoredHeightValue;
  }

  /** Uniform scale applied to the root. */
  get scale(): number {
    return this.appliedScale;
  }

  /** Final world-space height, after scaling. */
  get height(): number {
    return this.authoredHeightValue * this.appliedScale;
  }

  /** Body plan this creature is driven by. */
  get plan(): SkeletonDefinition['plan'] {
    return this.rig.plan;
  }

  /**
   * Parents `object` to a named socket.
   *
   * Attached objects are not owned by the creature: `dispose()` frees them
   * along with the rest of the graph, so detach anything you intend to reuse.
   */
  attach(socket: string, object: Object3D): void {
    this.rig.getSocket(socket).add(object);
  }

  /** Removes `object` from whichever socket holds it. */
  detach(object: Object3D): void {
    object.removeFromParent();
  }

  /** Returns the socket, for direct manipulation. */
  getSocket(socket: string): Object3D {
    return this.rig.getSocket(socket);
  }

  /**
   * Rescales the creature to a new world-space height.
   * Cheap — it touches one transform and reuses all geometry.
   */
  setTargetHeight(height: number): void {
    if (height <= 0 || this.authoredHeightValue <= 0) return;
    this.appliedScale = (height / this.authoredHeightValue) * this.options.scaleMultiplier;
    this.root.scale.setScalar(this.appliedScale);
  }

  protected override onBuild(): void {
    const builder = new CreatureBuilder(this.binder);
    const result = builder.build(this.options.skeleton, {
      palette: this.options.palette,
      segments: this.options.segments,
      flatShading: this.options.flatShading,
      castShadow: this.options.castShadow,
      receiveShadow: this.options.receiveShadow,
    });

    this.rigInstance = result.rig;
    this.meshList = result.meshes;
    this.root.add(result.rig.root);

    // Measure what was actually built rather than trusting the declared
    // nominal height, so a tier request lands on the exact number asked for
    // even if the skeleton data drifts.
    this.root.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(result.rig.root);
    const size = bounds.getSize(new Vector3());
    this.authoredHeightValue = size.y;

    // Drop the creature so its lowest point sits on y = 0.
    result.rig.root.position.y -= bounds.min.y;
    result.rig.captureRestPose();

    const target = this.options.targetHeight;
    if (target > 0 && this.authoredHeightValue > 0) {
      this.appliedScale = (target / this.authoredHeightValue) * this.options.scaleMultiplier;
    } else {
      this.appliedScale = this.options.scaleMultiplier;
    }
    this.root.scale.setScalar(this.appliedScale);
  }

  protected override onDispose(): void {
    this.rigInstance = null;
    this.meshList = [];
  }
}

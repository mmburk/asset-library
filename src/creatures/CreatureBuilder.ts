import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  SphereGeometry,
  type BufferGeometry,
  type Object3D,
} from 'three';
import { taperGeometry } from '../core/GeometryUtils';
import { keyNum } from '../core/ResourceCache';
import type { ResourceBinder } from '../characters/HumanoidBuilder';
import { CreatureRig } from './CreatureRig';
import type {
  BoneDefinition,
  BoneShape,
  CreaturePalette,
  PaletteRole,
  SkeletonDefinition,
} from './types';

/** Build-wide settings applied to every shape in a skeleton. */
export interface CreatureBuildOptions {
  palette: CreaturePalette;
  /** Default radial segment count for round primitives. Clamped to `[3, 32]`. */
  segments: number;
  flatShading: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}

/** What {@link CreatureBuilder.build} produces. */
export interface CreatureBuildResult {
  rig: CreatureRig;
  /** Every mesh created, in creation order. */
  meshes: Mesh[];
}

/**
 * Turns a {@link SkeletonDefinition} into a rig with geometry hanging off it.
 *
 * Purely mechanical: it does not know what a shark or a propeller is, only how
 * to emit four primitive families and parent them to bones. All creature
 * identity lives in the skeleton data, which is what makes a new archetype a
 * data change rather than a code change.
 */
export class CreatureBuilder {
  private readonly binder: ResourceBinder;

  constructor(binder: ResourceBinder) {
    this.binder = binder;
  }

  build(definition: SkeletonDefinition, options: CreatureBuildOptions): CreatureBuildResult {
    const rig = new CreatureRig(definition);
    const meshes: Mesh[] = [];
    const defaultSegments = clampSegments(options.segments);

    for (let i = 0; i < definition.bones.length; i++) {
      const bone = definition.bones[i] as BoneDefinition;
      const shapes = bone.shapes;
      if (shapes === undefined || shapes.length === 0) continue;

      const joint = rig.joints[i] as Object3D;
      for (let s = 0; s < shapes.length; s++) {
        const shape = shapes[s] as BoneShape;
        const mesh = this.createShape(shape, options, defaultSegments);
        mesh.name = `${bone.name}:${shape.kind}${s}`;
        joint.add(mesh);
        meshes.push(mesh);
      }
    }

    return { rig, meshes };
  }

  private createShape(
    shape: BoneShape,
    options: CreatureBuildOptions,
    defaultSegments: number,
  ): Mesh {
    const segments = clampSegments(shape.segments ?? defaultSegments);
    const geometry = this.acquireShapeGeometry(shape, segments);
    const color = resolveColor(options.palette, shape.color);

    const material = this.binder.material({ color, flatShading: options.flatShading });
    const mesh = new Mesh(geometry, material);

    const offset = shape.offset;
    if (offset !== undefined) mesh.position.set(offset[0], offset[1], offset[2]);

    const rotation = shape.rotation;
    if (rotation !== undefined) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);

    mesh.castShadow = options.castShadow;
    mesh.receiveShadow = options.receiveShadow;
    return mesh;
  }

  private acquireShapeGeometry(shape: BoneShape, segments: number): BufferGeometry {
    const [a, b, c] = shape.size;
    const taperBottom = shape.taper?.[0] ?? 1;
    const taperTop = shape.taper?.[1] ?? 1;

    switch (shape.kind) {
      case 'box': {
        const key = `cr:box|${keyNum(a)}|${keyNum(b)}|${keyNum(c)}|${keyNum(taperBottom)}|${keyNum(taperTop)}`;
        return this.binder.geometry(key, () => {
          const geometry = new BoxGeometry(a, b, c);
          if (taperBottom !== 1 || taperTop !== 1) {
            taperGeometry(geometry, 'y', taperBottom, taperTop);
          }
          return geometry;
        });
      }

      case 'cylinder': {
        const key = `cr:cyl|${keyNum(a)}|${keyNum(b)}|${keyNum(c)}|${segments}|${keyNum(taperBottom)}|${keyNum(taperTop)}`;
        return this.binder.geometry(key, () => {
          const geometry = new CylinderGeometry(a, b, c, segments, 1, false);
          if (taperBottom !== 1 || taperTop !== 1) {
            taperGeometry(geometry, 'y', taperBottom, taperTop);
          }
          return geometry;
        });
      }

      case 'sphere': {
        // Height segments are halved: a low-poly sphere reads better with more
        // longitude than latitude, and it keeps the triangle count down.
        const heightSegments = Math.max(2, Math.round(segments * 0.5));
        const key = `cr:sph|${keyNum(a)}|${segments}|${heightSegments}`;
        return this.binder.geometry(
          key,
          () => new SphereGeometry(a, segments, heightSegments),
        );
      }

      case 'cone': {
        const key = `cr:cone|${keyNum(a)}|${keyNum(b)}|${segments}`;
        return this.binder.geometry(key, () => new ConeGeometry(a, b, segments, 1, false));
      }
    }
  }
}

/** Resolves a palette role to a packed colour. */
export function resolveColor(palette: CreaturePalette, role: PaletteRole): number {
  return palette[role];
}

function clampSegments(value: number): number {
  const rounded = Math.round(value);
  return rounded < 3 ? 3 : rounded > 32 ? 32 : rounded;
}

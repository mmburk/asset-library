import type { BoneDefinition, BoneShape, PaletteRole, SocketDefinition } from '../types';

/**
 * Terse constructors for skeleton data.
 *
 * Skeletons are authored as code rather than JSON so mirrored limbs, repeated
 * tail segments and radial arrangements can be computed instead of copy-pasted.
 * These helpers keep the resulting definitions readable.
 */

/** Optional per-shape modifiers. */
export interface ShapeExtras {
  rotation?: readonly [number, number, number];
  taper?: readonly [number, number];
  segments?: number;
}

const ORIGIN: readonly [number, number, number] = [0, 0, 0];

/** A box: `[width, height, depth]`. */
export function box(
  size: readonly [number, number, number],
  color: PaletteRole,
  offset: readonly [number, number, number] = ORIGIN,
  extras?: ShapeExtras,
): BoneShape {
  return { kind: 'box', size, color, offset, ...extras };
}

/** A cylinder: `[radiusTop, radiusBottom, height]`. */
export function cyl(
  size: readonly [number, number, number],
  color: PaletteRole,
  offset: readonly [number, number, number] = ORIGIN,
  extras?: ShapeExtras,
): BoneShape {
  return { kind: 'cylinder', size, color, offset, ...extras };
}

/** A sphere of the given radius. */
export function sphere(
  radius: number,
  color: PaletteRole,
  offset: readonly [number, number, number] = ORIGIN,
  extras?: ShapeExtras,
): BoneShape {
  return { kind: 'sphere', size: [radius, 0, 0], color, offset, ...extras };
}

/** A cone: `[radius, height]`. Points up `+Y` unless rotated. */
export function cone(
  radius: number,
  height: number,
  color: PaletteRole,
  offset: readonly [number, number, number] = ORIGIN,
  extras?: ShapeExtras,
): BoneShape {
  return { kind: 'cone', size: [radius, height, 0], color, offset, ...extras };
}

/** A bone declaration. */
export function bone(
  name: string,
  parent: string | null,
  position: readonly [number, number, number],
  shapes?: readonly BoneShape[],
  rotation?: readonly [number, number, number],
): BoneDefinition {
  return rotation === undefined
    ? { name, parent, position, shapes }
    : { name, parent, position, rotation, shapes };
}

/** A socket declaration. */
export function socket(
  name: string,
  boneName: string,
  position: readonly [number, number, number],
  rotation?: readonly [number, number, number],
): SocketDefinition {
  return rotation === undefined
    ? { name, bone: boneName, position }
    : { name, bone: boneName, position, rotation };
}

/**
 * A pair of eyes on a face plane.
 * @param spread Half-distance between the eyes on X.
 */
export function eyes(
  spread: number,
  height: number,
  depth: number,
  size: number,
  color: PaletteRole = 'eye',
): BoneShape[] {
  return [
    box([size, size, size * 0.6], color, [spread, height, depth]),
    box([size, size, size * 0.6], color, [-spread, height, depth]),
  ];
}

/**
 * A row of downward-pointing teeth.
 * @param count Teeth per side of the centre line.
 */
export function teeth(
  count: number,
  spread: number,
  height: number,
  startDepth: number,
  spacing: number,
  size: number,
  color: PaletteRole = 'detail',
): BoneShape[] {
  const shapes: BoneShape[] = [];
  const flipDown: readonly [number, number, number] = [Math.PI, 0, 0];
  for (let i = 0; i < count; i++) {
    const z = startDepth - i * spacing;
    shapes.push(cone(size, size * 2.4, color, [spread, height, z], { rotation: flipDown, segments: 4 }));
    shapes.push(cone(size, size * 2.4, color, [-spread, height, z], { rotation: flipDown, segments: 4 }));
  }
  return shapes;
}

/**
 * Builds a three-segment limb chain (`Upper`, `Lower`, and a tip bone).
 *
 * Every legged plan in this library uses the same three-bone layout, so the
 * animators can address any leg by prefix without knowing which creature it
 * belongs to.
 */
export function legChain(
  prefix: string,
  parent: string,
  attach: readonly [number, number, number],
  upperLength: number,
  lowerLength: number,
  upperShapes: readonly BoneShape[],
  lowerShapes: readonly BoneShape[],
  tipName: string,
  tipShapes: readonly BoneShape[],
  rootRotation?: readonly [number, number, number],
): BoneDefinition[] {
  return [
    bone(`${prefix}Upper`, parent, attach, upperShapes, rootRotation),
    bone(`${prefix}Lower`, `${prefix}Upper`, [0, -upperLength, 0], lowerShapes),
    bone(`${prefix}${tipName}`, `${prefix}Lower`, [0, -lowerLength, 0], tipShapes),
  ];
}

/**
 * Radially arranged propeller blades, spinning about Z.
 *
 * Each blade is offset along a rotated radius rather than being modelled in
 * place, so all blades — and every propeller in the scene, single- or
 * multi-engine — share one cached box geometry.
 */
export function propellerBlades(
  count: number,
  radius: number,
  length: number,
  width: number,
  color: PaletteRole = 'metal',
): BoneShape[] {
  const shapes: BoneShape[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    shapes.push(
      box([width, length, 0.014], color, [-Math.sin(angle) * radius, Math.cos(angle) * radius, 0.02], {
        rotation: [0, 0, angle],
        taper: [1, 0.6],
      }),
    );
  }
  return shapes;
}

/** Mirrors an `[x, y, z]` triple across the YZ plane. */
export function mirrorX(
  position: readonly [number, number, number],
): readonly [number, number, number] {
  return [-position[0], position[1], position[2]];
}

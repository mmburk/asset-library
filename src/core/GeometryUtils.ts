import {
  BufferAttribute,
  BufferGeometry,
  Line,
  Mesh,
  Object3D,
  Points,
  type Material,
  type Matrix4,
} from 'three';
import type { Rng } from './Rng';

/** Axis selector used by the deformation helpers. */
export type Axis = 'x' | 'y' | 'z';

const AXIS_INDEX: Readonly<Record<Axis, number>> = { x: 0, y: 1, z: 2 };

/** Returns the two component indices that are *not* `axis`. */
function otherAxisIndices(axis: Axis): readonly [number, number] {
  switch (axis) {
    case 'x':
      return [1, 2];
    case 'y':
      return [0, 2];
    case 'z':
      return [0, 1];
  }
}

/**
 * Narrows a geometry attribute to a plain {@link BufferAttribute}.
 * Interleaved attributes are rejected because the merge and deform paths below
 * assume tightly packed arrays.
 */
function asBufferAttribute(
  geometry: BufferGeometry,
  name: string,
  context: string,
): BufferAttribute {
  const attribute = geometry.getAttribute(name);
  if (attribute === undefined) {
    throw new Error(`${context}: geometry is missing the "${name}" attribute.`);
  }
  if (!(attribute instanceof BufferAttribute)) {
    throw new Error(`${context}: interleaved attribute "${name}" is not supported.`);
  }
  return attribute;
}

/**
 * Converts a geometry to flat (faceted) shading in place-ish.
 *
 * Faceted shading needs one normal per face, which means vertices cannot be
 * shared — so the geometry is de-indexed first. This returns a *new* geometry
 * when the input was indexed; the caller owns disposing the original.
 */
export function toFaceted(geometry: BufferGeometry): BufferGeometry {
  const result = geometry.index !== null ? geometry.toNonIndexed() : geometry;
  result.computeVertexNormals();
  return result;
}

/**
 * Writes a single flat colour into the geometry's `color` attribute, creating
 * it when absent. Lets many parts share one `vertexColors` material instead of
 * one material per colour.
 */
export function applyVertexColor(geometry: BufferGeometry, hex: number): BufferGeometry {
  const position = asBufferAttribute(geometry, 'position', 'applyVertexColor');
  const count = position.count;

  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;

  let color = geometry.getAttribute('color');
  if (color === undefined || !(color instanceof BufferAttribute) || color.count !== count) {
    color = new BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', color);
  }

  const array = color.array as Float32Array;
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    array[o] = r;
    array[o + 1] = g;
    array[o + 2] = b;
  }
  color.needsUpdate = true;
  return geometry;
}

/**
 * Scales the cross-section of a geometry along `axis`, linearly interpolating
 * from `startScale` at the minimum end to `endScale` at the maximum end.
 *
 * This is how every limb, trunk and tower in this library gets its silhouette:
 * start from a cylinder or box, then taper it. Mutates and returns `geometry`.
 */
export function taperGeometry(
  geometry: BufferGeometry,
  axis: Axis,
  startScale: number,
  endScale: number,
): BufferGeometry {
  const position = asBufferAttribute(geometry, 'position', 'taperGeometry');
  const axisIndex = AXIS_INDEX[axis];
  const [a, b] = otherAxisIndices(axis);

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return geometry;

  const min = box.min.getComponent(axisIndex);
  const max = box.max.getComponent(axisIndex);
  const range = max - min;
  if (range <= 0) return geometry;

  for (let i = 0; i < position.count; i++) {
    const t = (position.getComponent(i, axisIndex) - min) / range;
    const scale = startScale + (endScale - startScale) * t;
    position.setComponent(i, a, position.getComponent(i, a) * scale);
    position.setComponent(i, b, position.getComponent(i, b) * scale);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Bends a geometry around `axis` — each slice is rotated proportionally to its
 * distance along the axis. Used for curved horns, tails and drooping branches.
 * Mutates and returns `geometry`.
 */
export function bendGeometry(
  geometry: BufferGeometry,
  axis: Axis,
  totalAngle: number,
): BufferGeometry {
  const position = asBufferAttribute(geometry, 'position', 'bendGeometry');
  const axisIndex = AXIS_INDEX[axis];
  const [a, b] = otherAxisIndices(axis);

  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) return geometry;

  const min = box.min.getComponent(axisIndex);
  const max = box.max.getComponent(axisIndex);
  const range = max - min;
  if (range <= 0) return geometry;

  for (let i = 0; i < position.count; i++) {
    const along = position.getComponent(i, axisIndex);
    const t = (along - min) / range;
    const angle = totalAngle * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Rotate the (axis, a) plane so the shape curves towards +a.
    const va = position.getComponent(i, a);
    const offset = along - min;
    position.setComponent(i, axisIndex, min + offset * cos - va * sin);
    position.setComponent(i, a, offset * sin + va * cos);
    // Component `b` is untouched by a rotation in the (axis, a) plane.
    position.setComponent(i, b, position.getComponent(i, b));
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Randomly displaces every vertex, giving primitives an organic, hand-carved
 * silhouette. De-index the geometry first if you want the seams to stay
 * welded — indexed geometries stay watertight, non-indexed ones will crack.
 * Mutates and returns `geometry`.
 */
export function jitterVertices(
  geometry: BufferGeometry,
  amount: number,
  rng: Rng,
): BufferGeometry {
  const position = asBufferAttribute(geometry, 'position', 'jitterVertices');
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(
      i,
      position.getX(i) + rng.spread(amount),
      position.getY(i) + rng.spread(amount),
      position.getZ(i) + rng.spread(amount),
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Applies a transform to a geometry's vertices. Mutates and returns it. */
export function transformGeometry(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  geometry.applyMatrix4(matrix);
  return geometry;
}

/**
 * Merges several geometries into one.
 *
 * Written in-house rather than pulled from `BufferGeometryUtils` so the
 * library keeps a single dependency surface and so the index-width choice
 * (16- vs 32-bit) stays under our control. All inputs must expose the same
 * attribute names with matching item sizes.
 *
 * Mixed indexed / non-indexed input is handled by de-indexing everything —
 * which is what faceted low-poly geometry wants anyway.
 *
 * @param geometries Source geometries. Not modified unless `disposeSources`.
 * @param disposeSources Dispose the inputs once merged.
 */
export function mergeGeometries(
  geometries: readonly BufferGeometry[],
  disposeSources = false,
): BufferGeometry {
  if (geometries.length === 0) {
    throw new Error('mergeGeometries: at least one geometry is required.');
  }
  if (geometries.length === 1) {
    const only = geometries[0] as BufferGeometry;
    const clone = only.clone();
    if (disposeSources) only.dispose();
    return clone;
  }

  let allIndexed = true;
  for (let i = 0; i < geometries.length; i++) {
    if ((geometries[i] as BufferGeometry).index === null) {
      allIndexed = false;
      break;
    }
  }

  // Normalise the inputs; temporaries are disposed before returning.
  const sources: BufferGeometry[] = [];
  const temporaries: BufferGeometry[] = [];
  for (let i = 0; i < geometries.length; i++) {
    const source = geometries[i] as BufferGeometry;
    if (!allIndexed && source.index !== null) {
      const converted = source.toNonIndexed();
      sources.push(converted);
      temporaries.push(converted);
    } else {
      sources.push(source);
    }
  }

  const template = sources[0] as BufferGeometry;
  const names = Object.keys(template.attributes);
  if (names.length === 0) {
    throw new Error('mergeGeometries: the first geometry has no attributes.');
  }

  // Validate up front so a mismatch fails loudly instead of producing garbage.
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i] as BufferGeometry;
    const sourceNames = Object.keys(source.attributes);
    if (sourceNames.length !== names.length) {
      throw new Error(
        `mergeGeometries: geometry ${i} has ${sourceNames.length} attributes, expected ${names.length}.`,
      );
    }
    for (const name of names) {
      const attribute = asBufferAttribute(source, name, 'mergeGeometries');
      const reference = asBufferAttribute(template, name, 'mergeGeometries');
      if (attribute.itemSize !== reference.itemSize) {
        throw new Error(
          `mergeGeometries: attribute "${name}" has itemSize ${attribute.itemSize} on geometry ${i}, expected ${reference.itemSize}.`,
        );
      }
    }
  }

  const merged = new BufferGeometry();

  for (const name of names) {
    const reference = asBufferAttribute(template, name, 'mergeGeometries');
    const itemSize = reference.itemSize;

    let totalCount = 0;
    for (let i = 0; i < sources.length; i++) {
      totalCount += asBufferAttribute(sources[i] as BufferGeometry, name, 'mergeGeometries').count;
    }

    const target = new Float32Array(totalCount * itemSize);
    let offset = 0;
    for (let i = 0; i < sources.length; i++) {
      const attribute = asBufferAttribute(sources[i] as BufferGeometry, name, 'mergeGeometries');
      const array = attribute.array;
      const length = attribute.count * itemSize;
      for (let j = 0; j < length; j++) {
        target[offset + j] = array[j] as number;
      }
      offset += length;
    }

    merged.setAttribute(name, new BufferAttribute(target, itemSize, reference.normalized));
  }

  if (allIndexed) {
    let indexCount = 0;
    for (let i = 0; i < sources.length; i++) {
      indexCount += ((sources[i] as BufferGeometry).index as BufferAttribute).count;
    }
    const vertexTotal = (merged.getAttribute('position') as BufferAttribute).count;
    const indexArray =
      vertexTotal > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

    let indexOffset = 0;
    let vertexOffset = 0;
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i] as BufferGeometry;
      const index = source.index as BufferAttribute;
      for (let j = 0; j < index.count; j++) {
        indexArray[indexOffset + j] = index.getX(j) + vertexOffset;
      }
      indexOffset += index.count;
      vertexOffset += asBufferAttribute(source, 'position', 'mergeGeometries').count;
    }
    merged.setIndex(new BufferAttribute(indexArray, 1));
  }

  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  for (let i = 0; i < temporaries.length; i++) {
    (temporaries[i] as BufferGeometry).dispose();
  }
  if (disposeSources) {
    for (let i = 0; i < geometries.length; i++) {
      (geometries[i] as BufferGeometry).dispose();
    }
  }

  return merged;
}

/** Options for {@link disposeObject3D}. */
export interface DisposeObjectOptions {
  /** Geometries owned by a cache — skipped so shared resources survive. */
  skipGeometries?: ReadonlySet<BufferGeometry>;
  /** Materials owned by a cache — skipped so shared resources survive. */
  skipMaterials?: ReadonlySet<Material>;
  /** Detach `root` from its parent as well. Defaults to `true`. */
  removeFromParent?: boolean;
}

/**
 * Recursively frees the GPU resources under `root`.
 *
 * Anything registered in the skip sets is left alone — that is how cached,
 * reference-counted resources stay alive while a single instance is torn down.
 */
export function disposeObject3D(root: Object3D, options: DisposeObjectOptions = {}): void {
  const skipGeometries = options.skipGeometries;
  const skipMaterials = options.skipMaterials;

  root.traverse((child) => {
    if (child instanceof Mesh || child instanceof Line || child instanceof Points) {
      const geometry = child.geometry as BufferGeometry | undefined;
      if (geometry !== undefined && skipGeometries?.has(geometry) !== true) {
        geometry.dispose();
      }

      const material = child.material as Material | Material[] | undefined;
      if (Array.isArray(material)) {
        for (let i = 0; i < material.length; i++) {
          const entry = material[i] as Material;
          if (skipMaterials?.has(entry) !== true) entry.dispose();
        }
      } else if (material !== undefined && skipMaterials?.has(material) !== true) {
        material.dispose();
      }
    }
  });

  root.clear();
  if (options.removeFromParent !== false) {
    root.removeFromParent();
  }
}

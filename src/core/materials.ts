import {
  DataTexture,
  FrontSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type Side,
} from 'three';
import { keyBool, keyNum, type MaterialCache } from './ResourceCache';

/**
 * Shared material factories.
 *
 * Every helper routes through a {@link MaterialCache}, so requesting "flat
 * lambert, 0x8f3b3b" a thousand times yields one material and one shader
 * program. Colour is part of the cache key; nothing here mutates an existing
 * material, because mutating a shared material would repaint every asset using
 * it.
 */

/** Options common to the flat-shaded material helpers. */
export interface FlatMaterialOptions {
  /** Base colour, packed `0xRRGGBB`. */
  color: number;
  /** Faceted shading. Defaults to `true` — that is the low-poly look. */
  flatShading?: boolean;
  /** Read colour from the geometry's `color` attribute instead. */
  vertexColors?: boolean;
  transparent?: boolean;
  /** Only meaningful when `transparent` is `true`. */
  opacity?: number;
  emissive?: number;
  emissiveIntensity?: number;
  side?: Side;
  depthWrite?: boolean;
  /** Render as wireframe — useful for debug views. */
  wireframe?: boolean;
}

interface ResolvedFlatOptions {
  color: number;
  flatShading: boolean;
  vertexColors: boolean;
  transparent: boolean;
  opacity: number;
  emissive: number;
  emissiveIntensity: number;
  side: Side;
  depthWrite: boolean;
  wireframe: boolean;
}

function resolve(options: FlatMaterialOptions): ResolvedFlatOptions {
  return {
    color: options.color,
    flatShading: options.flatShading ?? true,
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    side: options.side ?? FrontSide,
    depthWrite: options.depthWrite ?? true,
    wireframe: options.wireframe ?? false,
  };
}

function buildKey(prefix: string, o: ResolvedFlatOptions): string {
  return [
    prefix,
    o.color.toString(16),
    keyBool(o.flatShading),
    keyBool(o.vertexColors),
    keyBool(o.transparent),
    keyNum(o.opacity),
    o.emissive.toString(16),
    keyNum(o.emissiveIntensity),
    String(o.side),
    keyBool(o.depthWrite),
    keyBool(o.wireframe),
  ].join('|');
}

/**
 * Flat-shaded Lambert material — the workhorse of this library.
 * Cheap, responds to lighting, and its faceted normals sell the low-poly look.
 */
export function acquireFlatMaterial(
  cache: MaterialCache,
  options: FlatMaterialOptions,
): MeshLambertMaterial {
  const o = resolve(options);
  return cache.acquire(buildKey('lambert', o), () => {
    const material = new MeshLambertMaterial({
      color: o.color,
      flatShading: o.flatShading,
      vertexColors: o.vertexColors,
      transparent: o.transparent,
      opacity: o.opacity,
      emissive: o.emissive,
      emissiveIntensity: o.emissiveIntensity,
      side: o.side,
      depthWrite: o.depthWrite,
      wireframe: o.wireframe,
    });
    material.name = `flat-${o.color.toString(16)}`;
    return material;
  });
}

/** Options for the toon-shaded variant. */
export interface ToonMaterialOptions extends FlatMaterialOptions {
  /** Number of hard lighting bands. Minimum 2. Defaults to 3. */
  steps?: number;
}

/**
 * Toon material with a procedurally generated gradient ramp.
 *
 * The ramp is a tiny `DataTexture` built in code — no external image, in line
 * with the library's no-external-asset rule. Ramps are cached per step count.
 */
export function acquireToonMaterial(
  cache: MaterialCache,
  options: ToonMaterialOptions,
): MeshToonMaterial {
  const o = resolve(options);
  const steps = Math.max(2, Math.round(options.steps ?? 3));
  const key = `${buildKey('toon', o)}|steps=${steps}`;
  return cache.acquire(key, () => {
    const material = new MeshToonMaterial({
      color: o.color,
      vertexColors: o.vertexColors,
      transparent: o.transparent,
      opacity: o.opacity,
      emissive: o.emissive,
      emissiveIntensity: o.emissiveIntensity,
      side: o.side,
      depthWrite: o.depthWrite,
      wireframe: o.wireframe,
      gradientMap: getGradientTexture(steps),
    });
    material.name = `toon-${o.color.toString(16)}-${steps}`;
    return material;
  });
}

/** Unlit material — for skies, emissive decals and UI-in-world elements. */
export function acquireUnlitMaterial(
  cache: MaterialCache,
  options: FlatMaterialOptions,
): MeshBasicMaterial {
  const o = resolve(options);
  return cache.acquire(buildKey('basic', o), () => {
    const material = new MeshBasicMaterial({
      color: o.color,
      vertexColors: o.vertexColors,
      transparent: o.transparent,
      opacity: o.opacity,
      side: o.side,
      depthWrite: o.depthWrite,
      wireframe: o.wireframe,
    });
    material.name = `unlit-${o.color.toString(16)}`;
    return material;
  });
}

const gradientTextures = new Map<number, DataTexture>();

/**
 * Returns a cached `steps`-band gradient ramp, building it on first use.
 * These live for the process lifetime; call {@link disposeGradientTextures}
 * during a full teardown.
 */
export function getGradientTexture(steps: number): DataTexture {
  const count = Math.max(2, Math.round(steps));
  const existing = gradientTextures.get(count);
  if (existing !== undefined) return existing;

  const data = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = Math.round((i / (count - 1)) * 255);
  }
  const texture = new DataTexture(data, count, 1, RedFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.name = `toon-ramp-${count}`;
  gradientTextures.set(count, texture);
  return texture;
}

/** Frees every cached toon ramp. */
export function disposeGradientTextures(): void {
  for (const texture of gradientTextures.values()) {
    texture.dispose();
  }
  gradientTextures.clear();
}

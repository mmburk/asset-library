import type { Rng } from './Rng';

/**
 * Colour handling for the low-poly look.
 *
 * All colours are plain packed `0xRRGGBB` numbers rather than `THREE.Color`
 * instances, so palettes cost nothing to hold and mixing never allocates.
 */

/** A named list of packed RGB colours. */
export interface PaletteDefinition {
  readonly name: string;
  readonly colors: readonly number[];
}

/** Multiplies a colour's channels by `factor`. `<1` darkens, `>1` brightens. */
export function shadeColor(hex: number, factor: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

/** Linearly blends two packed colours. `t = 0` returns `a`, `t = 1` returns `b`. */
export function mixColor(a: number, b: number, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * clamped);
  const g = Math.round(ag + (bg - ag) * clamped);
  const bl = Math.round(ab + (bb - ab) * clamped);
  return (r << 16) | (g << 8) | bl;
}

/** Packs three `[0, 255]` channels into a single colour. */
export function packColor(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * Builds a colour from HSL, all inputs in `[0, 1]`.
 * Handy for generating whole palettes from one hue.
 */
export function hslColor(hue: number, saturation: number, lightness: number): number {
  const h = hue - Math.floor(hue);
  const s = saturation < 0 ? 0 : saturation > 1 ? 1 : saturation;
  const l = lightness < 0 ? 0 : lightness > 1 ? 1 : lightness;

  if (s === 0) {
    const v = Math.round(l * 255);
    return packColor(v, v, v);
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return packColor(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

/** Picks a colour from a palette using the supplied generator. */
export function pickColor(rng: Rng, palette: readonly number[]): number {
  return rng.pick(palette);
}

/**
 * Picks a colour and nudges its brightness, so two characters sharing a
 * palette entry still read as distinct individuals.
 */
export function pickShadedColor(rng: Rng, palette: readonly number[], variance = 0.12): number {
  return shadeColor(rng.pick(palette), 1 + rng.spread(variance));
}

export const SKIN_TONES: readonly number[] = [
  0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3317, 0xffe0bd, 0xd8a170,
];

export const FANTASY_SKIN_TONES: readonly number[] = [
  0x7fa650, 0x5d8a3a, 0x9ab973, 0x8b8b9e, 0xb0c4de, 0xd9d0c1, 0xa8574f, 0x6b4f8a,
];

export const HAIR_COLORS: readonly number[] = [
  0x1c1410, 0x3b2416, 0x5a3a22, 0x8b5a2b, 0xc19a6b, 0xe6cba8, 0x8c8c8c, 0xe8e8e8,
  0x7a2f1d, 0x2f3b52,
];

export const EYE_COLORS: readonly number[] = [
  0x3b2416, 0x2e5a88, 0x3f7a4a, 0x5a5a5a, 0x7a5230, 0x1c1410,
];

export const CLOTH_COLORS: readonly number[] = [
  0x8f3b3b, 0x3b5f8f, 0x4a7a4a, 0xb8873b, 0x6b4a8f, 0x3f3f4a, 0xb5a288, 0x2f6b6b,
  0xa8562f, 0x5a6b3b,
];

export const LEATHER_COLORS: readonly number[] = [
  0x6b4423, 0x8b5a2b, 0x4a2f1a, 0x9c7248, 0x5c3a20,
];

export const METAL_COLORS: readonly number[] = [
  0x9aa3ad, 0xb8bec7, 0x6e757d, 0xc8a951, 0x8a6b3d, 0x4a5058,
];

export const WOOD_COLORS: readonly number[] = [
  0x6b4a2f, 0x8a6240, 0x4f3524, 0xa07b52, 0x3d2a1c,
];

export const FOLIAGE_COLORS: readonly number[] = [
  0x3f6b32, 0x4f7d3a, 0x2f5528, 0x6b8f3f, 0x587a40, 0x35603a,
];

export const ROCK_COLORS: readonly number[] = [
  0x7d7f82, 0x63666a, 0x8f9296, 0x55585c, 0x9ba0a5,
];

/** Every built-in palette, addressable by name. */
export const PALETTES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  skin: SKIN_TONES,
  fantasySkin: FANTASY_SKIN_TONES,
  hair: HAIR_COLORS,
  eye: EYE_COLORS,
  cloth: CLOTH_COLORS,
  leather: LEATHER_COLORS,
  metal: METAL_COLORS,
  wood: WOOD_COLORS,
  foliage: FOLIAGE_COLORS,
  rock: ROCK_COLORS,
});

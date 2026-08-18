/**
 * Equipment type surface.
 *
 * The problem this module exists to solve: most of the creatures in this
 * library have no hands. A shark walks on three legs, a crocodile is half
 * aircraft, a cow is a planet — none of them have an arm to put a rifle in, and
 * modelling one onto every skeleton would change what the creature *is*.
 *
 * So the hand is not part of the creature. It is part of the *act of holding*:
 * a ghost forearm fades in when a weapon is equipped, holds it, and fades out
 * when the weapon is taken away. Creatures that do have hands are left alone —
 * they just get the weapon.
 */

/** Which side a hand belongs to. Mirrors the thumb, nothing else. */
export type Handedness = 'left' | 'right';

/**
 * How a weapon is held.
 *
 * A handless creature always conjures a *pair* of hands — one hand on its own
 * reads as a missing limb. This only decides what the off hand does with
 * itself: `'two-handed'` parents it to the weapon at
 * {@link EquipOptions.supportOffset} so it rides the fore-grip, `'one-handed'`
 * leaves it floating free at its own socket.
 */
export type GripStyle = 'one-handed' | 'two-handed';

/** Look and behaviour of a single ghost hand. */
export interface GhostHandOptions {
  /** Which side. Only affects which way the thumb points. */
  handedness: Handedness;
  /** Body colour, packed `0xRRGGBB`. */
  color: number;
  /** Wrist cuff and knuckle colour. */
  detailColor: number;
  emissive: number;
  emissiveIntensity: number;
  /** Opacity at full materialisation. */
  opacity: number;
  /**
   * Uniform size, where `1` is a hand for a 1.8-unit humanoid. The hand hangs
   * inside the rig, so this is measured against the skeleton's *authored*
   * height, not its final scaled height.
   */
  scale: number;
  flatShading: boolean;
  castShadow: boolean;
  /** Seconds to materialise. */
  fadeInSeconds: number;
  /** Seconds to dissolve. */
  fadeOutSeconds: number;
  /** Idle float, in local units. `0` disables it. */
  bobAmount: number;
  /** Idle float rate, in cycles per second. */
  bobRate: number;
  /** Loose motes trailing off the cut end of the forearm. */
  motes: boolean;
}

/** Defaults for {@link GhostHandOptions}. */
export const DEFAULT_GHOST_HAND: Readonly<GhostHandOptions> = Object.freeze({
  handedness: 'right' as Handedness,
  // Pale cyan rather than white: white reads as a solid glove once the emissive
  // lifts it, and the point is that this hand is not made of anything.
  color: 0x9fd8ff,
  detailColor: 0xdcf3ff,
  emissive: 0x3a7fb8,
  emissiveIntensity: 0.9,
  // Solid enough to read as a hand at a glance, thin enough that the world
  // shows through it. Below about 0.7 the fingers stop being legible.
  opacity: 0.78,
  scale: 1,
  flatShading: true,
  castShadow: false,
  fadeInSeconds: 0.16,
  fadeOutSeconds: 0.12,
  bobAmount: 0.012,
  bobRate: 0.85,
  motes: true,
});

/** Height a ghost hand is authored against. */
export const GHOST_HAND_REFERENCE_HEIGHT = 1.8;

/**
 * Socket names the holder looks for, in order.
 *
 * A skeleton that declares `handL` / `handR` has real hands and never gets a
 * ghost. `ghostHandL` / `ghostHandR` is where a handless skeleton wants its
 * conjured hands to float; without them the holder derives a placement from the
 * creature's own bounds, so an unknown skeleton still works.
 */
export const REAL_HAND_SOCKETS: Readonly<Record<Handedness, string>> = Object.freeze({
  left: 'handL',
  right: 'handR',
});

/** Socket names for conjured hands. */
export const GHOST_HAND_SOCKETS: Readonly<Record<Handedness, string>> = Object.freeze({
  left: 'ghostHandL',
  right: 'ghostHandR',
});

/**
 * Where a weapon's cutting part is, in the weapon's own space.
 *
 * Published by a weapon on `object.userData[BLADE_USER_DATA_KEY]` so that
 * {@link BladeSweep} can sweep the edge and nothing else. A weapon that does not
 * publish one still works — the sweep measures the object instead — but its hit
 * box then includes the handle, and the fist holding it.
 */
export interface BladeExtent {
  /** Start of the cutting part, `[x, y, z]`. */
  readonly start: readonly [number, number, number];
  /** The tip. */
  readonly end: readonly [number, number, number];
  /** How far from the line still counts as a hit. */
  readonly radius: number;
}

/** `userData` key a weapon publishes its {@link BladeExtent} under. */
export const BLADE_USER_DATA_KEY = 'blade';

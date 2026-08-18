import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cyl, mirrorX, socket, sphere } from './helpers';

/** World-space height of the ankle pivot. Every boot shape is placed off it. */
const ANKLE_Y = 0.17;

/** World-space height of the hip pivot, which is also the underside of the fridge. */
const HIP_Y = 0.5;

/** Tilt of each neck segment away from vertical, base to crown. Negative leans back. */
const NECK_TILTS = [-0.1, 0.06, 0.26, 0.48] as const;

/** Length of one neck segment. */
const NECK_SEGMENT = 0.12;

const HALF_PI = Math.PI * 0.5;

/**
 * A tapering snout part, described along its own axis.
 *
 * `taper` in this library scales a cross-section along the shape's local Y, so
 * anything that has to narrow from root to tip must be authored with its
 * *length* on Y and then rotated into place. That makes the useful description
 * of a snout an axis rather than a box: where it starts, how far it tips down
 * from horizontal, and how long it is. {@link along} and {@link pitchRotation}
 * turn that back into the offset and rotation a shape wants.
 */
interface Wedge {
  /** Where the wedge starts, in the owning bone's space. */
  readonly root: readonly [number, number, number];
  /** Radians below horizontal. */
  readonly pitch: number;
  readonly length: number;
}

/** The muzzle axis: down and forward off the brow. */
const MUZZLE: Wedge = { root: [0, 0.02, 0.06], pitch: 0.3, length: 0.3 };

/** The jaw axis. Shallower than the muzzle, so the two meet at the lip. */
const JAW: Wedge = { root: [0, 0.01, 0], pitch: 0.22, length: 0.26 };

/** A point a fraction `t` along a wedge. */
function along(wedge: Wedge, t: number): readonly [number, number, number] {
  const distance = wedge.length * t;
  return [
    wedge.root[0],
    wedge.root[1] - Math.sin(wedge.pitch) * distance,
    wedge.root[2] + Math.cos(wedge.pitch) * distance,
  ];
}

/** Raises a point perpendicular to a wedge's axis, toward its upper face. */
function lift(
  point: readonly [number, number, number],
  wedge: Wedge,
  distance: number,
): readonly [number, number, number] {
  return [
    point[0],
    point[1] + Math.cos(wedge.pitch) * distance,
    point[2] + Math.sin(wedge.pitch) * distance,
  ];
}

/** The rotation that swings a wedge's local `+Y` onto its axis. */
function pitchRotation(wedge: Wedge): readonly [number, number, number] {
  return [HALF_PI + wedge.pitch, 0, 0];
}

/**
 * Frigo Camelo — a camel's head and neck growing out of a refrigerator, on a
 * pair of work boots.
 *
 * Modelled from the reference image. Three things carry the joke and are built
 * deliberately:
 *
 * 1. **The fridge is the whole torso.** Not a fridge worn on the back, not a
 *    fridge carried — the animal's body has been replaced by a two-door
 *    refrigerator, and the neck grows straight out of its top panel. So the
 *    appliance detailing (door split, handles, hinges, base grille) is the
 *    body's surface treatment, and there is no camel torso underneath it at all.
 * 2. **Three masses, not one body with trimmings.** Head, fridge and boots each
 *    have to hold their own against the other two: the reference reads at
 *    thumbnail size because the boots are nearly as wide as the appliance and
 *    the skull is wider than the neck that carries it. Sized anatomically —
 *    a camel's real head on a camel's real foot — the fridge swallows both and
 *    the silhouette turns into a box on sticks.
 * 3. **The camel is calm.** Heavy brow, hooded eye, closed mouth, muzzle
 *    stepping down and forward. The absurdity is entirely in the body; giving
 *    the head an expression to match would be one joke too many.
 *
 * The fridge lives on a single bone, unbroken, for the same reason Tung Tung's
 * log does: it is one rigid box, and any real torso flex would crease it. The
 * recipe damps `torsoLean` and `torsoCounterRotate` to match, and leans on the
 * neck — which the biped animator never touches — to carry the character.
 */
export function createFrigoSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Hips --------------------------------------------------------------
    // Low, and inside the base of the fridge: the appliance's underside is the
    // pelvis, and everything below it is boot.
    bone('hips', null, [0, HIP_Y, 0]),

    // --- Fridge ------------------------------------------------------------
    // The whole appliance, on one bone.
    bone('spine', 'hips', [0, 0, 0], [
      // Carcass, in the greyest colour on the model. The doors are laid over it
      // in near-white and read as doors only because of that difference — with
      // both at enamel white the front face goes completely flat under flat
      // shading, which is how the first pass of this looked.
      box([0.6, 0.64, 0.54], 'secondary', [0, 0.32, 0]),

      // Freezer above, fridge below, with a dark shadow gap between them. Laid
      // on the front face rather than inset: an inset panel on a faceted box
      // loses its edge entirely once the shading is flat.
      box([0.585, 0.205, 0.04], 'detail', [0, 0.515, 0.285]),
      box([0.585, 0.385, 0.04], 'detail', [0, 0.205, 0.285]),
      box([0.58, 0.026, 0.024], 'metal', [0, 0.405, 0.282]),

      // Both handles on the same side, as on a real top-freezer unit, standing
      // proud of the doors. They are what makes the front face readable from an
      // angle, where the flat door panels have nothing to catch the light.
      box([0.036, 0.128, 0.058], 'metal', [-0.225, 0.515, 0.322]),
      box([0.036, 0.2, 0.058], 'metal', [-0.225, 0.3, 0.322]),

      // Hinges down the opposite edge.
      ...hinge(0.6),
      ...hinge(0.435),
      ...hinge(0.365),
      ...hinge(0.04),

      // Base grille, and a cap on top. The cap is not decoration: it is what
      // stops the neck looking like it was pushed through a hole in a flat lid.
      box([0.575, 0.06, 0.52], 'metal', [0, 0.03, 0]),
      box([0.615, 0.03, 0.555], 'metal', [0, 0.652, 0]),
    ]),

    // Empty: the pivot the neck twists against, so the head can turn without
    // the fridge turning with it.
    bone('chest', 'spine', [0, 0.33, 0]),

    // --- Neck --------------------------------------------------------------
    // Out of the rear third of the top panel, which is where a camel's neck
    // leaves the withers. Centred on the panel it reads as a periscope.
    bone('neck', 'chest', [0, 0.38, -0.12], [
      // Collar of hide where the animal meets the enamel, sunk into the top
      // panel. The seam is the one place the two materials touch, and left bare
      // it reads as a modelling mistake rather than as a chimera.
      sphere(0.15, 'primary', [0, 0.02, 0], { segments: 9 }),
      ...neckSegments(),
    ]),

    // --- Head --------------------------------------------------------------
    bone('head', 'neck', neckEnd(), [
      // Skull, wider than the neck it sits on and narrowing toward the jaw.
      box([0.2, 0.19, 0.22], 'primary', [0, 0.035, 0.015], { taper: [0.88, 1] }),

      // Domed forehead between the eyes. Deliberately *not* a brow bar running
      // the full width of the face: at this pitch the muzzle's upper surface
      // arrives at exactly that height, so a bar there continues the snout
      // forward and the head turns into one long shelf. The brow that a camel
      // actually has is a lump over each eye, and it lives in `eye()`.
      box([0.186, 0.052, 0.095], 'primary', [0, 0.125, 0.05], { taper: [1, 0.82] }),

      // Muzzle: one wedge running down and forward off the brow, narrowing to
      // the overhanging upper lip that is most of what makes a camel a camel.
      //
      // Built with its *length* on the box's own Y and then rotated into place,
      // because `taper` only ever scales a cross-section along Y. Laid out the
      // obvious way — length on Z, taper on Y — the snout narrows top to bottom
      // instead of root to tip and the whole face turns into a flat shelf
      // nailed to the skull, which is exactly how the first pass of this read.
      // Its root is sunk well inside the skull so the two never show a seam.
      box([0.15, MUZZLE.length, 0.145], 'primary', along(MUZZLE, 0.5), {
        rotation: pitchRotation(MUZZLE),
        taper: [1, 0.72],
      }),
      box([0.118, 0.078, 0.075], 'primary', lift(along(MUZZLE, 0.97), MUZZLE, -0.012)),
      box([0.022, 0.032, 0.024], 'organic', [0.033, -0.062, 0.371], { rotation: [0, 0, -0.35] }),
      box([0.022, 0.032, 0.024], 'organic', [-0.033, -0.062, 0.371], { rotation: [0, 0, 0.35] }),

      ...eye(1),
      ...eye(-1),

      ...ear(1),
      ...ear(-1),
    ]),

    // Closed at rest — `BipedAnimator` parts it at speed, and a camel that
    // starts with its mouth open has nowhere to go. The jaw is a second wedge
    // on a shallower pitch than the muzzle, so the two converge at the lip
    // exactly the way a closed mouth does.
    bone('jaw', 'head', [0, -0.085, 0.055], [
      box([0.136, JAW.length, 0.1], 'primary', along(JAW, 0.5), {
        rotation: pitchRotation(JAW),
        taper: [1, 0.78],
      }),
      // Mouth line: a dark stripe riding the jaw's upper edge, made wider than
      // both wedges so it shows as a seam on the flanks instead of being buried
      // between them.
      box([0.158, JAW.length * 0.86, 0.02], 'accent', lift(along(JAW, 0.46), JAW, 0.042), {
        rotation: pitchRotation(JAW),
        taper: [1, 0.8],
      }),
      // Chin, closing off the cut end of the wedge. Kept short of the tip: run
      // it all the way out and it juts past the upper lip, which turns a camel
      // into an underbite.
      box([0.09, 0.056, 0.058], 'primary', along(JAW, 0.88)),
    ]),

    // --- Legs --------------------------------------------------------------
    ...leg('L', 1),
    ...leg('R', -1),
  ];

  return {
    name: 'frigo-camelo',
    plan: 'biped',
    nominalHeight: 1.85,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.18, 0.02]),
      socket('jaw', 'jaw', [0, -0.05, 0.2]),
      // On the fridge itself: anything parked here rides the door.
      socket('door', 'spine', [0, 0.32, 0.31]),
      socket('back', 'spine', [0, 0.42, -0.28]),
      socket('fridgeTop', 'spine', [0, 0.67, 0.14]),
      // A refrigerator has no arms. The conjured pair floats outboard of the
      // carcass at door height — the forearm runs back along `-Z` from the
      // wrist, so anything inboard of `x = 0.3` would drive the cut end
      // straight into the appliance.
      socket('ghostHandL', 'spine', [0.46, 0.33, 0.3]),
      socket('ghostHandR', 'spine', mirrorX([0.46, 0.33, 0.3])),
    ],
  };
}

/**
 * Where the neck arc ends, in neck-bone space.
 *
 * Derived rather than written down, so retuning the curve moves the head with
 * it. A hand-measured constant drifts silently the first time a tilt changes,
 * and the only symptom is a head floating off the end of the neck.
 */
function neckEnd(): readonly [number, number, number] {
  let y = 0;
  let z = 0;
  for (let i = 0; i < NECK_TILTS.length; i++) {
    const tilt = NECK_TILTS[i] as number;
    y += Math.cos(tilt) * NECK_SEGMENT;
    z += Math.sin(tilt) * NECK_SEGMENT;
  }
  return [0, y, z];
}

/**
 * The neck, as a chain of tapered cylinders walking along {@link NECK_TILTS}.
 *
 * A camel's neck is an S: it leaves the shoulder leaning back, straightens, and
 * turns forward under the head. Built as one straight tube it reads as a pipe
 * and the whole silhouette collapses. Each segment is placed by stepping along
 * its own axis from the end of the previous one, so the joints stay closed
 * without hand-fitted offsets, and each is overlapped slightly at both ends to
 * hide the seam where two tilts meet.
 */
function neckSegments(): BoneShape[] {
  const radius = [0.14, 0.125, 0.11, 0.095, 0.084];
  const shapes: BoneShape[] = [];
  let y = 0;
  let z = 0;

  for (let i = 0; i < NECK_TILTS.length; i++) {
    const tilt = NECK_TILTS[i] as number;
    const dy = Math.cos(tilt) * NECK_SEGMENT;
    const dz = Math.sin(tilt) * NECK_SEGMENT;
    shapes.push(
      cyl([radius[i + 1] as number, radius[i] as number, NECK_SEGMENT + 0.014], 'primary', [
        0,
        y + dy * 0.5,
        z + dz * 0.5,
      ], { rotation: [tilt, 0, 0], segments: 9 }),
    );
    y += dy;
    z += dz;
  }
  return shapes;
}

/**
 * One eye: a dark ball bulging out of the side of the skull, hooded by lashes.
 *
 * Placed laterally, not on the front face. A camel's eyes are on the sides of
 * its head and barely visible head-on, and pulling them forward so they read
 * better from the front turns the face human.
 */
function eye(side: 1 | -1): BoneShape[] {
  const tilt: readonly [number, number, number] = [0, 0, -side * 0.16];
  return [
    sphere(0.044, 'eye', [side * 0.092, 0.05, 0.078], { segments: 8 }),
    // Hooded lid in hide colour, overhanging the ball. Without it the eye is a
    // black hole punched in the side of the head rather than an eye.
    box([0.088, 0.038, 0.084], 'primary', [side * 0.094, 0.094, 0.076], { rotation: tilt }),
    // Lash line under the lid, on the eye's own footprint. Run any longer in Z
    // and it stops reading as lashes and starts reading as a plank.
    box([0.092, 0.015, 0.088], 'accent', [side * 0.096, 0.073, 0.076], { rotation: tilt }),
  ];
}

/** One ear: a small leaf splayed out and tipped back on the crown. */
function ear(side: 1 | -1): BoneShape[] {
  return [
    box([0.048, 0.062, 0.062], 'primary', [side * 0.086, 0.144, -0.03], {
      rotation: [0.3, 0, -side * 0.5],
      taper: [1, 0.55],
    }),
  ];
}

/** One door hinge, on the edge opposite the handles. */
function hinge(y: number): BoneShape[] {
  return [box([0.024, 0.06, 0.055], 'metal', [0.298, y, 0.25])];
}

/**
 * One leg: a short bare shin ending in a boot.
 *
 * Short on purpose. The reference has almost no visible leg — the boot collars
 * come up to within a finger's width of the fridge — and lengthening the shin
 * to something a walk cycle would flatter turns the creature into a camel
 * wearing a fridge instead of a camel that *is* one.
 */
function leg(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    // Toed out a little. The yaw survives the walk cycle because
    // `BipedAnimator` only ever writes `rotation.x` on a leg.
    bone('upperLeg' + side, 'hips', [sign * 0.155, -0.01, 0], [
      cyl([0.055, 0.064, 0.18], 'primary', [0, -0.085, 0], { segments: 8 }),
    ], [0, sign * 0.1, 0]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -0.17, 0], [
      cyl([0.052, 0.055, 0.15], 'primary', [0, -0.07, 0], { segments: 8 }),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -0.16, 0], boot()),
  ];
}

/**
 * A laced work boot, built as a stack of blocks off the ankle.
 *
 * Every height is derived from {@link ANKLE_Y} so both soles land on `y = 0`
 * exactly: `CreatureAsset` grounds a creature by its lowest vertex, so a sole a
 * hair below the other one tips the entire fridge — and the verification
 * harness, which only checks that the feet are the lowest thing, would pass it.
 *
 * The blocks step outward from heel to toe rather than forming one tapered box,
 * for the same reason the muzzle is stepped: `taper` runs along Y and cannot
 * narrow a shape from heel to toe.
 */
function boot(): BoneShape[] {
  const up = (height: number): number => -ANKLE_Y + height;

  return [
    // Rubber sole, and the pale welt above it. The welt is the only bright line
    // on the boot and it is what separates sole from leather at a distance.
    box([0.235, 0.06, 0.5], 'organic', [0, up(0.03), 0.065]),
    box([0.245, 0.02, 0.492], 'detail', [0, up(0.07), 0.065]),

    // Leather upper: heel counter, midfoot, toe box, cap.
    box([0.225, 0.15, 0.175], 'accent', [0, up(0.155), -0.095]),
    box([0.228, 0.145, 0.19], 'accent', [0, up(0.152), 0.055]),
    box([0.218, 0.12, 0.175], 'accent', [0, up(0.14), 0.215], { taper: [1, 0.82] }),
    box([0.19, 0.075, 0.062], 'accent', [0, up(0.12), 0.275], { taper: [1, 0.7] }),

    // Ankle shaft, flaring at the top into a dark rolled collar.
    box([0.212, 0.185, 0.19], 'accent', [0, up(0.31), -0.04], { taper: [0.98, 1.08] }),
    box([0.232, 0.036, 0.208], 'organic', [0, up(0.42), -0.04]),

    // Tongue, and three laces across it.
    box([0.115, 0.19, 0.035], 'organic', [0, up(0.31), 0.062]),
    ...lace(up(0.24)),
    ...lace(up(0.31)),
    ...lace(up(0.38)),
  ];
}

/** One lace across the tongue. */
function lace(y: number): BoneShape[] {
  return [box([0.135, 0.022, 0.03], 'detail', [0, y, 0.072])];
}

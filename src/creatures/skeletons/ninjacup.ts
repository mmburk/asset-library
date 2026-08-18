import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cyl, socket, sphere } from './helpers';

const HALF_PI = Math.PI * 0.5;

/** World height of the hip pivot, which is also the underside of the cup. */
const CUP_BOTTOM = 0.3;

/** Height of the paper cup itself, lid excluded. */
const CUP_HEIGHT = 0.88;

const CUP_TOP_RADIUS = 0.3;
const CUP_BOTTOM_RADIUS = 0.212;

/**
 * Radial segments on the cup and everything wrapped around it.
 *
 * Higher than the library default of 7. A takeaway cup is a smooth cone of
 * revolution and the whole character *is* that cone — at 7 segments the
 * silhouette reads as a pentagon with a face on it, and the bands wrapped round
 * it stop lining up with the body underneath.
 */
const CUP_SEGMENTS = 16;

/** Top of the cup, where the lid sits. */
const LID_Y = CUP_BOTTOM + CUP_HEIGHT;

/** World height the arms leave the body at — inside the middle sleeve. */
const SHOULDER_Y = 0.62;

/**
 * Ninja Coffee Cup — a takeaway coffee cup that has taken up the sword.
 *
 * Modelled from the reference image. Four things carry the character and are
 * built deliberately:
 *
 * 1. **The cup is the whole body.** Not a cup worn as armour, not a cup carried:
 *    the ninja *is* a paper cup, so everything else — headband, sleeve, limbs —
 *    is wrapped around or hung off a plain tapered cone. Nothing is allowed to
 *    break that cone's silhouette except the lid.
 * 2. **The bands are rings of the body, not decals.** Each black band is a
 *    cylinder that follows the cup's own taper at the height it sits at, so it
 *    grips the cup rather than floating around it. They are derived from
 *    {@link radiusAt} for exactly that reason — retuning the cup's taper moves
 *    every band with it.
 * 3. **The face is two eyes and two brows, and nothing else.** No mouth, no
 *    nose. The reference gets its entire expression from the angle of the brows,
 *    and adding a mouth turns a glaring ninja into a cartoon mascot.
 * 4. **The limbs are pipes.** Thin, black, unarticulated-looking, with blunt
 *    mitts and blunt shoes — the contrast between the heavy body and the spindly
 *    limbs is most of the joke, so the arms are deliberately too thin to swing a
 *    sword and the feet too small to stand on.
 *
 * The cup lives on a single bone, unbroken, for the same reason Tung Tung's log
 * and Frigo's carcass do: it is one rigid shell and any real torso flex would
 * crease it. The lid rides the `head` bone instead, so the character still nods
 * — its skirt hangs well over the cup's rim precisely so the nod never opens a
 * seam.
 */
export function createNinjaCupSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Hips --------------------------------------------------------------
    // At the base of the cup: everything below this is leg.
    bone('hips', null, [0, CUP_BOTTOM, 0]),

    // --- Cup ---------------------------------------------------------------
    // The entire body, on one bone. Local y here is height above the cup's base.
    bone('spine', 'hips', [0, 0, 0], [
      cyl([CUP_TOP_RADIUS, CUP_BOTTOM_RADIUS, CUP_HEIGHT], 'primary', [0, CUP_HEIGHT * 0.5, 0], {
        segments: CUP_SEGMENTS,
      }),

      // Rolled rim at the top and a base disc at the bottom. Both are a hair
      // proud of the cone: a paper cup is not a smooth taper end to end, and
      // these two lips are what say "cup" rather than "traffic cone".
      ...ring(CUP_HEIGHT - 0.018, 0.036, 0.008, 'secondary'),
      ...ring(0.016, 0.032, 0.006, 'secondary'),

      // Three black bands. Bottom trim, the wide sleeve the arms come out of,
      // and the headband at the top. Their heights are what set the spacing of
      // the face: the brows have to clear the headband and the eyes have to
      // clear the sleeve, and at this size a hair of overlap either way reads
      // as one solid black mask rather than as a face.
      ...ring(0.0975, 0.075, 0.007, 'accent'),
      ...ring(0.31, 0.18, 0.009, 'accent'),
      ...ring(0.775, 0.105, 0.009, 'accent'),

      // --- Forehead protector ----------------------------------------------
      // The plate is flat while the cup is round, so it is narrow enough that
      // the chord it cuts stays inside the band. Widening it to the reference's
      // proportions sinks its corners into the body.
      ...plate(0.775),

      // --- Face -------------------------------------------------------------
      // No mouth, no nose. Everything is in the brows.
      ...eye(1),
      ...eye(-1),
      ...brow(1),
      ...brow(-1),
    ]),

    // Empty: the pivot the lid twists and nods against, so the cup itself never
    // has to move.
    bone('chest', 'spine', [0, 0.55, 0]),

    // --- Lid ---------------------------------------------------------------
    bone('head', 'chest', [0, LID_Y - (CUP_BOTTOM + 0.55), 0], [
      // Skirt, dropped over the cup's rim. The overlap is not cosmetic: the
      // `head` bone nods, and anything less than this opens a gap at the front
      // rim on the way down.
      cyl([0.316, 0.312, 0.06], 'accent', [0, -0.02, 0], { segments: CUP_SEGMENTS }),
      // Domed top, in two steps.
      cyl([0.298, 0.316, 0.05], 'accent', [0, 0.035, 0], { segments: CUP_SEGMENTS }),
      cyl([0.2, 0.27, 0.045], 'accent', [0, 0.078, 0], { segments: CUP_SEGMENTS }),
      // Drinking spout, so the lid reads as a lid from the front.
      box([0.085, 0.028, 0.07], 'accent', [0, 0.05, 0.225], { rotation: [-0.25, 0, 0] }),

      ...topknot(),
      ...ribbon(),
    ]),

    // --- Arms --------------------------------------------------------------
    ...pipeArm('L', 1),
    ...pipeArm('R', -1),

    // --- Legs --------------------------------------------------------------
    ...pipeLeg('L', 1),
    ...pipeLeg('R', -1),
  ];

  return {
    name: 'ninja-coffee',
    plan: 'biped',
    nominalHeight: 1.45,
    bones,
    sockets: [
      // Real hands, so nothing is ever conjured: this creature came with fists.
      socket('handL', 'handL', [0, -0.045, 0], [0.45, 0, 0]),
      socket('handR', 'handR', [0, -0.045, 0], [0.45, 0, 0]),
      socket('head', 'head', [0, 0.11, 0]),
      socket('lid', 'head', [0, 0.1, 0.12]),
      socket('chest', 'spine', [0, 0.55, 0.28]),
      socket('back', 'spine', [0, 0.55, -0.28]),
    ],
  };
}

/**
 * Radius of the cup at a given height above its base.
 *
 * Every band, the plate and both eyes are placed off this rather than off
 * measured constants, so retuning the cup's taper carries all of them with it
 * instead of leaving a ring hanging in the air.
 */
function radiusAt(y: number): number {
  return CUP_BOTTOM_RADIUS + ((CUP_TOP_RADIUS - CUP_BOTTOM_RADIUS) * y) / CUP_HEIGHT;
}

/**
 * A band wrapped round the cup, following the cup's own taper.
 * @param proud How far it stands off the surface.
 */
function ring(
  centerY: number,
  height: number,
  proud: number,
  color: 'accent' | 'secondary',
): BoneShape[] {
  const half = height * 0.5;
  return [
    cyl(
      [radiusAt(centerY + half) + proud, radiusAt(centerY - half) + proud, height],
      color,
      [0, centerY, 0],
      { segments: CUP_SEGMENTS },
    ),
  ];
}

/**
 * The forehead plate and its engraving.
 *
 * The engraving is a spiral with a tail, cut as three short bars rather than
 * drawn: at this size anything finer disappears, and anything rounder needs a
 * primitive the shape system does not have.
 */
function plate(y: number): BoneShape[] {
  const face = radiusAt(y) + 0.014;
  return [
    box([0.185, 0.088, 0.02], 'metal', [0, y, face]),
    // Rivets at both ends, where a real protector is stitched to the cloth.
    cyl([0.012, 0.012, 0.016], 'organic', [0.083, y, face + 0.012], {
      rotation: [HALF_PI, 0, 0],
      segments: 6,
    }),
    cyl([0.012, 0.012, 0.016], 'organic', [-0.083, y, face + 0.012], {
      rotation: [HALF_PI, 0, 0],
      segments: 6,
    }),
    // Spiral: a bar, a hook and a tail leaving to the left.
    box([0.052, 0.011, 0.012], 'organic', [0.004, y + 0.016, face + 0.011]),
    box([0.011, 0.03, 0.012], 'organic', [0.026, y + 0.002, face + 0.011]),
    box([0.046, 0.011, 0.012], 'organic', [-0.03, y - 0.026, face + 0.011], {
      rotation: [0, 0, 0.5],
    }),
  ];
}

/**
 * One eye, laid on the curve of the cup.
 *
 * Placed by chord rather than by eye: the offset along Z is solved from the
 * cup's radius at that height, so the sclera sits *on* the surface at whatever
 * X it is given. Guessing it instead leaves one eye floating and the other
 * sunk, and which one depends on the taper.
 *
 * The yaw turns each eye to face along the surface normal. Without it the two
 * eyes read as a single flat mask stuck on the front of a cylinder.
 */
function eye(side: 1 | -1): BoneShape[] {
  const y = 0.53;
  const x = 0.086;
  const surface = Math.sqrt(radiusAt(y) * radiusAt(y) - x * x);

  // Discs, not boxes. A box eye on a cylinder reads as a sticker at any size,
  // and this face is two eyes and nothing else — there is nowhere for a square
  // eye to hide.
  //
  // The rotation is what turns a cylinder into a disc facing outward along the
  // surface normal: `x = π/2` swings the axis from `+Y` to `+Z`, and because
  // that is the *last* rotation applied, the outward yaw has to be given as `z`
  // — an obvious-looking `y` here does nothing at all, since yawing about `Y`
  // cannot move the `+Y` axis it starts from.
  const facing: readonly [number, number, number] = [HALF_PI, 0, -side * 0.32];

  return [
    cyl([0.09, 0.09, 0.028], 'detail', [side * x, y, surface - 0.004], {
      rotation: facing,
      segments: 12,
    }),
    cyl([0.059, 0.059, 0.028], 'eye', [side * (x + 0.006), y - 0.004, surface + 0.014], {
      rotation: facing,
      segments: 12,
    }),
    // Catchlight, *inside* the pupil. Outside it, at this scale, it stops
    // reading as a highlight and starts reading as a chip out of the eye.
    cyl([0.016, 0.016, 0.02], 'detail', [
      side * (x + 0.026),
      y + 0.024,
      surface + 0.026,
    ], { rotation: facing, segments: 6 }),
  ];
}

/**
 * One brow: a thick bar with its inner end dropped.
 *
 * This is the entire expression. The sign of the roll is what separates furious
 * from surprised, so it is written per side rather than mirrored blindly.
 */
function brow(side: 1 | -1): BoneShape[] {
  const y = 0.668;
  const x = 0.094;
  const surface = Math.sqrt(radiusAt(y) * radiusAt(y) - x * x);
  // The gaps above and below this bar are the whole face, and a rolled box is
  // taller at its corners than its height suggests: at this width, every
  // 0.1 rad of roll eats another 0.006 of clearance at each end.
  return [
    box([0.115, 0.03, 0.032], 'accent', [side * x, y, surface - 0.004], {
      rotation: [0, side * 0.32, side * 0.26],
    }),
  ];
}

/**
 * The knot of the headband, standing up off the back of the lid.
 *
 * Two segments rather than one: a single spike reads as an antenna, and the
 * break is what makes it read as cloth tied in a knot.
 */
function topknot(): BoneShape[] {
  return [
    sphere(0.058, 'accent', [0.05, 0.085, -0.085], { segments: 8 }),
    cyl([0.042, 0.058, 0.15], 'accent', [0.085, 0.16, -0.115], {
      rotation: [-0.3, 0, -0.32],
      segments: 8,
    }),
    cyl([0.016, 0.042, 0.14], 'accent', [0.145, 0.27, -0.155], {
      rotation: [-0.45, 0, -0.62],
      segments: 8,
    }),
  ];
}

/**
 * The trailing end of the headband, flying out to the creature's left.
 *
 * Walked segment by segment along its own direction, the way Frigo's neck is,
 * so the ribbon stays closed at the joints while it curls. The roll passes
 * through a right angle partway along, which is what turns the tail over from
 * streaming upward to falling away — a ribbon that only ever goes up reads as a
 * second knot.
 */
function ribbon(): BoneShape[] {
  const rolls = [-1.1, -1.75, -2.35];
  const pitches = [-0.3, -0.45, -0.6];
  const length = 0.15;
  const shapes: BoneShape[] = [];

  let x = 0.2;
  let y = -0.09;
  let z = -0.175;

  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i] as number;
    const pitch = pitches[i] as number;
    // Where this segment's own +Y points once the Euler is applied.
    const dx = -Math.sin(roll);
    const dy = Math.cos(roll) * Math.cos(pitch);
    const dz = Math.cos(roll) * Math.sin(pitch);

    shapes.push(
      box([0.075, length + 0.02, 0.016], 'accent', [
        x + dx * length * 0.5,
        y + dy * length * 0.5,
        z + dz * length * 0.5,
      ], { rotation: [pitch, 0, roll], taper: [1, 0.9] }),
    );

    x += dx * length;
    y += dy * length;
    z += dz * length;
  }

  return shapes;
}

/**
 * One arm: a black pipe with a blunt mitt on the end.
 *
 * The mitt is a ball rather than a hand because the reference has no fingers —
 * and because a hand modelled at this scale would be four boxes nobody can see,
 * on the one part of the creature that swings fastest.
 */
function pipeArm(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  const attach = radiusAt(SHOULDER_Y - CUP_BOTTOM) - 0.01;

  return [
    // Splayed out from the body. `BipedAnimator` writes `rotation.z` on a
    // shoulder as `rest ± open`, so this survives the walk cycle.
    bone('shoulder' + side, 'chest', [sign * attach, SHOULDER_Y - (CUP_BOTTOM + 0.55), 0], [
      sphere(0.036, 'accent', [0, 0, 0], { segments: 7 }),
    ], [0, 0, sign * 0.28]),

    bone('upperArm' + side, 'shoulder' + side, [0, 0, 0], [
      cyl([0.031, 0.028, 0.19], 'accent', [0, -0.095, 0], { segments: 7 }),
      sphere(0.03, 'accent', [0, -0.19, 0], { segments: 6 }),
    ]),

    bone('lowerArm' + side, 'upperArm' + side, [0, -0.19, 0], [
      cyl([0.028, 0.026, 0.17], 'accent', [0, -0.085, 0], { segments: 7 }),
    ]),

    bone('hand' + side, 'lowerArm' + side, [0, -0.17, 0], [
      sphere(0.052, 'accent', [0, -0.03, 0], { segments: 8 }),
      // Cuff, so the mitt reads as a glove rather than as a knot in the pipe.
      cyl([0.036, 0.033, 0.028], 'organic', [0, 0.008, 0], { segments: 8 }),
    ]),
  ];
}

/**
 * One leg: a black pipe in a blunt shoe.
 *
 * Every height is derived from the ankle so both soles land on `y = 0` exactly.
 * `CreatureAsset` grounds a creature by its lowest vertex, so a sole a hair
 * below its partner tips the whole cup — and the verification harness would
 * still wave it through.
 */
function pipeLeg(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  const ankleY = 0.07;
  const up = (height: number): number => -ankleY + height;

  return [
    // Toed out slightly. The yaw survives the walk cycle because the animator
    // only ever writes `rotation.x` on a leg.
    bone('upperLeg' + side, 'hips', [sign * 0.1, -0.015, 0], [
      cyl([0.033, 0.03, 0.115], 'accent', [0, -0.055, 0], { segments: 7 }),
    ], [0, sign * 0.09, 0]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -0.115, 0], [
      cyl([0.03, 0.028, 0.105], 'accent', [0, -0.05, 0], { segments: 7 }),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -0.1, 0], [
      // Sole, upper and a rounded toe. Split rather than tapered because
      // `taper` scales a cross-section along Y — it can narrow a shoe from the
      // ankle down, but never from heel to toe.
      box([0.105, 0.035, 0.19], 'organic', [0, up(0.0175), 0.035]),
      box([0.098, 0.055, 0.155], 'accent', [0, up(0.052), 0.025], { taper: [1, 0.88] }),
      sphere(0.046, 'accent', [0, up(0.046), 0.105], { segments: 8 }),
    ]),
  ];
}

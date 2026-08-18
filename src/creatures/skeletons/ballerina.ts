import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cyl, mirrorX, socket, sphere } from './helpers';

const HALF_PI = Math.PI * 0.5;
const TAU = Math.PI * 2;

/** World height of the ankle pivot. Every slipper block is placed off it. */
const ANKLE_Y = 0.065;

/** World height of the hip pivot — also where the tutu hangs from. */
const HIP_Y = 0.7;

/** World height of the waist pivot. */
const WAIST_Y = 0.745;

/** World height of the shoulder line. */
const CHEST_Y = 1.02;

/** World height of the base of the neck. */
const NECK_Y = 1.065;

/** World height of the cup's foot: the head bone's pivot. */
const HEAD_Y = 1.16;

/**
 * The cup's wall, as `[height, radius]` from the foot up, in head space.
 *
 * A revolved profile rather than one flared cone, because a cone is a funnel:
 * built as a single frustum this cup came out as a V with a face inside it. What
 * makes it read as china is the change of curvature — tucked in hard at the
 * foot, nearly straight through the middle, flaring again at the lip.
 *
 * The long gentle band between `0.175` and `0.44` is not cosmetic either. It is
 * where the face goes, and its slope is the angle the whole face ends up
 * looking: on a surface of revolution the outward normal tilts *down* by the
 * wall's own slope, so a face on a steeply flaring cup stares at the floor no
 * matter how it is placed. It runs that low because the face needs the room —
 * built with the tuck starting at `0.24`, the eyes and the mouth were squeezed
 * into the top third of the cup with an empty chin below them.
 */
const PROFILE: readonly (readonly [number, number])[] = [
  [0.0, 0.135],
  [0.045, 0.115],
  [0.085, 0.195],
  [0.135, 0.268],
  [0.175, 0.3],
  [0.44, 0.395],
  [0.5, 0.435],
  [0.55, 0.472],
];

/** Height of the wall's lip — the last profile entry. */
const RIM_Y = 0.55;
const RIM_R = 0.472;

/** Height of the crema, which is poured over the rim's cap. */
const COFFEE_Y = 0.573;

/**
 * How much of the wall's slope the face features are allowed to follow.
 *
 * Not all of it. Laid perfectly flush, every feature would tilt down by the
 * wall's 17°, and the rest of that angle has to come out of the head's own
 * backward tilt — which cannot take all of it either, because a cup leaning that
 * far back reads as one about to be poured out. Splitting it three ways (this,
 * {@link HEAD_TILT}, and a face band that is deliberately the flattest part of
 * the wall) is what leaves her looking at whoever is in front of her.
 */
const FACE_PITCH = 0.75;

/** How far the cup leans back, to bring the face level and show the coffee. */
const HEAD_TILT = -0.14;

/**
 * Segments on the cup and everything wrapped around it.
 *
 * Higher than the library default of 7, for the same reason the ninja's cup is:
 * this bowl is the biggest single mass in the silhouette and it is a surface of
 * revolution seen head-on. At 7 it reads as a hexagonal bucket, and the coffee
 * disc stops lining up with the rim it is supposed to sit inside.
 */
const CUP_SEGMENTS = 16;

/**
 * Ballerina Cappuccina — a cappuccino cup dancing on a ballerina's body.
 *
 * Modelled from the reference image. Four things carry the character and are
 * built deliberately:
 *
 * 1. **The cup is the head, and it is enormous.** Wider than it is tall, three
 *    times the width of the shoulders it stands on, and a third of the total
 *    height. The joke is the mismatch between a heavy porcelain bowl and the
 *    delicate body holding it up, so the body is drawn as slender as it will go
 *    and the cup is never scaled down to meet it.
 * 2. **The face is the cup's front, at anime scale.** Two eyes wide enough to
 *    nearly touch, ringed by lashes, over a smile with teeth in it. The
 *    reference has no nose and needs none: the eyes and the smile are the whole
 *    performance.
 * 3. **The cup is a real cup.** A foot to stand on, a handle you could hook a
 *    finger through, crema inside it and a rosetta poured on the crema. Skip any
 *    of those and it stops being a cappuccino and becomes a white bowl with a
 *    face.
 * 4. **The body is a dancer's, at rest in second position.** Arms out and
 *    rounded, legs straight and turned out, tutu flared into petals. The pose
 *    lives on rest rotations the walk cycle adds to rather than overwrites —
 *    `BipedAnimator` writes `rotation.z` on a shoulder as `rest ± open` and
 *    `rotation.x` on an arm as `rest ± swing` — so she keeps her port de bras
 *    while she walks.
 *
 * The cup rides the `head` bone alone, unbroken, the way Tung Tung's log and the
 * ninja's cup do: it is one rigid glazed shell and any real neck flex would
 * crease it. What nods is the whole cup, from a pivot at its foot.
 */
export function createBallerinaSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Hips and tutu -------------------------------------------------------
    bone('hips', null, [0, HIP_Y, 0], [
      // The leotard's lower half. Most of this is buried under the skirt; what
      // shows is the line between the pink and the legs.
      cyl([0.118, 0.128, 0.12], 'accent', [0, -0.03, 0], { segments: 10 }),
      ...tutu(),
    ]),

    // --- Torso ---------------------------------------------------------------
    // A narrow waist widening to the ribs, in two frusta rather than one. One
    // straight cone from hip to shoulder reads as a lampshade; the pinch at the
    // waist is most of what makes the body read as a dancer's.
    bone('spine', 'hips', [0, WAIST_Y - HIP_Y, 0], [
      cyl([0.122, 0.1, 0.15], 'accent', [0, 0.075, 0], { segments: 10 }),
      cyl([0.132, 0.122, 0.105], 'accent', [0, 0.2, 0], { segments: 10 }),
      // The bodice, shaped. Two soft masses rather than a flat panel: without
      // them the pink cylinder reads as a tube and the character loses its
      // waist along with its bust.
      sphere(0.05, 'accent', [0.048, 0.2, 0.075], { segments: 8 }),
      sphere(0.05, 'accent', [-0.048, 0.2, 0.075], { segments: 8 }),
    ]),

    // Bare shoulders and collarbone above the bodice's neckline. Skin, not pink:
    // the neckline is the only thing separating the leotard from the arms, and
    // painting the chest pink swallows both.
    bone('chest', 'spine', [0, CHEST_Y - WAIST_Y, 0], [
      cyl([0.116, 0.134, 0.075], 'secondary', [0, -0.03, 0], { segments: 10 }),
    ]),

    // --- Neck and cup --------------------------------------------------------
    bone('neck', 'chest', [0, NECK_Y - CHEST_Y, 0], [
      cyl([0.056, 0.072, 0.1], 'secondary', [0, 0.05, 0], { segments: 8 }),
    ]),

    bone('head', 'neck', [0, HEAD_Y - NECK_Y, 0], [
      ...cupBody(),
      ...handle(),
      ...coffee(),

      // --- Face -------------------------------------------------------------
      // No nose. The reference has none, and a nose modelled at this scale is a
      // wart between two eyes that are each a quarter of the width of the head.
      ...eye(1),
      ...eye(-1),
      ...brow(1),
      ...brow(-1),
      ...smile(),
      ...blush(1),
      ...blush(-1),
    ], [HEAD_TILT, 0, 0]),

    // --- Arms ----------------------------------------------------------------
    ...arm('L', 1),
    ...arm('R', -1),

    // --- Legs ----------------------------------------------------------------
    ...leg('L', 1),
    ...leg('R', -1),
  ];

  return {
    name: 'ballerina-cappuccina',
    plan: 'biped',
    nominalHeight: 1.8,
    bones,
    sockets: [
      // Real hands: this one came with fingers, so no ghost pair is conjured.
      socket('handL', 'handL', [0, -0.075, 0.01]),
      socket('handR', 'handR', [0, -0.075, 0.01]),
      socket('head', 'head', [0, RIM_Y + 0.06, 0]),
      // On the crema, for anything that wants to float in the coffee.
      socket('cup', 'head', [0, COFFEE_Y + 0.02, 0]),
      socket('handle', 'head', handlePoint(0)),
      socket('chest', 'chest', [0, 0, 0.14]),
      socket('back', 'chest', [0, 0, -0.14]),
      socket('hipL', 'hips', [0.13, 0, 0]),
      socket('hipR', 'hips', mirrorX([0.13, 0, 0])),
    ],
  };
}

// --- The cup ----------------------------------------------------------------

/** The wall's radius at a height, interpolated along {@link PROFILE}. */
function radiusAt(y: number): number {
  const last = PROFILE.length - 1;
  if (y <= (PROFILE[0] as readonly [number, number])[0]) {
    return (PROFILE[0] as readonly [number, number])[1];
  }
  for (let i = 1; i <= last; i++) {
    const [y1, r1] = PROFILE[i] as readonly [number, number];
    if (y > y1) continue;
    const [y0, r0] = PROFILE[i - 1] as readonly [number, number];
    return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return (PROFILE[last] as readonly [number, number])[1];
}

/** How fast the wall widens at a height: `dr/dy`, and so the face's own pitch. */
function slopeAt(y: number): number {
  const last = PROFILE.length - 1;
  for (let i = 1; i <= last; i++) {
    const [y1, r1] = PROFILE[i] as readonly [number, number];
    if (y > y1 && i < last) continue;
    const [y0, r0] = PROFILE[i - 1] as readonly [number, number];
    return (r1 - r0) / (y1 - y0);
  }
  return 0;
}

/**
 * The cup: the profile, revolved as a stack of frusta.
 *
 * Every segment is a cylinder rather than one tapered cone, which costs eight
 * cached buffers and buys the only thing that matters here — the silhouette.
 */
function cupBody(): BoneShape[] {
  const shapes: BoneShape[] = [];

  for (let i = 1; i < PROFILE.length; i++) {
    const [y0, r0] = PROFILE[i - 1] as readonly [number, number];
    const [y1, r1] = PROFILE[i] as readonly [number, number];
    shapes.push(
      cyl([r1, r0, y1 - y0], 'primary', [0, (y0 + y1) * 0.5, 0], { segments: CUP_SEGMENTS }),
    );
  }

  // The rolled lip, standing a hair proud of the wall. Without it the cup ends
  // on a knife edge and reads as pressed paper rather than as glazed china.
  shapes.push(
    cyl([RIM_R + 0.014, RIM_R + 0.004, 0.032], 'primary', [0, RIM_Y + 0.008, 0], {
      segments: CUP_SEGMENTS,
    }),
  );

  return shapes;
}

/**
 * What is in the cup: milk foam, the crema inside it, and a rosetta on top.
 *
 * Stacked *over* the rim rather than sunk into the bowl. Every cylinder here is
 * capped — the shape system has no open tube — so a drink modelled at its true
 * depth is roofed over by the wall's own top face and never seen at all. Filled
 * to the brim, each disc a little narrower and a little higher than the one
 * under it, the rings read as depth from every angle that matters.
 */
function coffee(): BoneShape[] {
  return [
    cyl([RIM_R - 0.022, RIM_R - 0.022, 0.024], 'detail', [0, COFFEE_Y - 0.006, 0], {
      segments: CUP_SEGMENTS,
    }),
    cyl([RIM_R - 0.062, RIM_R - 0.062, 0.024], 'metal', [0, COFFEE_Y, 0], {
      segments: CUP_SEGMENTS,
    }),
    ...rosetta(COFFEE_Y + 0.018),
  ];
}

/**
 * Latte art: a poured stem with leaves fanning off it.
 *
 * Straight bars, because that is what survives. Anything finer than this
 * disappears at the sizes the creature is actually seen at, and anything curved
 * needs a primitive the shape system does not have. Two leaf lengths across four
 * pairs, so the whole rosetta costs four cached buffers.
 */
function rosetta(y: number): BoneShape[] {
  const shapes: BoneShape[] = [
    box([0.034, 0.016, 0.4], 'detail', [0, y, -0.04]),
    // The heart the pour finishes on, at the near edge.
    box([0.1, 0.016, 0.1], 'detail', [0, y, 0.185], { rotation: [0, Math.PI * 0.25, 0] }),
  ];

  // Three pairs, not four. Each bar covers about a tenth of the surface in `z`
  // once it is fanned, so four of them inside the same span close up into one
  // white mass and the rosetta stops having leaves at all.
  const leaves: readonly (readonly [number, number])[] = [
    [0.16, 0.08],
    [0.215, -0.035],
    [0.17, -0.15],
  ];

  for (let i = 0; i < leaves.length; i++) {
    const [length, z] = leaves[i] as readonly [number, number];
    // Placed so the inner end crosses the stem: a leaf that starts beside the
    // pour line reads as a stripe, not as a leaf growing off it.
    const x = length * 0.4;
    shapes.push(box([length, 0.016, 0.04], 'detail', [x, y, z], { rotation: [0, 0.62, 0] }));
    shapes.push(box([length, 0.016, 0.04], 'detail', [-x, y, z], { rotation: [0, -0.62, 0] }));
  }

  return shapes;
}

/** Lower and upper attachment points of the handle, on the creature's right. */
// Sunk into the wall rather than laid against it: tangent to the silhouette, the
// two ends read as floating a hair off the cup from every angle but dead-on.
const HANDLE_LOW: readonly [number, number] = [-radiusAt(0.16) + 0.03, 0.16];
const HANDLE_HIGH: readonly [number, number] = [-radiusAt(0.48) + 0.03, 0.48];

const HANDLE_X = (HANDLE_LOW[0] + HANDLE_HIGH[0]) * 0.5;
const HANDLE_Y = (HANDLE_LOW[1] + HANDLE_HIGH[1]) * 0.5;
const HANDLE_SPAN = Math.hypot(HANDLE_HIGH[0] - HANDLE_LOW[0], HANDLE_HIGH[1] - HANDLE_LOW[1]);
const HANDLE_R = HANDLE_SPAN * 0.5;

/** Unit vector from the lower attachment to the upper one. */
const HANDLE_UX = (HANDLE_HIGH[0] - HANDLE_LOW[0]) / HANDLE_SPAN;
const HANDLE_UY = (HANDLE_HIGH[1] - HANDLE_LOW[1]) / HANDLE_SPAN;

/** Its perpendicular, pointing away from the cup. */
const HANDLE_NX = -HANDLE_UY;
const HANDLE_NY = HANDLE_UX;

/**
 * How far round the cup the handle sits, from the widest point toward the back.
 *
 * A cup's handle belongs on its side, which on a bowl of revolution is the point
 * of the silhouette — and on *this* cup that is exactly where the outer corner
 * of an eye is. Left there, the loop crosses the face from every three-quarter
 * angle and reads as a monocle. Walked round into the back quarter it clears the
 * eye entirely and still reads as a handle from the front.
 */
const HANDLE_YAW = -0.5;

/**
 * Where the handle's arc is, at `t` in `-1`…`1` from the lower attachment to the
 * upper one.
 *
 * The handle is a semicircle in the plane through the cup's axis, but it is not
 * a *plumb* semicircle: the wall it hangs off leans outward, so the arc's axis
 * is laid along the line between its two attachment points and its bulge
 * measured perpendicular to that. Built upright instead, the top of the handle
 * sinks into the flare and the bottom floats off the bowl.
 */
function handlePoint(t: number): readonly [number, number, number] {
  const theta = t * HALF_PI;
  const along = Math.cos(theta) * HANDLE_R;
  // Stretched outward rather than circular. A true semicircle between these two
  // points is a shallow ear on a bowl this size; the bulge is what you could get
  // a finger through, and it is the whole silhouette of a cup handle.
  const out = Math.sin(theta) * HANDLE_R * 1.3;
  const radial = HANDLE_X + along * HANDLE_UX + out * HANDLE_NX;
  return [
    radial * Math.cos(HANDLE_YAW),
    HANDLE_Y + along * HANDLE_UY + out * HANDLE_NY,
    -radial * Math.sin(HANDLE_YAW),
  ];
}

/**
 * The handle: a loop of chords stepped around {@link handlePoint}.
 *
 * Every segment is the same box, rolled to lie along the tangent at its own
 * midpoint, so the whole handle costs one cached buffer. Nine of them: at seven
 * the loop reads as a hexagon and the two ends stop meeting the cup squarely.
 */
function handle(): BoneShape[] {
  const count = 9;
  const step = Math.PI / count;
  // Chord plus a little, so neighbours overlap on the inside of the curve
  // instead of opening a gap on the outside.
  const length = 2 * HANDLE_R * Math.sin(step * 0.5) * 1.6;

  const shapes: BoneShape[] = [];
  for (let i = 0; i < count; i++) {
    const t = -1 + (2 * (i + 0.5)) / count;
    const theta = t * HALF_PI;
    // The tangent here — differentiated through the same stretch {@link
    // handlePoint} applies, or the segments lie across the curve rather than
    // along it — and the roll that lays the box's own length on it: `Rz` maps
    // local `+Y` to `(-sin, cos)`.
    const dAlong = -Math.sin(theta);
    const dOut = Math.cos(theta) * 1.3;
    const tx = dAlong * HANDLE_UX + dOut * HANDLE_NX;
    const ty = dAlong * HANDLE_UY + dOut * HANDLE_NY;
    shapes.push(
      box([0.072, length, 0.062], 'primary', handlePoint(t), {
        // The yaw has to be the `y` term and the roll the `z` term, in that
        // order: with Euler `XYZ` the `z` is applied first, laying the box along
        // the tangent in the handle's own plane, and the `y` then carries that
        // plane round the cup. Swapped, the segments spiral off the arc.
        rotation: [0, HANDLE_YAW, Math.atan2(-tx, ty)],
      }),
    );
  }
  return shapes;
}

// --- The face ---------------------------------------------------------------

/**
 * A point on the wall, in head space.
 *
 * Every feature is planted at the radius for its own height. A lash placed at
 * the depth that suits the eye's centre line stands a finger's width off the
 * surface by the time it reaches the outer corner of an eye this size.
 *
 * @param out How far proud of the surface the shape's centre sits.
 */
function onCup(x: number, y: number, out = 0): readonly [number, number, number] {
  const r = radiusAt(y);
  return [x, y, Math.sqrt(Math.max(r * r - x * x, 1e-4)) + out];
}

/** The rotation that lays a flat shape against the wall at `(x, y)`. */
function cupTilt(x: number, y: number, roll = 0): readonly [number, number, number] {
  return [
    Math.atan(slopeAt(y)) * FACE_PITCH,
    Math.asin(unit(x / radiusAt(y))),
    roll,
  ];
}

/**
 * The rotation that turns a cylinder into a disc facing out of the cup.
 *
 * `x = π/2` is what swings the cylinder's axis from `+Y` to `+Z`, and because
 * that is the *last* rotation applied, the outward yaw has to be given as `z` —
 * a `y` here does nothing at all, since yawing about `Y` cannot move the `+Y`
 * axis it starts from. The wall's pitch rides on the `x` term for the same
 * reason.
 */
function discTilt(x: number, y: number): readonly [number, number, number] {
  return [
    HALF_PI + Math.atan(slopeAt(y)) * FACE_PITCH,
    0,
    -Math.asin(unit(x / radiusAt(y))),
  ];
}

function unit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/** Centre of one eye, and how big it is. */
const EYE_X = 0.136;
const EYE_Y = 0.338;
const EYE_R = 0.113;

/**
 * One eye: a white disc, a brown iris, a pupil, two catchlights, a heavy lid and
 * a fan of lashes.
 *
 * Discs, not boxes, and stacked forward rather than inlaid. An eye this large is
 * a quarter of the width of the whole head — a square one reads as a sticker
 * from any angle, and a flat one reads as paint. The dome is what makes it look
 * glazed, which is the one thing about the reference's rendering that primitives
 * can actually reproduce.
 *
 * The catchlights sit *inside* the pupil and iris. Outside them, at this scale,
 * they stop reading as highlights and start reading as chips out of the eye.
 */
function eye(side: 1 | -1): BoneShape[] {
  const x = side * EYE_X;
  const facing = discTilt(x, EYE_Y);
  const at = (dx: number, dy: number, out: number): readonly [number, number, number] =>
    onCup(x + dx, EYE_Y + dy, out);

  const shapes: BoneShape[] = [
    // Sunk, because a flat disc laid tangent to a curved wall lifts its rim: at
    // this radius the edge stands 0.02 off the surface if its centre is flush.
    cyl([EYE_R, EYE_R, 0.05], 'detail', at(0, 0, -0.016), { rotation: facing, segments: 14 }),
    cyl([0.076, 0.076, 0.04], 'eye', at(0, -0.006, 0.006), { rotation: facing, segments: 12 }),
    cyl([0.041, 0.041, 0.032], 'organic', at(0, -0.006, 0.018), { rotation: facing, segments: 10 }),
    cyl([0.029, 0.029, 0.026], 'detail', at(side * 0.03, 0.03, 0.026), {
      rotation: facing,
      segments: 8,
    }),
    cyl([0.014, 0.014, 0.024], 'detail', at(-side * 0.03, -0.037, 0.026), {
      rotation: facing,
      segments: 6,
    }),

    // The upper lid, cropping the top of the disc. This is what turns a circle
    // into an eye — uncropped, it reads as a button.
    //
    // It sits *in front* of the white rather than behind it, which is the whole
    // trick: the first version was sunk into the wall, so the domed sclera stood
    // proud of it and the lid ended up floating above the eye as a separate
    // black bar. Nothing about it read as a lid until it overlapped.
    // Riding high, only just clipping the white. Dropped far enough to cover the
    // top of the iris it stops reading as a lid and starts reading as a heavy
    // eyelid — which on a face this simple is the difference between delighted
    // and unimpressed.
    box([0.195, 0.04, 0.075], 'organic', at(0, 0.099, 0.004), {
      rotation: cupTilt(x, EYE_Y + 0.099, side * 0.12),
      taper: [1, 0.85],
    }),
  ];

  // Lashes, at the outer corner only. Each is placed on the wall at its own
  // angle around the eye and rolled to point away from the eye's centre, so they
  // splay instead of standing parallel.
  //
  // Two, and small. Three long ones across the top of the lid fused with the lid
  // and the brow above it into a single black band, and the face came out in war
  // paint rather than in mascara.
  const angles = [1.0, 1.3];
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i] as number;
    const dx = side * (EYE_R + 0.022) * Math.sin(angle);
    const dy = (EYE_R + 0.022) * Math.cos(angle);
    shapes.push(
      box([0.07, 0.02, 0.05], 'organic', at(dx, dy, -0.008), {
        rotation: cupTilt(x + dx, EYE_Y + dy, side * (HALF_PI - angle)),
        taper: [1, 0.4],
      }),
    );
  }

  return shapes;
}

/**
 * One brow: two short bars meeting in an arch.
 *
 * A single straight bar was tried first and could only ever be a slant — raised
 * on one side reads as suspicion, level reads as a frown. The break in the
 * middle is the whole difference, and it costs one extra box per side because
 * both halves share a geometry.
 */
function brow(side: 1 | -1): BoneShape[] {
  const y = 0.503;
  return [
    box([0.095, 0.019, 0.045], 'organic', onCup(side * 0.08, y - 0.008, -0.022), {
      rotation: cupTilt(side * 0.08, y - 0.008, side * 0.22),
    }),
    box([0.095, 0.019, 0.045], 'organic', onCup(side * 0.172, y, -0.022), {
      rotation: cupTilt(side * 0.172, y, -side * 0.18),
    }),
  ];
}

/**
 * The smile: a band of teeth with a lip along the bottom of it.
 *
 * Five segments on a parabola, each planted on the wall at its own `x` and
 * rolled to follow the curve, so the mouth stays welded to the surface instead
 * of chording across it. The corners rise — that is the entire expression, and a
 * level mouth on this face reads as a bowl of soup.
 *
 * The teeth carry the shape and the lip is a line under them, not the other way
 * round. Built as pink lips with teeth inside, the mouth came out as a dark
 * smear: this is the underside of the bowl, it faces down, and every downward
 * face on this creature is in its own shadow. Whatever has to read here has to
 * be the brightest thing on the cup.
 *
 * Two arcs, not three. An upper lip belongs above the teeth and cannot have one:
 * three arcs stacked inside a fifth of the cup's radius, on a surface already
 * curving away underneath them, come out as a pile of sticks.
 */
function smile(): BoneShape[] {
  const count = 5;
  const spacing = 0.066;
  const half = (count - 1) * 0.5;
  const base = 0.195;
  const shapes: BoneShape[] = [];

  for (let i = 0; i < count; i++) {
    const step = i - half;
    const x = step * spacing;
    const y = base + step * step * 0.016;
    const roll = step * 0.28;
    // Sunk rather than flush: each segment is a straight chord across a curved
    // surface, so its ends stand proud even when its centre does not, and a
    // flush arc frays into separate sticks at the corners.
    shapes.push(
      box([spacing * 1.6, 0.046, 0.05], 'detail', onCup(x, y, -0.02), {
        rotation: cupTilt(x, y, roll),
      }),
      // Clear of the teeth and sunk behind them. Butted right up against the
      // band, the two rows land at the same depth on a wall that is curving away
      // between them, and the corner of a tooth breaks back through the lip.
      box([spacing * 1.5, 0.022, 0.05], 'accent', onCup(x, y - 0.042, -0.03), {
        rotation: cupTilt(x, y - 0.042, roll),
      }),
    );
  }

  return shapes;
}

/**
 * A blush patch, below and outboard of the eye.
 *
 * Pushed out to the cheek rather than sitting under the eye, because the tutu's
 * pink is the only pink in the palette: parked any closer to the mouth, the two
 * merge into one pink mass across the middle of the face and read as a muzzle.
 */
function blush(side: 1 | -1): BoneShape[] {
  const x = side * 0.245;
  const y = 0.245;
  return [
    cyl([0.05, 0.05, 0.026], 'accent', onCup(x, y, -0.016), {
      rotation: discTilt(x, y),
      segments: 10,
    }),
  ];
}

// --- The body ---------------------------------------------------------------

/**
 * The tutu: a flared skirt with a ring of petals hung off it.
 *
 * The petals are the reason this is not just a cone. Each one is a tapered box
 * offset along a rotated radius, wide at the outer end, tipped down and out —
 * and every one of them is the same box, so the whole skirt costs three buffers.
 *
 * The roll has to be given as `z` and the azimuth as `y`, in that order: with
 * Euler `XYZ` the `z` term is applied *first*, which tips the petal out within
 * one plane, and the `y` term then carries it round to its own place on the
 * ring. Written the other way round the petals all tip toward the same side of
 * the body and the skirt comes out as a windblown mess.
 */
function tutu(): BoneShape[] {
  const shapes: BoneShape[] = [
    cyl([0.17, 0.3, 0.09], 'accent', [0, -0.075, 0], { segments: 12 }),
  ];

  const count = 8;
  const radius = 0.155;
  // Past a right angle, so the petals fall away from the body rather than
  // standing out from it like a collar.
  const droop = 1.85;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    shapes.push(
      box([0.19, 0.3, 0.038], 'accent', [
        Math.cos(angle) * radius,
        -0.06,
        -Math.sin(angle) * radius,
      ], { rotation: [0, angle, -droop], taper: [0.4, 1] }),
    );
  }

  // Belt: the seam the skirt is gathered on, and the line that separates the
  // leotard from the tutu at any distance.
  shapes.push(cyl([0.132, 0.128, 0.03], 'detail', [0, 0.015, 0], { segments: 10 }));

  return shapes;
}

/**
 * One arm: a slim skin tube held out in second position.
 *
 * The flare lives on the shoulder's rest `z` and the soft elbow on the
 * forearm's rest `z`, because those are the two axes no animator overwrites —
 * `BipedAnimator` writes `x` on both arm bones and `z` only on a shoulder, where
 * it adds to rest. A rounded pose baked anywhere else is either erased every
 * frame or fought by the swing.
 *
 * The arms are held high on purpose. Dropped to a walking rest they hang inside
 * the tutu, which is both wrong for a dancer and a visible intersection.
 */
function arm(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    bone('shoulder' + side, 'chest', [sign * 0.115, -0.005, 0], [
      sphere(0.048, 'secondary', [0, 0, 0], { segments: 8 }),
    ], [0, 0, sign * 0.78]),

    // Carried a little forward of the body, the way a held port de bras is.
    bone('upperArm' + side, 'shoulder' + side, [0, 0, 0], [
      cyl([0.042, 0.033, 0.23], 'secondary', [0, -0.115, 0], { segments: 8 }),
      sphere(0.034, 'secondary', [0, -0.23, 0], { segments: 7 }),
    ], [-0.22, 0, 0]),

    bone('lowerArm' + side, 'upperArm' + side, [0, -0.23, 0], [
      cyl([0.032, 0.026, 0.21], 'secondary', [0, -0.105, 0], { segments: 8 }),
    ], [-0.18, 0, -sign * 0.3]),

    bone('hand' + side, 'lowerArm' + side, [0, -0.21, 0], hand(sign)),
  ];
}

/**
 * A hand with the fingers held together, as a dancer's are.
 *
 * The thumb is signed off the side so it always ends up medial. Mirroring the
 * raw offset instead would put both thumbs on the same side of the body, which
 * compiles, passes every check, and only looks wrong on screen.
 */
function hand(sign: 1 | -1): BoneShape[] {
  return [
    box([0.048, 0.062, 0.028], 'secondary', [0, -0.031, 0], { taper: [1, 0.9] }),
    // Fingers: one blade rather than four, tapered to the tips.
    box([0.044, 0.062, 0.024], 'secondary', [0, -0.088, 0.004], {
      rotation: [0.16, 0, 0],
      taper: [0.75, 1],
    }),
    box([0.02, 0.042, 0.022], 'secondary', [-sign * 0.03, -0.042, 0.008], {
      rotation: [0, 0, sign * 0.42],
    }),
  ];
}

/**
 * One leg: long, straight and ending in a satin slipper.
 *
 * Every height is derived from {@link ANKLE_Y} so both soles land on `y = 0`
 * exactly. `CreatureAsset` grounds a creature by its lowest vertex, so a sole a
 * hair below its partner tips the whole cup — and the verification harness would
 * still wave it through.
 */
function leg(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    // Turned out from the hip, which is the one thing every ballet position has
    // in common. The yaw survives the walk cycle because `BipedAnimator` only
    // ever writes `rotation.x` on a leg.
    bone('upperLeg' + side, 'hips', [sign * 0.072, -0.03, 0], [
      cyl([0.072, 0.052, 0.28], 'secondary', [0, -0.14, 0], { segments: 8 }),
      sphere(0.062, 'secondary', [0, -0.03, 0], { segments: 8 }),
    ], [0, sign * 0.24, 0]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -0.28, 0], [
      cyl([0.05, 0.034, 0.325], 'secondary', [0, -0.163, 0], { segments: 8 }),
      // Calf, behind the shin. A straight taper from knee to ankle reads as a
      // stick; the one bulge is what makes it a leg.
      sphere(0.046, 'secondary', [0, -0.1, -0.014], { segments: 7 }),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -0.325, 0], slipper()),
  ];
}

/**
 * A ballet slipper: pale satin on a pink sole, with ribbons crossed at the
 * ankle.
 *
 * Flat, not on pointe. A dancer up on the box is the pose the reference is in,
 * and it is exactly the pose a walk cycle cannot keep: the animator rolls the
 * foot through every stride, and a creature balanced on two toe-sized contacts
 * spends the cycle grounded by whichever part of the shoe dips lowest.
 *
 * The blocks step forward rather than being one tapered box, because `taper`
 * scales a cross-section along Y — it can narrow a shoe from the ankle down, but
 * never from heel to toe.
 */
function slipper(): BoneShape[] {
  const up = (height: number): number => -ANKLE_Y + height;

  return [
    box([0.086, 0.022, 0.205], 'accent', [0, up(0.011), 0.028]),
    box([0.082, 0.055, 0.185], 'detail', [0, up(0.048), 0.024], { taper: [1, 0.85] }),
    sphere(0.041, 'detail', [0, up(0.038), 0.108], { segments: 8 }),
    // Heel counter and the collar around the ankle.
    box([0.074, 0.062, 0.062], 'detail', [0, up(0.05), -0.05]),
    cyl([0.05, 0.056, 0.03], 'detail', [0, up(0.082), -0.005], { segments: 8 }),

    // Ribbons, crossed. Two bars wider than the ankle so each shows on both
    // flanks — mirrored patches would cost a second geometry and read the same.
    box([0.105, 0.024, 0.09], 'accent', [0, up(0.105), -0.005], { rotation: [0, 0, 0.42] }),
    box([0.105, 0.024, 0.09], 'accent', [0, up(0.105), -0.005], { rotation: [0, 0, -0.42] }),
  ];
}

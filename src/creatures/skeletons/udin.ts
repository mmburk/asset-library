import type { BoneDefinition, BoneShape, PaletteRole, SkeletonDefinition } from '../types';
import { bone, box, cyl, mirrorX, socket, sphere } from './helpers';

/** Radius of the orange. Every face feature is planted on this sphere. */
const R = 0.6;

/** World height of the orange's centre — also the chest, neck and head pivot. */
const CENTER_Y = 1.1;

/** World height of the hip pivot, just inside the underside of the orange. */
const HIP_Y = 0.6;

/** World height of the ankle pivot. Every sneaker block is placed off it. */
const ANKLE_Y = 0.17;

/** Where the jaw hinges, in head space: inside the rind, behind the mouth. */
const JAW_PIVOT: readonly [number, number, number] = [0, -0.2, 0.3];

/**
 * Udin Din Din Dun — an enormous orange with an angry man's face, huge arms and
 * a pair of sneakers.
 *
 * Modelled from the reference images. Four things carry the character and are
 * built deliberately:
 *
 * 1. **The orange is torso and head at once.** There is no neck and no skull:
 *    one sphere is the whole body, the face is set into its front, and the
 *    stem grows out of the top of the same sphere. Giving it a separate head
 *    would turn it into a mascot holding a fruit.
 * 2. **The arms are the second mass.** Deltoid, bicep and forearm are each
 *    wider than a thigh, and they hang out and down to knee height. Scaled to
 *    anything anatomical the creature stops being the joke.
 * 3. **The sneakers are oversized.** Red, white and black high-tops that read
 *    as the third-biggest shape in the silhouette, on legs barely thicker than
 *    an arm. Small shoes make it a fruit with legs instead of a bodybuilder.
 * 4. **The face is angry, and human.** Heavy brow shelf angled down at the
 *    inner corners, deep-set squinting eyes, a protruding human nose, jowls and
 *    a wide downturned mouth. The absurdity is the body; a cartoon face on top
 *    of it would be one joke too many.
 *
 * The chest, neck and head pivots are all stacked at the centre of the sphere.
 * That is the whole trick that makes a face on a ball work: the animator's
 * torso twist and head turn become rotations *about the sphere's own centre*,
 * so the face slides across the rind at a constant radius instead of a mask
 * swinging off a neck and tearing out of the surface.
 */
export function createUdinSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Hips --------------------------------------------------------------
    // Inside the bottom of the orange: the fruit's underside is the pelvis.
    bone('hips', null, [0, HIP_Y, 0], [
      // Briefs. Nearly all of this block is buried in the sphere — only the
      // wedge below the underside shows, which is all the reference shows.
      box([0.3, 0.17, 0.27], 'metal', [0, -0.095, 0], { taper: [0.82, 1] }),
    ]),

    // --- The orange --------------------------------------------------------
    bone('spine', 'hips', [0, 0.02, 0], [
      // More segments than the library default. This sphere is the entire
      // body; at seven it reads as a die, and the face has nowhere flat to sit.
      sphere(R, 'primary', [0, CENTER_Y - HIP_Y - 0.02, 0], { segments: 16 }),
    ]),

    // Empty: the pivot at the centre of the orange that the arms and the face
    // rotate against.
    bone('chest', 'spine', [0, CENTER_Y - HIP_Y - 0.02, 0]),
    bone('neck', 'chest', [0, 0, 0]),

    // --- Face and stem -----------------------------------------------------
    bone('head', 'neck', [0, 0, 0], [
      ...brow(1),
      ...brow(-1),
      ...eye(1),
      ...eye(-1),
      ...nose(),
      ...jowl(1),
      ...jowl(-1),

      // The mouth is one dark downturned line. An upper lip was tried above it
      // and had to go: three arcs stacked within a fifth of the radius, on a
      // surface that is already curving away underneath them, come out as a
      // pile of sticks rather than as a mouth.
      ...lipArc(-0.225, 0.005, 0.024, 'accent'),

      ...stem(),
    ]),

    // Closed at rest. `BipedAnimator` parts it at speed, and a scowl that
    // starts open has nowhere to go.
    bone('jaw', 'head', JAW_PIVOT, [
      ...lipArc(-0.272, 0.005, 0.045, 'accent', JAW_PIVOT),
      // Chin, bulging proud of the rind under the mouth.
      sphere(0.105, 'primary', offJaw(onRind(0, -0.37, -0.09)), { segments: 9 }),
    ]),

    // --- Arms --------------------------------------------------------------
    ...arm('L', 1),
    ...arm('R', -1),

    // --- Legs --------------------------------------------------------------
    ...leg('L', 1),
    ...leg('R', -1),
  ];

  return {
    name: 'udin-din-din-dun',
    plan: 'biped',
    nominalHeight: 2.08,
    bones,
    sockets: [
      socket('head', 'head', [0, R + 0.04, 0]),
      socket('jaw', 'jaw', offJaw(onRind(0, -0.42, 0.06))),
      // Where the leaf grows, for anything that wants to sit on the stem.
      socket('stem', 'head', [0.1, 0.83, -0.02]),
      socket('chest', 'chest', [0, 0.12, 0.56]),
      socket('back', 'chest', [0, 0.12, -0.56]),
      // Real hands, so no ghost pair is ever conjured.
      socket('handL', 'handL', [0, -0.13, 0.04]),
      socket('handR', 'handR', [0, -0.13, 0.04]),
      socket('bicepL', 'upperArmL', [0.16, -0.16, 0]),
      socket('bicepR', 'upperArmR', mirrorX([0.16, -0.16, 0])),
      socket('hipL', 'hips', [0.21, 0.02, 0]),
      socket('hipR', 'hips', mirrorX([0.21, 0.02, 0])),
    ],
  };
}

/**
 * A point on the rind, in head space.
 *
 * Every feature has to be planted at the sphere's own radius for its own `x`
 * *and* `y`. A brow placed at the depth that suits the centre line floats a
 * finger's width off the face once it is moved out to the temple, and nothing
 * about that is visible until it is rendered.
 *
 * @param out How far proud of the surface the shape's centre sits.
 */
function onRind(x: number, y: number, out = 0): readonly [number, number, number] {
  return [x, y, Math.sqrt(Math.max(R * R - x * x - y * y, 1e-4)) + out];
}

/**
 * The rotation that lays a flat shape flush against the rind at `(x, y)`,
 * plus a roll about the shape's own face for expression.
 */
function rindTilt(x: number, y: number, roll = 0): readonly [number, number, number] {
  return [-Math.asin(unit(y / R)), Math.asin(unit(x / R)), roll];
}

function unit(value: number): number {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}

/** Rebases a head-space point into jaw space. */
function offJaw(point: readonly [number, number, number]): readonly [number, number, number] {
  return [point[0] - JAW_PIVOT[0], point[1] - JAW_PIVOT[1], point[2] - JAW_PIVOT[2]];
}

/**
 * One brow: a heavy shelf of rind with a dark bar along its top edge.
 *
 * The shelf is body-coloured rather than dark. It is a ridge of orange that the
 * light does the work on; painting it dark turns a scowling brow into a painted
 * eyebrow, and the deep-set look — which is most of the anger — disappears with
 * it. The roll drops the inner end, which is the difference between angry and
 * merely surprised.
 */
function brow(side: 1 | -1): BoneShape[] {
  const x = side * 0.185;
  return [
    box([0.31, 0.11, 0.1], 'primary', onRind(x, 0.17, -0.045), {
      rotation: rindTilt(x, 0.17, side * 0.3),
      taper: [1, 0.85],
    }),
    // Narrower and sunk deeper than the shelf it sits on. Every flat shape laid
    // on a sphere lifts its outer end off the surface, and on a piece this wide
    // that end shows up at the temple as a bar floating past the silhouette the
    // moment the creature is seen from three quarters.
    box([0.26, 0.05, 0.07], 'accent', onRind(x, 0.205, -0.028), {
      rotation: rindTilt(x, 0.205, side * 0.3),
    }),
  ];
}

/**
 * One eye: a dark recess under the brow, a sliver of sclera and a pupil.
 *
 * Squinting on purpose — the reference eye is mostly hidden under the brow
 * shelf, and a round open eye on this face reads as startled. The recess is
 * what gives the sclera something to sit in; without it the white block looks
 * glued to the surface.
 *
 * The pupil sits on the eye's own centre line. Nudging it inboard — which is
 * what a face aiming at something close would do — reads as cross-eyed the
 * moment both eyes are seen together.
 */
function eye(side: 1 | -1): BoneShape[] {
  const x = side * 0.175;
  return [
    box([0.19, 0.14, 0.05], 'secondary', onRind(x, 0.075, -0.042), {
      rotation: rindTilt(x, 0.075, side * 0.18),
    }),
    box([0.14, 0.075, 0.05], 'detail', onRind(x, 0.07, -0.018), {
      rotation: rindTilt(x, 0.07, side * 0.18),
    }),
    box([0.062, 0.062, 0.04], 'eye', onRind(x, 0.065, -0.002), {
      rotation: rindTilt(x, 0.065, side * 0.18),
    }),
  ];
}

/**
 * The nose: a bridge widening downward into a rounded tip, with nostrils.
 *
 * The single feature that makes the face read as a man's rather than as a
 * pattern painted on fruit, so it protrudes properly — the bridge stands a
 * finger's width off the rind and the tip stands ahead of the bridge.
 *
 * The nostrils are placed against the *tip*, not the rind: at their own `x`
 * the rind has already curved away behind the tip sphere, so a nostril planted
 * on it would be swallowed whole.
 */
function nose(): BoneShape[] {
  return [
    box([0.1, 0.19, 0.115], 'primary', onRind(0, 0.005, 0.02), { taper: [1.6, 0.75] }),
    sphere(0.062, 'primary', onRind(0, -0.08, 0.03), { segments: 8 }),
    box([0.032, 0.028, 0.04], 'accent', [0.05, -0.107, 0.642], { rotation: [0, 0, -0.35] }),
    box([0.032, 0.028, 0.04], 'accent', [-0.05, -0.107, 0.642], { rotation: [0, 0, 0.35] }),
  ];
}

/**
 * One jowl: a heavy cheek mound beside the mouth.
 *
 * The nasolabial crease that belongs next to it was tried and removed. A
 * straight box laid tangent to a sphere lifts its ends off the surface, and at
 * this length that is enough to turn a fold of a heavy face into a dark stick
 * poking out of the cheek — from the front it read as a whisker and from three
 * quarters as a tusk. The mound alone carries the weight.
 */
function jowl(side: 1 | -1): BoneShape[] {
  return [sphere(0.12, 'primary', onRind(side * 0.245, -0.09, -0.07), { segments: 9 })];
}

/**
 * A downturned arc of lip across the rind.
 *
 * Seven short segments on a quadratic curve, each planted on the rind at its
 * own `x` and rolled to follow the slope, so the mouth stays welded to a
 * curved surface instead of chording across it. Used three times: upper lip,
 * mouth line, and the lower lip on the jaw — hence `origin`, which rebases the
 * whole arc into the jaw's space.
 *
 * @param drop How far the corners fall, per segment squared.
 */
function lipArc(
  y: number,
  drop: number,
  height: number,
  color: PaletteRole,
  origin: readonly [number, number, number] = [0, 0, 0],
): BoneShape[] {
  const count = 7;
  const spacing = 0.05;
  const half = (count - 1) * 0.5;
  const shapes: BoneShape[] = [];

  for (let i = 0; i < count; i++) {
    const step = i - half;
    const x = step * spacing;
    const dropped = y - step * step * drop;
    // Sunk rather than flush: each segment is a straight chord across a curved
    // surface, so its ends stand proud of the rind even when its centre does
    // not, and a flush arc frays into separate sticks at the corners.
    const point = onRind(x, dropped, -0.022);
    shapes.push(
      box([spacing * 1.55, height, 0.05], color, [
        point[0] - origin[0],
        point[1] - origin[1],
        point[2] - origin[2],
      ], { rotation: rindTilt(x, dropped, -step * 0.2) }),
    );
  }
  return shapes;
}

/**
 * The stem and leaf, growing out of the crown.
 *
 * Two short segments at increasing tilt rather than one straight spike: the
 * reference stem bends. Each piece is placed by walking along its own axis from
 * the end of the previous one so the joints stay closed, and the leaf's two
 * halves are placed the same way along the leaf's own rotated axis — a leaf is
 * narrow at the base and pointed at the tip, and `taper` can only do one of
 * those per box.
 */
function stem(): BoneShape[] {
  // Where the second stem segment ends, walked out by hand from the crown.
  const base: readonly [number, number, number] = [0.102, 0.824, -0.02];
  // The leaf's own axis under its rotation, so the halves sit end to end.
  const dir: readonly [number, number, number] = [0.907, 0.225, -0.353];
  const rotation: readonly [number, number, number] = [0.15, 0.4, -1.4];
  const along = (d: number): readonly [number, number, number] => [
    base[0] + dir[0] * d,
    base[1] + dir[1] * d,
    base[2] + dir[2] * d,
  ];

  return [
    // The dimple the stem sits in.
    cyl([0.085, 0.115, 0.06], 'secondary', [0, R - 0.02, 0], { segments: 10 }),
    cyl([0.036, 0.05, 0.15], 'organic', [0.018, 0.655, 0], { rotation: [0, 0, -0.22], segments: 7 }),
    cyl([0.028, 0.036, 0.12], 'organic', [0.068, 0.775, -0.012], {
      rotation: [0, 0, -0.6],
      segments: 7,
    }),
    box([0.15, 0.17, 0.032], 'organic', along(0.085), { rotation, taper: [0.35, 1] }),
    box([0.15, 0.17, 0.032], 'organic', along(0.255), { rotation, taper: [1, 0.25] }),
  ];
}

/**
 * One arm: deltoid, bicep, forearm and fist, all oversized.
 *
 * The outward flare lives on the shoulder's rest rotation and the forearm's
 * counter-angle on the elbow's, because `BipedAnimator` writes `rotation.x` on
 * an arm and `rotation.z` only on a shoulder — a flare baked anywhere else is
 * either erased every frame or fought by the swing.
 */
function arm(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    // Out at the rind, not inside it. A shoulder tucked into the sphere hangs
    // the whole arm behind the body's own silhouette, and the biggest mass on
    // the creature ends up reading as a thin tube peeking out from behind an
    // orange.
    bone('shoulder' + side, 'chest', [sign * 0.55, 0.16, 0.03], [
      sphere(0.235, 'primary', [0, -0.02, 0], { segments: 10 }),
    ], [0, 0, sign * 0.5]),

    bone('upperArm' + side, 'shoulder' + side, [0, 0, 0], [
      cyl([0.2, 0.17, 0.44], 'primary', [0, -0.22, 0], { segments: 10 }),
      // Bicep in front, tricep behind. Two bulges rather than one fat tube:
      // the gap between them is what makes the arm read as muscle.
      sphere(0.175, 'primary', [0, -0.15, 0.055], { segments: 9 }),
      sphere(0.15, 'primary', [0, -0.19, -0.08], { segments: 8 }),
    ]),

    bone('lowerArm' + side, 'upperArm' + side, [0, -0.44, 0], [
      cyl([0.17, 0.12, 0.38], 'primary', [0, -0.19, 0], { segments: 10 }),
      sphere(0.162, 'primary', [0, -0.08, 0.015], { segments: 9 }),
    ], [0, 0, -sign * 0.22]),

    bone('hand' + side, 'lowerArm' + side, [0, -0.38, 0], fist(sign)),
  ];
}

/**
 * A closed fist, knuckles forward.
 *
 * The thumb is signed off the side so it always ends up medial. Mirroring the
 * raw offset instead would put both thumbs on the same side of the body, which
 * compiles, passes every check, and only looks wrong on screen.
 */
function fist(sign: 1 | -1): BoneShape[] {
  const shapes: BoneShape[] = [
    box([0.24, 0.23, 0.25], 'primary', [0, -0.115, 0.01], { taper: [0.9, 1] }),
    box([0.085, 0.125, 0.095], 'primary', [-sign * 0.098, -0.085, 0.12], {
      rotation: [0.3, 0, sign * 0.25],
    }),
  ];
  // Four knuckles across the front of the fist.
  for (let i = 0; i < 4; i++) {
    shapes.push(
      box([0.052, 0.056, 0.045], 'secondary', [sign * (0.078 - i * 0.052), -0.095, 0.13]),
    );
  }
  return shapes;
}

/**
 * One leg: a short muscled thigh and calf ending in a high-top sneaker.
 *
 * Short on purpose. The reference has almost no leg between the fruit and the
 * shoe, and lengthening it into something a walk cycle would flatter turns the
 * creature into an orange on stilts.
 */
function leg(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    // Toed out slightly. The yaw survives the walk cycle because
    // `BipedAnimator` only ever writes `rotation.x` on a leg.
    bone('upperLeg' + side, 'hips', [sign * 0.155, -0.02, 0], [
      cyl([0.145, 0.118, 0.24], 'primary', [0, -0.12, 0], { segments: 9 }),
      sphere(0.132, 'primary', [0, -0.07, 0.012], { segments: 8 }),
    ], [0, sign * 0.07, sign * 0.025]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -0.22, 0], [
      cyl([0.112, 0.088, 0.2], 'primary', [0, -0.1, 0], { segments: 9 }),
      sphere(0.104, 'primary', [0, -0.05, -0.03], { segments: 8 }),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -0.19, 0], sneaker()),
  ];
}

/**
 * A red, white and black high-top, built as a stack of blocks off the ankle.
 *
 * Every height is derived from {@link ANKLE_Y} so both soles land on `y = 0`
 * exactly: `CreatureAsset` grounds the creature by its lowest vertex, so one
 * sole a hair below the other tips the whole orange, and the verification
 * harness still passes it.
 *
 * The blocks step outward from heel to toe instead of being one tapered box,
 * because `taper` scales a cross-section along Y — it can narrow a shape from
 * top to bottom but never from heel to toe.
 */
function sneaker(): BoneShape[] {
  const up = (height: number): number => -ANKLE_Y + height;

  return [
    // Black outsole under a white midsole, which is the line that reads first
    // at any distance.
    box([0.208, 0.045, 0.44], 'metal', [0, up(0.0225), 0.05]),
    box([0.215, 0.062, 0.44], 'detail', [0, up(0.076), 0.05]),

    // Upper: red toe box, white quarter panel, red heel counter.
    box([0.198, 0.1, 0.155], 'accent', [0, up(0.157), 0.192]),
    box([0.201, 0.108, 0.175], 'detail', [0, up(0.161), 0.032]),
    box([0.196, 0.115, 0.145], 'accent', [0, up(0.164), -0.112]),

    // The swoosh, as one bar wider than the shoe so it shows on both flanks —
    // two mirrored patches would cost a second geometry and read identically.
    box([0.218, 0.04, 0.23], 'metal', [0, up(0.145), 0.055], { rotation: [-0.16, 0, 0] }),

    // High-top collar, and the dark padded roll around its lip. It stops well
    // short of the knee: this creature's shin is barely longer than the shoe
    // is tall, and a collar sized off the shoe swallows the leg whole.
    box([0.187, 0.13, 0.175], 'accent', [0, up(0.272), -0.055], { taper: [0.95, 1.05] }),
    box([0.194, 0.032, 0.183], 'metal', [0, up(0.35), -0.055]),

    // Tongue and laces.
    box([0.11, 0.15, 0.055], 'detail', [0, up(0.26), 0.085]),
    ...lace(up(0.208)),
    ...lace(up(0.262)),
    ...lace(up(0.316)),
  ];
}

/** One lace across the tongue. */
function lace(y: number): BoneShape[] {
  return [box([0.127, 0.019, 0.03], 'metal', [0, y, 0.094])];
}

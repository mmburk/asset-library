import type { BoneDefinition, BoneShape, PaletteRole, SkeletonDefinition } from '../types';
import { bone, box, cone, cyl, mirrorX, socket, sphere } from './helpers';

const TAU = Math.PI * 2;

/** World-space height of the ankle pivot. Every foot shape is placed off it. */
const ANKLE_Y = 0.135;

/**
 * La Vacca Saturno Saturnita — a cow's head fused into Saturn, on two bare feet.
 *
 * Modelled from the reference render. Three things carry the character and are
 * built deliberately:
 *
 * 1. **The head is enormous.** In the reference the skull is over half the
 *    planet's diameter and its back half is buried in the sphere — it reads as
 *    a cow *growing out of* the planet, not a head parked on top of one. A
 *    head sized against the neck would turn the whole thing into a mascot.
 * 2. **The rings are the silhouette.** They are wider than the model is tall,
 *    and they are the only part with no organic counterpart, so they are built
 *    from three concentric bands of flat segments rather than one disc.
 * 3. **Real feet on stub legs.** Short dusky legs, a metal cuff at each ankle,
 *    and broad five-toed human feet. The feet are the joke; they get the toes.
 *
 * The ring plane sits a little below the equator and pitches nose-down. That is
 * not decoration: the near arc of a level, centred ring passes straight through
 * the muzzle at chin height, and since these are opaque solids it would be
 * drawn *in front of* the face — the reference cheats that overlap, geometry
 * cannot. Dropping and tilting the plane walks the near arc under the chin.
 */
export function createVaccaSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Hips --------------------------------------------------------------
    // Low, because the legs are stubs: the planet's underside is the pelvis.
    bone('hips', null, [0, 0.46, 0]),

    // --- Planet ------------------------------------------------------------
    bone('spine', 'hips', [0, 0.02, 0], [
      // More segments than the library default: this sphere is the body, and
      // at seven it reads as a die rather than a world.
      sphere(0.52, 'primary', [0, 0.5, 0], { segments: 16 }),
      // One belt, low on the southern hemisphere. Its radius is the sphere's
      // own cross-section at that latitude plus a hair, so it sits proud of the
      // surface instead of vanishing inside it.
      //
      // Only one, and only down there: a matching belt on the northern
      // hemisphere is hidden behind the head from the front — the angle it was
      // placed for — and from the side it turns into a strap cinched around the
      // planet. The reference's banding is barely there, and one low belt below
      // the rings is as much as this silhouette will take.
      cyl([0.381, 0.381, 0.042], 'secondary', [0, 0.14, 0], { segments: 16 }),
    ]),

    // --- Rings -------------------------------------------------------------
    // Hung off the spine rather than the chest on purpose: the chest carries
    // the head and gets counter-rotated on every stride, and a ring system
    // that yaws with the neck reads as loose. Planet and rings stay welded.
    bone('rings', 'spine', [0, 0.4, 0], [
      // Darkest inside, palest outside, as in the reference. The middle band
      // must not take the planet's own colour: at this angle it abuts the
      // sphere and the two read as one shape.
      ...ringBand(14, 0.6, 0.7, 0.024, 'metal'),
      ...ringBand(14, 0.7, 0.88, 0.03, 'secondary'),
      ...ringBand(14, 0.88, 1.0, 0.024, 'primary'),
    ], [0.2, 0, -0.1]),

    // Empty: the pivot the head twists against, at the planet's centre.
    bone('chest', 'spine', [0, 0.5, 0]),
    bone('neck', 'chest', [0, 0.15, 0.24]),

    // --- Head --------------------------------------------------------------
    bone('head', 'neck', [0, 0.04, 0.23], [
      // Skull. Narrower at the bottom, where it runs into the muzzle.
      box([0.48, 0.36, 0.32], 'detail', [0, 0.1, 0.06], { taper: [0.9, 1] }),
      // Holstein patches over the temples and ears, leaving a white blaze down
      // the centre. Sized to overhang the skull slightly so no face is
      // coplanar with the white underneath it.
      box([0.155, 0.335, 0.315], 'accent', [0.167, 0.135, 0.085]),
      box([0.155, 0.335, 0.315], 'accent', [-0.167, 0.135, 0.085]),
      // Poll tuft between the horns.
      box([0.17, 0.06, 0.15], 'accent', [0, 0.29, 0.06], { taper: [1, 0.6] }),

      // Muzzle and nose pad.
      box([0.3, 0.21, 0.27], 'detail', [0, -0.135, 0.2]),
      box([0.25, 0.12, 0.1], 'organic', [0, -0.16, 0.3]),
      box([0.052, 0.058, 0.035], 'accent', [0.07, -0.16, 0.34], { rotation: [0, 0, -0.4] }),
      box([0.052, 0.058, 0.035], 'accent', [-0.07, -0.16, 0.34], { rotation: [0, 0, 0.4] }),
      // Dark plate under the muzzle, flush with its underside. Invisible at
      // rest behind the chin, and the only thing that keeps the slack jaw
      // `BipedAnimator` opens at speed from reading as white on white.
      box([0.2, 0.03, 0.2], 'accent', [0, -0.245, 0.19]),

      ...eye(0.155),
      ...eye(-0.155),

      ...ear(1),
      ...ear(-1),

      ...horn(1),
      ...horn(-1),
    ]),

    // Closed at rest — this cow is placid. `BipedAnimator` parts it at speed.
    bone('jaw', 'head', [0, -0.23, 0.12], [
      box([0.265, 0.13, 0.21], 'detail', [0, -0.045, 0.09]),
      // Mouth line, laid on the front face of the muzzle rather than under it,
      // where it would be swallowed by the muzzle block.
      box([0.18, 0.018, 0.028], 'accent', [0, 0.005, 0.215]),
    ]),

    // --- Legs --------------------------------------------------------------
    ...leg('L', 1),
    ...leg('R', -1),
  ];

  return {
    name: 'la-vacca-saturno',
    plan: 'biped',
    nominalHeight: 1.7,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.33, 0.06]),
      socket('jaw', 'jaw', [0, -0.06, 0.23]),
      socket('hornL', 'head', [0.3718, 0.5249, 0.02]),
      socket('hornR', 'head', mirrorX([0.3718, 0.5249, 0.02])),
      socket('back', 'spine', [0, 0.5, -0.5]),
      socket('belly', 'spine', [0, 0.02, 0.2]),
      // On the rings themselves, so anything parked there rides the tilt.
      socket('ringL', 'rings', [0.94, 0, 0]),
      socket('ringR', 'rings', [-0.94, 0, 0]),
      socket('ringFront', 'rings', [0, 0, 0.94]),
      // A planet has no arms. Conjured hands float either side of the head,
      // clear above the ring plane. Below the rings they end up level with the
      // feet — technically in front of the body, but read as something the cow
      // dropped rather than something it is holding.
      socket('ghostHandL', 'spine', [0.52, 0.62, 0.52]),
      socket('ghostHandR', 'spine', mirrorX([0.52, 0.62, 0.52])),
    ],
  };
}

/**
 * One flat annulus of the ring system.
 *
 * A ring has no primitive here, so it is a circle of boxes: each segment is
 * offset along a rotated radius, exactly as {@link propellerBlades} does, which
 * means all fourteen segments of a band share one cached geometry and the whole
 * system costs three buffers. Width is the *tangent* chord, so neighbouring
 * segments meet corner to corner at the outer edge and overlap slightly inside.
 */
function ringBand(
  count: number,
  innerRadius: number,
  outerRadius: number,
  thickness: number,
  color: PaletteRole,
): BoneShape[] {
  const mid = (innerRadius + outerRadius) * 0.5;
  const depth = outerRadius - innerRadius;
  const width = 2 * outerRadius * Math.tan(Math.PI / count);

  const shapes: BoneShape[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    shapes.push(
      box([width, thickness, depth], color, [Math.sin(angle) * mid, 0, Math.cos(angle) * mid], {
        rotation: [0, angle, 0],
      }),
    );
  }
  return shapes;
}

/**
 * One eye: a white plate sunk into the black patch, a dark ball in front of it
 * and a heavy upper lid.
 *
 * The lid is what stops the eye reading as a bead glued to the face — a cow's
 * eye is mostly hooded, and without it the expression turns cartoon-startled.
 */
function eye(x: number): BoneShape[] {
  const side = x > 0 ? 1 : -1;
  return [
    box([0.115, 0.085, 0.04], 'detail', [x, 0.03, 0.235]),
    sphere(0.042, 'eye', [x, 0.03, 0.255], { segments: 8 }),
    box([0.13, 0.038, 0.05], 'accent', [x, 0.085, 0.238], { rotation: [0, 0, -side * 0.12] }),
  ];
}

/**
 * One ear, splayed out and tipped back.
 *
 * `rotation.y` swings the outboard end aft and `rotation.z` drops it; both are
 * signed off the side so the pair mirrors instead of both leaning the same way.
 * The pink inner is pushed forward along the ear's own face, which after the
 * yaw is not the head's `+Z` — it only has to clear the outer shell, and 0.05
 * on a 0.155-deep ear does that from any angle it is seen at.
 */
function ear(side: 1 | -1): BoneShape[] {
  const rotation: readonly [number, number, number] = [0, side * 0.22, -side * 0.4];
  return [
    box([0.25, 0.12, 0.17], 'accent', [side * 0.325, 0.1, 0.06], { rotation }),
    box([0.18, 0.07, 0.11], 'organic', [side * 0.325, 0.085, 0.115], { rotation }),
  ];
}

/**
 * One horn: a thick tapered base sweeping out at 45°, then a tip cone levering
 * back toward vertical.
 *
 * Two segments rather than one because the reference horns *curve*; a single
 * straight spike reads as a bull's pike and loses the dairy-cow shape. Each
 * piece is placed by walking along its own axis from the attachment point,
 * which keeps the seam closed without hand-fitted offsets.
 */
function horn(side: 1 | -1): BoneShape[] {
  return [
    cyl([0.04, 0.062, 0.19], 'detail', [side * 0.2522, 0.3172, 0.02], {
      rotation: [0, 0, -side * 0.785],
      segments: 7,
    }),
    cone(0.04, 0.15, 'secondary', [side * 0.3455, 0.4546, 0.02], {
      rotation: [0, 0, -side * 0.357],
      segments: 7,
    }),
  ];
}

/**
 * One leg: a stub thigh, a stub shin wearing a metal cuff, and a broad human
 * foot.
 *
 * The cuff rides the shin rather than the foot so it stays level with the
 * ground when the ankle rolls through a stride.
 */
function leg(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    // Splayed a little and toed out. The yaw survives because `BipedAnimator`
    // only ever writes `rotation.x` on a leg — a stance angle baked into Y is
    // one the stride never fights.
    bone('upperLeg' + side, 'hips', [sign * 0.175, 0, 0.015], [
      cyl([0.078, 0.068, 0.16], 'organic', [0, -0.08, 0], { segments: 8 }),
    ], [0, sign * 0.11, sign * 0.02]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -0.16, 0], [
      cyl([0.068, 0.062, 0.135], 'organic', [0, -0.0675, 0], { segments: 8 }),
      cyl([0.088, 0.088, 0.07], 'metal', [0, -0.125, 0], { segments: 12 }),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -0.165, 0], foot(sign)),
  ];
}

/**
 * A bare foot, built as three stacked blocks plus toes.
 *
 * Three blocks because `taper` scales a cross-section along Y — it can shrink
 * a shape from top to bottom but never from heel to toe, so the widening from
 * heel to ball has to be a step between separate boxes. Every block's offset is
 * derived from {@link ANKLE_Y} so all four soles land on `y = 0` exactly; the
 * verification harness checks that a biped stands on its feet, and a sole even
 * slightly proud of the toes would tip the whole planet.
 */
function foot(sign: 1 | -1): BoneShape[] {
  const sole = (height: number): number => -ANKLE_Y + height * 0.5;

  return [
    // Heel, midfoot, ball — each wider than the last.
    box([0.155, 0.115, 0.15], 'organic', [0, sole(0.115), -0.055]),
    box([0.18, 0.105, 0.17], 'organic', [0, sole(0.105), 0.06]),
    box([0.205, 0.092, 0.135], 'organic', [0, sole(0.092), 0.185]),
    // Instep, rising to meet the ankle.
    box([0.145, 0.13, 0.14], 'organic', [0, -0.035, -0.005], { taper: [1, 0.85] }),
    ...toes(sign),
  ];
}

/**
 * Five toes across the ball of the foot.
 *
 * Offsets are measured from the foot's centre line and signed by `sign`, so the
 * big toe always ends up medial — mirroring the raw X would put both big toes
 * on the same side of the body, which is the sort of thing that compiles, passes
 * every check and only looks wrong on screen.
 */
function toes(sign: 1 | -1): BoneShape[] {
  const lateral = [-0.058, -0.01, 0.03, 0.064, 0.09];
  const width = [0.056, 0.044, 0.038, 0.034, 0.03];
  const depth = [0.08, 0.075, 0.07, 0.064, 0.058];
  const height = [0.055, 0.05, 0.047, 0.043, 0.04];

  const shapes: BoneShape[] = [];
  for (let i = 0; i < lateral.length; i++) {
    const h = height[i] as number;
    shapes.push(
      box([width[i] as number, h, depth[i] as number], 'organic', [
        sign * (lateral[i] as number),
        -ANKLE_Y + h * 0.5,
        0.275,
      ], { taper: [1, 0.75] }),
    );
  }
  return shapes;
}

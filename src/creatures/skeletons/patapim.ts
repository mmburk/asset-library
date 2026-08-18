import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cyl, mirrorX, socket, sphere } from './helpers';

const TAU = Math.PI * 2;

/** World height of the ankle pivot. Every block of the foot is placed off it. */
const ANKLE_Y = 0.13;

/** World height of the knee. */
const KNEE_Y = 0.36;

/** World height of the hip pivot — also where the root fringe hangs from. */
const HIP_Y = 0.6;

/** World height of the waist. */
const WAIST_Y = 0.72;

/** World height of the shoulder line. */
const CHEST_Y = 1.04;

/** World height of the base of the neck. */
const NECK_Y = 1.14;

/**
 * World height of the jaw line: the head bone's pivot.
 *
 * High enough that the chin clears the moss over the shoulders. Set by the neck
 * length it looked like it wanted, the head sat *in* the shoulders: the chin and
 * the whole beard under it disappeared inside the trunk, and the creature came
 * out with no neck at all.
 */
const HEAD_Y = 1.28;

/** Half the depth of the skull — the plane the face is built on. */
const FACE_Z = 0.19;

/**
 * Brr Brr Patapim — a mossy forest troll that is mostly nose and mostly feet.
 *
 * Modelled from the two reference images. Four things carry the character and
 * are built deliberately:
 *
 * 1. **The nose.** A long fleshy proboscis that leaves the brow almost
 *    horizontally, curves down as it goes and hangs past the mouth to the chin.
 *    It is nearly as long as the head is deep and it is the whole joke — every
 *    other feature on the face is arranged around leaving it room.
 * 2. **The feet.** Bare, flat and human, with five modelled toes and toenails,
 *    and comically oversized: each is three tenths of the creature's height from
 *    heel to toe, where a real foot is a sixth. The second half of the joke is
 *    that a forest spirit made of bark and moss ends in a pair of ordinary human
 *    feet, so they are skin, not wood, and the toes are individually modelled —
 *    a rounded slab reads as a boot.
 * 3. **Moss over bark over skin, in that order.** The crown, the shoulders and
 *    the trunk are under a green mantle with a fringe of roots hanging off it;
 *    the face, the forearms and the feet are bare. The green is what places the
 *    creature in a forest and the bare skin is what keeps it a face.
 * 4. **Shaggy white hair at the temples and under the jaw.** The reference is an
 *    old man's head under a hedge — without the hair the skull reads as a bald
 *    egg with a moss hat balanced on it.
 *
 * The trunk is one rigid mossy log, so the recipe damps `torsoLean` and
 * `torsoCounterRotate` the way `tung-tung-sahur` and `frigo-camelo` do: a real
 * bend creases a shape that visibly cannot crease, and it swings the head pivot
 * far enough to drive that nose into the creature's own chest.
 *
 * The leg swing is damped for a reason particular to this one. There is no foot
 * IK anywhere in the library — the ankle is posed and the ground is where it is
 * — and this creature's toes sit four tenths of a unit ahead of its ankle, so
 * every radian of ankle pitch drops the toe tips by four times what it costs a
 * normally-footed archetype. A walk with a humanoid's stride buries the front
 * half of both feet in the floor.
 */
export function createPatapimSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Hips and root fringe ------------------------------------------------
    bone('hips', null, [0, HIP_Y, 0], [
      cyl([0.19, 0.172, 0.16], 'organic', [0, -0.04, 0], { segments: 10 }),
      ...rootFringe(),
    ]),

    // --- Trunk ---------------------------------------------------------------
    // A barrel that widens from the waist to the shoulders, in two frusta. The
    // creature has no waist to speak of and does not want one: the reference is
    // a stump with a head on it, and the widening is what separates a stump from
    // a barrel.
    bone('spine', 'hips', [0, WAIST_Y - HIP_Y, 0], [
      cyl([0.212, 0.198, 0.19], 'organic', [0, 0.09, 0], { segments: 10 }),
      // Bare bark showing through the moss, which is what makes the green read
      // as growing *on* wood instead of being the wood's own colour.
      ...barkPanel(0.09, 0.18, 0.2),
    ]),

    bone('chest', 'spine', [0, CHEST_Y - WAIST_Y, 0], [
      cyl([0.238, 0.216, 0.24], 'organic', [0, -0.09, 0], { segments: 10 }),
      ...barkPanel(-0.11, 0.2, 0.225),
      // The moss over the top of the trunk, which is what gives the silhouette
      // its shoulders. The trunk alone is a cylinder, and a cylinder with arms
      // on it reads as a barrel.
      ...shoulderMoss(),
    ]),

    // Short and thick, and buried in the mantle. What shows of it is the gap
    // between the moss collar and the jaw.
    bone('neck', 'chest', [0, NECK_Y - CHEST_Y, 0], [
      cyl([0.1, 0.115, 0.1], 'primary', [0, 0.02, 0], { segments: 8 }),
    ]),

    // --- Head ----------------------------------------------------------------
    bone('head', 'neck', [0, HEAD_Y - NECK_Y, 0], [
      ...skull(),
      ...mossCap(),
      ...eye(1),
      ...eye(-1),
      ...ear(1),
      ...ear(-1),
      ...temple(1),
      ...temple(-1),
      ...nose(),
      ...mouth(),
    ]),

    // The mouth is all but roofed over by the nose, so the jaw carries the beard
    // as well as the chin: what actually reads at a distance is the white tuft
    // moving, not the lip behind it.
    bone('jaw', 'head', [0, 0.085, 0.05], [
      sphere(0.105, 'primary', [0, -0.045, 0.08], { segments: 8 }),
      ...beard(),
    ]),

    // --- Arms ----------------------------------------------------------------
    ...arm('L', 1),
    ...arm('R', -1),

    // --- Legs ----------------------------------------------------------------
    ...leg('L', 1),
    ...leg('R', -1),
  ];

  return {
    name: 'brr-brr-patapim',
    plan: 'biped',
    nominalHeight: 1.86,
    bones,
    sockets: [
      // Real hands: this one has fingers — root ones, but fingers — so no ghost
      // pair is conjured when it picks something up.
      socket('handL', 'handL', [0, -0.07, 0.015]),
      socket('handR', 'handR', [0, -0.07, 0.015]),
      socket('head', 'head', [0, 0.58, 0]),
      socket('jaw', 'jaw', [0, -0.05, 0.14]),
      // On the tip of the nose, for anything that wants to perch there.
      socket('nose', 'head', noseTip(0.03)),
      socket('chest', 'chest', [0, 0, 0.24]),
      socket('back', 'chest', [0, 0, -0.24]),
      socket('hipL', 'hips', [0.2, 0, 0]),
      socket('hipR', 'hips', mirrorX([0.2, 0, 0])),
    ],
  };
}

// --- The nose ---------------------------------------------------------------

/** Where the bridge leaves the brow, in head space. */
const NOSE_ROOT: readonly [number, number, number] = [0, 0.37, 0.13];

/**
 * The nose's path, as `[tilt, length, width, depth]` per segment.
 *
 * `tilt` is the angle away from straight down, toward the front, and every one
 * of these numbers was cut roughly in half after the first render. Built to
 * leave the brow near-horizontally — which is how the reference *reads*, drawn
 * from the side — the nose comes out as an anteater's snout: a beam hanging in
 * the air with daylight under it and the face visible behind. What makes it a
 * nose is that it stays against the face and only pulls away as it drops, so it
 * starts at 0.8 radians and stands closer to vertical the whole way down.
 *
 * The drop is what carries the length, not the reach. The tip ends about a fifth
 * of a unit in front of the face and hangs level with the chin, past the mouth —
 * which is exactly what the reference does and what a snout does not.
 *
 * The first segment is the deepest of the six, and that is what welds the whole
 * thing to the face. A bridge no deeper than the rest of the nose leaves a wedge
 * of daylight between its underside and the brow, and through that gap the face
 * behind is visible — which turns the nose into a separate object hanging in
 * front of the head.
 *
 * The width and depth grow the whole way down. A nose that tapers to its tip is
 * a witch's; this one is a bulb on the end of a bridge, and the swelling is most
 * of what makes it read as flesh rather than as a branch.
 */
const NOSE_PATH: readonly (readonly [number, number, number, number])[] = [
  [0.62, 0.09, 0.09, 0.17],
  [0.52, 0.09, 0.1, 0.16],
  [0.44, 0.09, 0.112, 0.16],
  [0.34, 0.085, 0.122, 0.165],
  [0.25, 0.075, 0.128, 0.17],
];

/**
 * Where the nose ends, in head space.
 *
 * @param beyond How far past the last segment, along its own axis.
 */
function noseTip(beyond = 0): readonly [number, number, number] {
  let y = NOSE_ROOT[1];
  let z = NOSE_ROOT[2];
  let tilt = 0;
  for (let i = 0; i < NOSE_PATH.length; i++) {
    const [angle, length] = NOSE_PATH[i] as readonly [number, number, number, number];
    y -= Math.cos(angle) * length;
    z += Math.sin(angle) * length;
    tilt = angle;
  }
  return [0, y - Math.cos(tilt) * beyond, z + Math.sin(tilt) * beyond];
}

/**
 * The nose: segments stepped along {@link NOSE_PATH}, and a bulb on the end.
 *
 * Each segment is a box laid along its own axis rather than a shape rotated in
 * place, because `taper` and a box's height both work on the shape's *local* Y —
 * so the length has to be the Y dimension and the rotation has to bring that Y
 * onto the path. `rotX(-tilt)` is what does it: it maps local `+Y` to
 * `(0, cos tilt, -sin tilt)`, which points back up the bridge, so local `-Y`
 * runs down and forward toward the tip.
 *
 * Segments are cut 15% longer than their step so consecutive boxes overlap.
 * Butted exactly end to end, the corner of each one opens a notch on the outside
 * of the curve and the nose reads as a chain of separate lumps.
 */
function nose(): BoneShape[] {
  const shapes: BoneShape[] = [];
  let y = NOSE_ROOT[1];
  let z = NOSE_ROOT[2];

  for (let i = 0; i < NOSE_PATH.length; i++) {
    const [tilt, length, width, depth] = NOSE_PATH[i] as readonly [
      number,
      number,
      number,
      number,
    ];
    const dy = -Math.cos(tilt) * length;
    const dz = Math.sin(tilt) * length;

    shapes.push(
      box([width, length * 1.15, depth], 'primary', [0, y + dy * 0.5, z + dz * 0.5], {
        rotation: [-tilt, 0, 0],
      }),
    );

    y += dy;
    z += dz;
  }

  // The bulb, and the two nostrils cut into its underside. The nostrils are on
  // the bottom face rather than the front: this nose points at the floor by the
  // time it ends, and a nostril on its front reads as a second pair of eyes.
  shapes.push(sphere(0.072, 'primary', [0, y + 0.01, z - 0.01], { segments: 9 }));
  shapes.push(box([0.032, 0.03, 0.05], 'accent', [0.035, y - 0.038, z - 0.025]));
  shapes.push(box([0.032, 0.03, 0.05], 'accent', [-0.035, y - 0.038, z - 0.025]));

  return shapes;
}

// --- The rest of the face ---------------------------------------------------

/**
 * The skull: a squared-off block with a domed crown and heavy cheeks.
 *
 * Wider at the top than the bottom, which is the shape of the reference head and
 * the reason the face reads as a face at all — the mass has to narrow toward the
 * jaw or the nose has nothing to hang off.
 */
function skull(): BoneShape[] {
  return [
    box([0.38, 0.38, 0.38], 'primary', [0, 0.2, 0], { taper: [0.88, 1] }),
    sphere(0.185, 'primary', [0, 0.33, 0], { segments: 10 }),
    // Cheekbones, flanking the nose — and small. Built at the size a human
    // cheek would be on a head this wide, the two mounds meet the nose across
    // the middle of the face and the whole front reads as a muzzle.
    sphere(0.072, 'primary', [0.15, 0.175, 0.115], { segments: 7 }),
    sphere(0.072, 'primary', [-0.15, 0.175, 0.115], { segments: 7 }),
  ];
}

/**
 * One eye: a yellow disc under a heavy skin lid, with a moss tuft for a brow.
 *
 * Deep-set and hooded. Two thirds of the height of the eye is covered by the
 * lid, which is the whole expression: uncovered, the yellow reads as alarm, and
 * the reference is half asleep.
 *
 * There is no brow *bar*. A single ridge across both eyes lands at exactly the
 * height the bridge of this nose passes through, welds to it, and turns the top
 * of the head into a shelf — the same trap `frigo-camelo`'s eyebrow fell into.
 * Two separate tufts read as brows and leave the bridge visible between them.
 */
function eye(side: 1 | -1): BoneShape[] {
  const x = side * 0.115;
  const y = 0.325;
  return [
    // Socket, sunk into the face, so the eye sits in a hollow rather than on a
    // wall.
    box([0.125, 0.105, 0.05], 'secondary', [x, y, FACE_Z - 0.01]),
    cyl([0.048, 0.048, 0.045], 'eye', [x, y - 0.005, FACE_Z + 0.015], {
      rotation: [Math.PI * 0.5, 0, 0],
      segments: 10,
    }),
    box([0.022, 0.05, 0.03], 'accent', [x, y - 0.005, FACE_Z + 0.04]),
    // The lid, in front of the eye rather than inlaid — sunk into the face it
    // ends up *behind* the eye and reads as a separate bar floating above it.
    box([0.135, 0.055, 0.075], 'primary', [x, y + 0.045, FACE_Z + 0.005], {
      rotation: [0, 0, -side * 0.14],
      taper: [1, 0.85],
    }),
    // Moss brow, sitting on the lid and splaying outward.
    box([0.15, 0.05, 0.09], 'organic', [x + side * 0.012, y + 0.098, FACE_Z - 0.015], {
      rotation: [0, 0, -side * 0.22],
      taper: [1, 0.7],
    }),
  ];
}

/** An ear, high on the side of the head. The reference has big ones. */
function ear(side: 1 | -1): BoneShape[] {
  const x = side * 0.185;
  return [
    box([0.05, 0.135, 0.105], 'primary', [x, 0.225, -0.005], {
      rotation: [0, 0, side * 0.12],
      taper: [0.7, 1],
    }),
    sphere(0.038, 'primary', [x, 0.16, 0.005], { segments: 7 }),
    box([0.03, 0.07, 0.055], 'secondary', [x + side * 0.014, 0.235, 0.005]),
  ];
}

/**
 * Shaggy white hair down the side of the head, from under the moss to below the
 * jaw.
 *
 * Laid flat against the skull, deep rather than wide. Built as separate strands
 * standing out from the head — which is what shaggy hair does — each one catches
 * the light on its own outer face and the head ends up wearing a set of white
 * paper flags. What actually reads as hair at this scale is a mass hugging the
 * silhouette with a ragged bottom edge, so the strands differ in length and
 * hardly at all in how far they stand off.
 *
 * It stays behind the cheekbone. Brought forward far enough to frame the face it
 * crosses in front of the nose from every three-quarter angle, and a hank of
 * hair over that nose is the one thing on this creature nobody could read.
 */
function temple(side: 1 | -1): BoneShape[] {
  const shapes: BoneShape[] = [];
  // Spaced so a shadow line falls between the hanks. Butted together they fuse
  // into one white board down the side of the head.
  const strands: readonly (readonly [number, number, number])[] = [
    [0.3, 0.23, 0.0],
    [0.3, 0.31, -0.115],
    [0.28, 0.21, -0.225],
  ];

  for (let i = 0; i < strands.length; i++) {
    const [y, length, z] = strands[i] as readonly [number, number, number];
    shapes.push(
      box([0.05, length, 0.09], 'detail', [side * 0.185, y - length * 0.5, z], {
        rotation: [0, 0, side * 0.06],
        taper: [0.7, 1],
      }),
    );
  }

  return shapes;
}

/**
 * The mouth: one dark line on the front of the face.
 *
 * A line, and nothing else. The nose hangs over this spot and leaves it in
 * shadow from every angle above the horizon, so a mouth built as a dark band
 * with a lip under it comes out as a single black smear the size of the chin —
 * it was, on the first render. What survives here is one edge the eye can find
 * under the nose.
 */
function mouth(): BoneShape[] {
  return [box([0.095, 0.02, 0.035], 'accent', [0, 0.115, FACE_Z - 0.02])];
}

/**
 * The beard: three white tufts hanging off the jaw, longest in the middle.
 *
 * Carried well forward of the chin, because a beard hanging plumb from a jaw
 * that sits over a trunk this wide hangs *inside* the trunk. The first version
 * did, and every strand of it was swallowed by the chest from the moment it
 * passed the shoulders. Out here it lies over the front of the chest instead,
 * which is also what the reference does.
 */
function beard(): BoneShape[] {
  const shapes: BoneShape[] = [];
  // The middle one is the widest and the furthest forward, so it closes the gap
  // between the other two. Three equal tufts leave the chin's own shadow showing
  // between them and the beard reads as a pair of white tusks.
  const tufts: readonly (readonly [number, number, number])[] = [
    [0, 0.19, 0.195],
    [0.075, 0.14, 0.15],
    [-0.075, 0.14, 0.15],
  ];

  for (let i = 0; i < tufts.length; i++) {
    const [x, length, z] = tufts[i] as readonly [number, number, number];
    shapes.push(
      box([x === 0 ? 0.125 : 0.09, length, 0.09], 'detail', [x, -0.075 - length * 0.5, z], {
        taper: [0.4, 1],
      }),
    );
  }

  return shapes;
}

/**
 * The moss growing over the crown, and the leaves in it.
 *
 * A slab with clumps sitting on it rather than one dome: the reference is a head
 * with a hedge on it, and a smooth green cap reads as a swimming hat. The clumps
 * alternate between the two greens for the same reason the palette carries two —
 * one flat green over a mass this size is a painted lump.
 */
function mossCap(): BoneShape[] {
  const shapes: BoneShape[] = [
    box([0.42, 0.17, 0.42], 'organic', [0, 0.44, -0.015], { taper: [1, 0.86] }),
    // The dark rim under the moss, which is what stops the cap reading as a hat
    // sitting on the head rather than as growth on it.
    box([0.4, 0.05, 0.4], 'metal', [0, 0.35, -0.015]),
    // Down the back of the head, where the reference's moss hangs longest.
    box([0.34, 0.32, 0.11], 'organic', [0, 0.28, -0.2], { taper: [0.7, 1] }),
  ];

  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    // Sunk into the cap rather than sitting on it. Perched on the surface, the
    // two clumps nearest the front stand up over the silhouette and read as
    // horns.
    shapes.push(
      sphere(0.075, i % 2 === 0 ? 'organic' : 'metal', [
        Math.cos(angle) * 0.14,
        0.5 + (i % 3) * 0.014,
        -Math.sin(angle) * 0.14 - 0.02,
      ], { segments: 7 }),
    );
  }

  return shapes;
}

// --- The trunk --------------------------------------------------------------

/**
 * A panel of bare bark on the front of the trunk.
 *
 * One plate, not a ring of staves. Strips stepped around the barrel were tried
 * first, and vertical bars of bare wood alternating with green at that spacing
 * turn the trunk into a picket fence — the two colours end up reading as the
 * *same* mass, striped, instead of as moss growing over wood.
 */
function barkPanel(y: number, height: number, radius: number): BoneShape[] {
  return [
    box([0.2, height, 0.07], 'secondary', [0, y, radius - 0.025], { taper: [0.85, 1] }),
    // A knot, off centre so the panel is not symmetrical about the spine.
    sphere(0.05, 'accent', [0.06, y + height * 0.2, radius - 0.005], { segments: 7 }),
  ];
}

/**
 * The moss over the shoulders: one mass with clumps in it.
 *
 * A ring of drooping flaps was the first attempt and it came out as a grass
 * skirt worn on the shoulders — nine separate green tongues around a barrel read
 * as fringe, not as moss, and they hid the trunk they were supposed to be
 * growing on. A dome with clumps sunk into it keeps the torso's silhouette and
 * still breaks the outline.
 */
function shoulderMoss(): BoneShape[] {
  const shapes: BoneShape[] = [
    cyl([0.19, 0.245, 0.13], 'organic', [0, 0.085, 0], { segments: 10 }),
    cyl([0.248, 0.244, 0.06], 'metal', [0, 0.0, 0], { segments: 10 }),
  ];

  const count = 6;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    shapes.push(
      sphere(0.082, i % 2 === 0 ? 'organic' : 'metal', [
        Math.cos(angle) * 0.175,
        0.075 + (i % 3) * 0.018,
        -Math.sin(angle) * 0.175,
      ], { segments: 7 }),
    );
  }

  return shapes;
}

/**
 * The fringe of roots hanging off the hips.
 *
 * Lengths are staggered rather than equal — a level hem reads as a skirt, and
 * this is supposed to be growth. None of them reaches anywhere near the ground:
 * `CreatureAsset` grounds the creature by its lowest vertex, so a root hanging
 * below the soles would lift the whole figure and leave it hovering.
 */
function rootFringe(): BoneShape[] {
  const shapes: BoneShape[] = [];
  const count = 8;
  // Outside the pelvis it hangs from, not flush with it: at the same radius the
  // whole fringe disappears inside the drum's own silhouette from the front, and
  // the creature comes out standing on a green table.
  const radius = 0.19;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const length = 0.16 + ((i * 3) % 5) * 0.03;
    shapes.push(
      // Wood, not the near-black of the root tips. At the fringe's own width a
      // ring of the darkest colour in the palette reads as a row of spikes.
      box([0.07, length, 0.06], 'secondary', [
        Math.cos(angle) * radius,
        -0.05 - length * 0.5,
        -Math.sin(angle) * radius,
      ], { rotation: [0, angle, 0], taper: [0.3, 1] }),
    );
  }

  return shapes;
}

// --- Limbs ------------------------------------------------------------------

/**
 * One arm: a bare wooden limb hanging from under the mantle, ending in a hand of
 * roots.
 *
 * Long on purpose — the fingertips reach the knees. The reference's arms are a
 * pair of dangling branches, and an arm cut to human proportion on a body this
 * squat reads as a stump.
 */
function arm(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    bone('shoulder' + side, 'chest', [sign * 0.225, 0.0, 0], [
      sphere(0.078, 'primary', [0, 0, 0], { segments: 8 }),
    ], [0, 0, sign * 0.1]),

    bone('upperArm' + side, 'shoulder' + side, [0, 0, 0], [
      cyl([0.068, 0.056, 0.26], 'primary', [0, -0.13, 0], { segments: 8 }),
      // A knot of bark part way down, which is what stops the limb reading as a
      // length of pipe.
      sphere(0.062, 'secondary', [0, -0.19, 0.012], { segments: 7 }),
      sphere(0.055, 'primary', [0, -0.26, 0], { segments: 7 }),
    ]),

    bone('lowerArm' + side, 'upperArm' + side, [0, -0.26, 0], [
      cyl([0.054, 0.046, 0.24], 'primary', [0, -0.12, 0], { segments: 8 }),
      box([0.036, 0.11, 0.036], 'secondary', [sign * 0.03, -0.15, 0.02], {
        rotation: [0, 0, -sign * 0.3],
        taper: [0.6, 1],
      }),
    ]),

    bone('hand' + side, 'lowerArm' + side, [0, -0.24, 0], rootHand(sign)),
  ];
}

/**
 * A hand of roots: a small palm with four long fingers fanned off it and a
 * thumb.
 *
 * Every finger is placed by walking out from its own knuckle along its own
 * splay angle — `rotZ(φ)` sends the shape's local `-Y` to `(sin φ, -cos φ, 0)` —
 * rather than being offset and then rotated in place, which would swing each
 * finger's root away from the palm and leave the hand as a fan of floating
 * sticks.
 *
 * The thumb is signed off the side so it always ends up medial. Mirroring the
 * raw offset instead puts both thumbs on the same side of the body, which
 * compiles, passes every check, and only looks wrong on screen.
 */
function rootHand(sign: 1 | -1): BoneShape[] {
  const shapes: BoneShape[] = [
    box([0.115, 0.1, 0.075], 'primary', [0, -0.05, 0.005], { taper: [0.9, 1] }),
  ];

  const finger = (x: number, y: number, splay: number, length: number, width: number): void => {
    const cx = x + Math.sin(splay) * length * 0.5;
    const cy = y - Math.cos(splay) * length * 0.5;
    shapes.push(
      box([width, length, width], 'primary', [cx, cy, 0.012], {
        rotation: [0, 0, splay],
        taper: [0.45, 1],
      }),
    );
    // Root tip, dark and blunt, at the end of the finger.
    shapes.push(
      sphere(width * 0.42, 'accent', [
        x + Math.sin(splay) * length,
        y - Math.cos(splay) * length,
        0.012,
      ], { segments: 6 }),
    );
  };

  for (let i = 0; i < 4; i++) {
    const t = i - 1.5;
    finger(t * 0.036, -0.095, t * 0.2, 0.145 - Math.abs(t) * 0.016, 0.032);
  }

  // Thumb: shorter, medial, and held well clear of the fingers.
  finger(-sign * 0.055, -0.06, -sign * 0.85, 0.105, 0.034);

  return shapes;
}

/**
 * One leg: short, thick and wrapped in bark, standing on an enormous foot.
 *
 * Barely visible from the front under the root fringe, which is exactly how the
 * reference reads: the creature appears to stand directly on its feet.
 */
function leg(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    bone('upperLeg' + side, 'hips', [sign * 0.135, -0.045, 0], [
      cyl([0.105, 0.09, 0.2], 'primary', [0, -0.1, 0], { segments: 8 }),
      // Bark rings. Two bands rather than a texture — at this size that is all
      // the wood grain that survives.
      cyl([0.108, 0.108, 0.035], 'secondary', [0, -0.075, 0], { segments: 8 }),
      sphere(0.088, 'primary', [0, -0.195, 0], { segments: 7 }),
    ]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -(HIP_Y - 0.045 - KNEE_Y), 0], [
      cyl([0.088, 0.078, 0.23], 'primary', [0, -0.115, 0], { segments: 8 }),
      cyl([0.092, 0.092, 0.032], 'secondary', [0, -0.16, 0], { segments: 8 }),
      // Calf, behind the shin.
      sphere(0.072, 'primary', [0, -0.085, -0.022], { segments: 7 }),
    ]),

    // Turned out at the ankle rather than at the hip: the reference's feet splay
    // while the legs stay square, and `BipedAnimator` only ever writes
    // `rotation.x` on a foot, so the yaw survives the walk cycle.
    bone('foot' + side, 'lowerLeg' + side, [0, -(KNEE_Y - ANKLE_Y), 0], foot(sign), [
      0.05,
      sign * 0.19,
      0,
    ]),
  ];
}

/** Toe widths and how far forward each one reaches, from the big toe out. */
const TOES: readonly (readonly [number, number])[] = [
  [0.072, 0.378],
  [0.052, 0.39],
  [0.048, 0.378],
  [0.043, 0.357],
  [0.037, 0.33],
];

/** Where the ball of the foot ends and the toes begin. */
const TOE_LINE = 0.285;

/**
 * A bare human foot, three tenths of the creature's height long.
 *
 * Every height is derived from {@link ANKLE_Y} so both soles land on `y = 0`
 * exactly: `CreatureAsset` grounds by the lowest vertex, so a sole a hair below
 * its partner tips the entire creature, and the verification harness would still
 * wave it through.
 *
 * The toes are five separate blocks with nails on them, not a rounded end. A
 * slab reads as a boot, and a boot on this creature loses half the joke — the
 * feet are the punchline and they have to be unmistakably bare.
 */
function foot(sign: 1 | -1): BoneShape[] {
  const sole = -ANKLE_Y;
  const shapes: BoneShape[] = [
    // Sole slab, flat on the ground for its whole length.
    box([0.27, 0.06, 0.44], 'primary', [0, sole + 0.03, 0.09]),
    // Instep, rising from the ball of the foot back to the ankle.
    box([0.25, 0.11, 0.32], 'primary', [0, sole + 0.085, 0.05], { taper: [1, 0.72] }),
    // Heel and ankle.
    box([0.2, 0.1, 0.11], 'primary', [0, sole + 0.05, -0.105]),
    sphere(0.088, 'primary', [0, sole + 0.09, -0.035], { segments: 8 }),
    // The knuckle line the toes come off, which is what keeps them from looking
    // stuck onto a flat edge.
    box([0.265, 0.075, 0.07], 'primary', [0, sole + 0.038, TOE_LINE - 0.02], {
      taper: [1, 0.85],
    }),
  ];

  for (let i = 0; i < TOES.length; i++) {
    const [width, reach] = TOES[i] as readonly [number, number];
    // Signed rather than mirrored, so the big toe is always the medial one.
    const x = sign * (-0.11 + i * 0.056);
    const length = reach - TOE_LINE;
    const z = (TOE_LINE + reach) * 0.5;

    shapes.push(
      box([width, 0.062, length], 'primary', [x, sole + 0.031, z]),
      sphere(width * 0.5, 'primary', [x, sole + 0.031, reach], { segments: 6 }),
      // Nail, laid on the top face and standing a hair proud of it.
      box([width * 0.62, 0.014, length * 0.45], 'detail', [
        x,
        sole + 0.065,
        reach - length * 0.28,
      ]),
    );
  }

  return shapes;
}

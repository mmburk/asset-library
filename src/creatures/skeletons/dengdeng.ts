import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cyl, mirrorX, socket, sphere } from './helpers';

const TAU = Math.PI * 2;

/** World height of the ankle pivot. */
const ANKLE_Y = 0.16;

/** World height of the knee. */
const KNEE_Y = 0.46;

/** World height of the hip pivot. */
const HIP_Y = 0.74;

/** World height of the waist. */
const WAIST_Y = 0.90;

/** World height of the shoulder line. */
const CHEST_Y = 1.30;

/** World height of the base of the neck. */
const NECK_Y = 1.44;

/** World height of the head bone's pivot. */
const HEAD_Y = 1.62;

/** Half the depth of the skull — the plane the face is built on. */
const FACE_Z = 0.26;

/**
 * Brr Brr Deng Deng (also known as Brr Brr Patapim / Trollfoot).
 *
 * Procedural low-poly Three.js skeleton modeled directly from the viral meme character:
 * - Imposing monumental size with an arch formed by two massive mossy trunk legs.
 * - Wise, elderly Proboscis Monkey (Bekantan) head with a giant drooping bulbous nose.
 * - Thick curly dark mossy hair on top, framed by sweeping bushy white whiskers and beard.
 * - Deep hooded golden primate eyes with calm/knowing expression.
 * - Massive arched mossy bark legs wrapped in winding gnarled root tendrils.
 * - COMICALLY GIGANTIC, ultra-wide bare human feet taking up the foreground with
 *   5 individually modeled toes, toenails, and prominent vascular tendon ridges.
 * - Spindly dangling woody arms with root fingers.
 */
export function createBrrBrrDengDengSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Hips and root fringe ------------------------------------------------
    bone('hips', null, [0, HIP_Y, 0], [
      cyl([0.28, 0.25, 0.22], 'organic', [0, -0.05, 0], { segments: 10 }),
      cyl([0.25, 0.26, 0.11], 'metal', [0, -0.10, 0], { segments: 10 }),
      ...hipRootFringe(),
    ]),

    // --- Trunk / Arch --------------------------------------------------------
    bone('spine', 'hips', [0, WAIST_Y - HIP_Y, 0], [
      cyl([0.30, 0.27, 0.24], 'organic', [0, 0.10, 0], { segments: 10 }),
      ...trunkBarkPlates(0.10, 0.22, 0.28),
    ]),

    bone('chest', 'spine', [0, CHEST_Y - WAIST_Y, 0], [
      cyl([0.34, 0.29, 0.32], 'organic', [0, -0.10, 0], { segments: 10 }),
      ...trunkBarkPlates(-0.11, 0.24, 0.31),
      ...shoulderMossMantle(),
      ...chestRootVines(),
    ]),

    // Neck
    bone('neck', 'chest', [0, NECK_Y - CHEST_Y, 0], [
      cyl([0.15, 0.18, 0.14], 'primary', [0, 0.03, 0], { segments: 8 }),
    ]),

    // --- Head ----------------------------------------------------------------
    bone('head', 'neck', [0, HEAD_Y - NECK_Y, 0], [
      ...skull(),
      ...hairCap(),
      ...eye(1),
      ...eye(-1),
      ...ear(1),
      ...ear(-1),
      ...cheekWhiskers(1),
      ...cheekWhiskers(-1),
      ...proboscisNose(),
      ...mouth(),
    ]),

    // Jaw & flowing beard
    bone('jaw', 'head', [0, 0.10, 0.08], [
      sphere(0.14, 'primary', [0, -0.06, 0.11], { segments: 8 }),
      ...flowingBeard(),
    ]),

    // --- Arms ----------------------------------------------------------------
    ...arm('L', 1),
    ...arm('R', -1),

    // --- Legs & Giant Feet ---------------------------------------------------
    ...leg('L', 1),
    ...leg('R', -1),
  ];

  return {
    name: 'brr-brr-deng-deng',
    plan: 'biped',
    nominalHeight: 2.45,
    bones,
    sockets: [
      socket('handL', 'handL', [0, -0.09, 0.02]),
      socket('handR', 'handR', [0, -0.09, 0.02]),
      socket('head', 'head', [0, 0.78, 0]),
      socket('jaw', 'jaw', [0, -0.07, 0.19]),
      socket('nose', 'head', proboscisTip(0.04)),
      socket('chest', 'chest', [0, 0, 0.32]),
      socket('back', 'chest', [0, 0, -0.32]),
      socket('hipL', 'hips', [0.28, 0, 0]),
      socket('hipR', 'hips', mirrorX([0.28, 0, 0])),
    ],
  };
}

// --- Proboscis Monkey Nose --------------------------------------------------

/** Where the proboscis leaves the brow in head space. */
const PROBOSCIS_ROOT: readonly [number, number, number] = [0, 0.48, 0.18];

/**
 * Path of the proboscis: `[tilt, length, width, depth]` per segment.
 * Sweeps forward then dramatically down past the mouth with bulbous swelling.
 */
const PROBOSCIS_PATH: readonly (readonly [number, number, number, number])[] = [
  [0.68, 0.12, 0.12, 0.22],
  [0.56, 0.125, 0.135, 0.21],
  [0.44, 0.125, 0.15, 0.21],
  [0.30, 0.12, 0.165, 0.22],
  [0.18, 0.11, 0.175, 0.23],
];

function proboscisTip(beyond = 0): readonly [number, number, number] {
  let y = PROBOSCIS_ROOT[1];
  let z = PROBOSCIS_ROOT[2];
  let tilt = 0;
  for (let i = 0; i < PROBOSCIS_PATH.length; i++) {
    const [angle, length] = PROBOSCIS_PATH[i] as readonly [number, number, number, number];
    y -= Math.cos(angle) * length;
    z += Math.sin(angle) * length;
    tilt = angle;
  }
  return [0, y - Math.cos(tilt) * beyond, z + Math.sin(tilt) * beyond];
}

function proboscisNose(): BoneShape[] {
  const shapes: BoneShape[] = [];
  let y = PROBOSCIS_ROOT[1];
  let z = PROBOSCIS_ROOT[2];

  for (let i = 0; i < PROBOSCIS_PATH.length; i++) {
    const [tilt, length, width, depth] = PROBOSCIS_PATH[i] as readonly [
      number,
      number,
      number,
      number,
    ];
    const dy = -Math.cos(tilt) * length;
    const dz = Math.sin(tilt) * length;

    const color = i >= 2 ? 'accent' : 'primary';

    shapes.push(
      box([width, length * 1.16, depth], color, [0, y + dy * 0.5, z + dz * 0.5], {
        rotation: [-tilt, 0, 0],
      }),
    );

    y += dy;
    z += dz;
  }

  // Fleshy massive bulbous nose tip
  shapes.push(sphere(0.11, 'accent', [0, y + 0.015, z - 0.01], { segments: 10 }));
  shapes.push(sphere(0.09, 'accent', [0, y - 0.02, z - 0.02], { segments: 8 }));

  // Nostrils on underside
  shapes.push(box([0.045, 0.04, 0.06], 'metal', [0.05, y - 0.048, z - 0.03]));
  shapes.push(box([0.045, 0.04, 0.06], 'metal', [-0.05, y - 0.048, z - 0.03]));

  return shapes;
}

// --- Skull & Primate Facial Features ----------------------------------------

function skull(): BoneShape[] {
  return [
    // Main skull mass
    box([0.50, 0.50, 0.50], 'primary', [0, 0.26, 0], { taper: [0.85, 1] }),
    sphere(0.25, 'primary', [0, 0.44, 0], { segments: 10 }),
    // Prominent cheekbones
    sphere(0.10, 'primary', [0.20, 0.23, 0.16], { segments: 7 }),
    sphere(0.10, 'primary', [-0.20, 0.23, 0.16], { segments: 7 }),
    // Muzzle backing
    box([0.24, 0.20, 0.18], 'primary', [0, 0.18, 0.16]),
  ];
}

function eye(side: 1 | -1): BoneShape[] {
  const x = side * 0.155;
  const y = 0.42;
  return [
    // Deep eye socket hollow
    box([0.16, 0.14, 0.06], 'secondary', [x, y, FACE_Z - 0.015]),
    // Golden amber primate eye
    cyl([0.062, 0.062, 0.055], 'eye', [x, y - 0.006, FACE_Z + 0.02], {
      rotation: [Math.PI * 0.5, 0, 0],
      segments: 10,
    }),
    // Pupil
    box([0.028, 0.06, 0.04], 'metal', [x, y - 0.006, FACE_Z + 0.05]),
    // Heavy hooded skin eyelid
    box([0.18, 0.07, 0.095], 'primary', [x, y + 0.058, FACE_Z + 0.008], {
      rotation: [0, 0, -side * 0.13],
      taper: [1, 0.85],
    }),
    // Mossy eyebrow ridge
    box([0.20, 0.068, 0.11], 'organic', [x + side * 0.015, y + 0.13, FACE_Z - 0.02], {
      rotation: [0, 0, -side * 0.20],
      taper: [1, 0.7],
    }),
  ];
}

function ear(side: 1 | -1): BoneShape[] {
  const x = side * 0.25;
  return [
    box([0.065, 0.18, 0.14], 'primary', [x, 0.30, -0.01], {
      rotation: [0, 0, side * 0.12],
      taper: [0.7, 1],
    }),
    sphere(0.052, 'primary', [x, 0.21, 0.01], { segments: 7 }),
    box([0.04, 0.095, 0.075], 'secondary', [x + side * 0.02, 0.31, 0.01]),
  ];
}

/** Bushy white cheek fur and sideburns framing the face. */
function cheekWhiskers(side: 1 | -1): BoneShape[] {
  const shapes: BoneShape[] = [];
  const strands: readonly (readonly [number, number, number, number])[] = [
    [0.42, 0.33, 0.03, side * 0.18],
    [0.40, 0.42, -0.13, side * 0.12],
    [0.36, 0.30, -0.28, side * 0.06],
    // Lower cheek tuft flaring outward
    [0.26, 0.28, 0.10, side * 0.32],
  ];

  for (let i = 0; i < strands.length; i++) {
    const [y, length, z, roll] = strands[i] as readonly [number, number, number, number];
    shapes.push(
      box([0.085, length, 0.12], 'detail', [side * 0.245, y - length * 0.5, z], {
        rotation: [0, 0, roll],
        taper: [0.6, 1],
      }),
    );
  }

  return shapes;
}

function mouth(): BoneShape[] {
  return [
    box([0.13, 0.032, 0.05], 'metal', [0, 0.15, FACE_Z - 0.022]),
    box([0.11, 0.04, 0.065], 'primary', [0, 0.11, FACE_Z - 0.012]),
  ];
}

/** Shaggy white beard on the jaw sweeping forward over the chest. */
function flowingBeard(): BoneShape[] {
  const shapes: BoneShape[] = [];
  const tufts: readonly (readonly [number, number, number, number])[] = [
    [0, 0.28, 0.26, 0],
    [0.10, 0.21, 0.21, 0.15],
    [-0.10, 0.21, 0.21, -0.15],
    [0.18, 0.16, 0.14, 0.28],
    [-0.18, 0.16, 0.14, -0.28],
  ];

  for (let i = 0; i < tufts.length; i++) {
    const [x, length, z, roll] = tufts[i] as readonly [number, number, number, number];
    shapes.push(
      box([x === 0 ? 0.17 : 0.11, length, 0.12], 'detail', [x, -0.09 - length * 0.5, z], {
        rotation: [0, 0, roll],
        taper: [0.35, 1],
      }),
    );
  }

  return shapes;
}

/** Dark curly moss/hair crown atop the head. */
function hairCap(): BoneShape[] {
  const shapes: BoneShape[] = [
    box([0.56, 0.24, 0.56], 'metal', [0, 0.58, -0.02], { taper: [1, 0.85] }),
    box([0.46, 0.44, 0.16], 'metal', [0, 0.38, -0.27], { taper: [0.65, 1] }),
  ];

  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    shapes.push(
      sphere(0.105, i % 2 === 0 ? 'metal' : 'organic', [
        Math.cos(angle) * 0.19,
        0.66 + (i % 3) * 0.02,
        -Math.sin(angle) * 0.19 - 0.025,
      ], { segments: 7 }),
    );
  }

  return shapes;
}

// --- Trunk & Moss Mantle ----------------------------------------------------

function trunkBarkPlates(y: number, height: number, radius: number): BoneShape[] {
  return [
    box([0.27, height, 0.10], 'secondary', [0, y, radius - 0.03], { taper: [0.85, 1] }),
    sphere(0.07, 'accent', [0.08, y + height * 0.2, radius - 0.005], { segments: 7 }),
  ];
}

function shoulderMossMantle(): BoneShape[] {
  const shapes: BoneShape[] = [
    cyl([0.26, 0.34, 0.18], 'organic', [0, 0.12, 0], { segments: 10 }),
    cyl([0.34, 0.33, 0.09], 'metal', [0, 0.0, 0], { segments: 10 }),
  ];

  const count = 9;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    shapes.push(
      sphere(0.115, i % 2 === 0 ? 'organic' : 'metal', [
        Math.cos(angle) * 0.25,
        0.10 + (i % 3) * 0.025,
        -Math.sin(angle) * 0.25,
      ], { segments: 7 }),
    );
  }

  return shapes;
}

/** Root vines sprawling across the chest and shoulders. */
function chestRootVines(): BoneShape[] {
  return [
    box([0.06, 0.36, 0.06], 'secondary', [0.08, -0.07, 0.31], {
      rotation: [0, 0, 0.45],
      taper: [0.7, 1],
    }),
    box([0.05, 0.31, 0.05], 'detail', [-0.10, -0.08, 0.30], {
      rotation: [0, 0, -0.55],
      taper: [0.6, 1],
    }),
    sphere(0.055, 'accent', [0, -0.16, 0.31], { segments: 6 }),
  ];
}

function hipRootFringe(): BoneShape[] {
  const shapes: BoneShape[] = [];
  const count = 10;
  const radius = 0.26;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU;
    const length = 0.24 + ((i * 3) % 5) * 0.045;
    shapes.push(
      box([0.095, length, 0.085], 'secondary', [
        Math.cos(angle) * radius,
        -0.06 - length * 0.5,
        -Math.sin(angle) * radius,
      ], { rotation: [0, angle, 0], taper: [0.3, 1] }),
    );
  }

  return shapes;
}

// --- Limbs ------------------------------------------------------------------

function arm(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    bone('shoulder' + side, 'chest', [sign * 0.31, 0.0, 0], [
      sphere(0.105, 'organic', [0, 0, 0], { segments: 8 }),
    ], [0, 0, sign * 0.1]),

    bone('upperArm' + side, 'shoulder' + side, [0, 0, 0], [
      cyl([0.09, 0.075, 0.34], 'primary', [0, -0.17, 0], { segments: 8 }),
      sphere(0.085, 'secondary', [0, -0.25, 0.015], { segments: 7 }),
      sphere(0.075, 'primary', [0, -0.34, 0], { segments: 7 }),
      box([0.04, 0.24, 0.04], 'detail', [sign * 0.05, -0.16, 0.025], {
        rotation: [0, 0, -sign * 0.35],
      }),
    ]),

    bone('lowerArm' + side, 'upperArm' + side, [0, -0.34, 0], [
      cyl([0.072, 0.062, 0.31], 'primary', [0, -0.155, 0], { segments: 8 }),
      box([0.05, 0.16, 0.05], 'secondary', [sign * 0.04, -0.19, 0.025], {
        rotation: [0, 0, -sign * 0.3],
        taper: [0.6, 1],
      }),
      box([0.032, 0.21, 0.032], 'detail', [-sign * 0.04, -0.13, 0.015], {
        rotation: [0, 0, sign * 0.25],
      }),
    ]),

    bone('hand' + side, 'lowerArm' + side, [0, -0.31, 0], rootHand(sign)),
  ];
}

function rootHand(sign: 1 | -1): BoneShape[] {
  const shapes: BoneShape[] = [
    box([0.16, 0.13, 0.10], 'primary', [0, -0.065, 0.006], { taper: [0.9, 1] }),
  ];

  const finger = (x: number, y: number, splay: number, length: number, width: number): void => {
    const cx = x + Math.sin(splay) * length * 0.5;
    const cy = y - Math.cos(splay) * length * 0.5;
    shapes.push(
      box([width, length, width], 'primary', [cx, cy, 0.015], {
        rotation: [0, 0, splay],
        taper: [0.45, 1],
      }),
    );
    shapes.push(
      sphere(width * 0.45, 'accent', [
        x + Math.sin(splay) * length,
        y - Math.cos(splay) * length,
        0.015,
      ], { segments: 6 }),
    );
  };

  for (let i = 0; i < 4; i++) {
    const t = i - 1.5;
    finger(t * 0.05, -0.125, t * 0.22, 0.195 - Math.abs(t) * 0.02, 0.043);
  }

  // Thumb
  finger(-sign * 0.075, -0.08, -sign * 0.85, 0.14, 0.045);

  return shapes;
}

// --- Legs & Monster Giant Feet ----------------------------------------------

function leg(side: 'L' | 'R', sign: 1 | -1): BoneDefinition[] {
  return [
    bone('upperLeg' + side, 'hips', [sign * 0.19, -0.06, 0], [
      // Thick mossy thigh trunk
      cyl([0.16, 0.14, 0.28], 'organic', [0, -0.14, 0], { segments: 8 }),
      cyl([0.15, 0.15, 0.055], 'metal', [0, -0.10, 0], { segments: 8 }),
      sphere(0.13, 'organic', [0, -0.28, 0], { segments: 7 }),
      ...thighRootTendrils(sign),
    ]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -(HIP_Y - 0.06 - KNEE_Y), 0], [
      // Mossy shin
      cyl([0.135, 0.12, 0.32], 'organic', [0, -0.16, 0], { segments: 8 }),
      cyl([0.13, 0.13, 0.045], 'metal', [0, -0.22, 0], { segments: 8 }),
      sphere(0.11, 'organic', [0, -0.12, -0.035], { segments: 7 }),
      ...shinRootTendrils(sign),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -(KNEE_Y - ANKLE_Y), 0], colossalFoot(sign), [
      0.05,
      sign * 0.22,
      0,
    ]),
  ];
}

function thighRootTendrils(sign: 1 | -1): BoneShape[] {
  return [
    box([0.048, 0.24, 0.048], 'secondary', [sign * 0.10, -0.12, 0.05], {
      rotation: [0.2, 0, -sign * 0.45],
      taper: [0.6, 1],
    }),
    box([0.038, 0.21, 0.038], 'detail', [-sign * 0.09, -0.16, 0.04], {
      rotation: [-0.2, 0, sign * 0.5],
      taper: [0.5, 1],
    }),
  ];
}

function shinRootTendrils(sign: 1 | -1): BoneShape[] {
  return [
    box([0.052, 0.26, 0.052], 'secondary', [sign * 0.08, -0.17, 0.07], {
      rotation: [0.3, 0, -sign * 0.35],
      taper: [0.5, 1],
    }),
    box([0.04, 0.24, 0.04], 'detail', [0, -0.21, 0.085], {
      rotation: [0.35, 0, sign * 0.2],
      taper: [0.5, 1],
    }),
    box([0.044, 0.19, 0.044], 'secondary', [-sign * 0.07, -0.24, 0.055], {
      rotation: [0.2, 0, sign * 0.4],
      taper: [0.4, 1],
    }),
  ];
}

/** Colossal Toe dimensions: `[width, reach]` from big toe to pinky. */
const COLOSSAL_TOES: readonly (readonly [number, number])[] = [
  [0.115, 0.65],
  [0.088, 0.68],
  [0.082, 0.65],
  [0.075, 0.60],
  [0.068, 0.54],
];

const COLOSSAL_TOE_LINE = 0.44;

/**
 * COLOSSAL BARE HUMAN FOOT:
 * - Dominates the entire foreground of the model.
 * - Extra wide sole base, deep fleshy arch, sturdy heel block.
 * - 5 huge articulated toes with large toenails.
 * - Prominent dorsal tendon cables running to each toe digit.
 * - Cascading gnarled root tendrils spilling over the instep.
 */
function colossalFoot(sign: 1 | -1): BoneShape[] {
  const sole = -ANKLE_Y;
  const shapes: BoneShape[] = [
    // Massive sole slab
    box([0.44, 0.085, 0.72], 'primary', [0, sole + 0.042, 0.18]),
    // Arch / Instep
    box([0.40, 0.16, 0.54], 'primary', [0, sole + 0.12, 0.11], { taper: [1, 0.72] }),
    // Heel & ankle block
    box([0.32, 0.145, 0.19], 'primary', [0, sole + 0.075, -0.16]),
    sphere(0.14, 'primary', [0, sole + 0.13, -0.05], { segments: 8 }),
    // Metatarsal knuckle line
    box([0.43, 0.11, 0.12], 'primary', [0, sole + 0.055, COLOSSAL_TOE_LINE - 0.03], {
      taper: [1, 0.85],
    }),

    // --- Dorsal Tendons / Veins to Toes -------------------------------------
    box([0.038, 0.026, 0.36], 'secondary', [-sign * 0.08, sole + 0.125, 0.24], {
      rotation: [-0.25, 0, sign * 0.1],
      taper: [0.6, 1],
    }),
    box([0.034, 0.024, 0.34], 'secondary', [0, sole + 0.122, 0.25], {
      rotation: [-0.24, 0, 0],
      taper: [0.6, 1],
    }),
    box([0.032, 0.022, 0.32], 'secondary', [sign * 0.07, sole + 0.12, 0.24], {
      rotation: [-0.24, 0, -sign * 0.08],
      taper: [0.6, 1],
    }),

    // --- Root Tendrils cascading onto foot top -------------------------------
    box([0.055, 0.042, 0.28], 'secondary', [0, sole + 0.145, 0.06], {
      rotation: [-0.4, 0, sign * 0.2],
      taper: [0.4, 1],
    }),
    box([0.042, 0.035, 0.22], 'detail', [sign * 0.08, sole + 0.135, 0.12], {
      rotation: [-0.35, 0, -sign * 0.3],
      taper: [0.4, 1],
    }),
    sphere(0.048, 'accent', [sign * 0.11, sole + 0.10, 0.20], { segments: 6 }),
  ];

  // --- 5 Detailed Colossal Toes & Nails -------------------------------------
  for (let i = 0; i < COLOSSAL_TOES.length; i++) {
    const [width, reach] = COLOSSAL_TOES[i] as readonly [number, number];
    const x = sign * (-0.18 + i * 0.092);
    const length = reach - COLOSSAL_TOE_LINE;
    const z = (COLOSSAL_TOE_LINE + reach) * 0.5;

    shapes.push(
      // Toe digit
      box([width, 0.095, length], 'primary', [x, sole + 0.048, z]),
      // Toe knuckle bump
      sphere(width * 0.54, 'primary', [x, sole + 0.055, COLOSSAL_TOE_LINE + length * 0.3], {
        segments: 6,
      }),
      // Rounded toe tip pad
      sphere(width * 0.54, 'primary', [x, sole + 0.048, reach], { segments: 6 }),
      // Toenail
      box([width * 0.65, 0.02, length * 0.46], 'detail', [
        x,
        sole + 0.10,
        reach - length * 0.26,
      ]),
    );
  }

  return shapes;
}

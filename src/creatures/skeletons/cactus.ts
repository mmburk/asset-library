import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cone, cyl, eyes, legChain, socket, sphere } from './helpers';

/**
 * Cactus Walker — the hybrid reference skeleton.
 *
 * A ribbed cactus trunk carrying a fruit crown, walking on four articulated
 * roots. It exists to prove out the parts of the system the other four plans do
 * not touch: a radial leg arrangement instead of a bilateral one, a top-heavy
 * mass that has to be stabilised by a lagging crown, and swappable produce
 * modules hung off sockets.
 *
 * Root bones use the `rootA` … `rootD` prefixes {@link HybridWalkAnimator}
 * drives in a staggered wave.
 */
export function createCactusSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Trunk -------------------------------------------------------------
    bone('trunk', null, [0, 0.42, 0], [
      cyl([0.17, 0.21, 0.54], 'organic', [0, 0.27, 0], { segments: 8 }),
      // Vertical ribs, the detail that makes it read as a cactus rather than
      // as a green cylinder.
      ...ribs(6, 0.185, 0.5, 0.27),
      // Spines.
      ...spines(10, 0.2, 0.06, 0.48),
    ]),

    bone('crown', 'trunk', [0, 0.54, 0], [
      sphere(0.2, 'organic', [0, 0.06, 0], { segments: 8 }),
      // Flower.
      cone(0.07, 0.1, 'accent', [0, 0.24, 0], { segments: 6 }),
      // Bananas, radially arranged.
      ...bananas(3, 0.19, 0.06),
    ]),

    bone('head', 'crown', [0, 0.08, 0.06], [
      box([0.19, 0.16, 0.16], 'organic', [0, 0.03, 0.06], { taper: [0.9, 1.0] }),
      ...eyes(0.055, 0.06, 0.14, 0.042),
    ]),

    bone('jaw', 'head', [0, -0.03, 0.06], [
      box([0.15, 0.05, 0.14], 'organic', [0, -0.02, 0.05]),
      box([0.12, 0.02, 0.12], 'detail', [0, 0.005, 0.05]),
    ]),

    // --- Arms --------------------------------------------------------------
    ...cactusArm('armL', 1),
    ...cactusArm('armR', -1),

    // --- Roots -------------------------------------------------------------
    // Four roots on a radial layout rather than a bilateral one.
    ...rootLeg('rootA', [0.14, -0.02, 0.11], 0.32),
    ...rootLeg('rootB', [-0.14, -0.02, 0.11], -0.32),
    ...rootLeg('rootC', [0.14, -0.02, -0.11], 0.32),
    ...rootLeg('rootD', [-0.14, -0.02, -0.11], -0.32),
  ];

  return {
    name: 'cactus-walker',
    plan: 'hybrid',
    nominalHeight: 1.25,
    bones,
    sockets: [
      socket('crown', 'crown', [0, 0.26, 0]),
      socket('head', 'head', [0, 0.14, 0]),
      socket('jaw', 'jaw', [0, -0.04, 0.12]),
      socket('handL', 'armL', [0.02, 0.26, 0]),
      socket('handR', 'armR', [-0.02, 0.26, 0]),
      socket('trunkFront', 'trunk', [0, 0.3, 0.19]),
    ],
  };
}

function cactusArm(name: string, sign: number): BoneDefinition[] {
  return [
    bone(
      name,
      'trunk',
      [sign * 0.15, 0.28, 0],
      [
        cyl([0.055, 0.065, 0.2], 'organic', [0, 0.1, 0], { segments: 7 }),
        // Elbow, then the segment that turns back upward — the classic
        // saguaro silhouette.
        sphere(0.06, 'organic', [0, 0.2, 0], { segments: 7 }),
        cyl([0.05, 0.055, 0.18], 'organic', [sign * 0.03, 0.29, 0], {
          segments: 7,
          rotation: [0, 0, -sign * 0.35],
        }),
        cone(0.035, 0.06, 'accent', [sign * 0.06, 0.39, 0], { segments: 6 }),
      ],
      [0, 0, sign * 0.55],
    ),
  ];
}

function rootLeg(
  prefix: string,
  attach: readonly [number, number, number],
  splay: number,
): BoneDefinition[] {
  return legChain(
    prefix,
    'trunk',
    attach,
    0.2,
    0.18,
    [cyl([0.06, 0.05, 0.2], 'organic', [0, -0.1, 0], { segments: 6 })],
    [cyl([0.05, 0.04, 0.18], 'organic', [0, -0.09, 0], { segments: 6 })],
    'Tip',
    [
      cone(0.045, 0.1, 'organic', [0, -0.05, 0], { rotation: [Math.PI, 0, 0], segments: 6 }),
      // Toe roots that splay forward, so the foot has some grip on the ground.
      cone(0.022, 0.06, 'organic', [0.03, -0.06, 0.04], { rotation: [Math.PI, 0, 0], segments: 5 }),
      cone(0.022, 0.06, 'organic', [-0.03, -0.06, 0.04], { rotation: [Math.PI, 0, 0], segments: 5 }),
    ],
    [0, 0, splay],
  );
}

/** Vertical ribs around the trunk. */
function ribs(count: number, radius: number, height: number, centreY: number): BoneShape[] {
  const shapes: BoneShape[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    shapes.push(
      box([0.045, height, 0.045], 'accent', [Math.sin(angle) * radius, centreY, Math.cos(angle) * radius], {
        rotation: [0, angle, 0],
        taper: [0.8, 0.9],
      }),
    );
  }
  return shapes;
}

/** Spines scattered around the trunk on a deterministic spiral. */
function spines(count: number, radius: number, length: number, height: number): BoneShape[] {
  const shapes: BoneShape[] = [];
  // A golden-angle spiral distributes the spines evenly without any randomness,
  // so the same cactus is identical on every machine.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const angle = i * goldenAngle;
    const y = 0.08 + (i / count) * height;
    shapes.push(
      cone(0.012, length, 'detail', [Math.sin(angle) * radius, y, Math.cos(angle) * radius], {
        rotation: [Math.PI * 0.5, 0, -angle],
        segments: 4,
      }),
    );
  }
  return shapes;
}

/** Bananas hanging off the crown. */
function bananas(count: number, radius: number, height: number): BoneShape[] {
  const shapes: BoneShape[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.4;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    // Three tapered segments arranged along an arc approximate the curve.
    shapes.push(
      cyl([0.032, 0.026, 0.11], 'accent', [x, height + 0.04, z], {
        rotation: [0.35, -angle, 0.5],
        segments: 6,
      }),
      cyl([0.028, 0.02, 0.09], 'accent', [x * 1.22, height - 0.03, z * 1.22], {
        rotation: [0.35, -angle, 0.95],
        segments: 6,
      }),
      cone(0.018, 0.04, 'organic', [x * 1.38, height - 0.09, z * 1.38], {
        rotation: [Math.PI, -angle, 0],
        segments: 5,
      }),
    );
  }
  return shapes;
}

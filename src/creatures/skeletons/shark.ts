import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cyl, eyes, legChain, mirrorX, socket, teeth } from './helpers';

/**
 * Tralalero Shark — the swimmer reference skeleton.
 *
 * A five-segment shark body for the travelling wave, plus the three legs the
 * character is known for, each ending in a generic trainer. The segmented
 * spine is the whole reason this plan exists: `body0` … `body4` are chained
 * parent-to-child so a yaw applied to each in turn compounds down the body and
 * the curve visibly travels toward the tail.
 *
 * Legs use the `legA` / `legB` / `legC` prefixes {@link SwimAnimator} probes
 * for, so they walk on land and trail while swimming.
 */
export function createSharkSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Body chain --------------------------------------------------------
    bone('body0', null, [0, 0.72, 0.3], [
      box([0.34, 0.32, 0.32], 'primary', [0, 0, 0], { taper: [0.94, 1.0] }),
      box([0.28, 0.09, 0.3], 'secondary', [0, -0.14, 0]),
    ]),

    bone('body1', 'body0', [0, 0, -0.28], [
      box([0.33, 0.31, 0.3], 'primary'),
      box([0.27, 0.09, 0.28], 'secondary', [0, -0.135, 0]),
    ]),

    bone('body2', 'body1', [0, 0, -0.27], [
      box([0.29, 0.28, 0.28], 'primary', [0, 0, 0], { taper: [1.0, 0.95] }),
      box([0.24, 0.08, 0.26], 'secondary', [0, -0.12, 0]),
    ]),

    bone('body3', 'body2', [0, 0, -0.25], [
      box([0.23, 0.23, 0.26], 'primary', [0, 0, 0], { taper: [1.0, 0.92] }),
    ]),

    bone('body4', 'body3', [0, 0, -0.22], [
      box([0.16, 0.17, 0.22], 'primary', [0, 0, 0], { taper: [1.0, 0.85] }),
    ]),

    // --- Head --------------------------------------------------------------
    bone('head', 'body0', [0, 0, 0.26], [
      box([0.32, 0.3, 0.3], 'primary', [0, 0, 0.06], { taper: [0.9, 1.0] }),
      // Pointed snout — the shark silhouette lives here.
      box([0.2, 0.16, 0.24], 'primary', [0, 0.03, 0.3], { taper: [1, 0.55] }),
      box([0.24, 0.08, 0.22], 'secondary', [0, -0.09, 0.28]),
      ...eyes(0.12, 0.08, 0.14, 0.05),
      // Gill slits.
      ...gills(3, 0.155, -0.02, -0.02, 0.05),
      ...teeth(4, 0.07, -0.08, 0.36, 0.06, 0.018),
    ]),

    bone('jaw', 'head', [0, -0.08, 0.12], [
      box([0.22, 0.07, 0.3], 'primary', [0, -0.02, 0.14], { taper: [1, 0.7] }),
      box([0.2, 0.03, 0.28], 'detail', [0, 0.015, 0.14]),
    ]),

    // --- Fins --------------------------------------------------------------
    bone('finDorsal', 'body1', [0, 0.15, 0], [
      box([0.035, 0.26, 0.22], 'accent', [0, 0.11, -0.02], { taper: [1, 0.25] }),
    ]),

    bone('finL', 'body0', [0.15, -0.06, 0.02], [
      box([0.22, 0.03, 0.16], 'accent', [0.11, 0, -0.02], { taper: [1, 0.5] }),
    ], [0, 0, -0.35]),

    bone('finR', 'body0', [-0.15, -0.06, 0.02], [
      box([0.22, 0.03, 0.16], 'accent', [-0.11, 0, -0.02], { taper: [1, 0.5] }),
    ], [0, 0, 0.35]),

    // --- Tail fin ----------------------------------------------------------
    bone('tailFin', 'body4', [0, 0, -0.18], [
      // Upper lobe, larger — a shark's tail is deliberately asymmetric.
      box([0.035, 0.34, 0.22], 'accent', [0, 0.13, -0.09], { taper: [1, 0.35] }),
      // Lower lobe.
      box([0.035, 0.2, 0.16], 'accent', [0, -0.09, -0.07], { taper: [1, 0.4] }),
    ]),

    // --- Legs --------------------------------------------------------------
    // Three of them, because that is the character.
    ...sharkLeg('legA', 'body1', [0.13, -0.15, 0.02]),
    ...sharkLeg('legB', 'body1', [-0.13, -0.15, 0.02]),
    ...sharkLeg('legC', 'body3', [0, -0.13, -0.02]),
  ];

  return {
    name: 'tralalero-shark',
    plan: 'swimmer',
    nominalHeight: 1.05,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.17, 0.06]),
      socket('jaw', 'jaw', [0, -0.04, 0.3]),
      socket('dorsal', 'finDorsal', [0, 0.24, 0]),
      socket('shoeA', 'legAFoot', [0, -0.04, 0.04]),
      socket('shoeB', 'legBFoot', [0, -0.04, 0.04]),
      socket('shoeC', 'legCFoot', [0, -0.04, 0.04]),
      // It has fins, not arms. Conjured hands float just outboard of the
      // pectoral fins and forward of them, so a held weapon clears the fin as
      // the body wave travels down the chain.
      socket('ghostHandL', 'body0', [0.34, 0.02, 0.34]),
      socket('ghostHandR', 'body0', mirrorX([0.34, 0.02, 0.34])),
    ],
  };
}

function sharkLeg(
  prefix: string,
  parent: string,
  attach: readonly [number, number, number],
): BoneDefinition[] {
  return legChain(
    prefix,
    parent,
    attach,
    0.26,
    0.24,
    [cyl([0.07, 0.058, 0.26], 'primary', [0, -0.13, 0])],
    [cyl([0.058, 0.046, 0.24], 'primary', [0, -0.12, 0])],
    'Foot',
    sneaker(),
  );
}

/**
 * A generic high-top trainer.
 *
 * Deliberately unbranded: silhouette, midsole and a plain side stripe, with no
 * logo or trademarked mark anywhere on it.
 */
function sneaker(): BoneShape[] {
  return [
    // Upper.
    box([0.15, 0.1, 0.26], 'detail', [0, -0.04, 0.05], { taper: [1, 0.9] }),
    // Ankle collar.
    box([0.14, 0.08, 0.12], 'detail', [0, 0.03, -0.03]),
    // Midsole.
    box([0.16, 0.045, 0.28], 'secondary', [0, -0.1, 0.05]),
    // Outsole.
    box([0.165, 0.025, 0.285], 'accent', [0, -0.125, 0.05]),
    // Side stripes.
    box([0.155, 0.03, 0.1], 'accent', [0, -0.04, 0.04]),
    // Toe cap.
    box([0.13, 0.06, 0.05], 'secondary', [0, -0.07, 0.16]),
  ];
}

/** A stack of gill slits on both sides of the head. */
function gills(count: number, x: number, y: number, startZ: number, spacing: number): BoneShape[] {
  const shapes: BoneShape[] = [];
  for (let i = 0; i < count; i++) {
    const z = startZ - i * spacing;
    shapes.push(box([0.015, 0.12, 0.02], 'accent', [x, y, z]));
    shapes.push(box([0.015, 0.12, 0.02], 'accent', [-x, y, z]));
  }
  return shapes;
}

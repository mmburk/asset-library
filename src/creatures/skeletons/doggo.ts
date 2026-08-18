import type { BoneDefinition, SkeletonDefinition } from '../types';
import { bone, box, cyl, eyes, legChain, mirrorX, socket, teeth } from './helpers';

/**
 * Mewing Doggo — the quadruped reference skeleton.
 *
 * A long-snouted, crocodilian quadruped built around the one feature the plan
 * has to prove out: a hinged `jaw` bone with a real tooth line, plus a
 * three-segment tail that wags with a lag down the chain.
 *
 * Leg bones follow the `legFL` / `legFR` / `legBL` / `legBR` convention that
 * {@link QuadrupedAnimator} expects, each with `Upper`, `Lower` and `Paw`.
 */
export function createDoggoSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Body --------------------------------------------------------------
    bone('hips', null, [0, 0.46, -0.3], [
      box([0.32, 0.28, 0.34], 'primary', [0, 0, 0], { taper: [0.9, 1.0] }),
      box([0.28, 0.08, 0.3], 'secondary', [0, -0.12, 0]),
    ]),

    bone('spine', 'hips', [0, 0.02, 0.26], [
      box([0.34, 0.3, 0.32], 'primary'),
      box([0.3, 0.08, 0.3], 'secondary', [0, -0.13, 0]),
      // Dorsal scutes.
      box([0.06, 0.06, 0.24], 'accent', [0, 0.16, 0], { taper: [1, 0.5] }),
    ]),

    bone('chest', 'spine', [0, 0.02, 0.28], [
      box([0.36, 0.32, 0.34], 'primary', [0, 0, 0], { taper: [1.0, 0.94] }),
      box([0.32, 0.08, 0.32], 'secondary', [0, -0.14, 0]),
    ]),

    bone('neck', 'chest', [0, 0.09, 0.22], [
      box([0.24, 0.2, 0.26], 'primary', [0, 0.02, 0.06]),
    ]),

    bone('head', 'neck', [0, 0.03, 0.2], [
      box([0.24, 0.19, 0.24], 'primary', [0, 0.03, 0.06]),
      // Snout.
      box([0.17, 0.12, 0.28], 'primary', [0, -0.01, 0.29], { taper: [1, 0.82] }),
      // Nostrils.
      box([0.04, 0.03, 0.03], 'detail', [0.05, 0.03, 0.42]),
      box([0.04, 0.03, 0.03], 'detail', [-0.05, 0.03, 0.42]),
      ...eyes(0.085, 0.11, 0.15, 0.05),
      // Brow ridges, which is most of what makes it read as a reptile.
      box([0.06, 0.04, 0.08], 'primary', [0.085, 0.14, 0.13]),
      box([0.06, 0.04, 0.08], 'primary', [-0.085, 0.14, 0.13]),
      ...teeth(3, 0.06, -0.06, 0.38, 0.08, 0.018),
    ]),

    bone('jaw', 'head', [0, -0.05, 0.08], [
      box([0.15, 0.07, 0.3], 'primary', [0, -0.02, 0.17], { taper: [1, 0.85] }),
      box([0.13, 0.03, 0.28], 'secondary', [0, 0.02, 0.17]),
    ]),

    // --- Tail --------------------------------------------------------------
    bone('tailA', 'hips', [0, 0.04, -0.16], [
      cyl([0.11, 0.09, 0.2], 'primary', [0, 0, -0.1], { rotation: [Math.PI * 0.5, 0, 0] }),
      box([0.05, 0.05, 0.18], 'accent', [0, 0.09, -0.1], { taper: [1, 0.5] }),
    ]),

    bone('tailB', 'tailA', [0, 0, -0.2], [
      cyl([0.09, 0.07, 0.18], 'primary', [0, 0, -0.09], { rotation: [Math.PI * 0.5, 0, 0] }),
      box([0.04, 0.04, 0.16], 'accent', [0, 0.07, -0.09], { taper: [1, 0.5] }),
    ]),

    bone('tailC', 'tailB', [0, 0, -0.18], [
      cyl([0.07, 0.03, 0.2], 'primary', [0, 0, -0.1], { rotation: [Math.PI * 0.5, 0, 0] }),
    ]),

    // --- Legs --------------------------------------------------------------
    ...quadLeg('legFL', 'chest', [0.15, -0.04, 0.02]),
    ...quadLeg('legFR', 'chest', [-0.15, -0.04, 0.02]),
    ...quadLeg('legBL', 'hips', [0.15, -0.04, -0.02]),
    ...quadLeg('legBR', 'hips', [-0.15, -0.04, -0.02]),
  ];

  return {
    name: 'mewing-doggo',
    plan: 'quadruped',
    nominalHeight: 0.85,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.16, 0.06]),
      socket('jaw', 'jaw', [0, -0.04, 0.3]),
      socket('back', 'spine', [0, 0.18, 0]),
      socket('collar', 'neck', [0, 0.02, 0.02]),
      socket('tailTip', 'tailC', [0, 0, -0.2]),
      // No arms, so anything it holds is held by conjured hands. They float
      // outboard of the shoulders and forward of the chest — clear of the front
      // legs through a full stride, which is why they sit this far out.
      socket('ghostHandL', 'chest', [0.36, 0.13, 0.44]),
      socket('ghostHandR', 'chest', mirrorX([0.36, 0.13, 0.44])),
    ],
  };
}

function quadLeg(
  prefix: string,
  parent: string,
  attach: readonly [number, number, number],
): BoneDefinition[] {
  return legChain(
    prefix,
    parent,
    attach,
    0.2,
    0.18,
    [cyl([0.078, 0.066, 0.2], 'primary', [0, -0.1, 0])],
    [cyl([0.066, 0.05, 0.18], 'primary', [0, -0.09, 0])],
    'Paw',
    [
      box([0.1, 0.06, 0.14], 'primary', [0, -0.03, 0.03]),
      // Claws.
      box([0.02, 0.02, 0.04], 'detail', [0.03, -0.045, 0.1]),
      box([0.02, 0.02, 0.04], 'detail', [-0.03, -0.045, 0.1]),
    ],
  );
}

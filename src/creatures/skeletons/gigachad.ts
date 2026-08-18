import type { BoneDefinition, SkeletonDefinition } from '../types';
import { bone, box, cyl, eyes, socket, sphere } from './helpers';

/**
 * GigaChad — the biped reference skeleton.
 *
 * A deliberately exaggerated humanoid: an oversized jaw on its own bone so the
 * animator can work it, a chest wide enough to read in silhouette, and pectoral
 * and bicep sockets for bolting extra absurdity on later.
 *
 * Bone names follow the biped convention (`hips`, `spine`, `chest`, `upperLegL`
 * …) so {@link BipedAnimator} drives it without configuration.
 */
export function createGigaChadSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Spine chain -------------------------------------------------------
    bone('hips', null, [0, 0.92, 0], [
      box([0.36, 0.24, 0.26], 'secondary', [0, 0.1, 0]),
      // Belt line.
      box([0.38, 0.05, 0.28], 'accent', [0, 0.2, 0]),
    ]),

    bone('spine', 'hips', [0, 0.2, 0], [
      box([0.42, 0.26, 0.28], 'primary', [0, 0.1, 0], { taper: [0.95, 1.08] }),
      // Abdominals: two columns of blocks, unmistakable at any distance.
      box([0.08, 0.07, 0.04], 'primary', [0.06, 0.06, 0.15]),
      box([0.08, 0.07, 0.04], 'primary', [-0.06, 0.06, 0.15]),
      box([0.08, 0.07, 0.04], 'primary', [0.06, 0.15, 0.155]),
      box([0.08, 0.07, 0.04], 'primary', [-0.06, 0.15, 0.155]),
    ]),

    bone('chest', 'spine', [0, 0.2, 0], [
      box([0.54, 0.28, 0.34], 'primary', [0, 0.1, 0], { taper: [0.88, 1.0] }),
      // Pectorals.
      box([0.22, 0.15, 0.09], 'primary', [0.13, 0.14, 0.16], { taper: [1, 0.85] }),
      box([0.22, 0.15, 0.09], 'primary', [-0.13, 0.14, 0.16], { taper: [1, 0.85] }),
    ]),

    bone('neck', 'chest', [0, 0.18, 0], [
      // A neck as wide as the head is half the joke.
      cyl([0.11, 0.13, 0.16], 'primary', [0, 0.06, 0]),
    ]),

    bone('head', 'neck', [0, 0.06, 0], [
      box([0.26, 0.2, 0.27], 'primary', [0, 0.19, 0], { taper: [1.02, 0.94] }),
      // Hair cap.
      box([0.27, 0.09, 0.28], 'accent', [0, 0.31, 0], { taper: [1, 0.88] }),
      ...eyes(0.065, 0.19, 0.14, 0.045),
      // Brow ridge.
      box([0.24, 0.035, 0.05], 'primary', [0, 0.235, 0.135]),
    ]),

    // The jaw is its own bone so the animator can hang it open at speed.
    bone('jaw', 'head', [0, 0.07, 0.01], [
      box([0.25, 0.13, 0.28], 'primary', [0, -0.06, 0.01], { taper: [0.82, 1.0] }),
      // Chin.
      box([0.12, 0.06, 0.06], 'primary', [0, -0.12, 0.12]),
    ]),

    // --- Arms --------------------------------------------------------------
    ...arm('L', 1),
    ...arm('R', -1),

    // --- Legs --------------------------------------------------------------
    ...leg('L', 1),
    ...leg('R', -1),
  ];

  return {
    name: 'gigachad',
    plan: 'biped',
    nominalHeight: 1.9,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.36, 0]),
      socket('jaw', 'jaw', [0, -0.06, 0.16]),
      socket('chest', 'chest', [0, 0.14, 0.18]),
      socket('back', 'chest', [0, 0.14, -0.18]),
      socket('handL', 'handL', [0, -0.06, 0]),
      socket('handR', 'handR', [0, -0.06, 0]),
      socket('hipL', 'hips', [0.19, 0.16, 0]),
      socket('hipR', 'hips', [-0.19, 0.16, 0]),
      socket('bicepL', 'upperArmL', [0.06, -0.12, 0]),
      socket('bicepR', 'upperArmR', [-0.06, -0.12, 0]),
    ],
  };
}

function arm(side: 'L' | 'R', sign: number): BoneDefinition[] {
  return [
    bone('shoulder' + side, 'chest', [sign * 0.29, 0.15, 0], [
      sphere(0.105, 'primary', [0, 0, 0], { segments: 8 }),
    ], [0, 0, sign * 0.13]),

    bone('upperArm' + side, 'shoulder' + side, [0, 0, 0], [
      cyl([0.095, 0.075, 0.3], 'primary', [0, -0.15, 0]),
      // Bicep.
      sphere(0.088, 'primary', [0, -0.11, 0.02], { segments: 8 }),
    ]),

    bone('lowerArm' + side, 'upperArm' + side, [0, -0.3, 0], [
      cyl([0.078, 0.058, 0.26], 'primary', [0, -0.13, 0]),
    ]),

    bone('hand' + side, 'lowerArm' + side, [0, -0.26, 0], [
      box([0.1, 0.12, 0.075], 'primary', [0, -0.06, 0]),
    ]),
  ];
}

function leg(side: 'L' | 'R', sign: number): BoneDefinition[] {
  return [
    bone('upperLeg' + side, 'hips', [sign * 0.13, 0, 0], [
      cyl([0.135, 0.11, 0.46], 'secondary', [0, -0.23, 0]),
    ], [0, 0, sign * 0.015]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -0.46, 0], [
      cyl([0.11, 0.085, 0.42], 'primary', [0, -0.21, 0]),
      // Calf.
      sphere(0.085, 'primary', [0, -0.12, -0.02], { segments: 8 }),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -0.42, 0], [
      box([0.14, 0.08, 0.3], 'secondary', [0, -0.04, 0.1]),
      box([0.145, 0.03, 0.31], 'detail', [0, -0.075, 0.1]),
    ]),
  ];
}

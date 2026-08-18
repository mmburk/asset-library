import type { BoneDefinition, SkeletonDefinition } from '../types';
import { bone, box, cone, cyl, eyes, propellerBlades, socket, teeth } from './helpers';

const HALF_PI = Math.PI * 0.5;

/**
 * Skibidi Propeller — the flyer reference skeleton.
 *
 * A crocodilian fuselage with fixed wings, a tail assembly and a nose
 * propeller. The propeller is a bone rather than a decorative part, which is
 * what lets {@link FlightAnimator} spin it from its own wrapped angle without
 * the part system knowing anything about rotation.
 *
 * Landing legs are declared so the creature has something to stand on when
 * grounded; the animator tucks them as it lifts off.
 */
export function createPropellerSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Fuselage ----------------------------------------------------------
    bone('body', null, [0, 0.62, 0], [
      cyl([0.17, 0.13, 0.66], 'primary', [0, 0, -0.02], { rotation: [HALF_PI, 0, 0] }),
      // Underside, a lighter belly like an aircraft.
      box([0.24, 0.07, 0.5], 'secondary', [0, -0.12, -0.02]),
      // Dorsal ridge.
      box([0.05, 0.07, 0.4], 'accent', [0, 0.15, -0.04], { taper: [1, 0.4] }),
    ]),

    bone('neck', 'body', [0, 0.02, 0.3], [
      cyl([0.13, 0.15, 0.12], 'primary', [0, 0, 0.04], { rotation: [HALF_PI, 0, 0] }),
    ]),

    bone('head', 'neck', [0, 0.02, 0.14], [
      box([0.22, 0.18, 0.22], 'primary', [0, 0.01, 0.06]),
      // Snout.
      box([0.15, 0.11, 0.24], 'primary', [0, -0.01, 0.26], { taper: [1, 0.8] }),
      ...eyes(0.08, 0.09, 0.14, 0.048),
      box([0.055, 0.04, 0.07], 'primary', [0.08, 0.12, 0.12]),
      box([0.055, 0.04, 0.07], 'primary', [-0.08, 0.12, 0.12]),
      ...teeth(3, 0.055, -0.055, 0.34, 0.07, 0.016),
    ]),

    bone('jaw', 'head', [0, -0.05, 0.07], [
      box([0.13, 0.06, 0.26], 'primary', [0, -0.02, 0.15], { taper: [1, 0.85] }),
    ]),

    // --- Propeller ---------------------------------------------------------
    // Spins about Z, so it must sit at the nose facing forward.
    bone('propeller', 'body', [0, 0.02, 0.5], [
      cone(0.055, 0.12, 'metal', [0, 0, 0.05], { rotation: [HALF_PI, 0, 0], segments: 8 }),
      ...propellerBlades(3, 0.19, 0.36, 0.05),
    ]),

    // --- Wings -------------------------------------------------------------
    // Each wing extends outward from its pivot, so the animator's flap is a
    // plain rotation about Z.
    bone('wingL', 'body', [0.16, 0.07, 0.0], [
      box([0.52, 0.035, 0.24], 'accent', [0.26, 0, 0], { taper: [1, 1] }),
      box([0.5, 0.02, 0.06], 'detail', [0.26, 0.025, -0.08]),
      // Wingtip fin.
      box([0.03, 0.1, 0.14], 'accent', [0.52, 0.05, 0]),
    ]),

    bone('wingR', 'body', [-0.16, 0.07, 0.0], [
      box([0.52, 0.035, 0.24], 'accent', [-0.26, 0, 0], { taper: [1, 1] }),
      box([0.5, 0.02, 0.06], 'detail', [-0.26, 0.025, -0.08]),
      box([0.03, 0.1, 0.14], 'accent', [-0.52, 0.05, 0]),
    ]),

    // --- Tail --------------------------------------------------------------
    bone('tail', 'body', [0, 0.03, -0.34], [
      cyl([0.1, 0.06, 0.3], 'primary', [0, 0, -0.15], { rotation: [HALF_PI, 0, 0] }),
    ]),

    bone('tailFin', 'tail', [0, 0.02, -0.28], [
      // Vertical stabiliser.
      box([0.035, 0.22, 0.18], 'accent', [0, 0.11, -0.02], { taper: [1, 0.55] }),
      // Horizontal stabilisers.
      box([0.32, 0.03, 0.12], 'accent', [0, 0, -0.02]),
    ]),

    // --- Landing legs ------------------------------------------------------
    bone('legL', 'body', [0.11, -0.13, 0.06], [
      cyl([0.03, 0.025, 0.18], 'metal', [0, -0.09, 0], { segments: 6 }),
      box([0.08, 0.04, 0.14], 'secondary', [0, -0.19, 0.02]),
    ]),

    bone('legR', 'body', [-0.11, -0.13, 0.06], [
      cyl([0.03, 0.025, 0.18], 'metal', [0, -0.09, 0], { segments: 6 }),
      box([0.08, 0.04, 0.14], 'secondary', [0, -0.19, 0.02]),
    ]),
  ];

  return {
    name: 'skibidi-propeller',
    plan: 'flyer',
    nominalHeight: 0.95,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.12, 0.06]),
      socket('jaw', 'jaw', [0, -0.04, 0.28]),
      socket('back', 'body', [0, 0.18, -0.05]),
      socket('belly', 'body', [0, -0.16, 0]),
      socket('wingTipL', 'wingL', [0.52, 0, 0]),
      socket('wingTipR', 'wingR', [-0.52, 0, 0]),
      socket('nose', 'propeller', [0, 0, 0.12]),
      // Wings, not arms. Conjured hands tuck up under the wings just ahead of
      // the leading edge. Outboard is what matters here: the propeller disc is
      // 0.37 across the nose, and a hand any closer in points its weapon
      // straight through the blades.
      socket('ghostHandL', 'body', [0.42, 0.02, 0.2]),
      socket('ghostHandR', 'body', [-0.42, 0.02, 0.2]),
    ],
  };
}

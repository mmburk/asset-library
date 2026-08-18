import type { BoneDefinition, BoneShape, SkeletonDefinition } from '../types';
import { bone, box, cyl, socket, sphere } from './helpers';

const HALF_PI = Math.PI * 0.5;

/**
 * Tung Tung Tung Sahur — a smooth wooden club with a human face.
 *
 * Built from reference. The character is *not* a slit drum with a carved
 * grimace: it is a plain polished baton, and the entire effect comes from an
 * uncannily realistic human face sitting on it. Four details carry that read
 * and are modelled deliberately:
 *
 * 1. **A protruding nose.** The single most important feature. Without it the
 *    face collapses into a generic mask; with it, the proportions read as human
 *    and the whole thing turns unsettling.
 * 2. **A closed, wide smirk** — not a toothy maw. The mouth is a shallow curved
 *    line with a lower lip, flanked by nasolabial creases.
 * 3. **Big, wide-set eyes** with plenty of sclera around a large brown iris,
 *    under thin arched brows. Arched, not angled down: the expression is
 *    manic-friendly, not angry.
 * 4. **Stick limbs on a slim log.** The body is roughly five times taller than
 *    it is wide, the legs take the bottom third, and the arms hang from the
 *    middle of the log rather than its top.
 *
 * The bat reaches the ground on purpose. `CreatureAsset` grounds a creature by
 * its lowest point, so a bat tip below the feet would lift the whole figure and
 * leave it hovering — the tip is placed to land level with the soles.
 *
 * The log body sits on a single bone so it never creases when the torso leans,
 * and the recipe damps `torsoLean` for the same reason: on a rigid log, a large
 * lean swings the head pivot enough to sink the face into the surface.
 */
export function createTungTungSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    bone('hips', null, [0, 0.52, 0]),

    // The whole log lives here, unbroken.
    bone('spine', 'hips', [0, 0.02, 0], [
      cyl([0.15, 0.139, 0.94], 'organic', [0, 0.45, 0], { segments: 14 }),
      // Flat top cut, showing paler end grain.
      cyl([0.1505, 0.1505, 0.022], 'primary', [0, 0.925, 0], { segments: 14 }),
      cyl([0.085, 0.085, 0.026], 'secondary', [0, 0.928, 0], { segments: 12 }),
    ]),

    // Empty: it exists so the arms have a pivot that can twist against the log.
    bone('chest', 'spine', [0, 0.5, 0]),

    bone('neck', 'chest', [0, 0.16, 0]),

    bone('head', 'neck', [0, 0.02, 0], [
      // --- Brows -----------------------------------------------------------
      // Thin and slightly arched. Tilting the outer ends down a little is what
      // stops them reading as flat painted stripes.
      box([0.095, 0.017, 0.035], 'accent', [0.062, 0.142, 0.115], { rotation: [0, -0.3, 0.1] }),
      box([0.095, 0.017, 0.035], 'accent', [-0.062, 0.142, 0.115], { rotation: [0, 0.3, -0.1] }),

      // --- Eyes ------------------------------------------------------------
      ...eye(0.061),
      ...eye(-0.061),

      // --- Nose ------------------------------------------------------------
      // Bridge widening downward into a rounded tip.
      box([0.038, 0.15, 0.05], 'organic', [0, 0.005, 0.128], { taper: [1.55, 0.75] }),
      sphere(0.031, 'organic', [0, -0.062, 0.152], { segments: 8 }),
      // Nostrils.
      box([0.016, 0.012, 0.02], 'accent', [0.027, -0.075, 0.142]),
      box([0.016, 0.012, 0.02], 'accent', [-0.027, -0.075, 0.142]),

      // --- Mouth -----------------------------------------------------------
      // A shallow arc curving up at the corners.
      ...smile(7, 0.028, -0.152, 0.128, 0.011),
      // Nasolabial creases bracketing the smirk.
      box([0.016, 0.085, 0.028], 'accent', [0.077, -0.105, 0.116], { rotation: [0, -0.5, 0.18] }),
      box([0.016, 0.085, 0.028], 'accent', [-0.077, -0.105, 0.116], { rotation: [0, 0.5, -0.18] }),
      // Cheeks, just enough to catch the light above the smile.
      sphere(0.045, 'organic', [0.072, -0.075, 0.108], { segments: 7 }),
      sphere(0.045, 'organic', [-0.072, -0.075, 0.108], { segments: 7 }),
    ]),

    // The mouth is closed at rest; `BipedAnimator` parts it slightly at speed.
    bone('jaw', 'head', [0, -0.16, 0.0], [
      // Lower lip.
      box([0.088, 0.024, 0.045], 'secondary', [0, -0.012, 0.126], { taper: [1, 0.8] }),
      // Chin.
      sphere(0.05, 'organic', [0, -0.058, 0.104], { segments: 8 }),
    ]),

    ...stickArm('L', 1, false),
    ...stickArm('R', -1, true),

    ...stickLeg('L', 1),
    ...stickLeg('R', -1),
  ];

  return {
    name: 'tung-tung-sahur',
    plan: 'biped',
    nominalHeight: 1.5,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.26, 0]),
      socket('jaw', 'jaw', [0, -0.05, 0.14]),
      socket('chest', 'spine', [0, 0.45, 0.15]),
      socket('back', 'spine', [0, 0.45, -0.15]),
      socket('handL', 'handL', [0, -0.05, 0]),
      socket('handR', 'handR', [0, -0.05, 0]),
    ],
  };
}

/**
 * One eye: a shallow socket, a wide sclera and a large iris.
 *
 * The iris is deliberately oversized relative to the sclera — that ratio, plus
 * how far apart the eyes sit, is most of what makes the face read as this
 * character rather than as a generic wooden puppet.
 */
function eye(x: number): BoneShape[] {
  const y = 0.078;
  return [
    // Socket, sunk slightly into the log.
    cyl([0.058, 0.055, 0.03], 'secondary', [x, y, 0.1], {
      rotation: [HALF_PI, 0, 0],
      segments: 10,
    }),
    sphere(0.047, 'detail', [x, y, 0.118], { segments: 10 }),
    sphere(0.026, 'eye', [x, y, 0.152], { segments: 8 }),
    // Upper lid, which is what keeps the eye from looking like a stuck-on bead.
    box([0.1, 0.022, 0.03], 'organic', [x, y + 0.043, 0.116], { rotation: [0, 0, -0.06] }),
  ];
}

/**
 * A closed smile built from short segments along an upward-curving arc.
 * @param curve How far the corners lift relative to the centre.
 */
function smile(
  count: number,
  spacing: number,
  y: number,
  z: number,
  curve: number,
): BoneShape[] {
  const shapes: BoneShape[] = [];
  const half = (count - 1) * 0.5;
  for (let i = 0; i < count; i++) {
    const step = i - half;
    const x = step * spacing;
    // Quadratic lift, so the ends turn up into the cheeks.
    const lift = step * step * curve;
    shapes.push(
      box([spacing * 1.35, 0.017, 0.03], 'accent', [x, y + lift, z], {
        rotation: [0, 0, -step * 0.16],
      }),
    );
  }
  return shapes;
}

/**
 * A stick arm, hanging from the middle of the log. The right one carries the
 * bat.
 */
function stickArm(side: 'L' | 'R', sign: number, withBat: boolean): BoneDefinition[] {
  return [
    bone('shoulder' + side, 'chest', [sign * 0.132, 0, 0], [
      sphere(0.031, 'secondary', [0, 0, 0], { segments: 7 }),
    ], [0, 0, sign * 0.07]),

    bone('upperArm' + side, 'shoulder' + side, [0, 0, 0], [
      cyl([0.027, 0.023, 0.22], 'secondary', [0, -0.11, 0], { segments: 7 }),
      sphere(0.025, 'secondary', [0, -0.22, 0], { segments: 6 }),
    ]),

    bone('lowerArm' + side, 'upperArm' + side, [0, -0.22, 0], [
      cyl([0.023, 0.02, 0.18], 'secondary', [0, -0.09, 0], { segments: 7 }),
    ]),

    bone('hand' + side, 'lowerArm' + side, [0, -0.18, 0], [
      // Barely a hand — a slight thickening, as in the reference.
      sphere(0.029, 'secondary', [0, -0.028, 0], { segments: 7 }),
      ...(withBat ? bat() : []),
    ]),
  ];
}

/**
 * A plain wooden bat, hanging from the fist and angled forward so its tip
 * reaches the ground.
 *
 * Segments are placed along the tilted axis and rotated to match rather than
 * being given their own bone: it never articulates, so baking it into the hand
 * costs nothing.
 */
function bat(): BoneShape[] {
  const tilt = -0.3;
  const dy = -Math.cos(tilt);
  const dz = -Math.sin(tilt);
  const base = -0.03;
  const along = (d: number): readonly [number, number, number] => [0, base + dy * d, dz * d];
  const rotation: readonly [number, number, number] = [tilt, 0, 0];

  return [
    // Knob.
    sphere(0.024, 'secondary', along(-0.01), { segments: 7 }),
    // Handle, thin where it is gripped.
    cyl([0.018, 0.022, 0.25], 'secondary', along(0.115), { rotation, segments: 8 }),
    // Barrel, swelling toward the end.
    cyl([0.024, 0.037, 0.34], 'secondary', along(0.4), { rotation, segments: 8 }),
    // Rounded tip. Its length is set so the tip stops just short of the soles:
    // any lower and `CreatureAsset` would ground the creature by the bat and
    // leave the feet hanging in the air.
    sphere(0.037, 'secondary', along(0.57), { segments: 8 }),
  ];
}

function stickLeg(side: 'L' | 'R', sign: number): BoneDefinition[] {
  return [
    bone('upperLeg' + side, 'hips', [sign * 0.072, -0.01, 0], [
      cyl([0.037, 0.031, 0.26], 'secondary', [0, -0.13, 0], { segments: 7 }),
      sphere(0.033, 'secondary', [0, -0.26, 0], { segments: 6 }),
    ], [0, 0, sign * 0.015]),

    bone('lowerLeg' + side, 'upperLeg' + side, [0, -0.26, 0], [
      cyl([0.031, 0.027, 0.21], 'secondary', [0, -0.105, 0], { segments: 7 }),
    ]),

    bone('foot' + side, 'lowerLeg' + side, [0, -0.21, 0], [
      // Small rounded nubs — the reference barely has feet at all.
      box([0.062, 0.038, 0.1], 'secondary', [0, -0.019, 0.026], { taper: [1, 0.85] }),
      sphere(0.031, 'secondary', [0, -0.019, 0.066], { segments: 7 }),
    ]),
  ];
}

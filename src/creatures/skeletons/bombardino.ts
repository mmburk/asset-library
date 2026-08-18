import type { BoneDefinition, BoneShape, PaletteRole, SkeletonDefinition } from '../types';
import {
  bone,
  box,
  cone,
  cyl,
  mirrorX,
  propellerBlades,
  socket,
  sphere,
  type ShapeExtras,
} from './helpers';

const HALF_PI = Math.PI * 0.5;

/**
 * How far the snout is pitched up out of the horizontal, in radians.
 *
 * The upper jaw is modelled as one long box rotated so its own `+Y` runs
 * forward — `rotation.x = HALF_PI` maps `+Y` onto `+Z` — which is the only way
 * to get a taper that narrows toward the tip, since `taper` always works along
 * a shape's local Y. Backing off from `HALF_PI` tilts the whole snout up.
 */
const SNOUT_PITCH = HALF_PI - 0.16;

/**
 * Bombardino Crocodilo — a crocodile welded into a twin-engine bomber.
 *
 * Modelled from the reference render rather than guessed at: the head, neck and
 * a shell over the front fuselage are crocodile, and everything from the
 * cockpit aft is riveted aluminium. The mouth is held open at rest — that gape
 * is the whole silhouette — so the jaw carries a rest rotation and the upper
 * jaw is tilted the other way by {@link SNOUT_PITCH}.
 *
 * Two things here are new for the flyer plan and drove small additions to
 * {@link FlightAnimator}. The engines are `propellerL` / `propellerR` on the
 * wings instead of a single `propeller` at the nose, and the bomb is a
 * `payload` bone rather than decoration, so it swings against the airframe's
 * bank instead of being welded to the belly.
 *
 * The landing gear is deliberately tall enough that the wheels, not the bomb,
 * are the lowest point — `CreatureAsset` grounds by the lowest vertex, so a
 * store hanging below the tyres would park the whole aircraft in the air.
 */
export function createBombardinoSkeleton(): SkeletonDefinition {
  const bones: BoneDefinition[] = [
    // --- Fuselage ----------------------------------------------------------
    bone('body', null, [0, 0.66, 0], [
      // The fuselage is two barrels sharing a radius at the seam, not one
      // barrel with a shell laid over it: the hide has to wrap the sides as
      // well as the spine, and a box over a nine-sided cylinder would clip
      // straight through it.
      cyl([0.205, 0.2, 0.42], 'primary', [0, 0, 0.13], { rotation: [HALF_PI, 0, 0], segments: 9 }),
      cyl([0.2, 0.145, 0.52], 'metal', [0, 0, -0.29], { rotation: [HALF_PI, 0, 0], segments: 9 }),
      // Pale belly, under the animal half only.
      box([0.26, 0.08, 0.42], 'secondary', [0, -0.155, 0.12]),
      // Crocodile back, laid over the front half of the airframe. It runs well
      // aft of the neck on purpose: in the reference the animal does not stop
      // at the shoulders, it fades into the machine somewhere around the wing.
      box([0.32, 0.15, 0.44], 'primary', [0, 0.12, 0.12], { taper: [1, 0.8] }),
      ...scutes(4, -0.06, 0.3, 0.2, 0.055),
      // Riveted collar over the seam where hide gives way to metal.
      cyl([0.212, 0.212, 0.05], 'organic', [0, 0, -0.05], { rotation: [HALF_PI, 0, 0], segments: 9 }),
      // Cockpit, sitting flush with the spine rather than perched on it.
      box([0.185, 0.09, 0.28], 'metal', [0, 0.155, -0.24]),
      box([0.155, 0.05, 0.12], 'accent', [0, 0.18, -0.17]),
      box([0.155, 0.04, 0.1], 'accent', [0, 0.175, -0.31]),
      // Panel band aft, sized just clear of the barrel's local radius.
      cyl([0.158, 0.158, 0.03], 'accent', [0, 0, -0.42], { rotation: [HALF_PI, 0, 0], segments: 9 }),
    ]),

    // --- Neck --------------------------------------------------------------
    // Short and as thick as the fuselage it grows out of. A slim neck reads as
    // a mascot head bolted on; the reference has no neck to speak of.
    bone('neck', 'body', [0, 0.04, 0.32], [
      cyl([0.21, 0.215, 0.12], 'primary', [0, 0, 0.04], { rotation: [HALF_PI, 0, 0], segments: 9 }),
      ...scutes(2, -0.01, 0.07, 0.175, 0.05),
    ]),

    // --- Head --------------------------------------------------------------
    // Sized against the fuselage, not against the neck: the skull is as deep as
    // the barrel is wide, which is what makes the thing read as a crocodile
    // wearing an aircraft rather than an aircraft with a crocodile ornament.
    bone('head', 'neck', [0, 0.01, 0.13], [
      box([0.3, 0.23, 0.3], 'primary', [0, 0.01, 0.1], { taper: [1, 0.9] }),
      // Jowls, flaring wider than the skull.
      box([0.33, 0.14, 0.2], 'primary', [0, -0.035, 0.06]),
      // Upper jaw: long, narrowing to the tip.
      box([0.245, 0.56, 0.155], 'primary', [0, -0.02, 0.52], {
        rotation: [SNOUT_PITCH, 0, 0],
        taper: [1, 0.6],
      }),
      box([0.13, 0.46, 0.045], 'organic', [0, 0.045, 0.5], {
        rotation: [SNOUT_PITCH, 0, 0],
        taper: [1, 0.55],
      }),
      // Nostril block at the tip.
      box([0.11, 0.06, 0.07], 'primary', [0, 0.045, 0.79]),
      box([0.026, 0.022, 0.024], 'accent', [0.032, 0.078, 0.8]),
      box([0.026, 0.022, 0.024], 'accent', [-0.032, 0.078, 0.8]),
      // Brow ridges and the eyes they shade — set high on the skull, where a
      // crocodile carries them.
      box([0.09, 0.075, 0.13], 'organic', [0.105, 0.125, 0.15]),
      box([0.09, 0.075, 0.13], 'organic', [-0.105, 0.125, 0.15]),
      sphere(0.048, 'eye', [0.105, 0.155, 0.165]),
      sphere(0.048, 'eye', [-0.105, 0.155, 0.165]),
      // Vertical slit pupils, facing outward — a crocodile's eyes look sideways
      // and up, not forward.
      box([0.022, 0.058, 0.018], 'accent', [0.145, 0.155, 0.165]),
      box([0.022, 0.058, 0.018], 'accent', [-0.145, 0.155, 0.165]),
      ...scutes(2, 0.02, 0.16, 0.125, 0.055),
      ...fangs(8, 0.28, 0.76, 0.105, 0.068, -0.11, -0.038, 0.021, false),
    ]),

    // --- Lower jaw ---------------------------------------------------------
    // Held open at rest: this is a character whose whole read is the gape. The
    // animator only ever adds to this rotation, so the mouth never closes past
    // the pose authored here.
    bone('jaw', 'head', [0, -0.1, 0.24], [
      box([0.215, 0.54, 0.115], 'primary', [0, -0.025, 0.27], {
        rotation: [HALF_PI, 0, 0],
        taper: [1, 0.62],
      }),
      // Pale throat.
      box([0.185, 0.5, 0.045], 'secondary', [0, -0.072, 0.26], {
        rotation: [HALF_PI, 0, 0],
        taper: [1, 0.64],
      }),
      // Mouth floor, dark enough to give the gape depth.
      box([0.145, 0.42, 0.03], 'accent', [0, 0.035, 0.25], {
        rotation: [HALF_PI, 0, 0],
        taper: [1, 0.7],
      }),
      ...fangs(7, 0.07, 0.48, 0.095, 0.062, 0.042, 0.042, 0.019, true),
    ], [0.52, 0, 0]),

    // --- Wings and engines -------------------------------------------------
    bone('wingL', 'body', [0.175, 0.055, -0.12], wing(1)),
    bone('propellerL', 'wingL', [0.4, 0.015, 0.3], engineDisc()),

    bone('wingR', 'body', mirrorX([0.175, 0.055, -0.12]), wing(-1)),
    bone('propellerR', 'wingR', [-0.4, 0.015, 0.3], engineDisc()),

    // --- Empennage ---------------------------------------------------------
    bone('tail', 'body', [0, 0.02, -0.56], [
      cyl([0.14, 0.075, 0.3], 'metal', [0, 0, -0.15], { rotation: [HALF_PI, 0, 0], segments: 9 }),
    ]),

    bone('tailFin', 'tail', [0, 0.01, -0.26], [
      // Vertical stabiliser.
      box([0.05, 0.34, 0.24], 'metal', [0, 0.17, -0.04], { taper: [1, 0.4] }),
      box([0.055, 0.22, 0.055], 'accent', [0, 0.16, -0.14]),
      box([0.045, 0.03, 0.11], 'accent', [0, 0.34, -0.02]),
      // Horizontal stabilisers, elevators and end plates.
      box([0.62, 0.045, 0.22], 'metal', [0, 0.005, -0.05]),
      box([0.6, 0.028, 0.07], 'accent', [0, 0.02, -0.14]),
      box([0.04, 0.1, 0.14], 'metal', [0.31, 0.045, -0.05]),
      box([0.04, 0.1, 0.14], 'metal', [-0.31, 0.045, -0.05]),
    ]),

    // --- Landing gear ------------------------------------------------------
    bone('legL', 'body', [0.17, -0.13, 0.12], gear()),
    bone('legR', 'body', mirrorX([0.17, -0.13, 0.12]), gear()),

    // --- Payload -----------------------------------------------------------
    bone('payload', 'body', [0, -0.2, -0.06], [
      // Pylon and sway brace.
      box([0.05, 0.12, 0.09], 'metal', [0, -0.05, 0]),
      box([0.09, 0.03, 0.05], 'metal', [0, -0.1, 0]),
      // Bomb body, nose ogive and boat-tail.
      cyl([0.082, 0.072, 0.4], 'accent', [0, -0.155, -0.02], {
        rotation: [HALF_PI, 0, 0],
        segments: 9,
      }),
      cone(0.082, 0.15, 'accent', [0, -0.155, 0.25], { rotation: [HALF_PI, 0, 0], segments: 9 }),
      cone(0.072, 0.16, 'accent', [0, -0.155, -0.3], { rotation: [-HALF_PI, 0, 0], segments: 9 }),
      box([0.03, 0.03, 0.05], 'metal', [0, -0.155, 0.34]),
      // Identification stripe.
      cyl([0.086, 0.086, 0.035], 'detail', [0, -0.155, 0.1], {
        rotation: [HALF_PI, 0, 0],
        segments: 9,
      }),
      // Tail fins, in a cross.
      box([0.014, 0.09, 0.13], 'metal', [0, -0.077, -0.3]),
      box([0.014, 0.09, 0.13], 'metal', [0, -0.233, -0.3]),
      box([0.09, 0.014, 0.13], 'metal', [0.078, -0.155, -0.3]),
      box([0.09, 0.014, 0.13], 'metal', [-0.078, -0.155, -0.3]),
    ]),
  ];

  return {
    name: 'bombardino-crocodilo',
    plan: 'flyer',
    nominalHeight: 0.89,
    bones,
    sockets: [
      socket('head', 'head', [0, 0.2, 0.08]),
      socket('jaw', 'jaw', [0, -0.06, 0.38]),
      socket('back', 'body', [0, 0.22, -0.14]),
      socket('belly', 'body', [0, -0.2, 0.14]),
      socket('wingTipL', 'wingL', [0.84, 0.02, -0.04]),
      socket('wingTipR', 'wingR', [-0.84, 0.02, -0.04]),
      // Under-wing hardpoints, for a second store or a drop tank.
      socket('hardpointL', 'wingL', [0.62, -0.03, 0.02]),
      socket('hardpointR', 'wingR', [-0.62, -0.03, 0.02]),
      socket('bombTip', 'payload', [0, -0.155, 0.4]),
      socket('tail', 'tailFin', [0, 0.3, -0.06]),
      // An airframe has no arms. Conjured hands float against the upper flanks,
      // forward of the gear and the bomb. Kept inboard of x = 0.255 on purpose:
      // that is where the engine discs start, and a hand any further out aims
      // its weapon through a propeller.
      socket('ghostHandL', 'body', [0.28, 0.12, 0.42]),
      socket('ghostHandR', 'body', mirrorX([0.28, 0.12, 0.42])),
    ],
  };
}

/**
 * One wing, its nacelle and the pylon carrying it.
 * @param side `+1` for the creature's left wing, `-1` for its right.
 */
function wing(side: 1 | -1): BoneShape[] {
  const x = (value: number): number => value * side;
  return [
    // Root fairing, then two panels — the step between them is what gives the
    // planform a taper, since `taper` cannot narrow a shape across its span.
    box([0.12, 0.1, 0.4], 'metal', [x(0.09), -0.01, 0]),
    box([0.4, 0.05, 0.36], 'metal', [x(0.32), 0.005, 0]),
    box([0.3, 0.04, 0.24], 'metal', [x(0.66), 0.01, -0.03]),
    box([0.05, 0.055, 0.14], 'metal', [x(0.82), 0.02, -0.04]),
    // Leading-edge trim and aileron.
    box([0.66, 0.03, 0.05], 'accent', [x(0.45), 0.02, 0.16]),
    box([0.34, 0.025, 0.08], 'accent', [x(0.64), 0.02, -0.17]),
    // Engine nacelle: pylon, cowling, cowl ring and exhaust cone.
    box([0.1, 0.1, 0.24], 'metal', [x(0.4), -0.04, 0.02]),
    cyl([0.085, 0.07, 0.44], 'metal', [x(0.4), 0.015, 0.06], {
      rotation: [HALF_PI, 0, 0],
      segments: 9,
    }),
    cyl([0.095, 0.09, 0.06], 'accent', [x(0.4), 0.015, 0.26], {
      rotation: [HALF_PI, 0, 0],
      segments: 9,
    }),
    cone(0.07, 0.16, 'metal', [x(0.4), 0.015, -0.23], { rotation: [-HALF_PI, 0, 0], segments: 8 }),
  ];
}

/** Spinner plus three blades. Both engines are identical, so both share it. */
function engineDisc(): BoneShape[] {
  return [
    cone(0.055, 0.13, 'metal', [0, 0, 0.05], { rotation: [HALF_PI, 0, 0], segments: 8 }),
    ...propellerBlades(3, 0.165, 0.32, 0.048, 'accent'),
  ];
}

/** One main gear leg: oleo strut, drag brace, tyre and hub. */
function gear(): BoneShape[] {
  return [
    cyl([0.026, 0.022, 0.26], 'metal', [0, -0.13, 0], { segments: 6 }),
    box([0.02, 0.22, 0.03], 'metal', [0, -0.12, -0.05], { rotation: [0.32, 0, 0] }),
    cyl([0.075, 0.075, 0.05], 'accent', [0, -0.29, 0], { rotation: [0, 0, HALF_PI], segments: 9 }),
    cyl([0.03, 0.03, 0.056], 'metal', [0, -0.29, 0], { rotation: [0, 0, HALF_PI], segments: 6 }),
  ];
}

/** A run of osteoderms along the spine. */
function scutes(
  count: number,
  startZ: number,
  endZ: number,
  y: number,
  size: number,
  color: PaletteRole = 'organic',
): BoneShape[] {
  const shapes: BoneShape[] = [];
  const step = count > 1 ? (endZ - startZ) / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    shapes.push(box([size, size * 0.7, size], color, [0, y, startZ + i * step], { taper: [1, 0.45] }));
  }
  return shapes;
}

/**
 * A row of teeth down one jaw.
 *
 * Both the spacing and the half-width are interpolated along the row, because
 * the jaws taper: a constant spread would leave the front teeth floating clear
 * of a snout that has already narrowed under them.
 */
function fangs(
  count: number,
  fromZ: number,
  toZ: number,
  fromSpread: number,
  toSpread: number,
  fromY: number,
  toY: number,
  size: number,
  pointUp: boolean,
  color: PaletteRole = 'detail',
): BoneShape[] {
  const shapes: BoneShape[] = [];
  const divisor = count > 1 ? count - 1 : 1;
  const extras: ShapeExtras = pointUp
    ? { segments: 4 }
    : { rotation: [Math.PI, 0, 0], segments: 4 };

  for (let i = 0; i < count; i++) {
    const t = i / divisor;
    const z = fromZ + (toZ - fromZ) * t;
    const spread = fromSpread + (toSpread - fromSpread) * t;
    const y = fromY + (toY - fromY) * t;
    // Teeth shrink toward the front of the jaw, as they do on the animal.
    const scale = size * (1 - t * 0.25);
    shapes.push(cone(scale, scale * 2.6, color, [spread, y, z], extras));
    shapes.push(cone(scale, scale * 2.6, color, [-spread, y, z], extras));
  }
  return shapes;
}

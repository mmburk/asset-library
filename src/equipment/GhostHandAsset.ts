import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three';
import { Asset } from '../core/Asset';
import type { AssetContext } from '../core/AssetContext';
import { acquireFlatMaterial } from '../core/materials';
import { keyNum } from '../core/ResourceCache';
import { DEFAULT_GHOST_HAND, type GhostHandOptions } from './types';

/**
 * Number of opacity levels a hand fades through.
 *
 * Materials in this library are shared and reference-counted, so a fade cannot
 * animate `material.opacity` — that would repaint every other asset holding the
 * same material. Instead the fade is quantised: each level is its own cached
 * material and the mesh swaps between them. Six steps is enough that a
 * 0.16-second fade reads as smooth, and it costs twelve cached materials for
 * every ghost hand in the game rather than two per hand.
 */
const FADE_STEPS = 6;

/** Colour slots a hand is painted from. Index into the material table. */
const BODY = 0;
const DETAIL = 1;

const HALF_PI = Math.PI * 0.5;

/** Fade state machine. */
type Phase = 'hidden' | 'materialising' | 'solid' | 'dissolving';

/**
 * A conjured forearm and hand, with nothing above the wrist.
 *
 * Deliberately not an arm: there is no elbow and no upper arm, because there is
 * no shoulder for one to hang from. The forearm tapers to a point at the cut
 * end and a few motes drift off it, which is what sells the thing as summoned
 * rather than amputated.
 *
 * Local frame: the grip sits at the origin, the fist closes around it, and the
 * forearm runs back along `-Z`. Parent a weapon to {@link grip} and it lands in
 * the palm with no offset maths.
 *
 * ```ts
 * const hand = new GhostHandAsset(context, { handedness: 'right' }).build();
 * socket.add(hand.root);
 * hand.grip.add(rifle);
 * hand.show();
 * // per frame:
 * hand.update(dt);
 * ```
 */
export class GhostHandAsset extends Asset<GhostHandOptions> {
  /** Weapon mount. Sits at the palm, and is not touched by the fade. */
  readonly grip: Object3D;

  /** Bob and roll are applied here, so the weapon rides along with the hand. */
  private readonly float: Group;

  /** Carries the meshes, and the only thing the fade scales. */
  private readonly body: Group;

  /** The stub below the wrist, angled away from whatever the hand is holding. */
  private readonly forearm: Group;

  private readonly meshes: Mesh[] = [];
  /** Colour slot per mesh, index-aligned with {@link meshes}. */
  private readonly meshSlots: number[] = [];
  /** `[slot][step]` — every opacity level of every colour, acquired once. */
  private readonly materials: Material[][] = [[], []];
  private readonly motes: Mesh[] = [];

  private phase: Phase = 'hidden';
  private fade = 0;
  private clock = 0;
  private appliedStep = -1;
  private bobScale = 1;

  constructor(context: AssetContext, options: Partial<GhostHandOptions> = {}) {
    super(context, { ...DEFAULT_GHOST_HAND, ...options });

    this.float = new Group();
    this.float.name = 'ghostHand:float';
    this.body = new Group();
    this.body.name = 'ghostHand:body';
    this.forearm = new Group();
    this.forearm.name = 'ghostHand:forearm';
    this.body.add(this.forearm);
    this.grip = new Object3D();
    this.grip.name = 'ghostHand:grip';
    // Not the centre of the palm: a weapon mounted there is buried inside the
    // fist and shows through it. This is the finger line, where a hand actually
    // closes around something.
    this.grip.position.set(0, -0.02, 0.06);

    this.root.add(this.float);
    this.float.add(this.body);
    this.float.add(this.grip);
    this.root.visible = false;
  }

  /** Which side this hand belongs to. */
  get handedness(): GhostHandOptions['handedness'] {
    return this.options.handedness;
  }

  /**
   * Scales the idle float, `0`–`1`.
   *
   * A braced weapon should stop drifting: the aim pose winds this down rather
   * than switching it off, so the hand settles instead of freezing.
   */
  setBobScale(scale: number): void {
    this.bobScale = scale < 0 ? 0 : scale > 1 ? 1 : scale;
  }

  /** `true` once the hand is fully dissolved and hidden. */
  get hidden(): boolean {
    return this.phase === 'hidden';
  }

  /** `true` while the hand is present in any amount. */
  get present(): boolean {
    return this.phase !== 'hidden';
  }

  /** Materialisation, `0` (gone) to `1` (fully there). */
  get materialised(): number {
    return this.fade;
  }

  /** Starts materialising. Idempotent while already visible. */
  show(): void {
    if (this.phase === 'solid' || this.phase === 'materialising') return;
    this.phase = 'materialising';
    this.root.visible = true;
  }

  /** Starts dissolving. The hand is only hidden once the fade completes. */
  hide(): void {
    if (this.phase === 'hidden' || this.phase === 'dissolving') return;
    this.phase = 'dissolving';
  }

  /** Materialises with no fade — for spawning a creature already armed. */
  showImmediate(): void {
    this.phase = 'solid';
    this.fade = 1;
    this.root.visible = true;
    this.applyFade();
  }

  /** Advances the fade and the idle float. Allocation-free. */
  update(dt: number): void {
    if (this.phase === 'hidden') return;

    if (this.phase === 'materialising') {
      const rate = this.options.fadeInSeconds > 0 ? dt / this.options.fadeInSeconds : 1;
      this.fade += rate;
      if (this.fade >= 1) {
        this.fade = 1;
        this.phase = 'solid';
      }
    } else if (this.phase === 'dissolving') {
      const rate = this.options.fadeOutSeconds > 0 ? dt / this.options.fadeOutSeconds : 1;
      this.fade -= rate;
      if (this.fade <= 0) {
        this.fade = 0;
        this.phase = 'hidden';
        this.root.visible = false;
        return;
      }
    }

    this.clock += dt;
    this.applyFade();

    const bob = this.options.bobAmount * this.bobScale;
    if (bob > 0) {
      const angle = this.clock * this.options.bobRate * Math.PI * 2;
      this.float.position.y = Math.sin(angle) * bob * this.fade;
      // A touch of roll off the same phase, a quarter cycle behind. Pure
      // translation reads as a lift; the roll is what makes it read as hovering.
      this.float.rotation.z = Math.cos(angle) * bob * this.fade * 1.6;
    } else {
      this.float.position.y = 0;
      this.float.rotation.z = 0;
    }

    for (let i = 0; i < this.motes.length; i++) {
      const mote = this.motes[i] as Mesh;
      const drift = this.clock * (0.7 + i * 0.35);
      mote.rotation.set(drift, drift * 0.6, 0);
      mote.position.z = (mote.userData.restZ as number) - Math.sin(drift) * 0.02;
      mote.scale.setScalar(this.fade * this.fade);
    }
  }

  protected override onBuild(): void {
    const o = this.options;
    const side = o.handedness === 'left' ? -1 : 1;

    this.acquireMaterials();

    // --- Forearm -----------------------------------------------------------
    // A stub, not a limb. Short enough that the hand still reads as detached —
    // the moment it gets long enough to imply an elbow, the creature looks like
    // it grew an arm. Thick at the wrist, tapering to almost nothing where it
    // is cut off; the radii are baked into the geometry rather than applied
    // with `taper`, so a left and a right forearm share one buffer.
    //
    // Angled down and outboard rather than run straight back, because straight
    // back is exactly where a held weapon's stock goes — a rifle and the stub
    // would occupy the same space. This is also how a wrist actually meets a
    // grip.
    this.forearm.rotation.set(-0.5, side * 0.3, 0);
    this.addMesh(this.cylinder(0.075, 0.03, 0.185, 7), BODY, 0, 0, -0.19, HALF_PI, 0, 0, this.forearm);

    // Wrist cuff — the seam between what is holding and what is haze.
    this.addMesh(
      this.cylinder(0.085, 0.085, 0.05, 8),
      DETAIL,
      0,
      0,
      -0.088,
      HALF_PI,
      0,
      0,
      this.forearm,
    );

    // --- Hand --------------------------------------------------------------
    // Deliberately oversized against the forearm. A hand in scale with its arm
    // reads as anatomy; a big, blunt, floating one reads as a spirit hand.
    this.addMesh(this.box(0.145, 0.135, 0.12), BODY, 0, 0, 0, 0, 0, 0);
    this.addMesh(this.box(0.148, 0.04, 0.062), DETAIL, 0, 0.072, 0.028, 0, 0, 0);

    // Four fingers, curled forward off the front edge of the palm. Only the
    // sign of the X offset is mirrored, so both hands share one finger box.
    for (let i = 0; i < 4; i++) {
      const x = (-0.051 + i * 0.034) * side;
      this.addMesh(this.box(0.031, 0.052, 0.125), BODY, x, -0.035, 0.088, 0.42, 0, 0);
    }

    // Thumb, laid across the grip on the inboard side.
    this.addMesh(this.box(0.048, 0.058, 0.1), BODY, side * 0.077, 0.032, 0.026, 0.2, 0, -side * 0.5);

    // --- Motes -------------------------------------------------------------
    if (o.motes) {
      this.addMote(this.box(0.028, 0.028, 0.028), side * 0.05, 0.042, -0.325);
      this.addMote(this.box(0.019, 0.019, 0.019), -side * 0.036, -0.044, -0.385);
    }

    this.root.scale.setScalar(o.scale);
    this.applyFade();
  }

  protected override onDispose(): void {
    this.meshes.length = 0;
    this.meshSlots.length = 0;
    this.motes.length = 0;
    this.materials[BODY] = [];
    this.materials[DETAIL] = [];
  }

  /**
   * Acquires every opacity level up front.
   *
   * Doing it here rather than on demand keeps the borrow ledger honest — each
   * material is taken exactly once and released exactly once — and means a fade
   * never touches the cache mid-frame.
   */
  private acquireMaterials(): void {
    const o = this.options;
    const colors = [o.color, o.detailColor];

    for (let slot = 0; slot < colors.length; slot++) {
      const levels = this.materials[slot] as Material[];
      for (let step = 0; step < FADE_STEPS; step++) {
        const opacity = (o.opacity * (step + 1)) / FADE_STEPS;
        levels.push(
          this.trackMaterial(
            acquireFlatMaterial(this.context.material, {
              color: colors[slot] as number,
              flatShading: o.flatShading,
              transparent: true,
              opacity,
              emissive: o.emissive,
              emissiveIntensity: o.emissiveIntensity,
              // Depth *is* written, unusually for a transparent material. A
              // hand is five overlapping boxes; without it every internal face
              // blends through every other one and the thing reads as a lump of
              // glass rather than a hand. Writing depth keeps the silhouette
              // and the finger seams while the whole hand still ghosts over
              // whatever is behind it.
              depthWrite: true,
            }),
          ),
        );
      }
    }
  }

  /** Selects the material level for the current fade and applies the scale. */
  private applyFade(): void {
    // Ease out, with a little overshoot: a hand that snaps to full size reads
    // as a pop-in, one that arrives slightly large and settles reads as a
    // materialisation.
    const eased = this.fade * (2 - this.fade);
    const overshoot = 1 + Math.sin(this.fade * Math.PI) * 0.12;
    this.body.scale.setScalar((0.55 + 0.45 * eased) * overshoot);

    const step = Math.min(FADE_STEPS - 1, Math.max(0, Math.ceil(this.fade * FADE_STEPS) - 1));
    if (step === this.appliedStep) return;
    this.appliedStep = step;

    for (let i = 0; i < this.meshes.length; i++) {
      const levels = this.materials[this.meshSlots[i] as number] as Material[];
      (this.meshes[i] as Mesh).material = levels[step] as Material;
    }
  }

  private addMesh(
    geometry: BufferGeometry,
    slot: number,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
    parent: Group = this.body,
  ): Mesh {
    const levels = this.materials[slot] as Material[];
    const mesh = new Mesh(geometry, levels[FADE_STEPS - 1] as Material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = this.options.castShadow;
    // Transparent, so it has to be drawn after the world it floats in front of.
    mesh.renderOrder = 2;
    parent.add(mesh);
    this.meshes.push(mesh);
    this.meshSlots.push(slot);
    return mesh;
  }

  private addMote(geometry: BufferGeometry, x: number, y: number, z: number): void {
    const mote = this.addMesh(geometry, DETAIL, x, y, z, 0, 0, 0, this.forearm);
    mote.userData.restZ = z;
    this.motes.push(mote);
  }

  private box(width: number, height: number, depth: number): BufferGeometry {
    return this.acquireGeometry(
      `gh:box|${keyNum(width)}|${keyNum(height)}|${keyNum(depth)}`,
      () => new BoxGeometry(width, height, depth),
    );
  }

  private cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
  ): BufferGeometry {
    return this.acquireGeometry(
      `gh:cyl|${keyNum(radiusTop)}|${keyNum(radiusBottom)}|${keyNum(height)}|${segments}`,
      () => new CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, false),
    );
  }
}

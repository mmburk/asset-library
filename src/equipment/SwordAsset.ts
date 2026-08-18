import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { Asset } from '../core/Asset';
import type { AssetContext } from '../core/AssetContext';
import { taperGeometry } from '../core/GeometryUtils';
import { acquireFlatMaterial } from '../core/materials';
import { keyNum } from '../core/ResourceCache';
import { BLADE_USER_DATA_KEY, type BladeExtent } from './types';

/** Look and proportions of a {@link SwordAsset}. */
export interface SwordOptions {
  /** Length of the cutting part, from the guard to the tip. */
  bladeLength: number;
  /** Profile height of the blade — spine to edge. */
  bladeWidth: number;
  /** Thickness across the flat. */
  bladeThickness: number;
  /**
   * Total curvature from the guard to the tip, radians.
   *
   * A katana's `sori`, spread evenly along the blade. `0` makes a straight
   * sword, which is what a `ninjatō` would want.
   */
  curve: number;
  /** Length of the bound handle. */
  gripLength: number;
  /** Radius of the disc guard. `0` omits it. */
  guardRadius: number;
  /** Blade colour, packed `0xRRGGBB`. */
  bladeColor: number;
  /** Colour of the hardened edge, laid along the cutting side. */
  edgeColor: number;
  /** Guard, collar and pommel colour. */
  fittingColor: number;
  /** Handle colour, under the binding. */
  gripColor: number;
  /** Colour of the cord wrapped round the handle. */
  wrapColor: number;
  /** Blade segments. More gives a smoother curve; 5 is plenty at this size. */
  segments: number;
  /**
   * Uniform size, where `1` is a sword for a 1.8-unit humanoid. Use
   * {@link weaponScaleForHeight} to match a creature.
   */
  scale: number;
  flatShading: boolean;
  castShadow: boolean;
}

/** Defaults for {@link SwordOptions} — a katana at human scale. */
export const DEFAULT_SWORD: Readonly<SwordOptions> = Object.freeze({
  bladeLength: 0.72,
  bladeWidth: 0.055,
  bladeThickness: 0.016,
  curve: 0.2,
  gripLength: 0.26,
  guardRadius: 0.072,
  // Not white: a white blade blows out under the library's default sun and the
  // edge line disappears into it. Cool grey leaves the edge somewhere to go.
  bladeColor: 0x9aa4b0,
  edgeColor: 0xeef3f8,
  fittingColor: 0x2b2b31,
  gripColor: 0x17171b,
  wrapColor: 0x3d3d46,
  segments: 5,
  scale: 1,
  flatShading: true,
  castShadow: true,
});

/**
 * A procedural katana.
 *
 * Local frame matches every other weapon in this library: the origin is where
 * the fist closes, and the blade runs down `+Z`. Parent it to a hand socket or
 * hand it to {@link EquipmentHolder.equip} and it lands in the palm with no
 * offset maths.
 *
 * The curve is the only structurally interesting part. `sori` is spread evenly
 * across the blade segments, each one placed by stepping along the *previous*
 * segment's own axis, so the blade stays closed at the joints however hard it is
 * curved — the alternative, laying segments out on hand-measured offsets, opens
 * gaps at the spine the moment the curve is retuned.
 *
 * The sword publishes where its edge is, on `root.userData.blade`, which is what
 * lets {@link BladeSweep} sweep the cutting part and nothing else. A sword that
 * did not would still work — the sweep falls back to measuring the object — but
 * it would swing with a hit box that includes the handle and the fist holding it.
 *
 * ```ts
 * const katana = new SwordAsset(context, { scale: 0.8 }).build();
 * creature.equip(katana.root);
 * ```
 */
export class SwordAsset extends Asset<SwordOptions> {
  /** Where the cutting edge starts, in the sword's own space. */
  readonly bladeStart = new Vector3();

  /** The tip, in the sword's own space. */
  readonly bladeEnd = new Vector3();

  constructor(context: AssetContext, options: Partial<SwordOptions> = {}) {
    super(context, { ...DEFAULT_SWORD, ...options });
    this.root.name = 'sword';
  }

  /** Length of the cutting part, at this sword's scale. */
  get reach(): number {
    return this.options.bladeLength * this.options.scale;
  }

  protected override onBuild(): void {
    const o = this.options;

    const blade = this.material(o.bladeColor);
    const edge = this.material(o.edgeColor);
    const fitting = this.material(o.fittingColor);
    const grip = this.material(o.gripColor);
    const wrap = this.material(o.wrapColor);

    // --- Handle ------------------------------------------------------------
    // Runs back from the origin, so the hand sits at the balance point of the
    // grip rather than at the pommel. The sword is authored around the fist,
    // not around itself.
    const gripBack = -o.gripLength * 0.42;
    const gripFront = gripBack + o.gripLength;

    this.part(
      this.box(0.036, 0.05, o.gripLength),
      grip,
      0,
      0,
      gripBack + o.gripLength * 0.5,
      0,
    );

    // Pommel cap.
    this.part(this.box(0.042, 0.056, 0.03), fitting, 0, 0, gripBack - 0.012, 0);

    // Binding: alternating diagonals, which is what a wrapped `tsuka` reads as
    // once it is too small to model as a braid.
    const wraps = 5;
    for (let i = 0; i < wraps; i++) {
      const t = (i + 0.5) / wraps;
      this.part(
        this.box(0.041, 0.055, 0.022),
        wrap,
        0,
        0,
        gripBack + t * o.gripLength,
        i % 2 === 0 ? 0.5 : -0.5,
      );
    }

    // --- Guard -------------------------------------------------------------
    if (o.guardRadius > 0) {
      const guard = new Mesh(this.disc(o.guardRadius, 0.016), fitting);
      guard.position.set(0, 0, gripFront + 0.012);
      guard.rotation.x = Math.PI * 0.5;
      guard.castShadow = o.castShadow;
      this.root.add(guard);
    }

    // Collar between guard and blade.
    this.part(this.box(0.026, o.bladeWidth + 0.012, 0.03), fitting, 0, 0, gripFront + 0.036, 0);

    // --- Blade -------------------------------------------------------------
    const base = gripFront + 0.05;
    const step = o.bladeLength / o.segments;
    // The edge is a hair proud of the flat, so it catches light as its own
    // facet instead of z-fighting with the blade it sits on.
    const edgeInset = o.bladeWidth * 0.5 - 0.004;

    let y = 0;
    let z = base;
    this.bladeStart.set(0, y, z);

    for (let i = 0; i < o.segments; i++) {
      // Curvature accumulates: the tip carries the whole `sori`, the ricasso
      // almost none.
      const tilt = (o.curve * (i + 0.5)) / o.segments;
      const dy = Math.sin(tilt);
      const dz = Math.cos(tilt);
      const last = i === o.segments - 1;

      // Width tapers along the blade, and the last segment tapers to the tip.
      const width = o.bladeWidth * (1 - i * 0.055);
      // Overlapped a little at both ends, so the seam between two tilted
      // segments never opens on the spine.
      const length = step * 1.04;
      const taperTop = last ? 0.12 : 1;

      const cx = 0;
      const cy = y + dy * step * 0.5;
      const cz = z + dz * step * 0.5;

      // Rotated so the box's own +Y — the axis `taper` works along — runs down
      // the blade. That is the only orientation in which a tapered box can come
      // to a point at the tip instead of along the edge.
      this.part(
        this.box(o.bladeThickness, length, width, taperTop),
        blade,
        cx,
        cy,
        cz,
        0,
        Math.PI * 0.5 - tilt,
      );

      if (!last) {
        // Offset perpendicular to the blade, on the inside of the curve, which
        // is where a single-edged sword keeps its edge.
        this.part(
          this.box(o.bladeThickness + 0.002, length, 0.012),
          edge,
          cx,
          cy - dz * edgeInset,
          cz + dy * edgeInset,
          0,
          Math.PI * 0.5 - tilt,
        );
      }

      y += dy * step;
      z += dz * step;
    }

    this.bladeEnd.set(0, y, z);

    // Published for the sweep. Radius is half the blade's own width plus a
    // little slack: a hit box that hugs the steel exactly reads as a miss
    // whenever the swing passes a target on the flat.
    const extent: BladeExtent = {
      start: [this.bladeStart.x, this.bladeStart.y, this.bladeStart.z],
      end: [this.bladeEnd.x, this.bladeEnd.y, this.bladeEnd.z],
      radius: o.bladeWidth * 0.5 + 0.03,
    };
    this.root.userData[BLADE_USER_DATA_KEY] = extent;

    this.root.scale.setScalar(o.scale);
  }

  protected override onDispose(): void {
    delete this.root.userData[BLADE_USER_DATA_KEY];
  }

  private material(color: number): Material {
    return this.trackMaterial(
      acquireFlatMaterial(this.context.material, {
        color,
        flatShading: this.options.flatShading,
      }),
    );
  }

  private part(
    geometry: BufferGeometry,
    material: Material,
    x: number,
    y: number,
    z: number,
    roll: number,
    pitch = 0,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(pitch, 0, roll);
    mesh.castShadow = this.options.castShadow;
    this.root.add(mesh);
    return mesh;
  }

  private box(width: number, height: number, depth: number, taperTop = 1): BufferGeometry {
    return this.acquireGeometry(
      `sw:box|${keyNum(width)}|${keyNum(height)}|${keyNum(depth)}|${keyNum(taperTop)}`,
      () => {
        const geometry = new BoxGeometry(width, height, depth);
        if (taperTop !== 1) taperGeometry(geometry, 'y', 1, taperTop);
        return geometry;
      },
    );
  }

  private disc(radius: number, thickness: number): BufferGeometry {
    return this.acquireGeometry(
      `sw:disc|${keyNum(radius)}|${keyNum(thickness)}`,
      () => new CylinderGeometry(radius, radius, thickness, 8, 1, false),
    );
  }
}

/**
 * Size a weapon should be built at to suit a creature.
 *
 * Weapons are authored for a 1.8-unit humanoid and then parented *inside* the
 * rig, so they are measured against the skeleton's authored height — the root
 * scale that turns a creature into a boss carries the weapon along with
 * everything else. This is the same rule {@link EquipmentHolder} sizes conjured
 * hands by, exposed so a caller building its own props can follow it.
 */
export function weaponScaleForHeight(nominalHeight: number): number {
  if (!(nominalHeight > 0)) return 1;
  const scale = nominalHeight / 1.8;
  return scale < 0.25 ? 0.25 : scale > 3 ? 3 : scale;
}

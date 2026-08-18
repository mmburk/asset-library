import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import { taperGeometry } from '../core/GeometryUtils';
import { keyNum } from '../core/ResourceCache';
import type { FlatMaterialOptions } from '../core/materials';
import { computeMeasurements } from './proportions';
import { HumanoidRig } from './HumanoidRig';
import type { CharacterOptions, HairStyle, HumanoidPalette } from './types';

/**
 * Indirection through which the builder borrows shared resources.
 *
 * The builder must not talk to the cache directly: whoever *owns* the asset
 * has to record each borrow so it can be released on dispose. `CharacterAsset`
 * supplies an implementation backed by its own tracking.
 */
export interface ResourceBinder {
  /** Borrows a geometry, building it on first request for this key. */
  geometry(key: string, factory: () => BufferGeometry): BufferGeometry;
  /** Borrows a flat-shaded material for the given description. */
  material(options: FlatMaterialOptions): Material;
}

/** What {@link HumanoidBuilder.build} produces. */
export interface HumanoidBuildResult {
  /** The posed skeleton, with all part meshes already parented in. */
  rig: HumanoidRig;
  /** Every mesh created, in creation order — handy for LOD or debug tinting. */
  meshes: Mesh[];
}

// Head silhouette: narrower at the jaw, full width at the cranium.
const HEAD_TAPER_BOTTOM = 0.86;
const HEAD_TAPER_TOP = 1.0;

/**
 * Assembles a low-poly humanoid out of boxes and low-segment cylinders.
 *
 * Every geometry is authored **centred on its own origin** and then positioned
 * via `mesh.position`. That is what makes caching effective: a left and a right
 * forearm of the same size are one geometry, and so are the forearms of a
 * hundred identical guards.
 */
export class HumanoidBuilder {
  private readonly binder: ResourceBinder;

  constructor(binder: ResourceBinder) {
    this.binder = binder;
  }

  /** Builds a complete character. The rig root is returned unparented. */
  build(options: CharacterOptions): HumanoidBuildResult {
    const m = computeMeasurements(options.proportions);
    const rig = new HumanoidRig(m);
    const meshes: Mesh[] = [];

    const segments = Math.max(3, Math.min(32, Math.round(options.limbSegments)));
    const p = options.palette;
    const s = options.style;

    // --- Torso -------------------------------------------------------------
    const hipW = m.hipWidth;
    const waistW = m.waistWidth;
    const chestW = m.shoulderWidth * 0.82;

    const pelvisHeight = m.torsoLength * 0.32;
    this.addBox(
      meshes,
      options,
      rig.hips,
      hipW,
      pelvisHeight,
      m.hipDepth,
      1,
      waistW / hipW,
      p.pants,
      0,
      pelvisHeight * 0.5,
      0,
    );

    // The abdomen pivots at `spine`, which sits 35% up the torso.
    const abdomenHeight = m.torsoLength * 0.38;
    this.addBox(
      meshes,
      options,
      rig.spine,
      waistW,
      abdomenHeight,
      m.chestDepth * 0.9,
      1,
      chestW / waistW,
      p.shirt,
      0,
      m.torsoLength * 0.14,
      0,
    );

    // The chest pivots at 70% up the torso.
    const chestHeight = m.torsoLength * 0.36;
    this.addBox(
      meshes,
      options,
      rig.chest,
      chestW,
      chestHeight,
      m.chestDepth,
      1,
      0.94,
      p.shirt,
      0,
      m.torsoLength * 0.14,
      0,
    );

    if (s.belt) {
      this.addBox(
        meshes,
        options,
        rig.spine,
        waistW * 1.07,
        m.torsoLength * 0.055,
        m.chestDepth * 0.94,
        1,
        1,
        p.accent,
        0,
        -m.torsoLength * 0.03,
        0,
      );
    }

    // --- Neck and head -----------------------------------------------------
    // Chibi-style presets have a near-zero neck ratio; give the mesh a floor so
    // the head never floats free of the shoulders.
    const neckVisualHeight = Math.max(m.neckLength, m.headHeight * 0.14) * 1.25;
    this.addCylinder(
      meshes,
      options,
      rig.neck,
      m.neckRadius,
      m.neckRadius * 1.05,
      neckVisualHeight,
      segments,
      p.skin,
      0,
      m.neckLength * 0.5 - neckVisualHeight * 0.1,
      0,
    );

    this.addBox(
      meshes,
      options,
      rig.head,
      m.headWidth,
      m.headHeight,
      m.headDepth,
      HEAD_TAPER_BOTTOM,
      HEAD_TAPER_TOP,
      p.skin,
      0,
      m.headHeight * 0.5,
      0,
    );

    this.buildFace(meshes, options, rig);
    this.buildHair(meshes, options, rig);

    // --- Arms --------------------------------------------------------------
    // The upper arm is always the sleeve; `bareLimbs` decides whether the
    // sleeve stops at the elbow.
    const upperArmColor = p.shirt;
    const lowerArmColor = s.bareLimbs ? p.skin : p.shirt;

    for (let side = 0; side < 2; side++) {
      const isLeft = side === 0;
      const shoulder = isLeft ? rig.shoulderL : rig.shoulderR;
      const upperArm = isLeft ? rig.upperArmL : rig.upperArmR;
      const lowerArm = isLeft ? rig.lowerArmL : rig.lowerArmR;
      const hand = isLeft ? rig.handL : rig.handR;

      if (s.shoulderPads) {
        this.addBox(
          meshes,
          options,
          shoulder,
          m.armRadius * 2.7,
          m.armRadius * 1.9,
          m.armRadius * 2.7,
          1,
          0.72,
          p.accent,
          0,
          m.armRadius * 0.15,
          0,
        );
      }

      this.addCylinder(
        meshes,
        options,
        upperArm,
        m.armRadius,
        m.armRadius * 0.86,
        m.upperArmLength,
        segments,
        upperArmColor,
        0,
        -m.upperArmLength * 0.5,
        0,
      );

      this.addCylinder(
        meshes,
        options,
        lowerArm,
        m.armRadius * 0.86,
        m.armRadius * 0.72,
        m.lowerArmLength,
        segments,
        lowerArmColor,
        0,
        -m.lowerArmLength * 0.5,
        0,
      );

      this.addBox(
        meshes,
        options,
        hand,
        m.handWidth,
        m.handLength,
        m.handWidth * 0.72,
        1,
        1,
        p.skin,
        0,
        -m.handLength * 0.5,
        0,
      );
    }

    // --- Legs --------------------------------------------------------------
    for (let side = 0; side < 2; side++) {
      const isLeft = side === 0;
      const upperLeg = isLeft ? rig.upperLegL : rig.upperLegR;
      const lowerLeg = isLeft ? rig.lowerLegL : rig.lowerLegR;
      const foot = isLeft ? rig.footL : rig.footR;

      this.addCylinder(
        meshes,
        options,
        upperLeg,
        m.legRadius,
        m.legRadius * 0.86,
        m.upperLegLength,
        segments,
        p.pants,
        0,
        -m.upperLegLength * 0.5,
        0,
      );

      this.addCylinder(
        meshes,
        options,
        lowerLeg,
        m.legRadius * 0.86,
        m.legRadius * 0.7,
        m.lowerLegLength,
        segments,
        p.pants,
        0,
        -m.lowerLegLength * 0.5,
        0,
      );

      // The ankle sits above the heel, so the shoe extends forward (+Z).
      this.addBox(
        meshes,
        options,
        foot,
        m.footWidth,
        m.footHeight,
        m.footLength,
        1,
        1,
        p.shoes,
        0,
        -m.footHeight * 0.5,
        m.footLength * 0.5 - m.legRadius * 0.75,
      );
    }

    return { rig, meshes };
  }

  // --- Sub-assemblies ------------------------------------------------------

  private buildFace(meshes: Mesh[], options: CharacterOptions, rig: HumanoidRig): void {
    const m = rig.measurements;
    const p = options.palette;
    const style = options.style.eyes;
    if (style === 'none') return;

    const eyeHeight = m.headHeight * 0.58;
    // The head is tapered, so the face plane sits further in near the jaw.
    const faceScale = taperScaleAt(eyeHeight / m.headHeight, HEAD_TAPER_BOTTOM, HEAD_TAPER_TOP);
    const faceZ = m.headDepth * 0.5 * faceScale;
    const eyeDepth = m.headDepth * 0.07;

    if (style === 'visor') {
      this.addBox(
        meshes,
        options,
        rig.head,
        m.headWidth * 0.8 * faceScale,
        m.headHeight * 0.17,
        eyeDepth,
        1,
        1,
        p.eye,
        0,
        eyeHeight,
        faceZ,
      );
      return;
    }

    const eyeWidth = style === 'box' ? m.headWidth * 0.17 : m.headWidth * 0.1;
    const eyeTall = style === 'box' ? m.headHeight * 0.1 : m.headHeight * 0.08;
    const eyeX = m.headWidth * 0.23 * faceScale;

    for (let side = 0; side < 2; side++) {
      this.addBox(
        meshes,
        options,
        rig.head,
        eyeWidth,
        eyeTall,
        eyeDepth,
        1,
        1,
        p.eye,
        side === 0 ? eyeX : -eyeX,
        eyeHeight,
        faceZ,
      );
    }

    if (options.style.beard) {
      const beardHeight = m.headHeight * 0.32;
      const beardY = m.headHeight * 0.2;
      const beardScale = taperScaleAt(beardY / m.headHeight, HEAD_TAPER_BOTTOM, HEAD_TAPER_TOP);
      this.addBox(
        meshes,
        options,
        rig.head,
        m.headWidth * 0.72 * beardScale,
        beardHeight,
        m.headDepth * 0.4,
        1,
        0.8,
        p.hair,
        0,
        beardY,
        m.headDepth * 0.32 * beardScale,
      );
    }
  }

  private buildHair(meshes: Mesh[], options: CharacterOptions, rig: HumanoidRig): void {
    const style = options.style.hair;
    if (style === 'none') return;

    const m = rig.measurements;
    const color = hairColorFor(style, options.palette);
    const head = rig.head;

    // A skull cap underpins every style except the fully enclosing ones.
    const needsCap =
      style === 'short' || style === 'long' || style === 'ponytail' || style === 'bun';

    if (needsCap) {
      this.addBox(
        meshes,
        options,
        head,
        m.headWidth * 1.05,
        m.headHeight * 0.38,
        m.headDepth * 1.05,
        0.98,
        0.9,
        color,
        0,
        m.headHeight * 0.83,
        0,
      );
    }

    switch (style) {
      case 'short':
        break;

      case 'long':
        this.addBox(
          meshes,
          options,
          head,
          m.headWidth * 1.0,
          m.headHeight * 0.75,
          m.headDepth * 0.34,
          1,
          1,
          color,
          0,
          m.headHeight * 0.42,
          -m.headDepth * 0.44,
        );
        break;

      case 'ponytail': {
        const tail = this.addCylinder(
          meshes,
          options,
          head,
          m.headWidth * 0.16,
          m.headWidth * 0.07,
          m.headHeight * 0.85,
          6,
          color,
          0,
          m.headHeight * 0.62,
          -m.headDepth * 0.62,
        );
        // Swing the tail back and down rather than letting it stand upright.
        tail.rotation.x = -0.6;
        break;
      }

      case 'bun':
        this.addBox(
          meshes,
          options,
          head,
          m.headWidth * 0.42,
          m.headWidth * 0.42,
          m.headWidth * 0.42,
          0.8,
          0.8,
          color,
          0,
          m.headHeight * 1.02,
          -m.headDepth * 0.38,
        );
        break;

      case 'mohawk':
        this.addBox(
          meshes,
          options,
          head,
          m.headWidth * 0.17,
          m.headHeight * 0.42,
          m.headDepth * 0.92,
          1,
          0.85,
          color,
          0,
          m.headHeight * 1.06,
          0,
        );
        break;

      case 'hood':
        this.addBox(
          meshes,
          options,
          head,
          m.headWidth * 1.2,
          m.headHeight * 1.0,
          m.headDepth * 1.18,
          0.92,
          1,
          color,
          0,
          m.headHeight * 0.56,
          -m.headDepth * 0.08,
        );
        break;

      case 'helmet':
        this.addBox(
          meshes,
          options,
          head,
          m.headWidth * 1.12,
          m.headHeight * 0.6,
          m.headDepth * 1.12,
          1,
          0.88,
          color,
          0,
          m.headHeight * 0.76,
          0,
        );
        break;
    }
  }

  // --- Primitive helpers ---------------------------------------------------

  private addBox(
    meshes: Mesh[],
    options: CharacterOptions,
    parent: Object3D,
    width: number,
    height: number,
    depth: number,
    taperBottom: number,
    taperTop: number,
    color: number,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const key = `hum:box|${keyNum(width)}|${keyNum(height)}|${keyNum(depth)}|${keyNum(taperBottom)}|${keyNum(taperTop)}`;
    const geometry = this.binder.geometry(key, () => {
      const geo = new BoxGeometry(width, height, depth);
      if (taperBottom !== 1 || taperTop !== 1) {
        taperGeometry(geo, 'y', taperBottom, taperTop);
      }
      return geo;
    });
    return this.addMesh(meshes, options, parent, geometry, color, x, y, z);
  }

  private addCylinder(
    meshes: Mesh[],
    options: CharacterOptions,
    parent: Object3D,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    segments: number,
    color: number,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const key = `hum:cyl|${keyNum(radiusTop)}|${keyNum(radiusBottom)}|${keyNum(height)}|${segments}`;
    const geometry = this.binder.geometry(
      key,
      () => new CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, false),
    );
    return this.addMesh(meshes, options, parent, geometry, color, x, y, z);
  }

  private addMesh(
    meshes: Mesh[],
    options: CharacterOptions,
    parent: Object3D,
    geometry: BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const material = this.binder.material({
      color,
      flatShading: options.flatShading,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = options.castShadow;
    mesh.receiveShadow = options.receiveShadow;
    mesh.name = `${parent.name}:part${meshes.length}`;
    parent.add(mesh);
    meshes.push(mesh);
    return mesh;
  }
}

/** Cross-section scale of a y-tapered shape at normalised height `t`. */
function taperScaleAt(t: number, bottom: number, top: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return bottom + (top - bottom) * clamped;
}

/** Hoods and helmets are gear, not hair — they take the accent colour. */
function hairColorFor(style: HairStyle, palette: HumanoidPalette): number {
  return style === 'hood' || style === 'helmet' ? palette.accent : palette.hair;
}

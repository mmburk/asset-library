import { Box3, Matrix4, Mesh, Object3D, Vector3, type BufferGeometry } from 'three';
import { BLADE_USER_DATA_KEY, type BladeExtent } from './types';
import type { SwingStyle } from './SwingController';

/** Per-blade settings. */
export interface BladeOptions {
  /**
   * Damage this blade deals. Overrides {@link BladeSweepOptions.damage}.
   *
   * Carried rather than interpreted: the library never subtracts it from
   * anything, it only hands it to the hit callback.
   */
  damage?: number;
  /**
   * How far from the edge still counts as a hit, in the weapon's own units.
   * Defaults to whatever the weapon published, or a fraction of its length.
   */
  radius?: number;
}

/** Settings for {@link BladeSweep}. */
export interface BladeSweepOptions {
  /** Damage reported for a blade that does not state its own. */
  damage: number;
  /**
   * Positions sampled between the previous frame and this one.
   *
   * The reason this exists: a sword tip covers a metre and a half in the 90 ms
   * a strike lasts, so at 60 fps it moves about a quarter of its own length per
   * frame — and at 20 fps it teleports straight through anything thinner than
   * that. Sampling the path closes the gap without integrating anything.
   */
  sweepSteps: number;
  /**
   * `true` lets one swing hit the same target more than once. Off by default:
   * a single cut that registers on four consecutive frames is four times the
   * damage the animation shows.
   */
  repeatHits: boolean;
}

export const DEFAULT_BLADE_SWEEP: Readonly<BladeSweepOptions> = Object.freeze({
  damage: 1,
  sweepSteps: 4,
  repeatHits: false,
});

/**
 * One thing a blade can hit.
 *
 * A sphere, not a mesh. Every creature in this library is a stack of boxes
 * around a rig, and testing an edge against that is both far slower and no more
 * convincing than testing it against the ball the creature occupies — the
 * animation is what sells a hit, the geometry only has to agree roughly about
 * where the target is.
 */
interface TargetEntry {
  readonly object: Object3D;
  radius: number;
  data: unknown;
}

interface BladeEntry {
  readonly object: Object3D;
  /** Cutting part, in the blade object's own space. */
  readonly start: Vector3;
  readonly end: Vector3;
  radius: number;
  readonly damage: number;
  /** World-space edge from the previous sample. */
  readonly lastStart: Vector3;
  readonly lastEnd: Vector3;
  /** `false` until the first sample of a swing has been taken. */
  primed: boolean;
}

/**
 * What a blade hit.
 *
 * The same object is handed to the callback every time, with its fields
 * rewritten — a hit report that allocated would allocate hardest exactly when
 * the most is happening on screen. Copy anything that has to outlive the call.
 */
export interface MeleeHit {
  /** The object registered with {@link BladeSweep.addTarget}. */
  target: Object3D;
  /** Whatever was handed to `addTarget` alongside it. */
  data: unknown;
  /** The weapon that connected. */
  blade: Object3D;
  /** Where on the edge the contact was, in world space. */
  readonly point: Vector3;
  /** Direction from the edge to the target's centre. Unit length. */
  readonly normal: Vector3;
  damage: number;
  style: SwingStyle;
  /** Which swing this was, counting from the first. */
  swing: number;
}

/** Handler for {@link BladeSweep.onHit}. */
export type MeleeHitHandler = (hit: MeleeHit) => void;

const scratchStart = new Vector3();
const scratchEnd = new Vector3();
const scratchSampleFrom = new Vector3();
const scratchSampleTo = new Vector3();
const scratchCenter = new Vector3();
const scratchAxis = new Vector3();
const scratchToTarget = new Vector3();
const scratchClosest = new Vector3();
const scratchScale = new Vector3();
const scratchBounds = new Box3();
const scratchChildBounds = new Box3();
const scratchSize = new Vector3();
const scratchInverse = new Matrix4();
const scratchLocal = new Matrix4();

/** Placeholder so {@link MeleeHit} is never handed a null object. */
const DUMMY = new Object3D();

/**
 * Hit detection for a swung weapon.
 *
 * Deliberately not a physics engine and deliberately not per-triangle: an edge
 * is a line segment, a target is a sphere, and a hit is the segment passing
 * within a radius of the centre at some point along its path since the last
 * frame. That is enough for a game to feel right, and it costs a dot product
 * per target per sample.
 *
 * Two things about it are less obvious than they look:
 *
 * - **The test is swept, not instantaneous.** A strike is 90 ms long and the tip
 *   crosses most of a body in that time. Sampling only where the blade *is*
 *   when the frame renders misses anything the blade went through between
 *   frames, and it misses more of them the worse the frame rate gets — which is
 *   the worst possible way for a hit box to behave.
 * - **A swing hits each target once.** Tracked by swing id rather than by a
 *   timer, so a cut that lingers on a target across four frames still reports
 *   one hit, and the next swing reports another.
 *
 * ```ts
 * sweep.addBlade(katana);
 * sweep.addTarget(enemy.root, 0.6, enemy);
 * sweep.onHit = (hit) => enemy.hurt(hit.damage);
 * // per frame, after the pose has been applied:
 * if (swing.striking) sweep.sweep(swing.swings, swing.style);
 * else sweep.rest();
 * ```
 */
export class BladeSweep {
  private readonly options: BladeSweepOptions;
  private readonly blades: BladeEntry[] = [];
  private readonly targets: TargetEntry[] = [];
  /** Targets already hit by the swing in {@link currentSwing}. */
  private readonly hitThisSwing: Object3D[] = [];
  private currentSwing = -1;
  private hitCountValue = 0;

  /** Called for every hit. Set to `null` to ignore hits. */
  onHit: MeleeHitHandler | null = null;

  private readonly hit: MeleeHit = {
    target: DUMMY,
    data: null,
    blade: DUMMY,
    point: new Vector3(),
    normal: new Vector3(),
    damage: 0,
    style: 'slash',
    swing: 0,
  };

  constructor(options: Partial<BladeSweepOptions> = {}) {
    this.options = { ...DEFAULT_BLADE_SWEEP, ...options };
  }

  /** Hits reported since construction. */
  get hits(): number {
    return this.hitCountValue;
  }

  /** Number of weapons currently able to cut. */
  get bladeCount(): number {
    return this.blades.length;
  }

  /** Number of registered targets. */
  get targetCount(): number {
    return this.targets.length;
  }

  /**
   * Registers a weapon as something that can cut.
   *
   * The cutting part comes from the weapon itself when it publishes one — see
   * {@link BladeExtent} — and is otherwise measured from its bounds along `+Z`,
   * starting a third of the way down so a derived edge does not include the
   * handle. Either way it is resolved once, here, rather than every frame.
   */
  addBlade(object: Object3D, options: BladeOptions = {}): void {
    if (this.indexOfBlade(object) >= 0) return;

    const entry: BladeEntry = {
      object,
      start: new Vector3(),
      end: new Vector3(),
      radius: 0,
      damage: options.damage ?? this.options.damage,
      lastStart: new Vector3(),
      lastEnd: new Vector3(),
      primed: false,
    };

    const published = object.userData[BLADE_USER_DATA_KEY] as BladeExtent | undefined;
    if (published !== undefined) {
      entry.start.set(published.start[0], published.start[1], published.start[2]);
      entry.end.set(published.end[0], published.end[1], published.end[2]);
      entry.radius = options.radius ?? published.radius;
    } else {
      // Measured in the weapon's *own* space rather than through
      // `Box3.setFromObject`, which reports world bounds: a weapon already
      // parented into a rig would otherwise be measured after the creature's
      // scale and the arm's rotation had been applied to it, and a sword held
      // pointing sideways would come out with no length at all.
      measureLocal(object, scratchBounds);
      scratchBounds.getSize(scratchSize);
      const reach = Math.max(scratchSize.z, 1e-4);
      // From a third of the way along: an edge derived from bounds would
      // otherwise include the handle, and the fist holding it.
      entry.start.set(0, 0, scratchBounds.min.z + reach * 0.34);
      entry.end.set(0, 0, scratchBounds.max.z);
      entry.radius = options.radius ?? Math.max(reach * 0.06, 0.02);
    }

    this.blades.push(entry);
  }

  /** Stops `object` cutting. */
  removeBlade(object: Object3D): void {
    const index = this.indexOfBlade(object);
    if (index >= 0) this.blades.splice(index, 1);
  }

  /** Forgets every blade. */
  clearBlades(): void {
    this.blades.length = 0;
  }

  /**
   * Registers something a blade can hit.
   *
   * @param radius World-space radius of the target's hit sphere.
   * @param data Handed back on {@link MeleeHit.data}, untouched. This is where
   * a caller's own enemy object goes.
   */
  addTarget(object: Object3D, radius: number, data: unknown = null): void {
    const existing = this.indexOfTarget(object);
    if (existing >= 0) {
      const entry = this.targets[existing] as TargetEntry;
      entry.radius = radius;
      entry.data = data;
      return;
    }
    this.targets.push({ object, radius, data });
  }

  /** Stops `object` being hittable. */
  removeTarget(object: Object3D): void {
    const index = this.indexOfTarget(object);
    if (index >= 0) this.targets.splice(index, 1);
    const hit = this.hitThisSwing.indexOf(object);
    if (hit >= 0) this.hitThisSwing.splice(hit, 1);
  }

  /** Forgets every target. */
  clearTargets(): void {
    this.targets.length = 0;
    this.hitThisSwing.length = 0;
  }

  /**
   * Tests the edge against every target and reports what it passed through.
   *
   * Call once per frame while — and only while — the strike window is open, and
   * {@link rest} otherwise. The swing id is what tells one cut from the next: a
   * new id clears the once-per-swing record and re-primes the sweep at the
   * blade's current position, so the first frame of a cut never sweeps from
   * wherever the weapon was standing.
   */
  sweep(swingId: number, style: SwingStyle = 'slash'): number {
    if (this.blades.length === 0 || this.targets.length === 0) return 0;

    const fresh = swingId !== this.currentSwing;
    if (fresh) {
      this.currentSwing = swingId;
      this.hitThisSwing.length = 0;
      for (let i = 0; i < this.blades.length; i++) {
        (this.blades[i] as BladeEntry).primed = false;
      }
    }

    let hits = 0;
    const steps = this.options.sweepSteps < 1 ? 1 : this.options.sweepSteps;

    for (let b = 0; b < this.blades.length; b++) {
      const blade = this.blades[b] as BladeEntry;
      const object = blade.object;
      // The pose was written this frame, so the matrices behind the weapon are
      // one update out of date until this runs.
      object.updateMatrixWorld(true);

      scratchStart.copy(blade.start).applyMatrix4(object.matrixWorld);
      scratchEnd.copy(blade.end).applyMatrix4(object.matrixWorld);
      object.getWorldScale(scratchScale);
      const radius = blade.radius * Math.abs(scratchScale.x);

      if (!blade.primed) {
        blade.lastStart.copy(scratchStart);
        blade.lastEnd.copy(scratchEnd);
        blade.primed = true;
      }

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        // One sample of the edge somewhere along the path it took this frame.
        scratchSampleFrom.copy(blade.lastStart).lerp(scratchStart, t);
        scratchSampleTo.copy(blade.lastEnd).lerp(scratchEnd, t);
        hits += this.testSegment(blade, scratchSampleFrom, scratchSampleTo, radius, style);
      }

      blade.lastStart.copy(scratchStart);
      blade.lastEnd.copy(scratchEnd);
    }

    return hits;
  }

  /**
   * Marks the blade as not cutting.
   *
   * The next sweep then re-primes rather than sweeping from wherever the weapon
   * was when the last strike ended — otherwise the first frame of a new cut
   * draws a line across the room from the old pose and hits everything on it.
   */
  rest(): void {
    for (let i = 0; i < this.blades.length; i++) {
      (this.blades[i] as BladeEntry).primed = false;
    }
  }

  /** Forgets which targets the current swing has already hit. */
  resetSwing(): void {
    this.currentSwing = -1;
    this.hitThisSwing.length = 0;
    this.rest();
  }

  /** One edge position against every target. */
  private testSegment(
    blade: BladeEntry,
    from: Vector3,
    to: Vector3,
    radius: number,
    style: SwingStyle,
  ): number {
    let hits = 0;

    for (let i = 0; i < this.targets.length; i++) {
      const target = this.targets[i] as TargetEntry;
      if (!this.options.repeatHits && this.hitThisSwing.indexOf(target.object) >= 0) continue;
      // A blade cannot cut what it is bolted to. Ancestors as well as the
      // object itself, so a creature that registers its own root as a target —
      // which is the normal way to make a crowd hit each other — is not cut in
      // half by the sword in its own hand.
      if (contains(target.object, blade.object)) continue;

      target.object.getWorldPosition(scratchCenter);

      // Closest point on the edge to the target's centre, clamped to the
      // segment: an unclamped projection reports hits from behind the hilt and
      // out past the tip.
      scratchAxis.copy(to).sub(from);
      const lengthSq = scratchAxis.lengthSq();
      scratchToTarget.copy(scratchCenter).sub(from);
      let t = lengthSq > 1e-12 ? scratchToTarget.dot(scratchAxis) / lengthSq : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      scratchClosest.copy(scratchAxis).multiplyScalar(t).add(from);

      const reach = radius + target.radius;
      const distanceSq = scratchClosest.distanceToSquared(scratchCenter);
      if (distanceSq > reach * reach) continue;

      if (!this.options.repeatHits) this.hitThisSwing.push(target.object);
      hits++;
      this.hitCountValue++;

      const handler = this.onHit;
      if (handler === null) continue;

      const hit = this.hit;
      hit.target = target.object;
      hit.data = target.data;
      hit.blade = blade.object;
      hit.point.copy(scratchClosest);
      hit.normal.copy(scratchCenter).sub(scratchClosest);
      const length = hit.normal.length();
      // Dead centre: any direction is as good as another, so pick the one that
      // reads as "away from the swing" rather than leaving a zero vector for
      // the caller to normalise.
      if (length > 1e-6) hit.normal.multiplyScalar(1 / length);
      else hit.normal.set(0, 1, 0);
      hit.damage = blade.damage;
      hit.style = style;
      hit.swing = this.currentSwing;
      handler(hit);
    }

    return hits;
  }

  private indexOfBlade(object: Object3D): number {
    for (let i = 0; i < this.blades.length; i++) {
      if ((this.blades[i] as BladeEntry).object === object) return i;
    }
    return -1;
  }

  private indexOfTarget(object: Object3D): number {
    for (let i = 0; i < this.targets.length; i++) {
      if ((this.targets[i] as TargetEntry).object === object) return i;
    }
    return -1;
  }
}

/** `true` when `node` is `ancestor` or hangs somewhere under it. */
function contains(ancestor: Object3D, node: Object3D): boolean {
  let current: Object3D | null = node;
  while (current !== null) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

/**
 * Bounds of `object` and its children, in `object`'s own space.
 *
 * Runs once per blade, at registration — the traversal and the closure it takes
 * would both be out of place in a frame loop, and the result never changes.
 */
function measureLocal(object: Object3D, out: Box3): void {
  object.updateMatrixWorld(true);
  scratchInverse.copy(object.matrixWorld).invert();
  out.makeEmpty();

  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const geometry = child.geometry as BufferGeometry | undefined;
    if (geometry === undefined || geometry.getAttribute('position') === undefined) return;
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (bounds === null) return;

    scratchLocal.multiplyMatrices(scratchInverse, child.matrixWorld);
    scratchChildBounds.copy(bounds).applyMatrix4(scratchLocal);
    out.union(scratchChildBounds);
  });

  // Nothing to measure — an empty group, or a weapon whose meshes have not been
  // built yet. Half a unit of reach down `+Z` is at least the right shape.
  if (out.isEmpty()) {
    out.min.set(0, 0, 0);
    out.max.set(0, 0, 0.5);
  }
}

/**
 * @burak/asset-library
 *
 * Procedural, Zero-GC low-poly asset library for Three.js.
 *
 * Nothing here loads from disk or the network: every mesh is generated from
 * `BoxGeometry`, `CylinderGeometry` and friends, and every texture is built in
 * code. Geometries and materials are reference-counted and shared, animation
 * runs without allocating, and each asset knows how to free exactly what it
 * borrowed.
 *
 * ```ts
 * import { AssetContext, createCharacter, LocomotionAnimator } from '@burak/asset-library';
 *
 * const context = new AssetContext({ seed: 'village' });
 * const guard = createCharacter(context, { palette: { shirt: 0x8f3b3b } }).build();
 * const animator = new LocomotionAnimator(guard.rig);
 *
 * scene.add(guard.root);
 * // in the frame loop:
 * animator.setState(speed, grounded, turnRate);
 * animator.update(dt);
 * ```
 */

export * from './core';
export * from './characters';
export * from './creatures';
export * from './equipment';

/** Library version, kept in step with `package.json`. */
export const VERSION = '0.1.0';

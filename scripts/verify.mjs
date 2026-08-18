// Verification harness for the built bundle. Runs headless â€” no WebGL needed,
// because nothing here constructs a renderer.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import {
  AssetContext,
  BladeSweep,
  CreatureAsset,
  DEFAULT_AIM,
  DEFAULT_RECOIL,
  EquipmentHolder,
  RecoilController,
  SwordAsset,
  weaponScaleForHeight,
  HUMANOID_ARCHETYPES,
  HUMANOID_PROPORTION_PRESETS,
  LocomotionAnimator,
  Rng,
  createArchetypeCharacter,
  createCharacter,
  createRandomCharacter,
  mergeGeometries,
  BRAINROT_RECIPES,
  BRAINROT_RECIPE_IDS,
  BipedAnimator,
  FlightAnimator,
  HybridWalkAnimator,
  QuadrupedAnimator,
  SIZE_TIER_HEIGHTS,
  SwimAnimator,
  spawnFromRecipe,
} from '../dist/asset-library.js';

let failures = 0;
const box = new Box3();
const size = new Vector3();

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}${detail ? ` â€” ${detail}` : ''}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` â€” ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// --- 1. Height accuracy -----------------------------------------------------
section('1. Requested height is delivered exactly');
{
  const context = new AssetContext({ seed: 'height' });
  for (const archetype of HUMANOID_ARCHETYPES) {
    const preset = HUMANOID_PROPORTION_PRESETS[archetype];
    const asset = createArchetypeCharacter(context, archetype, {
      style: { hair: 'none', eyes: 'none', beard: false, shoulderPads: false, belt: false },
    }).build();

    asset.root.updateMatrixWorld(true);
    box.setFromObject(asset.root);
    box.getSize(size);

    const error = Math.abs(size.y - preset.height) / preset.height;
    const floorError = Math.abs(box.min.y);
    check(
      `${archetype.padEnd(9)} height ${size.y.toFixed(4)} vs ${preset.height}`,
      error < 0.005 && floorError < preset.height * 0.005,
      `err ${(error * 100).toFixed(3)}%, feet at y=${box.min.y.toFixed(5)}`,
    );
    asset.dispose();
  }
  check('caches drained after dispose', context.stats().geometries === 0 && context.stats().materials === 0,
    JSON.stringify(context.stats()));
  context.dispose();
}

// --- 2. Resource sharing ----------------------------------------------------
section('2. Identical characters share geometries and materials');
{
  const context = new AssetContext({ seed: 'share' });
  const assets = [];
  for (let i = 0; i < 50; i++) assets.push(createCharacter(context).build());

  const after = context.stats();
  check('50 identical characters, geometry count stays small', after.geometries < 20, `${after.geometries} geometries`);
  check('50 identical characters, material count stays small', after.materials < 12, `${after.materials} materials`);

  // Dispose all but one: shared resources must survive.
  for (let i = 1; i < assets.length; i++) assets[i].dispose();
  const partial = context.stats();
  check('survivors keep their resources alive', partial.geometries === after.geometries && partial.materials === after.materials,
    JSON.stringify(partial));

  assets[0].dispose();
  const drained = context.stats();
  check('last release frees everything', drained.geometries === 0 && drained.materials === 0, JSON.stringify(drained));
  context.dispose();
}

// --- 3. Animator: finite, bounded, drift-free -------------------------------
section('3. Animator stability over a long session');
{
  const context = new AssetContext({ seed: 'anim' });
  const asset = createCharacter(context).build();
  const animator = new LocomotionAnimator(asset.rig);

  const dt = 1 / 60;
  const steps = 60 * 60 * 60; // one simulated hour
  let bad = 0;
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    animator.setState(3.5 + Math.sin(t * 0.3) * 3.4, Math.sin(t * 0.11) > -0.7, Math.sin(t * 0.23) * 1.5);
    animator.update(dt);
  }
  for (const joint of asset.rig.joints) {
    const r = joint.rotation;
    const p = joint.position;
    if (![r.x, r.y, r.z, p.x, p.y, p.z].every((v) => Number.isFinite(v) && Math.abs(v) < 100)) bad++;
  }
  check('all joints finite and bounded after 1 simulated hour', bad === 0, `${bad} bad joints`);

  // Determinism: identical input sequences must produce bit-identical poses.
  const snapshot = () => asset.rig.joints.flatMap((j) => [j.rotation.x, j.rotation.y, j.rotation.z, j.position.x, j.position.y, j.position.z]);

  animator.reset();
  for (let i = 0; i < 500; i++) { animator.setState(2.2, true, 0.4); animator.update(dt); }
  const runA = snapshot();

  animator.reset();
  for (let i = 0; i < 500; i++) { animator.setState(2.2, true, 0.4); animator.update(dt); }
  const runB = snapshot();

  check('identical input sequence yields bit-identical pose', runA.every((v, i) => v === runB[i]));

  animator.reset();
  const restMatches = asset.rig.joints.every((joint, i) => {
    const o = i * 3;
    return joint.rotation.x === asset.rig.restRotations[o]
      && joint.rotation.y === asset.rig.restRotations[o + 1]
      && joint.rotation.z === asset.rig.restRotations[o + 2];
  });
  check('reset() restores the exact rest pose', restMatches);

  asset.dispose();
  context.dispose();
}

// --- 4. Zero-GC check -------------------------------------------------------
section('4. update() allocates nothing');
{
  // Measured by alloc-probe.mjs, which runs V8's sampling heap profiler around
  // the frame loop only. Three other methods were tried first and all of them
  // failed their own control in this environment: `heapUsed` deltas are pure
  // JIT noise, PerformanceObserver never emits 'gc' entries here, and counting
  // `--trace-gc` collections turned out not to track allocation at all. Hence
  // the control run: if one escaping allocation per call does not register,
  // the `lib` number is meaningless and this check fails rather than passing
  // for the wrong reason.
  const probe = (mode, frames) => {
    const result = spawnSync(
      process.execPath,
      ['--expose-gc', fileURLToPath(new URL('./alloc-probe.mjs', import.meta.url)), mode, String(frames)],
      { encoding: 'utf8' },
    );
    if (result.status !== 0) {
      throw new Error(`alloc-probe failed (${result.status}): ${(result.stderr ?? '').slice(-400)}`);
    }
    return JSON.parse(result.stdout);
  };

  const FRAMES = 20000;
  const control = probe('control', FRAMES);
  const lib = probe('lib', FRAMES);
  const creatures = probe('creatures', FRAMES);

  const controlPerCall = control.totalBytes / control.calls;
  check('control: one retained allocation per call is detected',
    control.totalBytes > 50_000,
    `${control.totalBytes.toLocaleString('en-US')} bytes = ${controlPerCall.toFixed(3)} B/call over ${control.calls.toLocaleString('en-US')} calls`);

  // Attribution is thresholded rather than required to be exactly zero. At a
  // 1 KiB sampling interval a handful of samples land in library frames purely
  // by chance, and calling that a regression would make the check flaky. What
  // matters is the ratio against the control: real per-call allocation shows up
  // two orders of magnitude larger.
  const attributed = (result) =>
    result.top
      .filter(([name]) => name === 'update' || name === 'setState' || name === 'applyLocomotion')
      .reduce((sum, [, bytes]) => sum + bytes, 0);

  for (const [label, result] of [['humanoid', lib], ['creature', creatures]]) {
    const bytes = attributed(result);
    const perCall = bytes / result.calls;
    check(`${label} update() allocates < 0.05 B/call across ${result.calls.toLocaleString('en-US')} calls`,
      perCall < 0.05 && perCall < controlPerCall / 20,
      bytes === 0
        ? `no samples attributed at all (control: ${controlPerCall.toFixed(3)} B/call)`
        : `${bytes.toLocaleString('en-US')} bytes = ${perCall.toFixed(4)} B/call, ` +
          `${Math.round(controlPerCall / perCall)}x cleaner than the control`);
  }
}

// --- 5. mergeGeometries -----------------------------------------------------
section('5. mergeGeometries correctness');
{
  const context = new AssetContext({ seed: 'merge' });
  const asset = createCharacter(context).build();
  const geometries = asset.meshes.map((m) => m.geometry);
  const merged = mergeGeometries(geometries);

  let expectedVerts = 0;
  let expectedIndices = 0;
  for (const g of geometries) {
    expectedVerts += g.getAttribute('position').count;
    expectedIndices += g.index ? g.index.count : 0;
  }
  check('merged vertex count matches the sum of the sources',
    merged.getAttribute('position').count === expectedVerts,
    `${merged.getAttribute('position').count} vs ${expectedVerts}`);
  check('merged index count matches the sum of the sources',
    merged.index !== null && merged.index.count === expectedIndices,
    `${merged.index?.count} vs ${expectedIndices}`);

  // Every index must address a real vertex â€” the offsetting is the easy thing
  // to get wrong in a merge.
  let maxIndex = -1;
  for (let i = 0; i < merged.index.count; i++) maxIndex = Math.max(maxIndex, merged.index.getX(i));
  check('every index is in range', maxIndex === expectedVerts - 1, `max index ${maxIndex}, verts ${expectedVerts}`);
  check('index width chosen correctly',
    expectedVerts > 65535 ? merged.index.array instanceof Uint32Array : merged.index.array instanceof Uint16Array);

  merged.dispose();
  asset.dispose();
  context.dispose();
}

// --- 6. Determinism of generation -------------------------------------------
section('6. Same seed produces the same character');
{
  const describe = (asset) => {
    asset.root.updateMatrixWorld(true);
    box.setFromObject(asset.root);
    box.getSize(size);
    return `${size.x.toFixed(6)},${size.y.toFixed(6)},${size.z.toFixed(6)},${asset.meshes.length}`;
  };

  const c1 = new AssetContext({ seed: 'village' });
  const a1 = createRandomCharacter(c1, new Rng('village')).build();
  const d1 = describe(a1);

  const c2 = new AssetContext({ seed: 'village' });
  const a2 = createRandomCharacter(c2, new Rng('village')).build();
  const d2 = describe(a2);

  check('same seed â†’ identical geometry footprint', d1 === d2, d1);

  const c3 = new AssetContext({ seed: 'other' });
  const a3 = createRandomCharacter(c3, new Rng('other-seed')).build();
  check('different seed â†’ different character', describe(a3) !== d1);

  a1.dispose(); a2.dispose(); a3.dispose();
  c1.dispose(); c2.dispose(); c3.dispose();
}

// --- 7. Brainrot creature archetypes ----------------------------------------
section('7. Creature archetypes build, scale and animate');
{
  const EXPECTED_ANIMATOR = {
    biped: BipedAnimator,
    quadruped: QuadrupedAnimator,
    flyer: FlightAnimator,
    swimmer: SwimAnimator,
    hybrid: HybridWalkAnimator,
  };

  const context = new AssetContext({ seed: 'creatures' });
  const dt = 1 / 60;

  for (const id of BRAINROT_RECIPE_IDS) {
    const recipe = BRAINROT_RECIPES[id];
    const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player', seed: `s-${id}` });

    instance.root.updateMatrixWorld(true);
    box.setFromObject(instance.root);
    box.getSize(size);

    const heightErr = Math.abs(size.y - SIZE_TIER_HEIGHTS.player) / SIZE_TIER_HEIGHTS.player;
    const groundErr = Math.abs(box.min.y);
    const rightAnimator = instance.animator instanceof EXPECTED_ANIMATOR[recipe.plan];

    check(`${id.padEnd(18)} ${recipe.plan.padEnd(10)} builds, scales, sits on ground`,
      heightErr < 0.01 && groundErr < 0.01 && rightAnimator,
      `h=${size.y.toFixed(4)} (err ${(heightErr * 100).toFixed(2)}%), floor=${box.min.y.toFixed(4)}, animator=${instance.animator.constructor.name}`);

    instance.dispose();
  }

  // A creature carrying a prop must still stand on its feet. `CreatureAsset`
  // grounds by the lowest point, so a bat or a tail hanging below the soles
  // silently lifts the whole figure into the air — invisible in the bounding
  // box, obvious on screen.
  for (const id of BRAINROT_RECIPE_IDS) {
    const recipe = BRAINROT_RECIPES[id];
    if (recipe.plan !== 'biped') continue;
    const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player' });
    instance.root.updateMatrixWorld(true);
    const footLow = Math.min(
      new Box3().setFromObject(instance.rig.getBone('footL')).min.y,
      new Box3().setFromObject(instance.rig.getBone('footR')).min.y,
    );
    check(`${id.padEnd(18)} stands on its feet, not on a prop`,
      footLow < instance.height * 0.005,
      `soles at y=${footLow.toFixed(4)} on a ${instance.height.toFixed(2)} tall creature`);
    instance.dispose();
  }

  // Every size tier lands exactly on its target height.
  for (const tier of ['minion', 'player', 'boss']) {
    const instance = spawnFromRecipe(context, { recipeId: 'gigachad', scale: tier });
    instance.root.updateMatrixWorld(true);
    box.setFromObject(instance.root);
    box.getSize(size);
    const err = Math.abs(size.y - SIZE_TIER_HEIGHTS[tier]) / SIZE_TIER_HEIGHTS[tier];
    check(`tier ${tier.padEnd(7)} → ${SIZE_TIER_HEIGHTS[tier]} units`, err < 0.01,
      `measured ${size.y.toFixed(4)}`);
    instance.dispose();
  }

  // Scaling must not fork the geometry cache — that is the whole point of
  // scaling on the root instead of baking size into the vertices.
  const a = spawnFromRecipe(context, { recipeId: 'tralalero-shark', scale: 'minion' });
  const afterFirst = context.stats().geometries;
  const b = spawnFromRecipe(context, { recipeId: 'tralalero-shark', scale: 'boss' });
  const c = spawnFromRecipe(context, { recipeId: 'tralalero-shark', scale: 'player' });
  check('three sizes of one recipe share every geometry',
    context.stats().geometries === afterFirst,
    `${afterFirst} geometries before, ${context.stats().geometries} after two more spawns`);
  a.dispose(); b.dispose(); c.dispose();

  check('creature caches drain after dispose',
    context.stats().geometries === 0 && context.stats().materials === 0,
    JSON.stringify(context.stats()));
  context.dispose();
}

// --- 8. Creature animator stability -----------------------------------------
section('8. Creature animators are stable and die correctly');
{
  const context = new AssetContext({ seed: 'creature-anim' });
  const dt = 1 / 60;

  for (const id of BRAINROT_RECIPE_IDS) {
    const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player' });

    // Half a simulated hour of varied movement.
    let bad = 0;
    for (let i = 0; i < 60 * 60 * 30; i++) {
      const t = i * dt;
      instance.setState(3 + Math.sin(t * 0.3) * 3, Math.sin(t * 0.11) > -0.6, Math.sin(t * 0.23) * 1.4);
      instance.update(dt);
    }
    for (const joint of instance.rig.joints) {
      const r = joint.rotation, p = joint.position;
      if (![r.x, r.y, r.z, p.x, p.y, p.z].every((v) => Number.isFinite(v) && Math.abs(v) < 100)) bad++;
    }
    check(`${id.padEnd(18)} finite after 30 simulated minutes`, bad === 0, `${bad} bad bones`);

    // Death runs to completion and leaves the rig finite.
    instance.die();
    for (let i = 0; i < 180; i++) instance.update(dt);
    let deadBad = 0;
    for (const joint of instance.rig.joints) {
      const r = joint.rotation;
      if (![r.x, r.y, r.z].every((v) => Number.isFinite(v))) deadBad++;
    }
    check(`${id.padEnd(18)} death (${BRAINROT_RECIPES[id].deathStyle}) completes`,
      instance.animator.deathFinished && deadBad === 0 && instance.animator.mode === 'dead',
      `progress=${instance.animator.deathProgress.toFixed(2)}, mode=${instance.animator.mode}`);

    instance.dispose();
  }
  context.dispose();
}

// --- 9. Recipe determinism --------------------------------------------------
section('9. Same seed produces the same creature');
{
  const describe = (instance) => {
    instance.root.updateMatrixWorld(true);
    box.setFromObject(instance.root);
    box.getSize(size);
    return `${size.x.toFixed(6)},${size.y.toFixed(6)},${size.z.toFixed(6)}`;
  };

  const c1 = new AssetContext({ seed: 'x' });
  const i1 = spawnFromRecipe(c1, { recipeId: 'cactus-walker', colorPalette: 'random', randomize: true, seed: 'abc' });
  const d1 = describe(i1);

  const c2 = new AssetContext({ seed: 'x' });
  const i2 = spawnFromRecipe(c2, { recipeId: 'cactus-walker', colorPalette: 'random', randomize: true, seed: 'abc' });
  const d2 = describe(i2);

  check('same seed → identical creature', d1 === d2, d1);

  const c3 = new AssetContext({ seed: 'x' });
  const i3 = spawnFromRecipe(c3, { recipeId: 'cactus-walker', colorPalette: 'random', randomize: true, seed: 'zzz' });
  check('different seed → different creature', describe(i3) !== d1);

  i1.dispose(); i2.dispose(); i3.dispose();
  c1.dispose(); c2.dispose(); c3.dispose();
}

// --- 10. Ghost hands --------------------------------------------------------
section('10. Handless creatures conjure a hand to hold a weapon');
{
  const makeWeapon = () =>
    new Mesh(new BoxGeometry(0.06, 0.06, 0.7), new MeshBasicMaterial({ color: 0x888888 }));

  const isDescendantOf = (object, ancestor) => {
    let node = object;
    while (node !== null) {
      if (node === ancestor) return true;
      node = node.parent;
    }
    return false;
  };

  const countGhostMeshes = (root) => {
    let total = 0;
    root.traverse((child) => {
      if (child.name === 'ghostHand:body') total += child.children.length;
    });
    return total;
  };

  // Every shipped skeleton either has hands or declares where conjured ones go.
  {
    const context = new AssetContext({ seed: 'sockets' });
    for (const id of BRAINROT_RECIPE_IDS) {
      const instance = spawnFromRecipe(context, { recipeId: id });
      const sockets = instance.rig.listSockets();
      const real = sockets.includes('handL') && sockets.includes('handR');
      const ghost = sockets.includes('ghostHandL') && sockets.includes('ghostHandR');
      check(
        `${id.padEnd(21)} declares hands or ghost-hand sockets`,
        real !== ghost,
        real ? 'real hands' : ghost ? 'ghost sockets' : 'NEITHER',
      );
      instance.dispose();
    }
    context.dispose();
  }

  // A creature with hands is left alone; a creature without grows one.
  {
    const context = new AssetContext({ seed: 'equip' });

    const chad = spawnFromRecipe(context, { recipeId: 'gigachad' });
    const chadWeapon = makeWeapon();
    chad.equip(chadWeapon);
    chad.update(1 / 60);
    check(
      'gigachad holds it in its own hand',
      countGhostMeshes(chad.root) === 0 && isDescendantOf(chadWeapon, chad.root),
      `${countGhostMeshes(chad.root)} ghost meshes`,
    );
    chad.dispose();

    for (const id of ['mewing-doggo', 'tralalero-shark', 'skibidi-propeller', 'bombardino-crocodilo', 'la-vacca-saturno', 'frigo-camelo']) {
      const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player' });
      const weapon = makeWeapon();

      check(`${id.padEnd(21)} has no hands of its own`, countGhostMeshes(instance.root) === 0);

      instance.equip(weapon);
      for (let i = 0; i < 20; i++) instance.update(1 / 60);

      const meshes = countGhostMeshes(instance.root);
      check(
        `${id.padEnd(21)} conjures a hand and holds the weapon`,
        meshes > 0 && isDescendantOf(weapon, instance.root) && instance.isHolding(),
        `${meshes} ghost meshes`,
      );

      // A pair, always — one hand on its own reads as a missing limb — and both
      // fully materialised once the fade has had time to run.
      let handRoots = 0;
      let faded = 0;
      instance.root.traverse((child) => {
        if (child.name !== 'ghostHand:body') return;
        handRoots++;
        if (child.scale.x < 0.99) faded++;
      });
      check(
        `${id.padEnd(21)} conjures both hands, fully materialised`,
        handRoots === 2 && faded === 0,
        `${handRoots} hands, ${faded} still fading`,
      );

      // The hand must not hang through the floor the creature is standing on.
      instance.root.updateMatrixWorld(true);
      let lowest = Infinity;
      instance.root.traverse((child) => {
        if (child.name !== 'ghostHand:body') return;
        box.setFromObject(child);
        if (box.min.y < lowest) lowest = box.min.y;
      });
      check(`${id.padEnd(21)} conjured hand stays above the ground`, lowest > 0, `min y = ${lowest.toFixed(3)}`);

      const returned = instance.unequip();
      for (let i = 0; i < 30; i++) instance.update(1 / 60);
      check(
        `${id.padEnd(21)} hand dissolves once the weapon is dropped`,
        returned === weapon && countGhostMeshes(instance.root) === 0 && !instance.isHolding(),
      );

      instance.dispose();
    }

    context.dispose();
  }

  // Two-handed grip: the support hand rides the weapon.
  {
    const context = new AssetContext({ seed: 'grip' });
    const instance = spawnFromRecipe(context, { recipeId: 'tralalero-shark' });
    const weapon = makeWeapon();
    instance.equip(weapon, { grip: 'two-handed', supportOffset: 0.3 });
    for (let i = 0; i < 20; i++) instance.update(1 / 60);

    let handsOnWeapon = 0;
    weapon.traverse((child) => {
      if (child.name === 'ghostHand:body') handsOnWeapon++;
    });
    check('two-handed grip parents the off hand to the weapon', handsOnWeapon === 1, `${handsOnWeapon} found`);

    let total = 0;
    instance.root.traverse((child) => {
      if (child.name === 'ghostHand:body') total++;
    });
    check('two-handed grip still adds up to two hands', total === 2, `${total} found`);

    instance.unequip();
    for (let i = 0; i < 30; i++) instance.update(1 / 60);
    check('both hands dissolve together', countGhostMeshes(instance.root) === 0);
    instance.dispose();
    context.dispose();
  }

  // A skeleton with no ghost sockets at all still gets usable hands.
  {
    const context = new AssetContext({ seed: 'fallback' });
    const skeleton = {
      name: 'blob',
      plan: 'biped',
      nominalHeight: 1.8,
      bones: [
        { name: 'hips', parent: null, position: [0, 0.9, 0], shapes: [] },
        { name: 'spine', parent: 'hips', position: [0, 0.4, 0], shapes: [{ kind: 'box', size: [0.6, 0.8, 0.4], color: 'primary' }] },
      ],
      sockets: [],
    };
    const asset = new CreatureAsset(context, {
      skeleton,
      palette: BRAINROT_RECIPES.gigachad.palette,
      segments: 7,
      flatShading: true,
      castShadow: false,
      receiveShadow: false,
      targetHeight: 0,
      scaleMultiplier: 1,
    }).build();

    const holder = new EquipmentHolder(context, asset.rig);
    check('unauthored skeleton reports that it needs ghost hands', holder.needsGhostHands);
    const weapon = makeWeapon();
    holder.equip(weapon);
    for (let i = 0; i < 20; i++) holder.update(1 / 60);
    const hand = holder.ghostHands[0];
    // The derived placement lands on the socket the holder invented, not on the
    // hand itself — rest has to be zero on the hand for the aim pose to blend
    // back to it.
    const socket = hand === undefined ? null : hand.root.parent;
    check(
      'unauthored skeleton still gets a placed hand',
      hand !== undefined &&
        isDescendantOf(weapon, asset.root) &&
        socket !== null &&
        Math.abs(socket.position.x) > 0 &&
        hand.root.position.lengthSq() === 0,
      socket === null ? 'no hand' : `socket x = ${socket.position.x.toFixed(3)}`,
    );
    holder.dispose();
    asset.dispose();
    context.dispose();
  }

  // Resource accounting: conjuring and dissolving must leave no residue.
  {
    const context = new AssetContext({ seed: 'leak' });
    const instance = spawnFromRecipe(context, { recipeId: 'mewing-doggo' });
    const before = context.stats();

    for (let cycle = 0; cycle < 3; cycle++) {
      const weapon = makeWeapon();
      instance.equip(weapon, { grip: 'two-handed' });
      for (let i = 0; i < 20; i++) instance.update(1 / 60);
      instance.unequip();
      for (let i = 0; i < 40; i++) instance.update(1 / 60);
    }

    const after = context.stats();
    check(
      'equip/unequip cycles return every borrowed resource',
      after.geometries === before.geometries && after.materials === before.materials,
      `${before.geometries}g/${before.materials}m -> ${after.geometries}g/${after.materials}m`,
    );

    // A held weapon survives disposal of the creature: the holder never owned it.
    const kept = makeWeapon();
    instance.equip(kept);
    instance.update(1 / 60);
    instance.dispose();
    check('disposing a creature hands the weapon back intact', kept.geometry.attributes.position !== undefined && kept.parent === null);

    context.dispose();
  }

  // Ghost hands share their geometry across creatures, like everything else.
  {
    const context = new AssetContext({ seed: 'share' });
    const a = spawnFromRecipe(context, { recipeId: 'mewing-doggo' });
    const wa = makeWeapon();
    a.equip(wa);
    a.update(1 / 60);
    const oneHand = context.stats().geometries;

    const b = spawnFromRecipe(context, { recipeId: 'mewing-doggo' });
    const wb = makeWeapon();
    b.equip(wb);
    b.update(1 / 60);
    const twoHands = context.stats().geometries;

    check('a second ghost hand adds no new geometry', twoHands === oneHand, `${oneHand} -> ${twoHands}`);
    a.dispose(); b.dispose();
    context.dispose();
  }
}

// --- 11. Aiming -------------------------------------------------------------
section('11. Raising to aim points the weapon where it was told');
{
  const makeWeapon = () =>
    new Mesh(new BoxGeometry(0.06, 0.06, 0.7), new MeshBasicMaterial({ color: 0x888888 }));

  const forward = new Vector3();
  const worldQ = new Quaternion();
  const rootQ = new Quaternion();

  /** The weapon's aim, measured in the creature's own space. */
  const measure = (instance, weapon) => {
    instance.root.updateMatrixWorld(true);
    weapon.getWorldQuaternion(worldQ);
    instance.rig.root.getWorldQuaternion(rootQ);
    forward.set(0, 0, 1).applyQuaternion(worldQ).applyQuaternion(rootQ.invert()).normalize();
    const flat = Math.hypot(forward.x, forward.z);
    return { yaw: Math.atan2(forward.x, flat > 0 ? forward.z : 1), pitch: -Math.atan2(forward.y, flat) };
  };

  const context = new AssetContext({ seed: 'aim' });
  const dt = 1 / 60;

  // Both hand paths have to end up aiming at the same angle, which is the whole
  // point of the weapon mount: on a real arm the barrel would otherwise pitch
  // up with the shoulder.
  for (const id of ['gigachad', 'tung-tung-sahur', 'mewing-doggo', 'tralalero-shark', 'la-vacca-saturno', 'bombardino-crocodilo', 'frigo-camelo']) {
    const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player' });
    const weapon = makeWeapon();
    instance.equip(weapon, { grip: 'two-handed' });

    // Blends in rather than snapping.
    instance.setAiming(true);
    instance.update(dt);
    const afterOneFrame = instance.aimWeight();
    for (let i = 0; i < 90; i++) instance.update(dt);
    check(
      `${id.padEnd(21)} raises over time, not instantly`,
      afterOneFrame > 0 && afterOneFrame < 0.5 && instance.aimWeight() > 0.99,
      `1 frame = ${afterOneFrame.toFixed(3)}, settled = ${instance.aimWeight().toFixed(3)}`,
    );

    instance.setAim(0.7, -0.4);
    for (let i = 0; i < 90; i++) instance.update(dt);
    const aimed = measure(instance, weapon);
    // The breathing sway rides on top, so the tolerance is a little wider than
    // the sway amplitude rather than zero.
    check(
      `${id.padEnd(21)} weapon points at the commanded angle`,
      Math.abs(aimed.yaw - 0.7) < 0.02 && Math.abs(aimed.pitch + 0.4) < 0.03,
      `yaw ${aimed.yaw.toFixed(3)}, pitch ${aimed.pitch.toFixed(3)}`,
    );

    // Lowering has to put the arms back where the animator wants them. `y` and
    // `z` on an arm are not rewritten by the animator, so a pose blended from
    // the previous frame instead of from rest ratchets into place and never
    // comes out.
    const upper = instance.rig.findBone('upperArmL') ?? instance.rig.findBone('armL');
    instance.setAiming(false);
    for (let i = 0; i < 240; i++) instance.update(dt);
    check(
      `${id.padEnd(21)} lowers back to rest without ratcheting`,
      instance.aimWeight() === 0 &&
        (upper === undefined || (Math.abs(upper.rotation.z) < 0.01 && Math.abs(upper.rotation.y) < 0.01)),
      upper === undefined ? 'no arms' : `z = ${upper.rotation.z.toFixed(4)}, y = ${upper.rotation.y.toFixed(4)}`,
    );

    instance.dispose();
  }

  // Limits, and aiming at a world point.
  {
    const instance = spawnFromRecipe(context, { recipeId: 'tralalero-shark', scale: 'player' });
    const weapon = makeWeapon();
    instance.equip(weapon);
    instance.setAiming(true);

    // Far outside the limits: the pose must stop at them rather than fold the
    // creature in half.
    instance.setAim(9, -9);
    for (let i = 0; i < 120; i++) instance.update(dt);
    const clamped = measure(instance, weapon);
    check(
      'aim is clamped to the pose limits',
      Math.abs(clamped.yaw - DEFAULT_AIM.maxYaw) < 0.02 &&
        Math.abs(clamped.pitch - DEFAULT_AIM.minPitch) < 0.03,
      `yaw ${clamped.yaw.toFixed(3)} (max ${DEFAULT_AIM.maxYaw}), pitch ${clamped.pitch.toFixed(3)} (min ${DEFAULT_AIM.minPitch})`,
    );

    // A point straight ahead and level with the weapon: no yaw, no pitch.
    instance.root.position.set(0, 0, 0);
    instance.root.updateMatrixWorld(true);
    instance.aimAt(0, 0, 10);
    for (let i = 0; i < 120; i++) instance.update(dt);
    const ahead = measure(instance, weapon);
    check(
      'aimAt a point straight ahead levels the weapon',
      Math.abs(ahead.yaw) < 0.02 && Math.abs(ahead.pitch) < 0.03,
      `yaw ${ahead.yaw.toFixed(3)}, pitch ${ahead.pitch.toFixed(3)}`,
    );

    // Turning the creature must not turn the aim: it is relative to facing.
    instance.root.rotation.y = 1.2;
    instance.root.updateMatrixWorld(true);
    instance.setAim(0.3, -0.2);
    for (let i = 0; i < 120; i++) instance.update(dt);
    const turned = measure(instance, weapon);
    check(
      'aim is relative to the creature, not the world',
      Math.abs(turned.yaw - 0.3) < 0.02 && Math.abs(turned.pitch + 0.2) < 0.03,
      `yaw ${turned.yaw.toFixed(3)}, pitch ${turned.pitch.toFixed(3)}`,
    );

    const returned = instance.unequip();
    if (returned !== null) returned.geometry.dispose();
    instance.dispose();
  }

  context.dispose();
}

// --- 12. Firing -------------------------------------------------------------
section('12. Firing kicks the weapon and the spring puts it back');
{
  const makeWeapon = () =>
    new Mesh(new BoxGeometry(0.06, 0.06, 0.7), new MeshBasicMaterial({ color: 0x888888 }));

  const forward = new Vector3();
  const worldQ = new Quaternion();
  const rootQ = new Quaternion();

  const measurePitch = (instance, weapon) => {
    instance.root.updateMatrixWorld(true);
    weapon.getWorldQuaternion(worldQ);
    instance.rig.root.getWorldQuaternion(rootQ);
    forward.set(0, 0, 1).applyQuaternion(worldQ).applyQuaternion(rootQ.invert()).normalize();
    return -Math.atan2(forward.y, Math.hypot(forward.x, forward.z));
  };

  const dt = 1 / 60;

  // The impulse is normalised so one shot peaks at exactly 1, which is what
  // lets `kick` be stated in radians instead of spring units.
  {
    const recoil = new RecoilController();
    recoil.fire();
    let peak = 0;
    for (let i = 0; i < 200; i++) {
      recoil.update(1 / 240);
      if (recoil.level > peak) peak = recoil.level;
    }
    check('one shot peaks at 1', Math.abs(peak - 1) < 0.02, `peak = ${peak.toFixed(4)}`);
    check('the spring parks itself once it stops moving', !recoil.active, `level = ${recoil.level}`);
  }

  // Stiffer and softer springs must normalise too, or the option is a lie.
  for (const [stiffness, damping] of [[120, 30], [600, 20], [400, 40]]) {
    const recoil = new RecoilController({ stiffness, damping });
    recoil.fire();
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      recoil.update(1 / 240);
      if (recoil.level > peak) peak = recoil.level;
    }
    check(
      `spring ${String(stiffness).padStart(3)}/${String(damping).padStart(2)} still peaks at 1`,
      Math.abs(peak - 1) < 0.03,
      `peak = ${peak.toFixed(4)}`,
    );
  }

  // Cooldown, stacking and the ceiling on both.
  {
    const recoil = new RecoilController({ cooldown: 0.1 });
    check('first shot is accepted', recoil.fire());
    check('a second shot inside the cooldown is refused', !recoil.fire());
    for (let i = 0; i < 7; i++) recoil.update(dt);
    check('the shot after the cooldown is accepted', recoil.fire(), `${recoil.shots} shots`);

    let worst = 0;
    for (let i = 0; i < 600; i++) {
      recoil.fire();
      recoil.update(dt);
      if (Math.abs(recoil.level) > worst) worst = Math.abs(recoil.level);
    }
    check(
      'sustained fire stacks but stays under the ceiling',
      worst > 1 && worst <= DEFAULT_RECOIL.maxStack + 1e-6,
      `worst = ${worst.toFixed(3)}, ceiling = ${DEFAULT_RECOIL.maxStack}`,
    );

    // A long frame must not blow the spring up — it is stiff on purpose.
    const jerky = new RecoilController();
    jerky.fire();
    for (let i = 0; i < 50; i++) jerky.update(0.5);
    check('a stalled frame does not detonate the spring', Number.isFinite(jerky.level) && Math.abs(jerky.level) < 3, `level = ${jerky.level}`);
  }

  // Both hand paths: the muzzle rises on the shot and comes back to the aim.
  {
    const context = new AssetContext({ seed: 'fire' });
    for (const id of ['gigachad', 'mewing-doggo', 'la-vacca-saturno']) {
      const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player' });
      const weapon = makeWeapon();
      instance.equip(weapon, { grip: 'two-handed' });
      instance.setAiming(true);
      instance.setAim(0, 0);
      for (let i = 0; i < 120; i++) instance.update(dt);

      const settled = measurePitch(instance, weapon);
      check(`${id.padEnd(18)} fires`, instance.fire());

      let peak = settled;
      for (let i = 0; i < 30; i++) {
        instance.update(dt);
        const p = measurePitch(instance, weapon);
        if (p < peak) peak = p;
      }
      // Negative pitch is up. The mount takes most of the kick, the arms the
      // rest, so the muzzle must have risen by a real fraction of it.
      check(
        `${id.padEnd(18)} muzzle rises on the shot`,
        settled - peak > DEFAULT_RECOIL.kick * 0.5,
        `rose ${(settled - peak).toFixed(3)} rad of ${DEFAULT_RECOIL.kick}`,
      );

      for (let i = 0; i < 120; i++) instance.update(dt);
      check(
        `${id.padEnd(18)} settles back onto the aim`,
        Math.abs(measurePitch(instance, weapon) - settled) < 0.03 && instance.recoil() === 0,
        `pitch ${measurePitch(instance, weapon).toFixed(3)} vs ${settled.toFixed(3)}`,
      );

      // Hip fire: the pose weight is zero, but the weapon still moves.
      instance.setAiming(false);
      for (let i = 0; i < 180; i++) instance.update(dt);
      const hipRest = measurePitch(instance, weapon);
      instance.fire();
      let hipPeak = hipRest;
      for (let i = 0; i < 30; i++) {
        instance.update(dt);
        const p = measurePitch(instance, weapon);
        if (p < hipPeak) hipPeak = p;
      }
      check(
        `${id.padEnd(18)} kicks when fired from the hip too`,
        instance.aimWeight() === 0 && hipRest - hipPeak > DEFAULT_RECOIL.kick * 0.5,
        `weight ${instance.aimWeight()}, rose ${(hipRest - hipPeak).toFixed(3)}`,
      );

      // A long burst must leave the rig finite and the weapon where it started.
      for (let i = 0; i < 60 * 60; i++) {
        instance.fire();
        instance.setState(2.5, true, 0.4);
        instance.update(dt);
      }
      let bad = 0;
      for (const joint of instance.rig.joints) {
        const r = joint.rotation;
        if (![r.x, r.y, r.z].every((v) => Number.isFinite(v) && Math.abs(v) < 100)) bad++;
      }
      check(`${id.padEnd(18)} survives a minute of sustained fire`, bad === 0, `${bad} bad bones`);

      const returned = instance.unequip();
      check(`${id.padEnd(18)} dropping the weapon clears the recoil`, instance.recoil() === 0);
      if (returned !== null) returned.geometry.dispose();
      instance.dispose();
    }

    // Nothing held, nothing to fire.
    const empty = spawnFromRecipe(context, { recipeId: 'tralalero-shark' });
    check('an empty-handed creature cannot fire', !empty.fire());
    empty.dispose();

    context.dispose();
  }
}

// --- 13. Swinging and hitting ------------------------------------------------
section('13. A swung blade poses the body and cuts what it passes through');
{
  const dt = 1 / 60;
  const makeTarget = (x, y, z) => {
    const target = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial());
    target.position.set(x, y, z);
    return target;
  };

  // A blade that publishes its own extent must be swept along exactly that
  // line, and one that does not must still get a usable one.
  {
    const context = new AssetContext({ seed: 'sword' });
    const sword = new SwordAsset(context, { bladeLength: 0.8, curve: 0 }).build();
    const extent = sword.root.userData.blade;
    check('a katana publishes where its edge is',
      extent !== undefined && Math.abs(extent.end[2] - extent.start[2] - 0.8) < 0.06,
      extent === undefined ? 'nothing published' : `${(extent.end[2] - extent.start[2]).toFixed(3)} of blade, ${extent.radius.toFixed(3)} radius`);
    check('the edge starts past the guard, not at the fist',
      extent.start[2] > 0.1, `starts at z = ${extent.start[2].toFixed(3)}`);

    // Curvature has to move the tip off the axis, or `curve` does nothing.
    const straight = new SwordAsset(context, { curve: 0 }).build();
    const curved = new SwordAsset(context, { curve: 0.35 }).build();
    check('curvature lifts the tip off the blade axis',
      Math.abs(straight.bladeEnd.y) < 1e-6 && curved.bladeEnd.y > 0.05,
      `straight y = ${straight.bladeEnd.y.toFixed(4)}, curved y = ${curved.bladeEnd.y.toFixed(4)}`);

    const before = context.stats();
    const twin = new SwordAsset(context, { bladeLength: 0.8, curve: 0 }).build();
    check('a second identical sword adds no geometry',
      context.stats().geometries === before.geometries,
      `${before.geometries} -> ${context.stats().geometries}`);

    sword.dispose(); straight.dispose(); curved.dispose(); twin.dispose();
    check('sword caches drain after dispose',
      context.stats().geometries === 0 && context.stats().materials === 0,
      JSON.stringify(context.stats()));
    context.dispose();
  }

  // The swing itself: phases, timing, and the pose landing back at rest.
  {
    const context = new AssetContext({ seed: 'swing' });
    for (const id of ['ninja-coffee', 'gigachad', 'tralalero-shark']) {
      const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player' });
      const sword = new SwordAsset(context, {
        scale: weaponScaleForHeight(instance.rig.nominalHeight),
      }).build();

      check(`${id.padEnd(14)} cannot swing empty-handed`, !instance.swing());
      instance.equip(sword.root);

      const arm = instance.rig.findBone('upperArmR') ?? instance.rig.findBone('armR');
      const restZ = arm === undefined ? 0 : arm.rotation.z;

      check(`${id.padEnd(14)} swings when armed`, instance.swing('slash'));
      check(`${id.padEnd(14)} refuses a second swing mid-cut`, !instance.swing());

      // The strike window has to open after the wind-up and close before the
      // recovery ends, or the blade cuts on frames it is visibly not moving.
      let strikeFrames = 0;
      let firstStrike = -1;
      let peakArm = 0;
      for (let i = 0; i < 40; i++) {
        instance.update(dt);
        if (instance.isStriking()) {
          strikeFrames++;
          if (firstStrike < 0) firstStrike = i;
        }
        if (arm !== undefined && Math.abs(arm.rotation.x) > Math.abs(peakArm)) {
          peakArm = arm.rotation.x;
        }
      }
      check(`${id.padEnd(14)} strike window opens after the wind-up and closes`,
        firstStrike >= 7 && strikeFrames >= 4 && strikeFrames <= 8 && !instance.isStriking(),
        `opened on frame ${firstStrike}, lasted ${strikeFrames} frames`);
      check(`${id.padEnd(14)} the cut actually moves the arm`,
        arm === undefined || Math.abs(peakArm) > 1,
        `peak arm x = ${peakArm.toFixed(2)}`);
      check(`${id.padEnd(14)} the swing ends`, !instance.isSwinging() && instance.swingProgress() === 0);

      // Nothing may be left behind on the axes no animator rewrites — that is
      // the ratchet the aim pose had to be built around.
      check(`${id.padEnd(14)} the arm returns exactly to rest`,
        arm === undefined || arm.rotation.z === restZ,
        arm === undefined ? 'no arms' : `z = ${arm.rotation.z}, rest = ${restZ}`);

      // A hundred swings must not walk the rig anywhere.
      for (let i = 0; i < 100; i++) {
        instance.swing();
        for (let k = 0; k < 12; k++) {
          instance.setState(2.5, true, 0.3);
          instance.update(dt);
        }
      }
      let bad = 0;
      for (const joint of instance.rig.joints) {
        const r = joint.rotation;
        if (![r.x, r.y, r.z].every((v) => Number.isFinite(v) && Math.abs(v) < 100)) bad++;
      }
      check(`${id.padEnd(14)} survives a hundred chained swings`, bad === 0, `${bad} bad bones`);

      instance.unequip();
      sword.dispose();
      instance.dispose();
    }
    context.dispose();
  }

  // Hit detection.
  {
    const context = new AssetContext({ seed: 'hits' });
    const instance = spawnFromRecipe(context, { recipeId: 'ninja-coffee', scale: 'player' });
    const sword = new SwordAsset(context, {
      scale: weaponScaleForHeight(instance.rig.nominalHeight),
    }).build();
    instance.equip(sword.root);

    // Where the edge actually goes, measured rather than assumed — the same way
    // the demo places its dummies.
    const socket = instance.rig.getSocket('handR');
    instance.root.updateMatrixWorld(true);
    const hand = socket.getWorldPosition(new Vector3());
    const reach = sword.reach * instance.asset.scale;

    const hits = [];
    instance.onHit((hit) => hits.push({
      damage: hit.damage,
      style: hit.style,
      swing: hit.swing,
      point: hit.point.clone(),
      target: hit.target,
    }));

    const near = makeTarget(hand.x * 0.45, Math.max(hand.y, 0.5), hand.z + reach * 0.55);
    instance.addHitTarget(near, 0.25, 'near');

    // Far enough away that no pose can reach it. If this ever registers, the
    // sweep is testing something other than the blade.
    const far = makeTarget(0, 1.0, 6);
    instance.addHitTarget(far, 0.25, 'far');

    instance.swing('slash');
    for (let i = 0; i < 30; i++) instance.update(dt);

    check('a cut through a target registers', hits.length > 0, `${hits.length} hits`);
    check('one swing hits one target once',
      hits.filter((h) => h.target === near).length === 1,
      `${hits.filter((h) => h.target === near).length} hits on the near target`);
    check('a target out of reach is never hit',
      hits.every((h) => h.target !== far));
    check('the hit reports where the edge was',
      hits.length > 0 && hits[0].point.distanceTo(near.position) < 0.4,
      hits.length === 0 ? 'no hits' : `${hits[0].point.distanceTo(near.position).toFixed(3)} from the target`);
    check('the hit carries damage and the cut that landed it',
      hits.length > 0 && hits[0].damage === 1 && hits[0].style === 'slash');

    // A second swing hits the same target again — the once-per-swing rule is
    // per swing, not for ever.
    const firstCount = hits.length;
    instance.swing('slash');
    for (let i = 0; i < 30; i++) instance.update(dt);
    check('the next swing may hit the same target again', hits.length > firstCount,
      `${firstCount} -> ${hits.length}`);

    // A blade cannot cut the creature carrying it.
    instance.addHitTarget(instance.root, 2, 'self');
    const beforeSelf = hits.length;
    instance.swing('overhead');
    for (let i = 0; i < 30; i++) instance.update(dt);
    check('a blade never cuts the creature holding it',
      hits.slice(beforeSelf).every((h) => h.target !== instance.root));
    instance.removeHitTarget(instance.root);

    // Dropping the weapon disarms it.
    instance.unequip();
    for (let i = 0; i < 20; i++) instance.update(dt);
    const beforeDrop = hits.length;
    check('an unarmed creature cannot swing', !instance.swing());
    for (let i = 0; i < 30; i++) instance.update(dt);
    check('a dropped weapon stops cutting', hits.length === beforeDrop);

    near.geometry.dispose();
    far.geometry.dispose();
    sword.dispose();
    instance.dispose();
    context.dispose();
  }

  // Tunnelling: the reason the test is swept at all.
  {
    const context = new AssetContext({ seed: 'sweep' });
    const holderRig = spawnFromRecipe(context, { recipeId: 'gigachad', scale: 'player' });
    const sweep = new BladeSweep({ sweepSteps: 4 });
    const blade = new Mesh(new BoxGeometry(0.04, 0.04, 1), new MeshBasicMaterial());
    blade.userData.blade = { start: [0, 0, -0.5], end: [0, 0, 0.5], radius: 0.03 };
    holderRig.root.add(blade);

    const target = makeTarget(0, 0, 0);
    sweep.addBlade(blade);
    sweep.addTarget(target, 0.12);

    // Two frames, with the blade on opposite sides of the target and never
    // touching it in either — exactly the case an instantaneous test misses.
    blade.position.set(-1.2, 0, 0);
    holderRig.root.updateMatrixWorld(true);
    sweep.sweep(1);
    blade.position.set(1.2, 0, 0);
    holderRig.root.updateMatrixWorld(true);
    const swept = sweep.sweep(1);
    check('a blade that jumps past a target between frames still hits it', swept === 1,
      `${swept} hits from a 2.4-unit step`);

    // And the same jump with sweeping switched off must miss, or the check
    // above is not testing what it claims to.
    const instant = new BladeSweep({ sweepSteps: 1 });
    instant.addBlade(blade);
    instant.addTarget(target, 0.12);
    blade.position.set(-1.2, 0, 0);
    holderRig.root.updateMatrixWorld(true);
    instant.sweep(1);
    blade.position.set(1.2, 0, 0);
    holderRig.root.updateMatrixWorld(true);
    check('one sample per frame misses it — which is why the sweep exists',
      instant.sweep(1) === 0);

    blade.geometry.dispose();
    target.geometry.dispose();
    holderRig.dispose();
    context.dispose();
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);


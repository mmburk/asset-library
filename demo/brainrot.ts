import {
  ACESFilmicToneMapping,
  Box3,
  BoxGeometry,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  CylinderGeometry,
  Mesh,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  AssetContext,
  BRAINROT_RECIPES,
  BRAINROT_RECIPE_IDS,
  FlightAnimator,
  SwimAnimator,
  SwordAsset,
  disposeObject3D,
  spawnFromRecipe,
  weaponScaleForHeight,
  type BrainrotInstance,
  type BrainrotRecipeId,
  type MeleeHit,
  type SizeTier,
} from '../src/index';

/**
 * Brainrot archetype demo.
 *
 * One creature per body plan, driven by the same three inputs, so the
 * difference between the animators is visible side by side. The plan-specific
 * inputs — climb rate for the flyer, water state for the swimmer — are routed
 * to whichever instances can accept them.
 */

const canvas = document.getElementById('app') as HTMLCanvasElement;
const speedInput = document.getElementById('speed') as HTMLInputElement;
const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
const turnInput = document.getElementById('turn') as HTMLInputElement;
const turnValue = document.getElementById('turn-value') as HTMLSpanElement;
const climbInput = document.getElementById('climb') as HTMLInputElement;
const climbValue = document.getElementById('climb-value') as HTMLSpanElement;
const tierSelect = document.getElementById('tier') as HTMLSelectElement;
const groundedButton = document.getElementById('grounded') as HTMLButtonElement;
const waterButton = document.getElementById('water') as HTMLButtonElement;
const weaponButton = document.getElementById('weapon') as HTMLButtonElement;
const swordButton = document.getElementById('sword') as HTMLButtonElement;
const swingButton = document.getElementById('swing') as HTMLButtonElement;
const dummyButton = document.getElementById('dummy') as HTMLButtonElement;
const aimButton = document.getElementById('aim') as HTMLButtonElement;
const fireButton = document.getElementById('fire') as HTMLButtonElement;
const aimYawInput = document.getElementById('aim-yaw') as HTMLInputElement;
const aimYawValue = document.getElementById('aim-yaw-value') as HTMLSpanElement;
const aimPitchInput = document.getElementById('aim-pitch') as HTMLInputElement;
const aimPitchValue = document.getElementById('aim-pitch-value') as HTMLSpanElement;
const paletteButton = document.getElementById('palette') as HTMLButtonElement;
const dieButton = document.getElementById('die') as HTMLButtonElement;
const respawnButton = document.getElementById('respawn') as HTMLButtonElement;
const statsPanel = document.getElementById('stats') as HTMLDivElement;
const labelLayer = document.getElementById('labels') as HTMLDivElement;

// --- Renderer ---------------------------------------------------------------

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;

const scene = new Scene();
scene.background = new Color(0x0e1116);
scene.fog = new Fog(0x0e1116, 18, 55);

const camera = new PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(7.5, 4.6, 13.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 2;
controls.maxDistance = 60;

scene.add(new HemisphereLight(0xc9d8ff, 0x2b2f3a, 1.15));

const sun = new DirectionalLight(0xfff0dd, 2.2);
sun.position.set(7, 13, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 48;
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.bias = -0.0005;
scene.add(sun);

const groundGeometry = new PlaneGeometry(120, 120);
const groundMaterial = new MeshLambertMaterial({ color: 0x1e232d });
const ground = new Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI * 0.5;
ground.receiveShadow = true;
scene.add(ground);

// --- Creatures --------------------------------------------------------------

let context = new AssetContext({ seed: 'brainrot-0' });
let creatures: BrainrotInstance[] = [];
let labels: HTMLDivElement[] = [];
let paletteSeed = 0;
let randomPalette = false;
let grounded = true;
let inWater = true;

function currentTier(): SizeTier | undefined {
  const value = tierSelect.value;
  return value === 'natural' ? undefined : (value as SizeTier);
}

// Reused by the layout pass so measuring the row costs no allocations either.
const layoutBounds = new Box3();
const layoutSize = new Vector3();

function buildCreatures(): void {
  const tier = currentTier();
  const gap = 0.8;

  // Laid out by measured width rather than on a fixed pitch. The archetypes
  // differ by a factor of four across the shoulders — a wingspan next to a dog
  // — so a single spacing number either overlaps the wide ones or strands the
  // narrow ones at opposite ends of the scene.
  const widths = new Array<number>(BRAINROT_RECIPE_IDS.length);
  let totalWidth = 0;

  for (let i = 0; i < BRAINROT_RECIPE_IDS.length; i++) {
    const id = BRAINROT_RECIPE_IDS[i] as BrainrotRecipeId;
    const instance = spawnFromRecipe(context, {
      recipeId: id,
      seed: `${id}-${paletteSeed}`,
      ...(randomPalette ? { colorPalette: 'random' as const } : {}),
      ...(tier === undefined ? {} : { scale: tier }),
    });

    instance.root.updateMatrixWorld(true);
    layoutBounds.setFromObject(instance.root);
    layoutBounds.getSize(layoutSize);
    widths[i] = layoutSize.x;
    totalWidth += layoutSize.x;

    scene.add(instance.root);
    creatures.push(instance);

    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML =
      `<b>${instance.displayName}</b><span>${instance.plan} · ${instance.id}</span>`;
    labelLayer.appendChild(label);
    labels.push(label);
  }

  let cursor = -(totalWidth + gap * (creatures.length - 1)) * 0.5;
  for (let i = 0; i < creatures.length; i++) {
    const width = widths[i] as number;
    (creatures[i] as BrainrotInstance).root.position.set(cursor + width * 0.5, 0, 0);
    cursor += width + gap;
  }

  // After the layout pass: each dummy stands in front of a creature that now
  // knows where it is.
  buildDummies();
}

function disposeCreatures(): void {
  dropWeapons();
  dropSwords();
  disposeDummies();
  for (let i = 0; i < creatures.length; i++) {
    creatures[i]?.dispose();
    labels[i]?.remove();
  }
  creatures = [];
  labels = [];
}

// --- Weapons ----------------------------------------------------------------

/**
 * A placeholder rifle, built here rather than in the library — props are a
 * later phase. Origin sits at the pistol grip with the barrel down `+Z`, which
 * is what every hand in the library expects to be handed.
 *
 * Authored at human scale on purpose: a ghost hand is sized against the
 * creature it grows out of and the weapon hangs off that hand, so the same
 * rifle comes out dog-sized on the doggo and boss-sized on the planet without
 * anyone rescaling it.
 */
const weaponMetal = new MeshLambertMaterial({ color: 0x2a2f36, flatShading: true });
const weaponWood = new MeshLambertMaterial({ color: 0x6b4a2f, flatShading: true });
/** Shared across every rifle, so dropping one must not free them. */
const weaponMaterials = new Set([weaponMetal, weaponWood]);

function createRifle(): Group {
  const rifle = new Group();
  rifle.name = 'demo:rifle';

  const part = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: MeshLambertMaterial,
    pitch = 0,
  ): void => {
    const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = pitch;
    mesh.castShadow = true;
    rifle.add(mesh);
  };

  part(0.055, 0.08, 0.42, 0, 0.025, 0.13, weaponMetal);
  part(0.032, 0.032, 0.46, 0, 0.05, 0.55, weaponMetal);
  part(0.02, 0.032, 0.05, 0, 0.082, 0.3, weaponMetal);
  part(0.042, 0.13, 0.075, 0, -0.085, 0.11, weaponMetal);
  part(0.048, 0.115, 0.07, 0, -0.055, -0.025, weaponWood, 0.3);
  part(0.05, 0.095, 0.26, 0, 0.005, -0.2, weaponWood);

  return rifle;
}

let armed = false;
let aiming = false;
let firing = false;
let swinging = false;

function giveWeapons(): void {
  for (let i = 0; i < creatures.length; i++) {
    const creature = creatures[i] as BrainrotInstance;
    if (creature.isHolding()) continue;
    creature.equip(createRifle(), { grip: 'two-handed', supportOffset: 0.36 });
  }
}

function dropWeapons(): void {
  for (let i = 0; i < creatures.length; i++) {
    const weapon = (creatures[i] as BrainrotInstance).unequip();
    // The library hands the weapon back rather than freeing it — the demo built
    // it, so the demo disposes it.
    if (weapon !== null) disposeObject3D(weapon, { skipMaterials: weaponMaterials });
  }
}

// --- Swords and training dummies --------------------------------------------

/**
 * A post with a head on it, in front of one creature.
 *
 * Registered as a melee target and handed back to the hit callback as the
 * target's `data`, which is the whole point of that field: the demo never has
 * to look up what was hit.
 */
interface Dummy {
  readonly root: Group;
  readonly ball: Mesh;
  homeZ: number;
  readonly height: number;
  hits: number;
  /** Knocked-back amount, `1` on impact, decaying to `0`. */
  knock: number;
}

const dummyPost = new MeshLambertMaterial({ color: 0x4a4038, flatShading: true });
const dummyBall = new MeshLambertMaterial({ color: 0xb9ae95, flatShading: true });
const dummyHit = new MeshLambertMaterial({
  color: 0xff7a4d,
  emissive: 0x6b1d00,
  flatShading: true,
});
const dummyMaterials = new Set([dummyPost, dummyBall, dummyHit]);
/** Reused: placing a dummy should not allocate a vector per creature. */
const dummyAnchor = new Vector3();

let dummies: Dummy[] = [];
/** Swords are library assets, so the demo owns and frees them. */
const swords = new Map<BrainrotInstance, SwordAsset[]>();
let swordArmed = false;
let dummiesShown = true;

function onMeleeHit(hit: MeleeHit): void {
  const dummy = hit.data as Dummy | null;
  if (dummy === null) return;
  dummy.hits++;
  // Knocked away from the blade rather than straight back: the hit reports
  // which way it was travelling, and using it is the difference between a dummy
  // that reacts and one that just flinches.
  dummy.knock = 1;
  dummy.root.rotation.z = -hit.normal.x * 0.5;
}

function buildDummies(): void {
  for (let i = 0; i < creatures.length; i++) {
    const creature = creatures[i] as BrainrotInstance;
    const height = creature.height;

    const root = new Group();
    root.name = 'demo:dummy';
    const post = new Mesh(new CylinderGeometry(0.028 * height, 0.04 * height, 0.44 * height, 6), dummyPost);
    post.position.y = 0.22 * height;
    post.castShadow = true;
    root.add(post);

    // Small, and no taller than the creature's own chest: a head-sized target
    // standing between the camera and the character is a wall, not a dummy.
    // The height and the distance are where they are because that is where the
    // cuts actually pass — a target placed by eye at arm's length is missed by
    // half the archetypes, whose arms are nothing like an arm's length.
    const ball = new Mesh(new SphereGeometry(0.14 * height, 8, 6), dummyBall);
    ball.position.y = 0.45 * height;
    ball.castShadow = true;
    root.add(ball);

    // Parked at the creature's own origin for now: where it really belongs
    // depends on how long the sword it is about to be handed turns out to be,
    // so `placeDummy` moves it the moment one is equipped.
    const homeZ = creature.root.position.z;
    root.position.set(creature.root.position.x, 0, homeZ);
    root.visible = dummiesShown;
    scene.add(root);

    const dummy: Dummy = { root, ball, homeZ, height, hits: 0, knock: 0 };
    dummies.push(dummy);
    // The ball is the target, not the post: a hit sphere around the whole thing
    // would report a hit for a cut that passed a foot over its head.
    // The hit sphere is exactly the ball that is drawn. It could be bigger —
    // most games' are — but then a cut that visibly passed a hand's width clear
    // of the target would still count, and this demo exists to show where the
    // edge actually went.
    creature.addHitTarget(ball, 0.14 * height, dummy);
    creature.onHit(onMeleeHit);
  }
}

/**
 * Stands the dummy where this creature's edge will actually pass.
 *
 * Not at a fixed distance, and not off the bounding box either: these
 * archetypes differ by a factor of three in how far forward their hands are — a
 * shark's float out past a snout half its body long, a bomber's sit behind two
 * metres of nose — so both of those rules put the target somewhere no cut goes.
 * The hand and the blade's length are the two things that decide where a swing
 * lands, so the dummy is placed off those.
 */
function placeDummy(creature: BrainrotInstance, dummy: Dummy, bladeReach: number): void {
  const socket =
    creature.rig.findSocket('handR') ??
    creature.rig.findSocket('ghostHandR') ??
    creature.rig.findSocket('handL') ??
    creature.rig.findSocket('ghostHandL');
  if (socket === undefined) return;

  creature.root.updateMatrixWorld(true);
  socket.getWorldPosition(dummyAnchor);

  dummy.homeZ = dummyAnchor.z + bladeReach * 0.55;
  // Not dead centre: a cut starts at the hand and crosses inward, so a creature
  // whose hands float a long way outboard — which is most of the handless ones
  // — sweeps its edge through a plane that never reaches its own centre line.
  const outboard = (dummyAnchor.x - creature.root.position.x) * 0.45;
  dummy.root.position.set(creature.root.position.x + outboard, 0, dummy.homeZ);
  // At hand height, or high enough off the floor to read as a target on a
  // creature that carries its hands at ankle level.
  dummy.ball.position.y = Math.max(dummyAnchor.y, 0.3 * dummy.height);
}

function disposeDummies(): void {
  for (let i = 0; i < dummies.length; i++) {
    const dummy = dummies[i] as Dummy;
    dummy.root.removeFromParent();
    disposeObject3D(dummy.root, { skipMaterials: dummyMaterials });
  }
  dummies = [];
}

function updateDummies(dt: number): void {
  for (let i = 0; i < dummies.length; i++) {
    const dummy = dummies[i] as Dummy;
    if (dummy.knock <= 0) continue;

    dummy.knock -= dt * 3.2;
    if (dummy.knock < 0) dummy.knock = 0;

    const swing = dummy.knock * dummy.knock;
    dummy.root.position.z = dummy.homeZ + swing * 0.22 * dummy.height;
    dummy.root.rotation.x = -swing * 0.5;
    dummy.root.rotation.z *= 0.9;
    dummy.ball.material = dummy.knock > 0.35 ? dummyHit : dummyBall;
  }
}

/**
 * Arms everyone with a katana from the library.
 *
 * The sword is sized by the creature it is going to rather than by the world:
 * a weapon hangs *inside* the rig, so it is measured against the skeleton's
 * authored height and then carried along by whatever scale turns that creature
 * into a minion or a boss.
 */
function giveSwords(): void {
  for (let i = 0; i < creatures.length; i++) {
    const creature = creatures[i] as BrainrotInstance;
    if (swords.has(creature) || creature.isHolding()) continue;

    const scale = weaponScaleForHeight(creature.rig.nominalHeight);
    const main = new SwordAsset(context, { scale }).build();
    creature.equip(main.root);
    const owned = [main];

    // `reach` is the blade in the rig's own units; the creature's root scale is
    // what turns that into world units.
    const dummy = dummies[i];
    if (dummy !== undefined) placeDummy(creature, dummy, main.reach * creature.asset.scale);

    // The ninja fights with two. The off-hand blade is not held by the holder
    // at all — it hangs off the hand socket and is registered as a blade, which
    // is what `addBlade` is for: anything that swings with the body and cuts
    // without being the weapon in hand.
    if (creature.id === 'ninja-coffee') {
      const off = new SwordAsset(context, { scale }).build();
      creature.asset.attach('handL', off.root);
      creature.addBlade(off.root);
      owned.push(off);
    }

    swords.set(creature, owned);
  }
}

function dropSwords(): void {
  for (let i = 0; i < creatures.length; i++) {
    const creature = creatures[i] as BrainrotInstance;
    const owned = swords.get(creature);
    if (owned === undefined) continue;

    creature.unequip();
    for (let k = 0; k < owned.length; k++) {
      const sword = owned[k] as SwordAsset;
      creature.removeBlade(sword.root);
      sword.root.removeFromParent();
      // A library asset: it returns exactly what it borrowed, and the shared
      // geometry survives for whoever else is holding one.
      sword.dispose();
    }
    swords.delete(creature);
  }
}

// Reused every frame: projecting a point is the only per-frame vector work the
// label layer does, and it should not allocate to do it.
const labelAnchor = new Vector3();

function updateLabels(): void {
  const halfWidth = window.innerWidth * 0.5;
  const halfHeight = window.innerHeight * 0.5;

  for (let i = 0; i < creatures.length; i++) {
    const creature = creatures[i] as BrainrotInstance;
    const label = labels[i];
    if (label === undefined) continue;

    labelAnchor.set(
      creature.root.position.x,
      creature.height * 1.08,
      creature.root.position.z,
    );
    labelAnchor.project(camera);

    // z > 1 means the anchor is behind the near plane — hide rather than
    // letting the label flip to the opposite side of the screen.
    if (labelAnchor.z > 1) {
      label.style.opacity = '0';
      continue;
    }

    const x = labelAnchor.x * halfWidth + halfWidth;
    const y = -labelAnchor.y * halfHeight + halfHeight;
    label.style.opacity = '1';
    label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
  }
}

function rebuild(): void {
  disposeCreatures();
  // Rebuilding through a fresh context proves the caches drain: the stats
  // readout drops to zero and climbs back only as the new creatures ask.
  context.dispose();
  context = new AssetContext({ seed: `brainrot-${paletteSeed}` });
  buildCreatures();
  if (armed) giveWeapons();
  if (swordArmed) giveSwords();
}

buildCreatures();

// --- UI ---------------------------------------------------------------------

speedInput.addEventListener('input', () => {
  speedValue.textContent = Number(speedInput.value).toFixed(2);
});
turnInput.addEventListener('input', () => {
  turnValue.textContent = Number(turnInput.value).toFixed(2);
});
climbInput.addEventListener('input', () => {
  climbValue.textContent = Number(climbInput.value).toFixed(2);
});

tierSelect.addEventListener('change', rebuild);

groundedButton.addEventListener('click', () => {
  grounded = !grounded;
  groundedButton.textContent = grounded ? 'Yerde ✓' : 'Havada';
  groundedButton.classList.toggle('on', grounded);
});

waterButton.addEventListener('click', () => {
  inWater = !inWater;
  waterButton.textContent = inWater ? 'Suda ✓ (shark)' : 'Karada (shark)';
  waterButton.classList.toggle('on', inWater);
});

weaponButton.addEventListener('click', () => {
  armed = !armed;
  // One weapon per pair of hands: arming the rifle puts the swords away.
  if (armed && swordArmed) swordButton.click();
  if (armed) giveWeapons();
  else dropWeapons();
  weaponButton.textContent = armed ? 'Silahı al ✓' : 'Silah ver';
  weaponButton.classList.toggle('on', armed);
});

swordButton.addEventListener('click', () => {
  swordArmed = !swordArmed;
  if (swordArmed && armed) weaponButton.click();
  if (swordArmed) giveSwords();
  else dropSwords();
  swordButton.textContent = swordArmed ? 'Kılıcı al ✓' : 'Kılıç ver';
  swordButton.classList.toggle('on', swordArmed);
});

// Held rather than clicked, like the trigger: `swing()` enforces the swing's own
// timing, so the frame loop can keep asking and the combo rate comes out of the
// library.
swingButton.addEventListener('pointerdown', () => {
  swinging = true;
  if (!swordArmed) swordButton.click();
  swingButton.classList.add('on');
});
const stopSwinging = (): void => {
  swinging = false;
  swingButton.classList.remove('on');
};
swingButton.addEventListener('pointerup', stopSwinging);
swingButton.addEventListener('pointerleave', stopSwinging);

dummyButton.addEventListener('click', () => {
  dummiesShown = !dummiesShown;
  for (let i = 0; i < dummies.length; i++) (dummies[i] as Dummy).root.visible = dummiesShown;
  dummyButton.textContent = dummiesShown ? 'Hedefler ✓' : 'Hedefler kapalı';
  dummyButton.classList.toggle('on', dummiesShown);
});

aimButton.addEventListener('click', () => {
  aiming = !aiming;
  // Nothing to raise without a weapon, so arming is implied.
  if (aiming && !armed) weaponButton.click();
  aimButton.textContent = aiming ? 'Nişanda ✓' : 'Nişan al';
  aimButton.classList.toggle('on', aiming);
});

// Held rather than clicked: `fire()` enforces the weapon's own cooldown, so the
// frame loop can just keep asking and the rate of fire comes out of the library.
fireButton.addEventListener('pointerdown', () => {
  firing = true;
  if (!armed) weaponButton.click();
  fireButton.classList.add('on');
});
const stopFiring = (): void => {
  firing = false;
  fireButton.classList.remove('on');
};
fireButton.addEventListener('pointerup', stopFiring);
fireButton.addEventListener('pointerleave', stopFiring);

aimYawInput.addEventListener('input', () => {
  aimYawValue.textContent = Number(aimYawInput.value).toFixed(2);
});
aimPitchInput.addEventListener('input', () => {
  aimPitchValue.textContent = Number(aimPitchInput.value).toFixed(2);
});

paletteButton.addEventListener('click', () => {
  randomPalette = true;
  paletteSeed++;
  rebuild();
});

dieButton.addEventListener('click', () => {
  for (let i = 0; i < creatures.length; i++) creatures[i]?.die();
});

respawnButton.addEventListener('click', () => {
  for (let i = 0; i < creatures.length; i++) creatures[i]?.animator.revive();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Frame loop -------------------------------------------------------------

const clock = new Clock();
let statsTimer = 0;

function animate(): void {
  const dt = Math.min(clock.getDelta(), 0.1);
  const speed = Number(speedInput.value);
  const turn = Number(turnInput.value);
  const climb = Number(climbInput.value);
  const aimYaw = Number(aimYawInput.value);
  const aimPitch = Number(aimPitchInput.value);

  for (let i = 0; i < creatures.length; i++) {
    const creature = creatures[i] as BrainrotInstance;
    creature.setState(speed, grounded, turn);

    if (creature.isHolding()) {
      // A creature mid-cut is not aiming: the swing pose is applied over the
      // aim and would fight it.
      creature.setAiming(aiming && !swinging);
      creature.setAim(aimYaw, aimPitch);
      if (firing) creature.fire();
      if (swinging) creature.swing();
    }

    // Plan-specific inputs, routed by animator type rather than by recipe id.
    const animator = creature.animator;
    if (animator instanceof FlightAnimator) animator.setClimbRate(climb);
    if (animator instanceof SwimAnimator) animator.setInWater(inWater);

    creature.update(dt);
    creature.root.rotation.y += turn * dt;
  }

  updateDummies(dt);

  statsTimer += dt;
  if (statsTimer > 0.25) {
    statsTimer = 0;
    updateStats();
  }

  controls.update();
  updateLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateStats(): void {
  const stats = context.stats();
  const info = renderer.info.render;
  const lines: string[] = [];

  for (let i = 0; i < creatures.length; i++) {
    const creature = creatures[i] as BrainrotInstance;
    const recipe = BRAINROT_RECIPES[creature.id];
    const hits = creature.hitCount();
    lines.push(
      `${recipe.displayName.padEnd(18)}${creature.animator.mode.padEnd(6)}` +
        `${creature.height.toFixed(2)}${hits > 0 ? `  ${hits} isabet` : ''}`,
    );
  }

  lines.push('');
  lines.push(`geometri   ${stats.geometries} (paylaşımlı)`);
  lines.push(`materyal   ${stats.materials} (paylaşımlı)`);
  lines.push(`draw call  ${info.calls}`);
  lines.push(`üçgen      ${info.triangles}`);

  statsPanel.textContent = lines.join('\n');
}

animate();

/**
 * Dev capture hook.
 *
 * A headless check can prove a skeleton is finite and grounded but not that it
 * looks right, and this canvas cannot always be screenshotted from outside the
 * page. So the demo exposes one: render a single frame and read it straight
 * back off the canvas, optionally after moving the camera somewhere specific.
 */
(window as unknown as Record<string, unknown>).__demo = {
  renderer,
  scene,
  camera,
  controls,
  creatures: () => creatures,
  look(from: [number, number, number], at: [number, number, number]): void {
    camera.position.set(from[0], from[1], from[2]);
    controls.target.set(at[0], at[1], at[2]);
    controls.update();
  },
  snapshot(): string {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  },
};

window.addEventListener('beforeunload', () => {
  disposeCreatures();
  context.dispose();
  groundGeometry.dispose();
  groundMaterial.dispose();
  weaponMetal.dispose();
  weaponWood.dispose();
  dummyPost.dispose();
  dummyBall.dispose();
  dummyHit.dispose();
  renderer.dispose();
});

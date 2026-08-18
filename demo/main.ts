import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  AssetContext,
  HUMANOID_ARCHETYPES,
  LocomotionAnimator,
  Rng,
  createRandomCharacter,
  type CharacterAsset,
  type HumanoidArchetype,
} from '../src/index';

/**
 * Character-system demo.
 *
 * Also serves as the smoke test for the resource lifecycle: "Yeni Tohum"
 * disposes every character and rebuilds from a fresh seed, and the stats
 * readout shows the geometry/material caches draining to zero in between.
 */

interface DemoCharacter {
  asset: CharacterAsset;
  animator: LocomotionAnimator;
  archetype: HumanoidArchetype;
  label: HTMLDivElement;
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const speedInput = document.getElementById('speed') as HTMLInputElement;
const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
const turnInput = document.getElementById('turn') as HTMLInputElement;
const turnValue = document.getElementById('turn-value') as HTMLSpanElement;
const jumpButton = document.getElementById('jump') as HTMLButtonElement;
const reseedButton = document.getElementById('reseed') as HTMLButtonElement;
const statsPanel = document.getElementById('stats') as HTMLDivElement;
const labelLayer = document.getElementById('labels') as HTMLDivElement;

// --- Renderer ---------------------------------------------------------------

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new Scene();
scene.background = new Color(0x10131a);
scene.fog = new Fog(0x10131a, 14, 42);

const camera = new PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(6.5, 3.2, 9.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 2;
controls.maxDistance = 40;

// --- Lighting ---------------------------------------------------------------

const hemisphere = new HemisphereLight(0xbfd4ff, 0x2b2f3a, 1.15);
scene.add(hemisphere);

const sun = new DirectionalLight(0xfff2e0, 2.1);
sun.position.set(6, 11, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

// --- Ground -----------------------------------------------------------------

const groundGeometry = new PlaneGeometry(80, 80);
const groundMaterial = new MeshLambertMaterial({ color: 0x252a35 });
const ground = new Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI * 0.5;
ground.receiveShadow = true;
scene.add(ground);

// --- Characters -------------------------------------------------------------

// One context per world: every character built through it shares geometries
// and materials wherever their dimensions and colours coincide.
let context = new AssetContext({ seed: 'demo-0' });
let characters: DemoCharacter[] = [];
let seedCounter = 0;
let grounded = true;

function buildCharacters(): void {
  const rng = new Rng(`demo-${seedCounter}`);
  const spacing = 1.6;
  const startX = -((HUMANOID_ARCHETYPES.length - 1) * spacing) * 0.5;

  for (let i = 0; i < HUMANOID_ARCHETYPES.length; i++) {
    const archetype = HUMANOID_ARCHETYPES[i] as HumanoidArchetype;
    const asset = createRandomCharacter(context, rng, archetype).build();

    asset.root.position.set(startX + i * spacing, 0, 0);
    scene.add(asset.root);

    // Stride cadence is derived from leg length, so a goblin and an ogre
    // walking at the same speed automatically take different-sized steps.
    const animator = new LocomotionAnimator(asset.rig);

    const label = document.createElement('div');
    label.className = 'label';
    label.innerHTML = `<b>${archetype}</b><span>${asset.height.toFixed(2)} birim</span>`;
    labelLayer.appendChild(label);

    characters.push({ asset, animator, archetype, label });
  }
}

function disposeCharacters(): void {
  for (let i = 0; i < characters.length; i++) {
    characters[i]?.asset.dispose();
    characters[i]?.label.remove();
  }
  characters = [];
}

// Reused every frame so the label layer never allocates.
const labelAnchor = new Vector3();

function updateLabels(): void {
  const halfWidth = window.innerWidth * 0.5;
  const halfHeight = window.innerHeight * 0.5;

  for (let i = 0; i < characters.length; i++) {
    const entry = characters[i] as DemoCharacter;
    labelAnchor.set(
      entry.asset.root.position.x,
      entry.asset.height * 1.1,
      entry.asset.root.position.z,
    );
    labelAnchor.project(camera);

    if (labelAnchor.z > 1) {
      entry.label.style.opacity = '0';
      continue;
    }

    const x = labelAnchor.x * halfWidth + halfWidth;
    const y = -labelAnchor.y * halfHeight + halfHeight;
    entry.label.style.opacity = '1';
    entry.label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
  }
}

function reseed(): void {
  disposeCharacters();
  // Dropping the whole context proves the caches drain: nothing survives a
  // rebuild except what the new characters ask for again.
  context.dispose();
  seedCounter++;
  context = new AssetContext({ seed: `demo-${seedCounter}` });
  buildCharacters();
}

buildCharacters();

// --- UI ---------------------------------------------------------------------

speedInput.addEventListener('input', () => {
  speedValue.textContent = Number(speedInput.value).toFixed(2);
});

turnInput.addEventListener('input', () => {
  turnValue.textContent = Number(turnInput.value).toFixed(2);
});

jumpButton.addEventListener('click', () => {
  grounded = !grounded;
  jumpButton.textContent = grounded ? 'Havada / Yerde' : 'Havada — yere indir';
});

reseedButton.addEventListener('click', reseed);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Frame loop -------------------------------------------------------------

const clock = new Clock();
let statsTimer = 0;

function animate(): void {
  // Clamped so a tab that was backgrounded does not fire one enormous step.
  const dt = Math.min(clock.getDelta(), 0.1);
  const speed = Number(speedInput.value);
  const turn = Number(turnInput.value);

  for (let i = 0; i < characters.length; i++) {
    const entry = characters[i] as DemoCharacter;
    entry.animator.setState(speed, grounded, turn);
    entry.animator.update(dt);
    // Yaw the whole rig so the banking lean has something to bank against.
    entry.asset.root.rotation.y += turn * dt;
  }

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
  const first = characters[0];
  const mode = first === undefined ? '—' : first.animator.mode;
  const info = renderer.info.render;

  statsPanel.textContent = [
    `karakter     ${characters.length}`,
    `mod          ${mode}`,
    `geometri     ${stats.geometries} (paylaşımlı)`,
    `materyal     ${stats.materials} (paylaşımlı)`,
    `draw call    ${info.calls}`,
    `üçgen        ${info.triangles}`,
  ].join('\n');
}

animate();

window.addEventListener('beforeunload', () => {
  disposeCharacters();
  context.dispose();
  groundGeometry.dispose();
  groundMaterial.dispose();
  renderer.dispose();
});

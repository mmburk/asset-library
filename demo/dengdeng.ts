import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  AssetContext,
  spawnFromRecipe,
  type BrainrotInstance,
  type SizeTier,
} from '../src/index';

const canvas = document.getElementById('app') as HTMLCanvasElement;
const speedInput = document.getElementById('speed') as HTMLInputElement;
const speedValue = document.getElementById('speed-value') as HTMLSpanElement;
const turnInput = document.getElementById('turn') as HTMLInputElement;
const turnValue = document.getElementById('turn-value') as HTMLSpanElement;
const scaleSelect = document.getElementById('scale') as HTMLSelectElement;
const groundedButton = document.getElementById('grounded') as HTMLButtonElement;
const wireframeButton = document.getElementById('wireframe') as HTMLButtonElement;
const dieButton = document.getElementById('die') as HTMLButtonElement;
const respawnButton = document.getElementById('respawn') as HTMLButtonElement;
const paletteButton = document.getElementById('palette') as HTMLButtonElement;
const lightningButton = document.getElementById('lightning') as HTMLButtonElement;
const statsPanel = document.getElementById('stats') as HTMLDivElement;

// --- Three.js Scene Setup ---------------------------------------------------

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;

const scene = new Scene();
scene.background = new Color(0x090d14);
scene.fog = new Fog(0x090d14, 10, 45);

const camera = new PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 4.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.1, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1;
controls.maxDistance = 25;

// --- Lighting (Atmospheric Storm / Forest) -----------------------------------

const hemiLight = new HemisphereLight(0x7da4d4, 0x1f2918, 1.2);
scene.add(hemiLight);

const sun = new DirectionalLight(0xffecd0, 2.4);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 25;
sun.shadow.camera.left = -4;
sun.shadow.camera.right = 4;
sun.shadow.camera.top = 4;
sun.shadow.camera.bottom = -4;
sun.shadow.bias = -0.0005;
scene.add(sun);

// Rim back-light
const rimLight = new DirectionalLight(0x90b0e0, 1.0);
rimLight.position.set(-5, 4, -4);
scene.add(rimLight);

// Lightning point light
const lightningLight = new PointLight(0xbadfff, 0, 30);
lightningLight.position.set(0, 6, 2);
scene.add(lightningLight);

// Ground
const groundGeom = new PlaneGeometry(80, 80);
const groundMat = new MeshLambertMaterial({ color: 0x11161d });
const ground = new Mesh(groundGeom, groundMat);
ground.rotation.x = -Math.PI * 0.5;
ground.receiveShadow = true;
scene.add(ground);

const grid = new GridHelper(20, 20, 0xf7a048, 0x1f2838);
grid.position.y = 0.001;
scene.add(grid);

// --- Creature Management ----------------------------------------------------

let context = new AssetContext({ seed: 'dengdeng-0' });
let creature: BrainrotInstance | null = null;
let grounded = true;
let wireframe = false;
let lightningEnabled = false;
let paletteIndex = 0;

function spawnDengDeng(): void {
  if (creature !== null) {
    scene.remove(creature.root);
    creature.dispose();
    creature = null;
  }

  const scale = scaleSelect.value as SizeTier;
  const isRandom = paletteIndex > 0;

  creature = spawnFromRecipe(context, {
    recipeId: 'brr-brr-deng-deng',
    seed: `dengdeng-seed-${paletteIndex}`,
    scale,
    colorPalette: isRandom ? 'random' : undefined,
    castShadow: true,
    receiveShadow: true,
  });

  scene.add(creature.root);
  applyWireframe();
  updateStats();
}

function applyWireframe(): void {
  if (!creature) return;
  creature.root.traverse((child) => {
    if (child instanceof Mesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => (m.wireframe = wireframe));
      } else {
        child.material.wireframe = wireframe;
      }
    }
  });
}

function updateStats(): void {
  if (!creature) return;

  let triangleCount = 0;
  let meshCount = 0;
  creature.root.traverse((child) => {
    if (child instanceof Mesh && child.geometry) {
      meshCount++;
      const geom = child.geometry;
      if (geom.index) {
        triangleCount += geom.index.count / 3;
      } else if (geom.attributes.position) {
        triangleCount += geom.attributes.position.count / 3;
      }
    }
  });

  statsPanel.textContent = [
    `Karakter: ${creature.displayName}`,
    `Plan: ${creature.plan} · ID: ${creature.id}`,
    `Boyut: ${creature.height.toFixed(2)}m`,
    `Poligon / Üçgen: ${triangleCount}`,
    `Parça Sayısı: ${meshCount}`,
    `Zero-GC Geometri Önbelleği: Aktif`,
  ].join('\n');
}

// --- UI Listeners -----------------------------------------------------------

speedInput.addEventListener('input', () => {
  speedValue.textContent = Number(speedInput.value).toFixed(2);
});

turnInput.addEventListener('input', () => {
  turnValue.textContent = Number(turnInput.value).toFixed(2);
});

scaleSelect.addEventListener('change', () => {
  spawnDengDeng();
});

groundedButton.addEventListener('click', () => {
  grounded = !grounded;
  groundedButton.classList.toggle('on', grounded);
  groundedButton.textContent = grounded ? 'Yerde' : 'Havada / Zıplama';
});

wireframeButton.addEventListener('click', () => {
  wireframe = !wireframe;
  wireframeButton.classList.toggle('on', wireframe);
  applyWireframe();
});

dieButton.addEventListener('click', () => {
  if (creature) creature.die();
});

respawnButton.addEventListener('click', () => {
  spawnDengDeng();
});

paletteButton.addEventListener('click', () => {
  paletteIndex++;
  spawnDengDeng();
});

lightningButton.addEventListener('click', () => {
  lightningEnabled = !lightningEnabled;
  lightningButton.classList.toggle('on', lightningEnabled);
});

// --- Main Loop --------------------------------------------------------------

const clock = new Clock();
let lightningTimer = 0;

function animate(): void {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);

  if (creature) {
    const speed = Number(speedInput.value);
    const turn = Number(turnInput.value);
    creature.setState(speed, grounded, turn);
    creature.update(dt);
  }

  // Stormy lightning flashes
  if (lightningEnabled) {
    lightningTimer -= dt;
    if (lightningTimer <= 0) {
      if (Math.random() < 0.25) {
        lightningLight.intensity = 4.0 + Math.random() * 6.0;
        lightningTimer = 0.05 + Math.random() * 0.12;
      } else {
        lightningLight.intensity = 0;
        lightningTimer = 0.8 + Math.random() * 3.0;
      }
    }
  } else {
    lightningLight.intensity = 0;
  }

  controls.update();
  renderer.render(scene, camera);
}

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial spawn & run
spawnDengDeng();
animate();

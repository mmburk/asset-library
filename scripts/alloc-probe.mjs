// Allocation probe for `LocomotionAnimator.update()`.
//
//   node --expose-gc scripts/alloc-probe.mjs <lib|control> <frames>
//
// Uses V8's sampling heap profiler through the inspector session, started and
// stopped around the measured loop only. Scoping it this way is what makes the
// number meaningful: run process-wide, the profile is swamped by rig
// construction, which allocates megabytes and has nothing to do with the frame
// loop under test.
//
// `control` adds one escaping allocation per call so the caller can confirm the
// measurement actually detects allocation before trusting the `lib` figure.
import { Session } from 'node:inspector';
import {
  AssetContext,
  BRAINROT_RECIPE_IDS,
  LocomotionAnimator,
  createCharacter,
  spawnFromRecipe,
} from '../dist/asset-library.js';

const VALID_MODES = ['lib', 'control', 'creatures'];
const mode = VALID_MODES.includes(process.argv[2]) ? process.argv[2] : 'lib';
const frames = Number.parseInt(process.argv[3] ?? '0', 10) || 0;

const CHARACTERS = 30;
const dt = 1 / 60;

const context = new AssetContext({ seed: 'probe' });
const animators = [];
const instances = [];
if (mode === 'creatures') {
  // Six of each archetype, so every body-plan animator is exercised.
  for (let i = 0; i < CHARACTERS; i++) {
    const id = BRAINROT_RECIPE_IDS[i % BRAINROT_RECIPE_IDS.length];
    const instance = spawnFromRecipe(context, { recipeId: id, scale: 'player' });
    instances.push(instance);
    animators.push(instance.animator);
  }
} else {
  for (let i = 0; i < CHARACTERS; i++) {
    animators.push(new LocomotionAnimator(createCharacter(context).build().rig));
  }
}

// Warm up so the JIT has tiered up before anything is measured.
for (let i = 0; i < 3000; i++) {
  for (let k = 0; k < animators.length; k++) {
    animators[k].setState(3, true, 0.2);
    animators[k].update(dt);
  }
}
if (typeof global.gc === 'function') global.gc();

// Live ring of retained objects, kept reachable and read after the loop.
const sink = new Array(4096).fill(null);
let sinkIndex = 0;

const session = new Session();
session.connect();

const post = (method, params) =>
  new Promise((resolve, reject) => {
    session.post(method, params, (error, result) => (error ? reject(error) : resolve(result)));
  });

await post('HeapProfiler.enable');
// 1 KiB sampling interval: fine enough that even a single small object per
// call would produce thousands of samples.
await post('HeapProfiler.startSampling', { samplingInterval: 1024 });

for (let i = 0; i < frames; i++) {
  for (let k = 0; k < animators.length; k++) {
    animators[k].setState(3, true, 0.2);
    animators[k].update(dt);
    if (mode === 'control') {
      // Stored into a live array that is read after the loop. A local sink, or
      // even a global that is only ever overwritten, gets scalar-replaced by
      // escape analysis and the control silently measures nothing.
      sink[sinkIndex] = { frame: i, animator: k };
      sinkIndex = (sinkIndex + 1) & (sink.length - 1);
    }
  }
}

const { profile } = await post('HeapProfiler.stopSampling');
session.disconnect();

let total = 0;
const byFunction = new Map();
const walk = (node) => {
  const size = node.selfSize ?? 0;
  if (size > 0) {
    const frame = node.callFrame ?? {};
    const name = frame.functionName || '(anonymous)';
    byFunction.set(name, (byFunction.get(name) ?? 0) + size);
    total += size;
  }
  for (const child of node.children ?? []) walk(child);
};
walk(profile.head);

// Reading the sink keeps the control's allocations provably reachable.
let sinkCheck = 0;
for (let i = 0; i < sink.length; i++) if (sink[i] !== null) sinkCheck += sink[i].frame & 1;

const top = [...byFunction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
process.stdout.write(
  `${JSON.stringify({ mode, calls: frames * CHARACTERS, totalBytes: total, sinkCheck, top })}\n`,
);

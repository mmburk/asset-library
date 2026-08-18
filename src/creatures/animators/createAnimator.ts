import type { CreatureRig } from '../CreatureRig';
import type { BodyPlan } from '../types';
import { BipedAnimator, type BipedAnimatorOptions } from './BipedAnimator';
import { CreatureAnimator, type CreatureAnimatorOptions } from './CreatureAnimator';
import { FlightAnimator, type FlightAnimatorOptions } from './FlightAnimator';
import { HybridWalkAnimator, type HybridWalkAnimatorOptions } from './HybridWalkAnimator';
import { QuadrupedAnimator, type QuadrupedAnimatorOptions } from './QuadrupedAnimator';
import { SwimAnimator, type SwimAnimatorOptions } from './SwimAnimator';

/**
 * Every tuning knob any body plan understands.
 *
 * A recipe declares its animator settings before it knows which concrete
 * animator will be built, so the option bag has to span all of them. Each
 * animator picks out the fields it recognises and ignores the rest, which is
 * what lets `tung-tung-sahur` damp `torsoLean` — a biped-only setting — from
 * the same place a flyer sets `propellerIdleRps`.
 */
export type AnyCreatureAnimatorOptions = Partial<
  CreatureAnimatorOptions &
    BipedAnimatorOptions &
    QuadrupedAnimatorOptions &
    FlightAnimatorOptions &
    SwimAnimatorOptions &
    HybridWalkAnimatorOptions
>;

/**
 * Builds the animator a rig's body plan calls for.
 *
 * The plan lives on the skeleton, so a caller spawning from a recipe never has
 * to know whether it just created something that walks, flies or swims.
 */
export function createAnimatorForPlan(
  rig: CreatureRig,
  options?: AnyCreatureAnimatorOptions,
): CreatureAnimator {
  const plan: BodyPlan = rig.plan;
  switch (plan) {
    case 'biped':
      return new BipedAnimator(rig, options);
    case 'quadruped':
      return new QuadrupedAnimator(rig, options);
    case 'flyer':
      return new FlightAnimator(rig, options);
    case 'swimmer':
      return new SwimAnimator(rig, options);
    case 'hybrid':
      return new HybridWalkAnimator(rig, options);
  }
}

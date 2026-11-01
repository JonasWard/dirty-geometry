import type { Index } from '../../../core/numbers';

/** Work counters for a triangulation, for count-based (not wall-clock) performance budgets. */
export type CdtStats = {
  orient: Index;
  inCircle: Index;
  flips: Index;
  walkSteps: Index;
  /** Times a safety limit stopped a loop early; non-zero means the result may be incomplete. */
  guardHits: Index;
};

export function emptyCdtStats(): CdtStats {
  return { orient: 0, inCircle: 0, flips: 0, walkSteps: 0, guardHits: 0 };
}

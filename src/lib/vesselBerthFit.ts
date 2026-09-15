import type { VesselClassSpec } from '../data/vessels';
import type { Berth } from '../data/berths';

export interface FitResult {
  compatible: boolean;
  reasons: string[];
}

/**
 * Check if a vessel can fit in a berth based on dimensional constraints.
 * A vessel fits if:
 * - vessel.loaM <= berth.maxLoaM (if berth.maxLoaM is not null)
 * - vessel.beamM <= berth.maxBeamM (if berth.maxBeamM is not null)
 * - vessel.draftM <= berth.maxDraftM (if berth.maxDraftM is not null)
 *
 * If a berth's max dimension is null, that dimension has "no data" and is excluded
 * from the check (not treated as unlimited compatibility).
 *
 * All failing dimensions are listed in `reasons` as full sentences with both numbers.
 */
export function fitsBerth(vessel: VesselClassSpec, berth: Berth): FitResult {
  const reasons: string[] = [];

  // Check LOA only if berth has a defined max
  if (berth.maxLoaM !== null && vessel.loaM > berth.maxLoaM) {
    reasons.push(`Length ${vessel.loaM.toFixed(1)}m exceeds berth limit of ${berth.maxLoaM.toFixed(1)}m`);
  }

  // Check Beam only if berth has a defined max
  if (berth.maxBeamM !== null && vessel.beamM > berth.maxBeamM) {
    reasons.push(`Beam ${vessel.beamM.toFixed(1)}m exceeds berth limit of ${berth.maxBeamM.toFixed(1)}m`);
  }

  // Check Draft only if berth has a defined max
  if (berth.maxDraftM !== null && vessel.draftM > berth.maxDraftM) {
    reasons.push(`Draft ${vessel.draftM.toFixed(1)}m exceeds berth limit of ${berth.maxDraftM.toFixed(1)}m`);
  }

  return {
    compatible: reasons.length === 0,
    reasons,
  };
}

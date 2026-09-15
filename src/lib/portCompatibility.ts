import type { Berth } from '../data/berths';
import type { VesselClassSpec } from '../data/vessels';
import type { CargoCategory } from '../data/cargo';
import { getCargoCompatibleBerths } from './cargoCompatibleBerths';
import { fitsBerth } from './vesselBerthFit';

export interface PortFit {
  portId: string;
  compatible: boolean;
  bestBerth: Berth | null;
  reasons: string[];
}

/**
 * Check if a vessel can operate at a port with a specific cargo.
 * The port is compatible if at least ONE cargo-compatible berth fits the vessel.
 * bestBerth is the compatible berth with the largest maxDraftM (ties broken by maxLoaM).
 * If no berth fits, reasons come from the "closest" berth (smallest total dimensional shortfall).
 */
export function checkPortCompatibility(
  vessel: VesselClassSpec,
  portId: string,
  cargo: CargoCategory,
): PortFit {
  const compatibleBerths = getCargoCompatibleBerths(portId, cargo);

  if (compatibleBerths.length === 0) {
    return {
      portId,
      compatible: false,
      bestBerth: null,
      reasons: ['No berths available for this cargo at this port'],
    };
  }

  let bestFitBerth: Berth | null = null;
  const results = compatibleBerths.map((berth) => ({
    berth,
    fit: fitsBerth(vessel, berth),
  }));

  // Find a compatible berth (largest maxDraftM, ties broken by maxLoaM)
  const compatibleResults = results.filter((r) => r.fit.compatible);
  if (compatibleResults.length > 0) {
    bestFitBerth = compatibleResults.reduce((best, current) => {
      if (best === null) return current.berth;
      const bestDraft = best.maxDraftM ?? -1;
      const currentDraft = current.berth.maxDraftM ?? -1;
      if (currentDraft !== bestDraft) {
        return currentDraft > bestDraft ? current.berth : best;
      }
      const bestLoa = best.maxLoaM ?? -1;
      const currentLoa = current.berth.maxLoaM ?? -1;
      return currentLoa > bestLoa ? current.berth : best;
    }, null as Berth | null);

    return {
      portId,
      compatible: true,
      bestBerth: bestFitBerth,
      reasons: [],
    };
  }

  // No compatible berths; find the closest one (smallest total shortfall)
  let closestBerth = compatibleBerths[0];
  let closestShortfall = calculateShortfall(vessel, closestBerth);

  for (const berth of compatibleBerths.slice(1)) {
    const shortfall = calculateShortfall(vessel, berth);
    if (shortfall < closestShortfall) {
      closestShortfall = shortfall;
      closestBerth = berth;
    }
  }

  const closestFit = fitsBerth(vessel, closestBerth);
  return {
    portId,
    compatible: false,
    bestBerth: null,
    reasons: closestFit.reasons,
  };
}

/**
 * Calculate total dimensional shortfall (sum of all dimensional mismatches).
 * Used to find the "closest" berth when no berth fits.
 */
function calculateShortfall(vessel: VesselClassSpec, berth: Berth): number {
  let shortfall = 0;

  if (berth.maxLoaM !== null && vessel.loaM > berth.maxLoaM) {
    shortfall += vessel.loaM - berth.maxLoaM;
  }

  if (berth.maxBeamM !== null && vessel.beamM > berth.maxBeamM) {
    shortfall += vessel.beamM - berth.maxBeamM;
  }

  if (berth.maxDraftM !== null && vessel.draftM > berth.maxDraftM) {
    shortfall += vessel.draftM - berth.maxDraftM;
  }

  return shortfall;
}

import type { CargoCategory } from '../data/cargo';
import type { VesselClass } from '../data/vessels';
import { VESSEL_CLASSES } from '../data/vessels';
import { checkVoyageCompatibility } from './voyageCompatibility';
import type { VoyageFit } from './voyageCompatibility';

export interface VesselAvailability {
  vesselClass: VesselClass;
  voyageFit: VoyageFit;
  isCompatible: boolean;
  failureReason: string | null;
  failureLocation: 'origin' | 'destination' | null;
}

/**
 * Check voyage compatibility for all vessel classes.
 * Returns detailed compatibility info for each class, including
 * whether it can complete the voyage and failure reasons if not.
 */
export function checkAllVesselsForVoyage(
  originPortId: string,
  destinationPortId: string,
  cargo: CargoCategory,
): VesselAvailability[] {
  return VESSEL_CLASSES.map((vesselSpec) => {
    const voyageFit = checkVoyageCompatibility(
      vesselSpec.id,
      originPortId,
      destinationPortId,
      cargo,
    );

    let failureReason: string | null = null;
    let failureLocation: 'origin' | 'destination' | null = null;

    if (!voyageFit.compatible) {
      if (!voyageFit.origin.compatible) {
        failureReason = voyageFit.origin.reasons[0] || 'Origin port incompatible';
        failureLocation = 'origin';
      } else if (!voyageFit.destination.compatible) {
        failureReason = voyageFit.destination.reasons[0] || 'Destination port incompatible';
        failureLocation = 'destination';
      }
    }

    return {
      vesselClass: vesselSpec.id,
      voyageFit,
      isCompatible: voyageFit.compatible,
      failureReason,
      failureLocation,
    };
  });
}

/**
 * Get the best compatible vessel class(es) for a voyage.
 * Returns the largest (by DWT) compatible class, or null if none fit.
 */
export function findBestCompatibleVessel(
  originPortId: string,
  destinationPortId: string,
  cargo: CargoCategory,
): VesselClass | null {
  const all = checkAllVesselsForVoyage(originPortId, destinationPortId, cargo);
  const compatible = all.filter((v) => v.isCompatible);

  if (compatible.length === 0) {
    return null;
  }

  // Return largest (by DWT order)
  const dwtOrder: Record<VesselClass, number> = {
    capesize: 4,
    panamax: 3,
    supramax: 2,
    handysize: 1,
  };

  return compatible.reduce((best, current) =>
    dwtOrder[current.vesselClass] > dwtOrder[best.vesselClass] ? current : best,
  ).vesselClass;
}

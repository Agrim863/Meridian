import type { VesselClass } from '../data/vessels';
import type { CargoCategory } from '../data/cargo';
import { VESSEL_CLASSES } from '../data/vessels';
import type { PortFit } from './portCompatibility';
import { checkPortCompatibility } from './portCompatibility';

export interface VoyageFit {
  vessel: VesselClass;
  compatible: boolean;
  origin: PortFit;
  destination: PortFit;
}

/**
 * Check if a voyage (origin -> destination with specified cargo) is compatible.
 * A voyage is compatible only if BOTH the origin and destination ports pass
 * independently. The vessel spec is looked up from VESSEL_CLASSES.
 */
export function checkVoyageCompatibility(
  vesselId: VesselClass,
  originPortId: string,
  destinationPortId: string,
  cargo: CargoCategory,
): VoyageFit {
  const vesselSpec = VESSEL_CLASSES.find((v) => v.id === vesselId);
  if (!vesselSpec) {
    throw new Error(`Vessel class not found: ${vesselId}`);
  }

  const origin = checkPortCompatibility(vesselSpec, originPortId, cargo);
  const destination = checkPortCompatibility(vesselSpec, destinationPortId, cargo);

  return {
    vessel: vesselId,
    compatible: origin.compatible && destination.compatible,
    origin,
    destination,
  };
}

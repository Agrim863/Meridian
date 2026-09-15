import type { Berth } from '../data/berths';
import type { CargoCategory } from '../data/cargo';
import { BERTHS } from '../data/berths';

/**
 * Get all berths at a port that can handle a given cargo type.
 * A berth is compatible if:
 * - The cargo category is in the berth's cargoCategories, OR
 * - 'general_bulk' is in the berth's cargoCategories (fallback)
 *
 * Returns the actual berth records, unmodified.
 */
export function getCargoCompatibleBerths(portId: string, cargo: CargoCategory): Berth[] {
  return BERTHS.filter((berth) => {
    if (berth.portId !== portId) {
      return false;
    }
    // Berth is compatible if cargo matches directly or if it has general_bulk as fallback
    return berth.cargoCategories.includes(cargo) || berth.cargoCategories.includes('general_bulk');
  });
}

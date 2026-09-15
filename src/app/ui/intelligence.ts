/**
 * Freight intelligence panel (spot rate, forecast range, market outlook).
 * Mirrors the legacy drawAnalysis() but uses typed state.
 */

import { VESSEL_CLASSES } from '../../data/vessels';
import { distanceNm } from '../map';
import { getState } from '../state';

const $ = (selector: string): HTMLElement | null =>
  document.querySelector(selector);

const CARGO_LABEL: Record<string, string> = {
  iron_ore: 'IRON ORE',
  thermal_coal: 'THERMAL COAL',
  coking_coal: 'COKING COAL',
  manganese_ore: 'MANGANESE ORE',
  fertilizer: 'FERTILIZER',
};

export function drawAnalysis(): void {
  const s = getState();
  if (!(s.route && s.cargo && s.routeAnimationComplete)) return;

  const coords = s.route.geometry.coordinates as [number, number][];
  const nm = distanceNm(coords);
  // Rate approximation from the legacy formula, kept for visual parity
  const baseRate = 17.2 + nm / 7000 + (s.cargo === 'iron_ore' ? 0.4 : 0);
  const type =
    VESSEL_CLASSES.find((v) => v.id === s.selectedVesselClass) ?? VESSEL_CLASSES[2];
  const cargoLabel = CARGO_LABEL[s.cargo] ?? s.cargo.toUpperCase();

  const intel = $('#intelligence');
  intel?.classList.remove('hidden');
  const intelTitle = $('#intel-title');
  const spotRate = $('#spot-rate');
  const forecast = $('#forecast-range');
  if (intelTitle)
    intelTitle.innerHTML = `<small>${type.label.toUpperCase()} · ${cargoLabel}</small>${s.origin?.name} <i>→</i> ${s.destination?.name}`;
  if (spotRate) spotRate.innerHTML = `$${baseRate.toFixed(2)} <small>/ MT</small>`;
  if (forecast) forecast.textContent = `$${(baseRate - 0.3).toFixed(2)} – $${(baseRate + 1.9).toFixed(2)}`;
}

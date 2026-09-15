/**
 * Origin / destination search panel and cargo selection.
 * Ported from app.js — uses canonical PORTS data instead of the legacy hardcoded list.
 */

import { PORTS, type Port } from '../../data/ports';
import { CARGO_DROPDOWN_OPTIONS, type CargoCategory } from '../../data/cargo';
import {
  applyProjection,
  clearRouteLayers,
  clearVesselMarkers,
  fitVoyageOverview,
  flyToPort,
  renderPorts,
} from '../map';
import { TIMING } from '../../utils/timing';
import { flash } from './toast';
import { getState, resetDownstream, setState } from '../state';
import { calculateMaritimeRoute } from '../route';

const $ = (selector: string): HTMLElement | null =>
  document.querySelector(selector);
const $$ = (selector: string): HTMLElement[] =>
  Array.from(document.querySelectorAll(selector));

const COUNTRY_CODE: Record<string, string> = { India: 'IN', Australia: 'AU' };

/** Build search-results HTML for a given kind (origin or destination) */
function optionsHtml(kind: 'origin' | 'destination', query = ''): string {
  const q = query.toLowerCase();
  const s = getState();
  return PORTS.filter((p) => {
    if (p === s.origin || p === s.destination) return false;
    if (kind === 'destination' && s.origin && p.country === s.origin.country) return false;
    if (kind === 'origin' && s.destination && p.country === s.destination.country) return false;
    return p.name.toLowerCase().includes(q);
  })
    .filter((p) => p.lat !== null && p.lng !== null)
    .map(
      (p) =>
        `<button type="button" data-${kind}="${p.name}"><b>${p.name}</b><small>${p.country} · ${(p.lat as number).toFixed(2)}°, ${(p.lng as number).toFixed(2)}°</small></button>`
    )
    .join('');
}

function wireResults(kind: 'origin' | 'destination'): void {
  $$(`[data-${kind}]`).forEach((b) => {
    (b as HTMLButtonElement).onclick = () => {
      const name = (b as HTMLElement).dataset[kind];
      if (name) void selectPort(kind, name);
    };
  });
}

function confirmedPortHtml(port: Port): string {
  const code = COUNTRY_CODE[port.country] || port.country.slice(0, 2).toUpperCase();
  const lat = port.lat === null ? '—' : port.lat.toFixed(2);
  const lng = port.lng === null ? '—' : port.lng.toFixed(2);
  return `<div class="selected-port"><b>✓ ${port.name}</b><small>${port.country} · ${code} · ${lat}°, ${lng}°</small></div>`;
}

export function drawSearches(): void {
  const originEl = $('#origin-results');
  const destEl = $('#destination-results');
  const s = getState();

  if (s.origin) {
    if (originEl) originEl.innerHTML = confirmedPortHtml(s.origin);
    $('#origin-search')?.classList.add('hidden');
    const originDot = $('#origin-step .step-dot');
    originDot?.classList.remove('active');
    originDot?.classList.add('done');
    if (originDot) originDot.textContent = '✓';
  } else {
    if (originEl) originEl.innerHTML = optionsHtml('origin', ($('#origin-search') as HTMLInputElement)?.value ?? '');
    $('#origin-search')?.classList.remove('hidden');
    wireResults('origin');
  }

  if (s.destination) {
    if (destEl) destEl.innerHTML = confirmedPortHtml(s.destination);
    $('#destination-search')?.classList.add('hidden');
    const destDot = $('#destination-step .step-dot');
    destDot?.classList.remove('active');
    destDot?.classList.add('done');
    if (destDot) destDot.textContent = '✓';
  } else if (!$('#destination-step')?.classList.contains('hidden')) {
    if (destEl) destEl.innerHTML = optionsHtml('destination', ($('#destination-search') as HTMLInputElement)?.value ?? '');
    $('#destination-search')?.classList.remove('hidden');
    wireResults('destination');
  }
}

export async function selectPort(
  kind: 'origin' | 'destination',
  name: string,
): Promise<void> {
  const port = PORTS.find((p) => p.name === name);
  if (!port) return;

  const s = getState();

  if (kind === 'origin') {
    const originChanged = s.origin && s.origin.name !== port.name;
    setState({ origin: port });
    if (originChanged) resetDownstream();
    if (s.destination && s.destination.country === port.country) {
      setState({ destination: null });
      resetDownstream();
    }

    $('#welcome')?.classList.add('hidden');
    $('#planner')?.classList.remove('hidden');
    $('#origin-step')?.classList.remove('hidden');
    $('#destination-step')?.classList.remove('hidden');
    if (!getState().destination) $('#cargo-step')?.classList.add('hidden');
    drawSearches();
    renderPorts();
    clearVesselMarkers();
    await flyToPort(port, 5.5);
    ($('#destination-search') as HTMLInputElement | null)?.focus();
  } else {
    if (s.destination && s.destination.name !== port.name) {
      resetDownstream();
    }
    setState({ destination: port });
    clearRouteLayers();
    clearVesselMarkers();
    $('#intelligence')?.classList.add('hidden');
    $('#vessel-dock')?.classList.add('hidden');

    $('#planner')?.classList.remove('hidden');
    $('#destination-step')?.classList.remove('hidden');
    $('#cargo-step')?.classList.remove('hidden');
    const cargoDot = $('#cargo-step .step-dot');
    cargoDot?.classList.add('active');
    cargoDot?.classList.remove('done');
    if (cargoDot) cargoDot.textContent = '3';
    drawSearches();
    renderPorts();
    await flyToPort(port, 5.5);
    fitVoyageOverview(TIMING.voyageOverview);
    flash('Destination confirmed — select cargo to calculate voyage');
  }
}

export function onCargoSelected(cargoId: CargoCategory): void {
  setState({ cargo: cargoId });
  clearRouteLayers();
  clearVesselMarkers();
  $('#intelligence')?.classList.add('hidden');
  $('#vessel-dock')?.classList.add('hidden');

  const cargoDot = $('#cargo-step .step-dot');
  cargoDot?.classList.remove('active');
  cargoDot?.classList.add('done');
  if (cargoDot) cargoDot.textContent = '✓';
  $('#planner')?.classList.add('hidden');

  flash('Cargo selected — calculating maritime route');
  void calculateMaritimeRoute();
}

/** Render the cargo buttons using the canonical dropdown options */
export function renderCargoButtons(): void {
  const container = document.querySelector('.cargo-options');
  if (!container) return;
  container.innerHTML = CARGO_DROPDOWN_OPTIONS.map(
    (o) => `<button type="button" data-cargo="${o.value}">${o.label}</button>`
  ).join('');

  $$(('[data-cargo]')).forEach((b) => {
    (b as HTMLButtonElement).onclick = () => {
      const id = (b as HTMLElement).dataset.cargo as CargoCategory;
      onCargoSelected(id);
    };
  });
}

export function setMapMode(mode: '2d' | '3d'): void {
  $$('.mode').forEach((x) => x.classList.toggle('active', (x as HTMLElement).dataset.mode === mode));
  const app = $('#app');
  if (app) app.dataset.mode = mode;
  applyProjection(mode === '3d' ? 'globe' : 'mercator', true);
}

/** Wire up the planner UI event handlers */
export function initPlannerUI(): void {
  $('#welcome-action')?.addEventListener('click', () => {
    $('#welcome')?.classList.add('hidden');
    ($('#origin-search') as HTMLInputElement | null)?.focus();
  });

  (['origin', 'destination'] as const).forEach((k) => {
    const input = $(`#${k}-search`) as HTMLInputElement | null;
    if (!input) return;
    input.addEventListener('input', (e: Event) => {
      const target = e.target as HTMLInputElement;
      const resultsEl = $(`#${k}-results`);
      if (resultsEl) resultsEl.innerHTML = optionsHtml(k, target.value);
      wireResults(k);
    });
  });

  $$('.mode').forEach((b) => {
    (b as HTMLButtonElement).onclick = () => {
      const m = (b as HTMLElement).dataset.mode as '2d' | '3d';
      setMapMode(m);
    };
  });

  renderCargoButtons();
}

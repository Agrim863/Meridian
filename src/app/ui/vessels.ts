/**
 * Vessel class markers, vessel selection, and the vessel-instance drawer.
 * Compatibility comes from the canonical checkAllVesselsForVoyage() engine.
 * Vessel instances come from VESSEL_INSTANCES, not the legacy MOCK_VESSELS.
 *
 * Markers are positioned using map.project() → pixel coordinates, not MapLibre
 * Marker objects, so they are immune to MapLibre's internal z-ordering and
 * projection-switching issues.
 */

import { VESSEL_CLASSES, type VesselClass, type VesselClassSpec } from '../../data/vessels';
import { VESSEL_INSTANCES, type VesselInstance } from '../../data/vesselInstances';
import type { VesselAvailability } from '../../lib/voyageAvailability';
import { clearVesselMarkers, getMap, vesselMarkers } from '../map';
import { flash } from './toast';
import { getState, setState } from '../state';
import { drawAnalysis } from './intelligence';

/** Container that holds pixel-positioned vessel markers (width:0, overflow:visible) */
const SHIPS_ID = 'ships';

/** Ensure the ships container exists in the DOM */
function getShipsContainer(): HTMLElement {
  let el = document.getElementById(SHIPS_ID);
  if (!el) {
    el = document.createElement('section');
    el.id = SHIPS_ID;
    el.className = 'ships';
    document.getElementById('app')?.appendChild(el);
  }
  return el;
}

const $ = (selector: string): HTMLElement | null =>
  document.querySelector(selector);
const $$ = (selector: string): HTMLElement[] =>
  Array.from(document.querySelectorAll(selector));

/** Visual size per vessel class (pixels) — large enough to read on the map */
const SHIP_SIZES: Record<VesselClass, number> = {
  handysize: 60,
  supramax: 85,
  panamax: 115,
  capesize: 155,
};

/** Spread the four vessels in a semicircle in the water just in front of the port.
 *  Angles are measured from due-south; positive = eastward. */
const SHIP_ANGLES = [-75, -25, 25, 75]; // degrees - more spread, wider semicircle
const SHIP_SPREAD = 0.28; // degrees from port centre - slightly more spread

function shipModelHtml(vessel: VesselClassSpec): string {
  const size = SHIP_SIZES[vessel.id];
  // Create ship with better 3D depth - more realistic hull shape
  return `
    <div class="ship-bulk" style="--ship-w:${size}px">
      <div class="ship-hull"></div>
      <div class="ship-hull-side"></div>
      <div class="ship-super"></div>
      <div class="ship-bridge"></div>
      <div class="ship-deck"></div>
      <div class="ship-hatch"></div>
      <div class="ship-hatch"></div>
      <div class="ship-hatch"></div>
      <div class="ship-mast"></div>
    </div>
    <div class="ship-bulk-label"></div>
  `;
}

export function drawShips(): void {
  const s = getState();
  if (!s.routeAnimationComplete || !s.origin) return;
  if (s.origin.lat === null || s.origin.lng === null) return;

  clearVesselMarkers();
  const shipsEl = getShipsContainer();
  shipsEl.classList.remove('hidden');
  shipsEl.innerHTML = '';

  const map = getMap();
  const availability = s.vesselAvailability ?? [];
  const lookup = new Map<VesselClass, VesselAvailability>();
  availability.forEach((a) => lookup.set(a.vesselClass, a));

  const originLng: number = s.origin.lng;
  const originLat: number = s.origin.lat;

  VESSEL_CLASSES.forEach((vessel, index) => {
    const avail = lookup.get(vessel.id);
    const ok = avail?.isCompatible ?? false;
    const reason = avail?.failureReason ?? null;

    const angle = SHIP_ANGLES[index];
    const rad = (angle * Math.PI) / 180;
    const shipLng = originLng + Math.sin(rad) * SHIP_SPREAD;
    const shipLat = originLat - Math.cos(rad) * SHIP_SPREAD;

    const el = document.createElement('button');
    el.type = 'button';
    el.className = `ship-bulk ${ok ? 'compatible' : 'disabled'} ${s.selectedVesselClass === vessel.id ? 'selected' : ''}`;
    el.dataset.vessel = vessel.id;
    el.title = ok
      ? `${vessel.label} · ${vessel.draftM}m draft`
      : `${vessel.label} unavailable — ${reason ?? 'incompatible'}`;
    el.style.animationDelay = `${index * 180}ms`;
    el.innerHTML = shipModelHtml(vessel);
    const label = el.querySelector('.ship-bulk-label');
    if (label) {
      label.textContent = ok
        ? vessel.label
        : `${vessel.label} · Unavailable — ${reason ?? 'incompatible'}`;
    }

    if (ok) {
      el.onclick = () => selectVesselType(vessel.id);
    }

    if (map) {
      const pt = map.project([shipLng, shipLat]);
      // Wrapper handles pixel positioning; ship-bulk keeps its own 3D transform
      const wrap = document.createElement('div');
      wrap.style.position = 'absolute';
      wrap.style.left = `${pt.x}px`;
      wrap.style.top = `${pt.y}px`;
      wrap.style.transform = 'translate(-50%, -50%)';
      wrap.style.zIndex = String(index + 10);
      map.getContainer().appendChild(wrap);
      wrap.appendChild(el);
      vesselMarkers.push({ el: wrap, remove: () => wrap.remove() } as typeof vesselMarkers[number]);
    } else {
      shipsEl.appendChild(el);
    }
  });
}

export function selectVesselType(id: VesselClass): void {
  setState({ selectedVesselClass: id, selectedVessel: null });
  drawShips();
  drawAnalysis();
  drawDrawer();
  const v = VESSEL_CLASSES.find((vc) => vc.id === id);
  if (v) flash(`${v.label} selected`);
}

export function drawDrawer(): void {
  const s = getState();
  if (!s.selectedVesselClass) return;

  const type = VESSEL_CLASSES.find((v) => v.id === s.selectedVesselClass);
  if (!type) return;
  const list = VESSEL_INSTANCES.filter((v) => v.vesselClass === s.selectedVesselClass);

  const dock = $('#vessel-dock');
  if (!dock) return;
  dock.classList.remove('hidden');
  const dockClass = $('#dock-class');
  const vesselCount = $('#vessel-count');
  const vesselList = $('#vessel-list');

  if (dockClass) dockClass.textContent = type.label;
  if (vesselCount) vesselCount.textContent = `${list.length} vessels found`;

  if (vesselList) {
    vesselList.innerHTML = list
      .map((v, i) => {
        const active = s.selectedVessel?.id === v.id || (!s.selectedVessel && i === 0);
        return `<article class="vessel-card ${active ? 'active' : ''}" data-vessel-name="${v.name}">
          <div class="mini-ship"></div>
          <div class="vessel-info">
            <span>${v.name}</span>
            <b>${v.dwt.toLocaleString()} DWT · ${v.loaM}m LOA · ${v.beamM}m beam · ${v.draftM}m draft</b>
          </div>
          <div class="vessel-rate"><b>$${(v.dailyRate / 1000).toFixed(1)}k</b><span>/day</span></div>
          <button type="button" class="select-vessel" data-select-vessel="${v.name}">${active ? 'Selected ✓' : 'Select'}</button>
        </article>`;
      })
      .join('');
  }

  // Default-select first vessel if none chosen
  if (!s.selectedVessel && list[0]) {
    setState({ selectedVessel: list[0] });
  }

  $$('[data-select-vessel]').forEach((btn) => {
    (btn as HTMLButtonElement).onclick = () => {
      const name = (btn as HTMLElement).dataset.selectVessel;
      const inst: VesselInstance | undefined = list.find((v) => v.name === name);
      if (inst) {
        setState({ selectedVessel: inst });
        drawDrawer();
        flash(`${name} selected`);
      }
    };
  });
}

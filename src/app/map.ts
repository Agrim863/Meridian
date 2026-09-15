/**
 * MapLibre GL initialization, styling, and projection handling.
 * Ported from the legacy app.js with strict TypeScript typing.
 */

import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Port } from '../data/ports';
import { TIMING } from '../utils/timing';
import { flash } from './ui/toast';
import { getState } from './state';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

const PALETTE = {
  background: '#06131D',
  ocean: '#082638',
  land: '#17252D',
  borders: '#31434B',
  route: '#F4C542',
  port: '#65D9DD',
  destination: '#F4C542',
};

const $ = (selector: string): HTMLElement | null =>
  document.querySelector(selector);

let mapInstance: MapLibreMap | null = null;
export const portMarkers: Marker[] = [];
export const vesselMarkers: { el: HTMLElement; remove: () => void }[] = [];

export function getMap(): MapLibreMap | null {
  return mapInstance;
}

/** MapLibre-internal paint helpers (silently no-op on missing/unsupported layers) */
function setPaint(id: string, prop: string, value: unknown): void {
  if (!mapInstance?.getLayer(id)) return;
  try {
    mapInstance.setPaintProperty(id, prop, value as never);
  } catch {
    /* unsupported on this layer */
  }
}

function setLayout(id: string, prop: string, value: unknown): void {
  if (!mapInstance?.getLayer(id)) return;
  try {
    mapInstance.setLayoutProperty(id, prop, value as never);
  } catch {
    /* unsupported */
  }
}

function applyMeridianStyle(): void {
  if (!mapInstance) return;
  setPaint('background', 'background-color', PALETTE.land);
  setPaint('water', 'fill-color', PALETTE.ocean);
  setPaint('waterway', 'line-color', '#0a3a4e');

  for (const id of [
    'landcover_ice_shelf',
    'landcover_glacier',
    'landuse_residential',
    'landcover_wood',
    'landuse_park',
    'building',
  ]) {
    setPaint(id, 'fill-color', PALETTE.land);
    setPaint(id, 'fill-opacity', 0.85);
  }

  for (const id of ['boundary_state', 'boundary_country_z0-4', 'boundary_country_z5-']) {
    setPaint(id, 'line-color', PALETTE.borders);
    setPaint(id, 'line-opacity', 0.55);
  }

  const style = mapInstance.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id;
    if (
      layer.type === 'line' &&
      (id.includes('highway') || id.includes('railway') || id.includes('aeroway') || id.includes('road'))
    ) {
      setPaint(id, 'line-opacity', 0.1);
      setPaint(id, 'line-color', PALETTE.borders);
    }
  }
  declutterPlaceLabels();
}

/** Hide dense local names; reveal detail only as the camera zooms in */
function declutterPlaceLabels(): void {
  if (!mapInstance) return;

  for (const id of [
    'place_other',
    'place_suburb',
    'place_village',
    'water_name',
    'highway_name_other',
    'highway_name_motorway',
    'road_oneway',
    'road_oneway_opposite',
  ]) {
    setLayout(id, 'visibility', 'none');
  }

  const ranges: Record<string, [number, number]> = {
    place_country_major: [0, 5],
    place_country_minor: [1.5, 6],
    place_country_other: [2, 6],
    place_state: [4, 8],
    place_city_large: [4.5, 10],
    place_city: [5.5, 11],
    place_town: [7, 12],
  };

  for (const [id, [minZ, maxZ]] of Object.entries(ranges)) {
    if (!mapInstance.getLayer(id)) continue;
    try {
      mapInstance.setLayerZoomRange(id, minZ, maxZ);
      setLayout(id, 'visibility', 'visible');
      setPaint(id, 'text-color', '#8aa3ad');
      setPaint(id, 'text-halo-color', PALETTE.land);
      setPaint(id, 'text-halo-width', 1.2);
      setPaint(id, 'text-opacity', 0.85);
    } catch {
      /* ignore */
    }
  }
}

export function mapInit(): void {
  const container = document.getElementById('map2d');
  if (!container) {
    flash('Map container missing');
    return;
  }

  mapInstance = new maplibregl.Map({
    container: 'map2d',
    style: MAP_STYLE,
    center: [112, 5],
    zoom: 2.8,
    minZoom: 0.8,
    maxZoom: 12,
    renderWorldCopies: false,
    attributionControl: { compact: true },
    canvasContextAttributes: { antialias: true },
  });

  mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

  mapInstance.on('error', (e: unknown) => {
    console.error('MapLibre error', e);
  });

  mapInstance.on('load', () => {
    applyMeridianStyle();
    mapInstance?.resize();
    if (mapInstance && typeof mapInstance.setProjection === 'function') {
      mapInstance.setProjection({ type: 'mercator' });
    }
  });

  mapInstance.on('style.load', () => {
    applyMeridianStyle();
    const mode = $('#app')?.dataset.mode || '2d';
    applyProjection(mode === '3d' ? 'globe' : 'mercator', false);
  });
}

export function applyProjection(type: 'mercator' | 'globe', animate = true): void {
  if (!mapInstance || typeof mapInstance.setProjection !== 'function') {
    flash('Globe projection requires MapLibre 5+');
    return;
  }

  mapInstance.setProjection({ type });

  if (type === 'globe') {
    if (typeof mapInstance.setSky === 'function') {
      mapInstance.setSky({
        'sky-color': '#06131D',
        'sky-horizon-blend': 0.12,
        'horizon-color': '#0c3a52',
        'horizon-fog-blend': 0.08,
        'fog-color': '#06131D',
        'fog-ground-blend': 0.4,
        'atmosphere-blend': [
          'interpolate',
          ['linear'],
          ['zoom'],
          0, 0.8,
          5, 0.3,
          7, 0,
        ],
      });
    }
    if (animate) {
      const currentZoom = mapInstance.getZoom();
      mapInstance.easeTo({
        zoom: Math.min(currentZoom, 2.4),
        pitch: 0,
        bearing: 0,
        duration: 900,
      });
    }
  } else if (typeof mapInstance.setSky === 'function') {
    (mapInstance as unknown as { setSky: (v: unknown) => void }).setSky(undefined);
    if (animate) {
      mapInstance.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  } else if (animate) {
    mapInstance.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }

  requestAnimationFrame(() => mapInstance?.resize());
}

/** Haversine distance in nautical miles over a LineString */
export function distanceNm(coords: [number, number][]): number {
  let n = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const p = Math.PI / 180;
    const x =
      Math.sin(((b[1] - a[1]) * p) / 2) ** 2 +
      Math.cos(a[1] * p) * Math.cos(b[1] * p) * Math.sin(((b[0] - a[0]) * p) / 2) ** 2;
    n += 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  return Math.round(n / 1.852);
}

export function clearRouteLayers(): void {
  if (!mapInstance) return;
  for (const id of ['sea-route', 'sea-route-glow']) {
    if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
  }
  if (mapInstance.getSource('sea-route')) mapInstance.removeSource('sea-route');
}

export function clearPortMarkers(): void {
  portMarkers.forEach((m) => m.remove());
  portMarkers.length = 0;
}

export function clearVesselMarkers(): void {
  vesselMarkers.forEach((m) => m.remove());
  vesselMarkers.length = 0;
  const ships = $('#ships');
  if (ships) {
    ships.classList.add('hidden');
    ships.innerHTML = '';
  }
}

export function addRouteLayers(geojson: GeoJSON.Feature<GeoJSON.LineString>): void {
  if (!mapInstance) return;
  clearRouteLayers();
  mapInstance.addSource('sea-route', { type: 'geojson', data: geojson });
  mapInstance.addLayer({
    id: 'sea-route-glow',
    type: 'line',
    source: 'sea-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': PALETTE.route,
      'line-width': 8,
      'line-blur': 4,
      'line-opacity': 0.35,
    },
  });
  mapInstance.addLayer({
    id: 'sea-route',
    type: 'line',
    source: 'sea-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': PALETTE.route,
      'line-width': 2.5,
      'line-opacity': 0.98,
    },
  });
}

export function fitVoyageOverview(duration = 1400): void {
  if (!mapInstance) return;
  const s = getState();
  if (!s.origin || !s.destination) return;
  if (s.origin.lat === null || s.origin.lng === null) return;
  if (s.destination.lat === null || s.destination.lng === null) return;
  const bounds = new maplibregl.LngLatBounds(
    [s.origin.lng, s.origin.lat],
    [s.origin.lng, s.origin.lat]
  );
  bounds.extend([s.destination.lng, s.destination.lat]);
  if (s.route?.geometry?.coordinates) {
    for (const c of s.route.geometry.coordinates) bounds.extend(c as [number, number]);
  }
  mapInstance.fitBounds(bounds, {
    padding: { top: 110, bottom: 260, left: 340, right: 340 },
    duration,
    maxZoom: 4.8,
  });
}

export function flyToPort(port: Port, zoom = 5.6): Promise<void> {
  if (!mapInstance) return Promise.resolve();
  if (port.lat === null || port.lng === null) return Promise.resolve();
  const lat: number = port.lat;
  const lng: number = port.lng;
  return new Promise<void>((resolve) => {
    mapInstance?.flyTo({
      center: [lng, lat],
      zoom,
      duration: TIMING.flyToPort,
      essential: true,
      curve: 1.2,
      speed: 0.6,
    });
    mapInstance?.once('moveend', () => resolve());
  });
}

export function portMarker(port: Port, kind: 'origin' | 'destination'): void {
  if (!mapInstance) return;
  if (port.lat === null || port.lng === null) return;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `geo-marker ${kind} pulse-in`;
  el.innerHTML = `<span class="marker-core"></span><b>${port.name}</b><small>${kind.toUpperCase()}</small>`;
  const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([port.lng, port.lat])
    .addTo(mapInstance);
  portMarkers.push(m);
}

export function renderPorts(): void {
  if (!mapInstance) return;
  clearPortMarkers();
  const s = getState();
  if (s.origin) portMarker(s.origin, 'origin');
  if (s.destination) portMarker(s.destination, 'destination');
}

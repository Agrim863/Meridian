/**
 * Maritime route calculation, water-only path loading, and route animation.
 * Mirrors the legacy app.js route logic with TypeScript types.
 */

import type { Port } from '../data/ports';
import { TIMING } from '../utils/timing';
import {
  addRouteLayers,
  clearRouteLayers,
  clearVesselMarkers,
  fitVoyageOverview,
  flyToPort,
  getMap,
} from './map';
import { flash } from './ui/toast';
import { getState, setState } from './state';
import { checkAllVesselsForVoyage } from '../lib/voyageAvailability';
import { drawShips } from './ui/vessels';
import { drawAnalysis } from './ui/intelligence';

// (RAF handle is intentionally not retained — animation runs to completion, or is
// implicitly cancelled when the route layers are cleared by the next route calculation.)

type RouteFeature = GeoJSON.Feature<GeoJSON.LineString, GeoJSON.GeoJsonProperties>;

/**
 * Water-only path from precomputed ocean A* routes (never chords across land).
 * Generated offline — see scripts/generate-routes.mjs
 */
export async function buildWaterOnlyRoute(
  origin: Port,
  destination: Port,
): Promise<RouteFeature> {
  if (origin.lat === null || origin.lng === null ||
      destination.lat === null || destination.lng === null) {
    throw new Error('Port coordinates missing');
  }

  const key = `${origin.name}->${destination.name}`;
  const reverseKey = `${destination.name}->${origin.name}`;

  const response = await fetch('/maritime-routes.json');
  if (!response.ok) throw new Error('Maritime route catalog missing');
  const catalog = (await response.json()) as Record<string, GeoJSON.Feature>;

  let feature: GeoJSON.Feature | undefined = catalog[key];
  if (!feature && catalog[reverseKey]) {
    const reverseGeom = catalog[reverseKey].geometry;
    if (reverseGeom.type === 'LineString') {
      const coords = (reverseGeom.coordinates as [number, number][])
        .slice()
        .reverse();
      feature = {
        type: 'Feature',
        properties: { ...catalog[reverseKey].properties, pair: key },
        geometry: { type: 'LineString', coordinates: coords },
      };
    }
  }
  if (!feature?.geometry || feature.geometry.type !== 'LineString') {
    throw new Error(`No water route for ${key}`);
  }
  const lineCoords = feature.geometry.coordinates as [number, number][];
  if (!lineCoords.length) {
    throw new Error(`No water route for ${key}`);
  }

  const coordinates: [number, number][] = lineCoords.map(
    (c) => [c[0], c[1]] as [number, number]
  );
  coordinates[0] = [origin.lng, origin.lat];
  coordinates[coordinates.length - 1] = [destination.lng, destination.lat];

  return {
    type: 'Feature',
    properties: { ...(feature.properties ?? {}), pair: key },
    geometry: { type: 'LineString', coordinates },
  };
}

async function onRouteAnimationComplete(): Promise<void> {
  setState({ routeAnimationComplete: true });
  flash('Voyage route complete — opening origin for vessel classes');

  const s = getState();
  if (s.origin) {
    await flyToPort(s.origin, 6.2);
  }

  // Calculate vessel availability for the complete voyage using the canonical engine
  if (s.origin && s.destination && s.cargo) {
    const avail = checkAllVesselsForVoyage(s.origin.id, s.destination.id, s.cargo);
    setState({ vesselAvailability: avail });
  }

  drawShips();
  drawAnalysis();
  flash('Select a vessel class at origin');
}

function animateRoute(): void {
  const s = getState();
  if (!s.route || s.route.geometry.type !== 'LineString') return;
  const all = s.route.geometry.coordinates as [number, number][];
  const map = getMap();
  const source = map?.getSource('sea-route') as unknown as
    | { setData: (data: RouteFeature) => void }
    | undefined;
  if (!source) return;

  const start = performance.now();
  const duration = TIMING.routeReveal;

  function frame(now: number): void {
    const t = Math.min(1, (now - start) / duration);
    // Ease-out so the end settles gently
    const eased = 1 - (1 - t) ** 2;
    const i = Math.max(2, Math.ceil(eased * all.length));
    source!.setData({
      type: 'Feature',
      properties: s.route!.properties ?? {},
      geometry: { type: 'LineString', coordinates: all.slice(0, i) },
    });
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      onRouteAnimationComplete();
    }
  }

  requestAnimationFrame(frame);
}

export async function calculateMaritimeRoute(): Promise<void> {
  const s = getState();
  if (!s.origin || !s.destination || !s.cargo) return;

  clearRouteLayers();
  setState({ route: null, routeAnimationComplete: false });
  clearVesselMarkers();

  try {
    const feature = await buildWaterOnlyRoute(s.origin, s.destination);
    setState({ route: feature });
    const coords = feature.geometry.coordinates;

    const empty: RouteFeature = {
      type: 'Feature',
      properties: feature.properties ?? {},
      geometry: { type: 'LineString', coordinates: coords.slice(0, 2) },
    };
    addRouteLayers(empty);
    fitVoyageOverview(TIMING.voyageOverview);

    setTimeout(() => animateRoute(), TIMING.afterRouteSettle);
  } catch (err) {
    console.error(err);
    flash('Unable to calculate the maritime route');
  }
}

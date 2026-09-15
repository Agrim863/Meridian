import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/** Real-world vector basemap (OpenStreetMap via OpenFreeMap) — works with MapLibre globe */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

const PALETTE = {
  background: '#06131D',
  ocean: '#082638',
  land: '#17252D',
  borders: '#31434B',
  route: '#F4C542',
  port: '#65D9DD',
  destination: '#F4C542'
};

const COUNTRY_CODE = { India: 'IN', Australia: 'AU', Mozambique: 'MZ' };

/**
 * The seven ports used by the voyage planner: two Indian, two Australian,
 * and three Mozambican ports. Keep these names aligned with maritime-routes.json.
 */
const ports = [
  ['Paradip', 'India', 20.2644, 86.6729, 14.5, 300, 46],
  ['Visakhapatnam', 'India', 17.6868, 83.2185, 14.5, 300, 50],
  ['Port Hedland', 'Australia', -20.3097, 118.5764, 19.2, 325, 58],
  ['Gladstone', 'Australia', -23.8416, 151.2500, 18.8, 320, 55],
  ['Beira', 'Mozambique', -19.8436, 34.8389, 10.0, 200, 32.8],
  ['Nacala', 'Mozambique', -14.5427, 40.6890, 15.2, 300, 45],
  ['Maputo', 'Mozambique', -25.9692, 32.5732, 12.0, 270, 38]
].map(([name, country, lat, lng, maxDraft, maxLOA, maxBeam]) => ({
  name, country, lat, lng, maxDraft, maxLOA, maxBeam, code: COUNTRY_CODE[country] || country.slice(0, 2).toUpperCase()
}));

const vesselTypes = [
  ['handysize', 'Handysize', 10.2, 180, 28, 24],
  ['supramax', 'Supramax', 13, 200, 32, 34],
  ['panamax', 'Panamax', 13.8, 225, 32.3, 46],
  ['capesize', 'Capesize', 18, 290, 45, 62]
].map(([id, name, draft, loa, beam, scale]) => ({ id, name, draft, loa, beam, scale }));

/** Camera / route timing (ms) — slowed for readable motion */
const TIMING = {
  flyToPort: 2100, // was 1400; +0.7s
  voyageOverview: 2200,
  routeReveal: 2600, // progressive LineString draw (~+1s)
  afterRouteSettle: 500,
  shipEmergeStagger: 180
};

const MOCK_VESSELS = {
  handysize: [
    { name: 'MV Coastal Pearl', dwt: 35000, loa: 178, draft: 10.0 },
    { name: 'MV Bay Runner', dwt: 38000, loa: 180, draft: 10.1 },
    { name: 'MV Harbour Light', dwt: 32000, loa: 175, draft: 9.8 }
  ],
  supramax: [
    { name: 'MV Ocean Trader', dwt: 58000, loa: 190, draft: 12.8 },
    { name: 'MV Pacific Star', dwt: 56000, loa: 189, draft: 12.6 },
    { name: 'MV Eastern Wind', dwt: 61000, loa: 199, draft: 12.9 }
  ],
  panamax: [
    { name: 'MV Meridian Bulk', dwt: 75000, loa: 225, draft: 13.2 },
    { name: 'MV Coral Bridge', dwt: 78000, loa: 225, draft: 13.5 },
    { name: 'MV Southern Cross', dwt: 74000, loa: 222, draft: 13.1 }
  ],
  capesize: [
    { name: 'MV Iron Giant', dwt: 180000, loa: 289, draft: 17.8 },
    { name: 'MV Cape Horizon', dwt: 175000, loa: 288, draft: 17.5 },
    { name: 'MV Ore Pathfinder', dwt: 182000, loa: 290, draft: 18.0 }
  ]
};

const state = {
  origin: null,
  destination: null,
  cargo: null,
  cargoQuantity: null,
  route: null,
  routeAnimationComplete: false,
  selectedVesselType: null,
  selectedVessel: null
};

let map = null;
let portMarkers = [];
let vesselMarkers = [];
let animFrame = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const FREIGHT_API_URL = '/api/freight-prediction';
const CARGO_API_MAP = {
  ironOre: 'Iron Ore',
  thermalCoal: 'Coal',
  cokingCoal: 'Coal',
  fertilizer: 'Fertilizer',
  manganeseOre: 'Manganese Ore'
};
const VESSEL_API_MAP = {
  handysize: 'Handysize',
  supramax: 'Supramax',
  panamax: 'Panamax',
  capesize: 'Capesize'
};

let freightRequestId = 0;
let freightData = null;

function flash(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function setPaint(id, prop, value) {
  if (!map?.getLayer(id)) return;
  try {
    map.setPaintProperty(id, prop, value);
  } catch {
    /* unsupported on this layer */
  }
}

function setLayout(id, prop, value) {
  if (!map?.getLayer(id)) return;
  try {
    map.setLayoutProperty(id, prop, value);
  } catch {
    /* unsupported */
  }
}

function applyMeridianStyle() {
  if (!map) return;

  // OpenFreeMap dark: background ≈ land, water is a fill over real coastlines
  setPaint('background', 'background-color', PALETTE.land);
  setPaint('water', 'fill-color', PALETTE.ocean);
  setPaint('waterway', 'line-color', '#0a3a4e');

  for (const id of [
    'landcover_ice_shelf',
    'landcover_glacier',
    'landuse_residential',
    'landcover_wood',
    'landuse_park',
    'building'
  ]) {
    setPaint(id, 'fill-color', PALETTE.land);
    setPaint(id, 'fill-opacity', 0.85);
  }

  for (const id of ['boundary_state', 'boundary_country_z0-4', 'boundary_country_z5-']) {
    setPaint(id, 'line-color', PALETTE.borders);
    setPaint(id, 'line-opacity', 0.55);
  }

  const style = map.getStyle();
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

  // Zoom-aware labels: continents/countries when zoomed out; cities only when closer
  declutterPlaceLabels();
}

/** Hide dense local names; reveal detail only as the camera zooms in */
function declutterPlaceLabels() {
  if (!map) return;

  // Hide noisy local / water labels entirely for this product UI
  for (const id of [
    'place_other',
    'place_suburb',
    'place_village',
    'water_name',
    'highway_name_other',
    'highway_name_motorway',
    'road_oneway',
    'road_oneway_opposite'
  ]) {
    setLayout(id, 'visibility', 'none');
  }

  // Progressive place hierarchy (minzoom → maxzoom)
  const ranges = {
    place_country_major: [0, 5],
    place_country_minor: [1.5, 6],
    place_country_other: [2, 6],
    place_state: [4, 8],
    place_city_large: [4.5, 10],
    place_city: [5.5, 11],
    place_town: [7, 12]
  };

  for (const [id, [minZ, maxZ]] of Object.entries(ranges)) {
    if (!map.getLayer(id)) continue;
    try {
      map.setLayerZoomRange(id, minZ, maxZ);
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

function mapInit() {
  const container = document.getElementById('map2d');
  if (!container) {
    flash('Map container missing');
    return;
  }

  map = new maplibregl.Map({
    container: 'map2d',
    style: MAP_STYLE,
    center: [112, 5],
    zoom: 2.8,
    minZoom: 0.8,
    maxZoom: 12,
    renderWorldCopies: false,
    attributionControl: { compact: true },
    canvasContextAttributes: { antialias: true }
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

  map.on('error', (e) => {
    console.error('MapLibre error', e?.error || e);
  });

  map.on('load', () => {
    applyMeridianStyle();
    map.resize();
    // Default to mercator; globe is applied when user toggles 3D
    if (typeof map.setProjection === 'function') {
      map.setProjection({ type: 'mercator' });
    }
  });

  map.on('style.load', () => {
    applyMeridianStyle();
    // Re-apply projection after style reload (required for globe)
    const mode = $('#app')?.dataset.mode || '2d';
    applyProjection(mode === '3d' ? 'globe' : 'mercator', false);
  });
}

function applyProjection(type, animate = true) {
  if (!map || typeof map.setProjection !== 'function') {
    flash('Globe projection requires MapLibre 5+');
    return;
  }

  map.setProjection({ type });

  if (type === 'globe') {
    // MapLibre 5+: atmosphere uses setSky (setFog was removed)
    if (typeof map.setSky === 'function') {
      map.setSky({
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
          0,
          0.8,
          5,
          0.3,
          7,
          0
        ]
      });
    }
    if (animate) {
      map.easeTo({
        zoom: Math.min(map.getZoom(), 2.4),
        pitch: 0,
        bearing: 0,
        duration: 900
      });
    }
  } else if (typeof map.setSky === 'function') {
    map.setSky(undefined);
    if (animate) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  } else if (animate) {
    map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }

  requestAnimationFrame(() => map.resize());
}

function distanceNm(coords) {
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

function clearRouteLayers() {
  if (!map) return;
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  for (const id of ['sea-route', 'sea-route-glow']) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource('sea-route')) map.removeSource('sea-route');
}

function clearPortMarkers() {
  portMarkers.forEach((m) => m.remove());
  portMarkers = [];
}

function clearVesselMarkers() {
  vesselMarkers.forEach((m) => m.remove());
  vesselMarkers = [];
  const ships = $('#ships');
  if (ships) {
    ships.classList.add('hidden');
    ships.innerHTML = '';
  }
}

function resetVoyageDownstream() {
  state.cargo = null;
  state.cargoQuantity = null;
  state.route = null;
  state.routeAnimationComplete = false;
  state.selectedVesselType = null;
  state.selectedVessel = null;
  clearRouteLayers();
  clearVesselMarkers();
  $('#intelligence')?.classList.add('hidden');
  $('#vessel-dock')?.classList.add('hidden');
  $('#cargo-step')?.classList.add('hidden');
  $('#planner')?.classList.remove('hidden');
}

function portMarker(port, kind) {
  if (!map) return;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `geo-marker ${kind} pulse-in`;
  el.innerHTML = `<span class="marker-core"></span><b>${port.name} · ${port.code}</b><small>${kind.toUpperCase()}</small>`;
  const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([port.lng, port.lat])
    .addTo(map);
  portMarkers.push(m);
}

function renderPorts() {
  if (!map) return;
  clearPortMarkers();
  if (state.origin) portMarker(state.origin, 'origin');
  if (state.destination) portMarker(state.destination, 'destination');
}

function addRouteLayers(geojson) {
  clearRouteLayers();
  map.addSource('sea-route', { type: 'geojson', data: geojson });
  map.addLayer({
    id: 'sea-route-glow',
    type: 'line',
    source: 'sea-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': PALETTE.route,
      'line-width': 8,
      'line-blur': 4,
      'line-opacity': 0.35
    }
  });
  map.addLayer({
    id: 'sea-route',
    type: 'line',
    source: 'sea-route',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': PALETTE.route,
      'line-width': 2.5,
      'line-opacity': 0.98
    }
  });
}

function fitVoyageOverview(duration = 1400) {
  if (!map || !state.origin || !state.destination) return;
  const bounds = new maplibregl.LngLatBounds(
    [state.origin.lng, state.origin.lat],
    [state.origin.lng, state.origin.lat]
  );
  bounds.extend([state.destination.lng, state.destination.lat]);
  if (state.route?.geometry?.coordinates) {
    for (const c of state.route.geometry.coordinates) bounds.extend(c);
  }
  map.fitBounds(bounds, {
    padding: { top: 110, bottom: 260, left: 340, right: 340 },
    duration,
    maxZoom: 4.8
  });
}

function flyToPort(port, zoom = 5.6) {
  if (!map) return Promise.resolve();
  return new Promise((resolve) => {
    map.flyTo({
      center: [port.lng, port.lat],
      zoom,
      duration: TIMING.flyToPort,
      essential: true,
      curve: 1.2,
      speed: 0.6
    });
    map.once('moveend', () => resolve());
  });
}

function options(kind, query = '') {
  const q = query.toLowerCase();
  return ports
    .filter((p) => {
      if (p === state.origin || p === state.destination) return false;
      if (kind === 'destination' && state.origin && p.country === state.origin.country) return false;
      if (kind === 'origin' && state.destination && p.country === state.destination.country) return false;
      return p.name.toLowerCase().includes(q);
    })
    .map(
      (p) =>
        `<button type="button" data-${kind}="${p.name}"><b>${p.name}</b><small>${p.country} · ${p.lat.toFixed(2)}°, ${p.lng.toFixed(2)}°</small></button>`
    )
    .join('');
}

function wireResults(kind) {
  $$(`[data-${kind}]`).forEach((b) => {
    b.onclick = () => selectPort(kind, b.dataset[kind]);
  });
}

function confirmedPortHtml(port) {
  return `<div class="selected-port"><b>✓ ${port.name}</b><small>${port.country} · ${port.code} · ${port.lat.toFixed(2)}°, ${port.lng.toFixed(2)}°</small></div>`;
}

function drawSearches() {
  const originEl = $('#origin-results');
  const destEl = $('#destination-results');

  if (state.origin) {
    originEl.innerHTML = confirmedPortHtml(state.origin);
    $('#origin-search').classList.add('hidden');
    $('#origin-step .step-dot').classList.remove('active');
    $('#origin-step .step-dot').classList.add('done');
    $('#origin-step .step-dot').textContent = '✓';
  } else {
    originEl.innerHTML = options('origin', $('#origin-search').value);
    $('#origin-search').classList.remove('hidden');
    wireResults('origin');
  }

  if (state.destination) {
    destEl.innerHTML = confirmedPortHtml(state.destination);
    $('#destination-search').classList.add('hidden');
    $('#destination-step .step-dot').classList.remove('active');
    $('#destination-step .step-dot').classList.add('done');
    $('#destination-step .step-dot').textContent = '✓';
  } else if (!$('#destination-step').classList.contains('hidden')) {
    destEl.innerHTML = options('destination', $('#destination-search').value);
    $('#destination-search').classList.remove('hidden');
    wireResults('destination');
  }
}

async function selectPort(kind, name) {
  const port = ports.find((p) => p.name === name);
  if (!port) return;

  if (kind === 'origin') {
    const originChanged = state.origin && state.origin.name !== port.name;
    state.origin = port;
    if (originChanged) resetVoyageDownstream();
    if (state.destination && state.destination.country === port.country) {
      state.destination = null;
      resetVoyageDownstream();
    }

    $('#welcome').classList.add('hidden');
    $('#planner').classList.remove('hidden');
    $('#origin-step').classList.remove('hidden');
    $('#destination-step').classList.remove('hidden');
    if (!state.destination) $('#cargo-step').classList.add('hidden');
    drawSearches();
    renderPorts();
    clearVesselMarkers();
    await flyToPort(port, 5.5);
    $('#destination-search')?.focus();
  } else {
    if (state.destination && state.destination.name !== port.name) {
      resetVoyageDownstream();
    }
    state.destination = port;
    state.cargo = null;
    state.route = null;
    state.routeAnimationComplete = false;
    state.selectedVesselType = null;
    state.selectedVessel = null;
    clearRouteLayers();
    clearVesselMarkers();
    $('#intelligence')?.classList.add('hidden');
    $('#vessel-dock')?.classList.add('hidden');

    $('#planner').classList.remove('hidden');
    $('#destination-step').classList.remove('hidden');
    $('#cargo-step').classList.remove('hidden');
    const cargoDot = $('#cargo-step .step-dot');
    cargoDot.classList.add('active');
    cargoDot.classList.remove('done');
    cargoDot.textContent = '3';
    drawSearches();
    renderPorts();
    await flyToPort(port, 5.5);
    fitVoyageOverview(TIMING.voyageOverview);
    flash('Destination confirmed — select cargo to calculate voyage');
  }
}

function constrainingPorts() {
  return [state.origin, state.destination].filter(Boolean).map((port) => {
    // Prototype: slightly tighter destination limits so 1–2 classes gray out with clear reasons
    if (state.destination && port.name === state.destination.name) {
      return {
        ...port,
        maxDraft: Math.min(port.maxDraft, 14.0),
        maxLOA: Math.min(port.maxLOA, 220)
      };
    }
    return port;
  });
}

function compatibilityIssues(vessel) {
  const issues = [];
  for (const port of constrainingPorts()) {
    if (vessel.draft > port.maxDraft) {
      issues.push({
        port: port.name,
        metric: 'Draft',
        value: vessel.draft,
        limit: port.maxDraft,
        message: `Draft ${vessel.draft.toFixed(1)} m exceeds ${port.name} limit ${port.maxDraft.toFixed(1)} m`
      });
    }
    if (vessel.loa > port.maxLOA) {
      issues.push({
        port: port.name,
        metric: 'LOA',
        value: vessel.loa,
        limit: port.maxLOA,
        message: `LOA ${vessel.loa.toFixed(1)} m exceeds ${port.name} berth limit ${port.maxLOA.toFixed(1)} m`
      });
    }
    if (vessel.beam > port.maxBeam) {
      issues.push({
        port: port.name,
        metric: 'Beam',
        value: vessel.beam,
        limit: port.maxBeam,
        message: `Beam ${vessel.beam.toFixed(1)} m exceeds ${port.name} limit ${port.maxBeam.toFixed(1)} m`
      });
    }
  }
  return issues;
}

function compatible(vessel) {
  return compatibilityIssues(vessel).length === 0;
}

function issueSummary(vessel) {
  const issues = compatibilityIssues(vessel);
  return issues[0]?.message || 'Incompatible';
}

function animateRoute() {
  if (!map || !state.route) return;
  const all = state.route.geometry.coordinates;
  const source = map.getSource('sea-route');
  if (!source) return;

  const start = performance.now();
  const duration = TIMING.routeReveal;

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    // Ease-out so the end of the voyage settles gently
    const eased = 1 - (1 - t) ** 2;
    const i = Math.max(2, Math.ceil(eased * all.length));
    source.setData({
      type: 'Feature',
      properties: state.route.properties || {},
      geometry: { type: 'LineString', coordinates: all.slice(0, i) }
    });
    if (t < 1) {
      animFrame = requestAnimationFrame(frame);
    } else {
      animFrame = null;
      onRouteAnimationComplete();
    }
  }

  animFrame = requestAnimationFrame(frame);
}

async function onRouteAnimationComplete() {
  state.routeAnimationComplete = true;
  flash('Voyage route complete — opening origin for vessel classes');
  if (state.origin && map) {
    await flyToPort(state.origin, 6.2);
  }
  await drawShips();
  flash('Select a vessel class at origin');
}

/**
 * Water-only path from precomputed ocean A* routes (never chords across land).
 * Generated offline with @arcnautical/maritime-routing — see scripts/generate-routes.mjs
 */
async function buildWaterOnlyRoute(origin, destination) {
  const key = `${origin.name}->${destination.name}`;
  const reverseKey = `${destination.name}->${origin.name}`;

  const response = await fetch('/maritime-routes.json');
  if (!response.ok) throw new Error('Maritime route catalog missing');
  const catalog = await response.json();

  let feature = catalog[key];
  if (!feature && catalog[reverseKey]) {
    const coords = catalog[reverseKey].geometry.coordinates.slice().reverse();
    feature = {
      type: 'Feature',
      properties: { ...catalog[reverseKey].properties, pair: key },
      geometry: { type: 'LineString', coordinates: coords }
    };
  }
  if (!feature?.geometry?.coordinates?.length) {
    throw new Error(`No water route for ${key}`);
  }

  const coordinates = feature.geometry.coordinates.map((c) => [c[0], c[1]]);
  coordinates[0] = [origin.lng, origin.lat];
  coordinates[coordinates.length - 1] = [destination.lng, destination.lat];

  return {
    type: 'Feature',
    properties: { ...(feature.properties || {}), pair: key },
    geometry: { type: 'LineString', coordinates }
  };
}

async function calculateMaritimeRoute() {
  if (!state.origin || !state.destination || !state.cargo) return;

  clearRouteLayers();
  state.route = null;
  state.routeAnimationComplete = false;
  clearVesselMarkers();

  try {
    const feature = await buildWaterOnlyRoute(state.origin, state.destination);
    state.route = feature;
    const coords = feature.geometry.coordinates;

    if (!map) {
      state.routeAnimationComplete = true;
      drawShips();
      drawAnalysis();
      return;
    }

    const empty = {
      type: 'Feature',
      properties: feature.properties || {},
      geometry: { type: 'LineString', coordinates: coords.slice(0, 2) }
    };
    addRouteLayers(empty);
    fitVoyageOverview(TIMING.voyageOverview);
    setTimeout(() => animateRoute(), TIMING.afterRouteSettle);
  } catch (err) {
    console.error(err);
    flash('Unable to calculate the maritime route');
  }
}

const SHIP_MODEL_SRC = '/models/bulk-carrier.glb';

// These are deliberately small map objects. The four classes sit together just
// offshore of the origin rather than behaving like UI cards.
const SHIP_MODEL_VIEW = {
  handysize: { width: 88, height: 53, camera: '34deg 24deg 25m', visualScale: 1.19 },
  supramax:  { width: 99, height: 59, camera: '30deg 22deg 25m', visualScale: 1.30 },
  panamax:   { width: 113, height: 65, camera: '26deg 20deg 25m', visualScale: 1.43 },
  capesize:  { width: 126, height: 71, camera: '22deg 18deg 25m', visualScale: 1.55 }
};

function ensureModelViewerReady() {
  if (customElements.get('model-viewer')) return Promise.resolve();
  return customElements.whenDefined('model-viewer');
}

/**
 * Keep the four small vessel-class models close to the origin and on the
 * offshore side of the port. Positions follow the first leg of the actual
 * water route, with only a small stagger so the models never form a huge row.
 */
function getShipLineupPositions() {
  if (!state.origin || !map) return [];

  const originPoint = map.project([state.origin.lng, state.origin.lat]);
  const coords = state.route?.geometry?.coordinates || [];
  let heading = { x: 0, y: -1 };

  if (coords.length >= 2) {
    // Use a point a little farther along the route for a stable offshore heading.
    const next = map.project(coords[Math.min(6, coords.length - 1)]);
    const dx = next.x - originPoint.x;
    const dy = next.y - originPoint.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 0.5) heading = { x: dx / magnitude, y: dy / magnitude };
  }

  const perpendicular = { x: -heading.y, y: heading.x };
  // Pushed much further offshore (along the actual sea route's heading,
  // which is guaranteed to be water) so the whole lineup clears the
  // coastline instead of landing on it. All four still sit at the same
  // offshore distance so their on-screen separation is governed purely by
  // the lateral spacing below (independent of route heading/screen angle).
  // Lateral gaps grow with each vessel's larger rendered footprint
  // (handysize 88x71 ... capesize 126x89, see SHIP_MODEL_VIEW) so
  // neighbouring hulls never overlap.
  const forwardPx = [150, 150, 150, 150];
  const lateralPx = [-213, -85, 56, 212];

  return forwardPx.map((forward, index) => {
    const point = {
      x: originPoint.x + heading.x * forward + perpendicular.x * lateralPx[index],
      y: originPoint.y + heading.y * forward + perpendicular.y * lateralPx[index]
    };
    const lngLat = map.unproject([point.x, point.y]);
    return { lng: lngLat.lng, lat: lngLat.lat };
  });
}

function createShipMarker(vessel, ok, index) {
  const view = SHIP_MODEL_VIEW[vessel.id] || SHIP_MODEL_VIEW.panamax;
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.className = `ship-marker-3d ${ok ? 'compatible' : 'disabled'} ${state.selectedVesselType === vessel.id ? 'selected' : ''}`;
  marker.dataset.vessel = vessel.id;
  marker.style.width = `${view.width}px`;
  marker.style.height = `${view.height + 18}px`;
  marker.title = ok ? `${vessel.name} · ${vessel.draft}m draft` : issueSummary(vessel);
  marker.setAttribute('aria-label', ok ? `${vessel.name}, compatible` : `${vessel.name}, incompatible: ${issueSummary(vessel)}`);

  // IMPORTANT: `marker` itself is the element MapLibre positions via an
  // inline `transform` on every render/pan/zoom. A CSS animation on that
  // same element's `transform` (fill-mode both) permanently wins the
  // cascade over MapLibre's inline transform, which is why the ships were
  // stuck at the marker layer's default (top-left) position instead of the
  // origin port. The "emerge" entrance animation now runs on this inner
  // wrapper instead, leaving the outer marker's transform free for MapLibre.
  const inner = document.createElement('div');
  inner.className = 'ship-marker-inner';
  inner.style.animationDelay = `${index * TIMING.shipEmergeStagger}ms`;

  const model = document.createElement('model-viewer');
  model.setAttribute('src', SHIP_MODEL_SRC);
  model.setAttribute('alt', `${vessel.name} bulk carrier 3D model`);
  // The source model's up-axis is Z (bow/hull length on X, beam on Y, mast
  // height on Z), but model-viewer expects a Y-up asset. model-viewer's
  // `orientation` attribute is "roll pitch yaw" (roll = about Z, pitch =
  // about X, yaw = about Y) — the earlier version of this code put the
  // -90deg in the ROLL slot, which actually rotated about Z and swung the
  // hull's *length* axis onto Y, making the ship stand on its bow (the
  // "pointing straight down into the water" bug). The correction belongs in
  // the PITCH slot (rotate -90deg about X) so the model's real "up" (old Z)
  // maps onto Y and the hull ends up lying flat/horizontal, floating.
  model.setAttribute('orientation', '0deg -90deg 0deg');
  model.setAttribute('camera-orbit', view.camera);
  model.setAttribute('camera-target', '0m 1m 0m');
  model.setAttribute('field-of-view', '30deg');
  model.setAttribute('exposure', '1.05');
  model.setAttribute('shadow-intensity', '0.55');
  model.setAttribute('shadow-softness', '1');
  model.setAttribute('interaction-prompt', 'none');
  model.setAttribute('disable-zoom', '');
  model.setAttribute('disable-pan', '');
  model.setAttribute('auto-rotate', '');
  model.setAttribute('rotation-per-second', '4deg');
  model.setAttribute('auto-rotate-delay', '0');
  model.style.width = '100%';
  model.style.height = `${view.height}px`;
  model.style.pointerEvents = 'none';
  model.style.setProperty('--ship-visual-scale', String(view.visualScale));

  const label = document.createElement('span');
  label.className = 'ship-model-label';
  label.innerHTML = `<b>${vessel.name}</b><small>${ok ? `${vessel.draft.toFixed(1)}m draft · compatible` : `✕ ${issueSummary(vessel)}`}</small>`;

  inner.append(model, label);
  marker.append(inner);
  if (ok) marker.addEventListener('click', () => selectVesselType(vessel.id));

  return marker;
}

async function drawShips() {
  if (!state.routeAnimationComplete || !state.origin || !map) return;

  clearVesselMarkers();
  const shipsEl = $('#ships');
  shipsEl.classList.remove('hidden');
  shipsEl.setAttribute('aria-hidden', 'false');
  shipsEl.innerHTML = '';

  await ensureModelViewerReady();
  if (!state.routeAnimationComplete || !state.origin || !map) return;

  const positions = getShipLineupPositions();
  vesselTypes.forEach((vessel, index) => {
    const ok = compatible(vessel);
    const el = createShipMarker(vessel, ok, index);
    const position = positions[index] || { lng: state.origin.lng, lat: state.origin.lat };
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([position.lng, position.lat])
      .addTo(map);
    vesselMarkers.push(marker);
  });
}

function selectVesselType(id) {
  state.selectedVesselType = id;
  state.selectedVessel = null;
  drawShips();
  drawAnalysis();
  drawDrawer();
  flash(`${vesselTypes.find((v) => v.id === id).name} selected`);
}

async function drawAnalysis() {
  if (!(state.route && state.cargo && state.routeAnimationComplete && state.selectedVesselType)) return;
  const type = vesselTypes.find((v) => v.id === state.selectedVesselType);
  if (!type || !state.origin || !state.destination) return;

  const quantity = Number(state.cargoQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    flash('Enter cargo quantity to view freight intelligence');
    return;
  }

  const requestId = ++freightRequestId;
  const intel = $('#intelligence');
  intel.classList.remove('hidden');
  intel.classList.remove('expanded');
  intel.setAttribute('aria-expanded', 'false');
  $('#intel-toggle').setAttribute('aria-expanded', 'false');
  const toggleIcon = $('#intel-toggle b');
  if (toggleIcon) toggleIcon.textContent = '⌄';
  $('#spot-rate').textContent = '…';
  $('#spot-change').textContent = 'CALCULATING';
  $('#forecast-month1').textContent = '—';
  $('#forecast-month2').textContent = '—';
  $('#recommendation-title').textContent = 'Analysing market';
  $('#recommendation-reason').textContent = 'Running the freight model and decision engine.';

  const cargoLabel = {
    ironOre: 'IRON ORE', thermalCoal: 'COAL', cokingCoal: 'COAL',
    fertilizer: 'FERTILIZER', manganeseOre: 'MANGANESE ORE'
  }[state.cargo] || String(state.cargo).toUpperCase();
  $('#intel-title').innerHTML = `<small>${type.name.toUpperCase()} · ${cargoLabel}</small>${state.origin.name} <i>→</i> ${state.destination.name}`;

  try {
    const response = await fetch(FREIGHT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin_port: state.origin.name,
        destination_port: state.destination.name,
        cargo: CARGO_API_MAP[state.cargo],
        vessel_type: VESSEL_API_MAP[state.selectedVesselType],
        cargo_quantity_t: quantity
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Freight service unavailable');
    if (requestId !== freightRequestId) return;
    freightData = data;
    renderFreightIntelligence(data);
  } catch (error) {
    console.error(error);
    if (requestId !== freightRequestId) return;
    freightData = null;
    $('#spot-rate').textContent = '—';
    $('#forecast-month1').textContent = '—';
    $('#forecast-month2').textContent = '—';

    const message = String(error?.message || '');
    if (message.toLowerCase().includes('unsupported freight lane')) {
      $('#spot-change').textContent = 'UNSUPPORTED LANE';
      $('#spot-change').className = 'neutral';
      $('#recommendation-title').textContent = 'Freight lane not supported';
      $('#recommendation-reason').textContent = 'This prototype forecasts overseas → East Coast India procurement routes.';
    } else {
      $('#spot-change').textContent = 'MODEL OFFLINE';
      $('#spot-change').className = '';
      $('#recommendation-title').textContent = 'Freight model unavailable';
      $('#recommendation-reason').textContent = 'Start the freight prediction service to populate this panel.';
    }
  }
}

function money(value) {
  return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function rate(value) {
  return `$${Number(value).toFixed(2)} <small>/ MT</small>`;
}

function renderFreightIntelligence(data) {
  const current = Number(data.current_freight_usd_t);
  const m1 = Number(data.forecast_plus_1_usd_t);
  const m2 = Number(data.forecast_plus_2_usd_t);
  const quantity = Number(data.cargo_quantity_t || state.cargoQuantity || 0);
  const d1 = m1 - current;
  const d2 = m2 - current;
  const direction = d1 > 0.05 ? '↗ Rising' : d1 < -0.05 ? '↘ Easing' : '→ Stable';
  const directionClass = d1 > 0.05 ? 'positive' : d1 < -0.05 ? 'negative' : 'neutral';

  $('#spot-rate').innerHTML = rate(current);
  $('#spot-change').textContent = `${direction} next month`;
  $('#spot-change').className = directionClass;
  $('#forecast-month1').innerHTML = rate(m1);
  $('#forecast-month2').innerHTML = rate(m2);
  $('#detail-current').innerHTML = rate(current);
  $('#detail-month1').innerHTML = rate(m1);
  $('#detail-month2').innerHTML = rate(m2);
  $('#total-current').textContent = money(data.current_total_freight_usd);
  $('#total-month1').textContent = money(m1 * quantity);
  $('#total-month2').textContent = money(m2 * quantity);
  $('#cost-breakdown').textContent = `${quantity.toLocaleString('en-US')} t × ${rate(current).replace(' <small>/ MT</small>', '/t')}`;
  renderFreightChart(current, m1, m2);

  const rec = data.decision || {};
  const recTitle = rec.title || 'Review freight timing';
  const recCard = $('#recommendation-card');
  if (recCard) {
    recCard.classList.remove('rec-lock', 'rec-wait', 'rec-monitor');
    const lower = recTitle.toLowerCase();
    recCard.classList.add(lower.includes('lock') ? 'rec-lock' : lower.includes('wait') ? 'rec-wait' : 'rec-monitor');
  }
  $('#recommendation-title').textContent = recTitle;
  $('#recommendation-reason').textContent = rec.short_reason || 'No strong near-term signal.';
  $('#decision-market').textContent = rec.market_signal || direction;
  $('#decision-move').textContent = rec.near_term_move || (d1 > 0 ? 'Higher' : d1 < 0 ? 'Lower' : 'Flat');
  $('#decision-economics').textContent = rec.economic_signal || 'Voyage cost considered';
  $('#decision-explanation').textContent = rec.explanation || 'The recommendation combines the current freight estimate with the near-term market movement.';
}


function renderFreightChart(current, month1, month2) {
  const el = $('#freight-chart');
  if (!el) return;
  const values = [current, month1, month2].map(Number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.9, 0.75);
  const lo = min - pad;
  const hi = max + pad;
  const width = 760, height = 190;
  const xs = [70, width / 2, width - 70];
  const y = (v) => 145 - ((v - lo) / (hi - lo)) * 100;
  const points = values.map((v, i) => `${xs[i]},${y(v).toFixed(1)}`).join(' ');
  const labels = ['NOW', '+1 MONTH', '+2 MONTHS'];
  const grid = [0, .5, 1].map((r) => {
    const gy = 145 - r * 100;
    return `<line x1="50" y1="${gy}" x2="710" y2="${gy}" stroke="rgba(156,206,218,.13)" stroke-width="1"/>`;
  }).join('');
  const circles = values.map((v, i) => `
    <circle cx="${xs[i]}" cy="${y(v).toFixed(1)}" r="7" fill="#65d9dd" stroke="#d8ffff" stroke-width="3"/>
    <text x="${xs[i]}" y="${(y(v) - 16).toFixed(1)}" text-anchor="middle" fill="#eefcfd" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700">$${v.toFixed(2)}</text>
    <text x="${xs[i]}" y="174" text-anchor="middle" fill="#7f9da5" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700">${labels[i]}</text>
  `).join('');
  el.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Freight rate outlook">
    ${grid}
    <polyline points="${points}" fill="none" stroke="#65d9dd" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    ${circles}
  </svg>`;
}

function toggleIntelligence() {
  const intel = $('#intelligence');
  if (!intel || intel.classList.contains('hidden')) return;
  const expanded = intel.classList.toggle('expanded');
  intel.setAttribute('aria-expanded', String(expanded));
  $('#intel-toggle')?.setAttribute('aria-expanded', String(expanded));
  const toggleIcon = $('#intel-toggle b');
  if (toggleIcon) toggleIcon.textContent = expanded ? '×' : '⌄';
}

function drawDrawer() {
  if (!state.selectedVesselType) return;
  const type = vesselTypes.find((v) => v.id === state.selectedVesselType);
  const list = MOCK_VESSELS[state.selectedVesselType] || [];

  $('#vessel-dock').classList.remove('hidden');
  $('#dock-class').textContent = type.name;
  $('#vessel-count').textContent = `${list.length} vessels found`;
  $('#vessel-list').innerHTML = list
    .map((v, i) => {
      const active =
        state.selectedVessel?.name === v.name || (!state.selectedVessel && i === 0);
      return `<article class="vessel-card ${active ? 'active' : ''}" data-vessel-name="${v.name}">
        <div class="mini-ship"></div>
        <div class="vessel-info">
          <span>${v.name}</span>
          <b>${v.dwt.toLocaleString()} DWT · ${v.loa}m LOA · ${v.draft}m draft</b>
        </div>
        <button type="button" class="select-vessel" data-select-vessel="${v.name}">${active ? 'Selected ✓' : 'Select'}</button>
      </article>`;
    })
    .join('');

  // Default-select first vessel if none chosen
  if (!state.selectedVessel && list[0]) {
    state.selectedVessel = list[0];
  }

  $$('[data-select-vessel]').forEach((btn) => {
    btn.onclick = () => {
      const name = btn.dataset.selectVessel;
      state.selectedVessel = list.find((v) => v.name === name) || null;
      drawDrawer();
      flash(`${name} selected`);
    };
  });
}

function onCargoSelected(cargoId) {
  state.cargo = cargoId;
  state.cargoQuantity = null;
  state.route = null;
  state.routeAnimationComplete = false;
  state.selectedVesselType = null;
  state.selectedVessel = null;
  freightData = null;
  clearVesselMarkers();
  clearRouteLayers();
  $('#intelligence').classList.add('hidden');
  $('#vessel-dock').classList.add('hidden');

  $$('.cargo-options button').forEach((b) => b.classList.toggle('selected', b.dataset.cargo === cargoId));
  $('#cargo-quantity-wrap')?.classList.remove('hidden');
  const qty = $('#cargo-quantity');
  if (qty) { qty.value = ''; qty.focus(); }
  $('#cargo-step .step-dot').classList.add('active');
  $('#cargo-step .step-dot').classList.remove('done');
  $('#cargo-step .step-dot').textContent = '3';
}

function continueFromCargo() {
  const qty = Number($('#cargo-quantity')?.value);
  if (!state.cargo) { flash('Select a cargo type first'); return; }
  if (!Number.isFinite(qty) || qty <= 0) { flash('Enter cargo quantity in tonnes'); return; }
  state.cargoQuantity = qty;
  $('#cargo-step .step-dot').classList.remove('active');
  $('#cargo-step .step-dot').classList.add('done');
  $('#cargo-step .step-dot').textContent = '✓';
  $('#cargo-quantity-wrap')?.classList.add('hidden');
  $('#planner').classList.add('hidden');
  flash('Cargo confirmed — calculating maritime route');
  void calculateMaritimeRoute();
}

function setMapMode(mode) {
  $$('.mode').forEach((x) => x.classList.toggle('active', x.dataset.mode === mode));
  $('#app').dataset.mode = mode;
  applyProjection(mode === '3d' ? 'globe' : 'mercator', true);
}

// ——— Wire UI ———
$('#welcome-action').onclick = () => {
  $('#welcome').classList.add('hidden');
  $('#origin-search').focus();
};

['origin', 'destination'].forEach((k) => {
  $(`#${k}-search`).oninput = (e) => {
    $(`#${k}-results`).innerHTML = options(k, e.target.value);
    wireResults(k);
  };
});

$$('[data-cargo]').forEach((b) => {
  b.onclick = () => onCargoSelected(b.dataset.cargo);
});

$$('.mode').forEach((b) => {
  b.onclick = () => setMapMode(b.dataset.mode);
});

$('#cargo-continue')?.addEventListener('click', continueFromCargo);
$('#intel-toggle')?.addEventListener('click', toggleIntelligence);

window.addEventListener('load', () => {
  mapInit();
  drawSearches();
});

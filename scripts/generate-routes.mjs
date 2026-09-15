/**
 * Precompute water-only port-to-port routes (ocean A*).
 * Run: node scripts/generate-routes.mjs
 *
 * Generates all CROSS-COUNTRY routes (never same-country pairs).
 * Countries: India (2 ports), Australia (2 ports), Mozambique (3 ports) = 16 routes total.
 */
import { findOceanPath } from '@arcnautical/maritime-routing';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** [name, lat, lng, country] — kept in sync with src/data/ports.ts */
const ports = [
  ['Paradip',       20.2644,  86.6729, 'India'],
  ['Visakhapatnam', 17.6868,  83.2185, 'India'],
  ['Port Hedland', -20.3097, 118.5764, 'Australia'],
  ['Gladstone',   -23.8416, 151.2500, 'Australia'],
  ['Beira',       -19.8436,  34.8389, 'Mozambique'],
  ['Nacala',      -14.5427,  40.6890, 'Mozambique'],
  ['Maputo',      -25.9692,  32.5732, 'Mozambique'],
];

function downsample(coords, target = 280) {
  if (coords.length <= target) return coords;
  const step = Math.ceil(coords.length / target);
  const out = [];
  for (let i = 0; i < coords.length; i++) {
    if (i === 0 || i === coords.length - 1 || i % step === 0) out.push(coords[i]);
  }
  const last = coords[coords.length - 1];
  const tail = out[out.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) out.push(last);
  return out;
}

const routes = {};

for (const [oname, olat, olng, ocountry] of ports) {
  for (const [dname, dlat, dlng, dcountry] of ports) {
    if (oname === dname) continue;                          // same port
    if (ocountry === dcountry) continue;                    // same country — skip
    const key = `${oname}->${dname}`;
    if (routes[key]) continue;                              // already generated as reverse

    const path = findOceanPath(olat, olng, dlat, dlng);
    const coords = downsample(path.map((p) => [p[0], p[1]]));
    coords[0] = [olng, olat];
    coords[coords.length - 1] = [dlng, dlat];
    routes[key] = {
      type: 'Feature',
      properties: { pair: key, points: coords.length, source: 'ocean-astar' },
      geometry: { type: 'LineString', coordinates: coords }
    };
    console.log(key, '→', coords.length, 'points');
  }
}

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'maritime-routes.json'), JSON.stringify(routes));
writeFileSync(join(root, 'maritime-routes.json'), JSON.stringify(routes));
console.log('Wrote', Object.keys(routes).length, 'routes');

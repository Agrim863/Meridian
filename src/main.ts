/**
 * Maritime Voyage Planner — TypeScript entry point.
 *
 * Bootstraps the application by:
 * 1. Initializing the MapLibre map
 * 2. Setting up the origin/destination/cargo planner UI
 * 3. Drawing the initial search state
 *
 * All data (ports, vessels, berths, cargo, compatibility) comes from the
 * canonical src/data/ and src/lib/ modules.
 */

// Import all CSS so Vite bundles it (Vite does NOT bundle <link>-tagged external CSS)
import '/style.css';
import '/geography.css';

import { mapInit } from './app/map';
import { drawSearches, initPlannerUI } from './app/ui/planner';

function init(): void {
  mapInit();
  initPlannerUI();
  drawSearches();
  console.log('Meridian — Freight Intelligence initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

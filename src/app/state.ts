/**
 * Application state management.
 * Typed voyage state with a simple pub/sub for reactive rendering.
 */

import type { Port } from '../data/ports';
import type { CargoCategory } from '../data/cargo';
import type { VesselClass } from '../data/vessels';
import type { VesselInstance } from '../data/vesselInstances';
import type { VesselAvailability } from '../lib/voyageAvailability';

// GeoJSON types (inline to avoid extra dep)
export type LineStringCoords = [number, number][];

export interface VoyageState {
  origin: Port | null;
  destination: Port | null;
  cargo: CargoCategory | null;
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
  routeAnimationComplete: boolean;
  vesselAvailability: VesselAvailability[] | null;
  selectedVesselClass: VesselClass | null;
  selectedVessel: VesselInstance | null;
}

const initialState: VoyageState = {
  origin: null,
  destination: null,
  cargo: null,
  route: null,
  routeAnimationComplete: false,
  vesselAvailability: null,
  selectedVesselClass: null,
  selectedVessel: null,
};

type Listener = (state: VoyageState) => void;

const listeners: Set<Listener> = new Set();

let currentState: VoyageState = { ...initialState };

export function getState(): VoyageState {
  return currentState;
}

export function setState(partial: Partial<VoyageState>): void {
  currentState = { ...currentState, ...partial };
  listeners.forEach((fn) => fn(currentState));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reset everything downstream of origin/destination/cargo selection */
export function resetDownstream(): void {
  setState({
    cargo: null,
    route: null,
    routeAnimationComplete: false,
    vesselAvailability: null,
    selectedVesselClass: null,
    selectedVessel: null,
  });
}

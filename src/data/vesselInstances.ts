/**
 * Hardcoded vessel instances with realistic dimensions per class.
 * These represent example vessels available for booking.
 * Dimensions roughly follow the class specs from vessels.ts with ±5% variation.
 */

import type { VesselClass } from './vessels';

export interface VesselInstance {
  id: string;
  name: string;
  vesselClass: VesselClass;
  dwt: number;           // Deadweight tonnage
  loaM: number;          // Length overall
  beamM: number;         // Beam width
  draftM: number;        // Draft (actual operating)
  dailyRate: number;     // USD per day
}

export const VESSEL_INSTANCES: VesselInstance[] = [
  // Handysize (LOA ~180, draft ~10–11.5m)
  {
    id: 'v001',
    name: 'MV Coastal Pearl',
    vesselClass: 'handysize',
    dwt: 35000,
    loaM: 178,
    beamM: 27.8,
    draftM: 10.0,
    dailyRate: 16800,
  },
  {
    id: 'v002',
    name: 'MV Bay Runner',
    vesselClass: 'handysize',
    dwt: 38000,
    loaM: 182,
    beamM: 28.2,
    draftM: 10.8,
    dailyRate: 17100,
  },
  {
    id: 'v003',
    name: 'MV Harbour Light',
    vesselClass: 'handysize',
    dwt: 32000,
    loaM: 175,
    beamM: 27.5,
    draftM: 9.8,
    dailyRate: 16400,
  },

  // Supramax (LOA ~200, draft ~12–13m)
  {
    id: 'v004',
    name: 'MV Ocean Trader',
    vesselClass: 'supramax',
    dwt: 58000,
    loaM: 189,
    beamM: 31.8,
    draftM: 12.6,
    dailyRate: 17600,
  },
  {
    id: 'v005',
    name: 'MV Pacific Star',
    vesselClass: 'supramax',
    dwt: 56000,
    loaM: 205,
    beamM: 32.1,
    draftM: 12.8,
    dailyRate: 17900,
  },
  {
    id: 'v006',
    name: 'MV Eastern Wind',
    vesselClass: 'supramax',
    dwt: 61000,
    loaM: 199,
    beamM: 32.4,
    draftM: 13.0,
    dailyRate: 18200,
  },

  // Panamax (LOA ~229, draft ~13.5–14m)
  {
    id: 'v007',
    name: 'MV Meridian Bulk',
    vesselClass: 'panamax',
    dwt: 75000,
    loaM: 226,
    beamM: 32.0,
    draftM: 13.2,
    dailyRate: 18400,
  },
  {
    id: 'v008',
    name: 'MV Coral Bridge',
    vesselClass: 'panamax',
    dwt: 78000,
    loaM: 231,
    beamM: 32.5,
    draftM: 13.8,
    dailyRate: 18900,
  },
  {
    id: 'v009',
    name: 'MV Southern Cross',
    vesselClass: 'panamax',
    dwt: 74000,
    loaM: 223,
    beamM: 31.9,
    draftM: 13.1,
    dailyRate: 18600,
  },

  // Capesize (LOA ~290, draft ~17.5–18m)
  {
    id: 'v010',
    name: 'MV Iron Giant',
    vesselClass: 'capesize',
    dwt: 180000,
    loaM: 289,
    beamM: 44.8,
    draftM: 17.8,
    dailyRate: 19500,
  },
  {
    id: 'v011',
    name: 'MV Cape Horizon',
    vesselClass: 'capesize',
    dwt: 175000,
    loaM: 291,
    beamM: 45.2,
    draftM: 17.5,
    dailyRate: 19800,
  },
  {
    id: 'v012',
    name: 'MV Ore Pathfinder',
    vesselClass: 'capesize',
    dwt: 182000,
    loaM: 290,
    beamM: 45.0,
    draftM: 18.0,
    dailyRate: 20100,
  },
];

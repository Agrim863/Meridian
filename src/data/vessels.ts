// Representative dimensions per vessel class, for compatibility checks only —
// NOT a specific real vessel. Typical industry figures compiled from public
// reference sources (Marine Insight's ship-size guide, Port Economics &
// Management's bulk-carrier class definitions). Cross-check against a
// class-society standard-vessel table before using these for anything beyond
// a prototype demo.

export type VesselClass = 'handysize' | 'supramax' | 'panamax' | 'capesize';

export interface VesselClassSpec {
  id: VesselClass;
  label: string;
  loaM: number;
  beamM: number;
  draftM: number;
  dwt: number;
}

export const VESSEL_CLASSES: VesselClassSpec[] = [
  { id: 'handysize', label: 'Handysize', loaM: 180, beamM: 28, draftM: 11.5, dwt: 35000 },
  { id: 'supramax',  label: 'Supramax',  loaM: 200, beamM: 32, draftM: 12.5, dwt: 58000 },
  { id: 'panamax',   label: 'Panamax',   loaM: 229, beamM: 32.3, draftM: 14.0, dwt: 75000 },
  { id: 'capesize',  label: 'Capesize',  loaM: 290, beamM: 45.0, draftM: 18.0, dwt: 180000 },
];

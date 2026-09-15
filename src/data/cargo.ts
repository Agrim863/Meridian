// Cargo taxonomy. Berth-level `cargo_raw` strings from the source spreadsheet are
// normalized into these categories in berths.ts. See CARGO_SYNONYMS below for how
// each raw label was mapped, in case a new berth/cargo string needs classifying later.

export type CargoCategory =
  | 'thermal_coal'
  | 'coking_coal'
  | 'iron_ore'
  | 'fertilizer'
  | 'manganese_ore'
  | 'general_bulk';

// Shown in the cargo selection dropdown. general_bulk is intentionally excluded —
// it's a compatibility fallback (see berthCompatibility.ts), not a user-facing option.
// Ordered by how often each cargo actually appears across the 7 ports in the dataset
// (iron ore 20 berths, thermal coal 13, coking coal 6, fertilizer 5, manganese ore 3).
export const CARGO_DROPDOWN_OPTIONS: { value: CargoCategory; label: string }[] = [
  { value: 'iron_ore', label: 'Iron Ore' },
  { value: 'thermal_coal', label: 'Thermal Coal' },
  { value: 'coking_coal', label: 'Coking Coal' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'manganese_ore', label: 'Manganese Ore' },
];

// Reference only — documents how raw spreadsheet cargo strings were classified.
// Substring match, case-insensitive, checked in this order (iron ore before fertilizer
// so 'Iron Ore and Sulphuric Acid' resolves to iron_ore, not fertilizer/sulfur).
export const CARGO_SYNONYMS: Record<CargoCategory, string[]> = {
  thermal_coal: ['thermal'],
  coking_coal: ['coking', 'cooking'],
  iron_ore: ['iron ore', 'iop'],
  fertilizer: ['fertilizer', 'phosphate'],
  manganese_ore: ['manganese'],
  general_bulk: ['other bulk', 'dry bulk', 'multi-cargo', 'general cargo'],
};

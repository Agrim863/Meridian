// Auto-generated from Ports.xlsx — do not hand-edit cargo/berth data here.
// Regenerate via the preprocessing script if the source spreadsheet changes.

export interface Port {
  id: string;
  name: string;
  country: string;
  // lat/lng are not in the source spreadsheet — fill these in before using the map view.
  lat: number | null;
  lng: number | null;
}

export const PORTS: Port[] = [
  { id: "paradip", name: "Paradip", country: "India", lat: 20.2644, lng: 86.6729 },
  { id: "vizag", name: "Visakhapatnam", country: "India", lat: 17.6868, lng: 83.2185 },
  { id: "hedland", name: "Port Hedland", country: "Australia", lat: -20.3097, lng: 118.5764 },
  { id: "gladstone", name: "Gladstone", country: "Australia", lat: -23.8416, lng: 151.2500 },
  { id: "beira", name: "Beira", country: "Mozambique", lat: -19.8436, lng: 34.8389 },
  { id: "nacala", name: "Nacala", country: "Mozambique", lat: -14.5427, lng: 40.6890 },
  { id: "maputo", name: "Maputo", country: "Mozambique", lat: -25.9692, lng: 32.5732 },
];

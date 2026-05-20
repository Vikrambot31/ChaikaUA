/**
 * Real GPS coordinates for ЖК Чайка buildings.
 *
 * Sources:
 *  - Primary: OpenStreetMap / Nominatim geocoding (buildings that returned
 *    "ЖК «Чайка»" in the display_name are confirmed OSM matches).
 *  - Secondary: manually estimated from neighbouring confirmed buildings for
 *    corps/suffix variants that OSM does not index individually (marked ← est).
 *
 * All coordinates are within the Чайки / Борщагівська сільська громада bbox.
 * To refresh coordinates run:  node scripts/geocode-buildings.js
 */

import { BUILDINGS, getFullAddress } from '../data/buildings';
import { Place, PlaceType } from '../types/app';

/** Confirmed or estimated coordinates keyed by building id. */
const COORDS: Record<string, { lat: number; lon: number }> = {
  // ── вул. Валерія Лобановського ─────────────────────────────────────────────
  'lob-1':    { lat: 50.4393500, lon: 30.2825200 }, // ← est (south of #5)
  'lob-2':    { lat: 50.4395000, lon: 30.2831500 }, // ← est (even side)
  'lob-3':    { lat: 50.4396500, lon: 30.2823400 }, // ← est (odd side)
  'lob-4':    { lat: 50.4397800, lon: 30.2832000 }, // ← est (even side)
  'lob-5':    { lat: 50.4398173, lon: 30.2822636 }, // OSM ✓
  'lob-5a':   { lat: 50.4398900, lon: 30.2825500 }, // ← est (near #5)
  'lob-5b':   { lat: 50.4399400, lon: 30.2819800 }, // ← est (near #5)
  'lob-7':    { lat: 50.4400275, lon: 30.2811446 }, // OSM ✓
  'lob-9':    { lat: 50.4405704, lon: 30.2811279 }, // OSM ✓
  'lob-10':   { lat: 50.4400486, lon: 30.2832617 }, // OSM ✓
  'lob-11':   { lat: 50.4409804, lon: 30.2814155 }, // OSM ✓
  'lob-13':   { lat: 50.4414373, lon: 30.2816397 }, // OSM ✓
  'lob-14':   { lat: 50.4405061, lon: 30.2838793 }, // OSM ✓
  'lob-15':   { lat: 50.4418695, lon: 30.2818219 }, // OSM ✓
  'lob-16':   { lat: 50.4410903, lon: 30.2846440 }, // OSM ✓
  'lob-17':   { lat: 50.4425018, lon: 30.2822168 }, // OSM ✓
  'lob-18':   { lat: 50.4417596, lon: 30.2849269 }, // OSM ✓
  'lob-19':   { lat: 50.4424093, lon: 30.2839523 }, // OSM ✓
  'lob-19k2': { lat: 50.4427543, lon: 30.2857105 }, // OSM ✓
  'lob-21':   { lat: 50.4412025, lon: 30.2825454 }, // OSM ✓
  'lob-21k1': { lat: 50.4413200, lon: 30.2821800 }, // ← est (near #21)
  'lob-21k2': { lat: 50.4418594, lon: 30.2825949 }, // OSM ✓
  'lob-21k3': { lat: 50.4421261, lon: 30.2830584 }, // OSM ✓
  'lob-21k4': { lat: 50.4415300, lon: 30.2828600 }, // ← est (near #21)
  'lob-21k5': { lat: 50.4416800, lon: 30.2822200 }, // ← est (near #21)
  'lob-21k6': { lat: 50.4419000, lon: 30.2820000 }, // ← est (near #21)
  'lob-24':   { lat: 50.4422174, lon: 30.2876396 }, // OSM ✓
  'lob-25':   { lat: 50.4431474, lon: 30.2830361 }, // OSM ✓
  'lob-26k1': { lat: 50.4414313, lon: 30.2903777 }, // OSM (26к1) ✓
  'lob-26k2': { lat: 50.4411500, lon: 30.2908300 }, // ← est (near 26к1)
  'lob-26k3': { lat: 50.4408800, lon: 30.2912600 }, // ← est
  'lob-27':   { lat: 50.4429373, lon: 30.2847729 }, // OSM ✓
  'lob-28':   { lat: 50.4419495, lon: 30.2899902 }, // OSM ✓
  'lob-29':   { lat: 50.4426487, lon: 30.2882723 }, // OSM ✓
  'lob-30':   { lat: 50.4414722, lon: 30.2939145 }, // OSM ✓
  'lob-30a':  { lat: 50.4416200, lon: 30.2945000 }, // ← est (near #30)
  'lob-30b':  { lat: 50.4417917, lon: 30.2914948 }, // OSM ✓
  'lob-30v':  { lat: 50.4417006, lon: 30.2922617 }, // OSM ✓
  'lob-31':   { lat: 50.4420580, lon: 30.2933074 }, // OSM ✓
  'lob-32a':  { lat: 50.4420800, lon: 30.2948200 }, // ← est (between #31 & #35)
  'lob-35':   { lat: 50.4421134, lon: 30.2915667 }, // OSM ✓

  // ── вул. Печерська ─────────────────────────────────────────────────────────
  'pech-2':   { lat: 50.4427619, lon: 30.3099626 }, // OSM ✓ (!>=FB0C=/'09:8)
  'pech-4':   { lat: 50.4421242, lon: 30.3095820 }, // OSM ✓
  'pech-6':   { lat: 50.4415600, lon: 30.3091200 }, // ← est (same street)
  'pech-24':  { lat: 50.4436800, lon: 30.3116000 }, // ← est (higher numbers north)
  'pech-26':  { lat: 50.4432100, lon: 30.3108500 }, // ← est
  'pech-28':  { lat: 50.4429800, lon: 30.3103000 }, // ← est
};

export const chaykaBuildingPlaces: Place[] = BUILDINGS.map((building) => {
  const coords = COORDS[building.id];
  const latitude  = coords?.lat ?? 50.4415;   // fallback to ЖК centre
  const longitude = coords?.lon ?? 30.2870;

  return {
    id: `building-${building.id}`,
    name: getFullAddress(building),
    address: 'ЖК Чайка',
    latitude,
    longitude,
    type: PlaceType.BUILDING,
    rating: 0,
    reviews: 0,
    createdAt: new Date('2026-04-09T09:00:00Z').valueOf(),
  };
});

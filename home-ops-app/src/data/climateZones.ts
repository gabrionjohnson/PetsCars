import type { ClimateZone } from '../types/models';

export const CLIMATE_ZONE_LABELS: Record<ClimateZone, string> = {
  cold: 'Cold (cold winters, e.g. Midwest, Mountain states, New England)',
  mixed_humid: 'Mixed-Humid (hot summers, mild winters, e.g. Mid-Atlantic, Southeast)',
  mixed_dry: 'Mixed-Dry (hot summers, mild winters, low humidity, e.g. inland Southwest)',
  hot_humid: 'Hot-Humid (hot, humid most of the year, e.g. Gulf Coast, Florida)',
  hot_dry: 'Hot-Dry (hot, arid, e.g. desert Southwest)',
  marine: 'Marine (mild, wet, e.g. Pacific Northwest coast)',
};

export const CLIMATE_ZONE_OPTIONS: ClimateZone[] = [
  'cold',
  'mixed_humid',
  'mixed_dry',
  'hot_humid',
  'hot_dry',
  'marine',
];

/**
 * Maps the first 3 digits of a US ZIP code to a climate zone.
 * This is a coarse approximation (loosely based on IECC climate zones) good
 * enough for picking a sensible default; the user can always override it.
 */
const ZIP3_RANGES: { from: number; to: number; zone: ClimateZone }[] = [
  { from: 0, to: 49, zone: 'cold' }, // CT/MA/ME/NH/NJ/PR/RI/VT
  { from: 50, to: 69, zone: 'cold' }, // NY/DE/PA
  { from: 70, to: 89, zone: 'mixed_humid' }, // VA/DC/MD/WV (mid-Atlantic)
  { from: 100, to: 149, zone: 'cold' }, // NY
  { from: 150, to: 196, zone: 'mixed_humid' }, // PA
  { from: 197, to: 219, zone: 'mixed_humid' }, // VA/MD/DC/WV
  { from: 220, to: 246, zone: 'mixed_humid' }, // VA/NC
  { from: 247, to: 268, zone: 'mixed_humid' }, // WV/VA
  { from: 270, to: 289, zone: 'mixed_humid' }, // NC
  { from: 290, to: 299, zone: 'hot_humid' }, // SC
  { from: 300, to: 319, zone: 'hot_humid' }, // GA
  { from: 320, to: 349, zone: 'hot_humid' }, // FL
  { from: 350, to: 369, zone: 'mixed_humid' }, // AL
  { from: 370, to: 385, zone: 'mixed_humid' }, // TN
  { from: 386, to: 397, zone: 'hot_humid' }, // MS
  { from: 398, to: 399, zone: 'hot_humid' }, // GA
  { from: 400, to: 427, zone: 'mixed_humid' }, // KY
  { from: 430, to: 459, zone: 'cold' }, // OH
  { from: 460, to: 479, zone: 'mixed_humid' }, // IN
  { from: 480, to: 499, zone: 'cold' }, // MI
  { from: 500, to: 528, zone: 'cold' }, // IA
  { from: 530, to: 549, zone: 'cold' }, // WI
  { from: 550, to: 567, zone: 'cold' }, // MN
  { from: 570, to: 577, zone: 'cold' }, // SD
  { from: 580, to: 588, zone: 'cold' }, // ND
  { from: 590, to: 599, zone: 'cold' }, // MT
  { from: 600, to: 629, zone: 'cold' }, // IL
  { from: 630, to: 658, zone: 'mixed_humid' }, // MO
  { from: 660, to: 679, zone: 'cold' }, // KS
  { from: 680, to: 693, zone: 'cold' }, // NE
  { from: 700, to: 714, zone: 'hot_humid' }, // LA
  { from: 716, to: 729, zone: 'mixed_humid' }, // AR
  { from: 730, to: 749, zone: 'mixed_humid' }, // OK
  { from: 750, to: 799, zone: 'hot_humid' }, // TX (humid east/central)
  { from: 800, to: 816, zone: 'cold' }, // CO
  { from: 820, to: 831, zone: 'cold' }, // WY
  { from: 832, to: 838, zone: 'cold' }, // ID
  { from: 840, to: 847, zone: 'cold' }, // UT
  { from: 850, to: 865, zone: 'hot_dry' }, // AZ
  { from: 870, to: 884, zone: 'hot_dry' }, // NM
  { from: 889, to: 898, zone: 'hot_dry' }, // NV
  { from: 900, to: 935, zone: 'mixed_dry' }, // CA (coastal/inland mix, default mixed-dry)
  { from: 936, to: 961, zone: 'mixed_dry' }, // CA
  { from: 967, to: 968, zone: 'hot_humid' }, // HI
  { from: 970, to: 979, zone: 'marine' }, // OR
  { from: 980, to: 994, zone: 'marine' }, // WA
  { from: 995, to: 999, zone: 'cold' }, // AK
];

export function climateZoneFromZip(zip: string): ClimateZone | null {
  const digits = zip.trim().slice(0, 3);
  if (!/^\d{3}$/.test(digits)) return null;
  const zip3 = parseInt(digits, 10);
  const match = ZIP3_RANGES.find((r) => zip3 >= r.from && zip3 <= r.to);
  return match ? match.zone : null;
}

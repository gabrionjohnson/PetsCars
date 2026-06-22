import type { HomeAgeBand } from '../types/models';

export const HOME_AGE_BAND_LABELS: Record<HomeAgeBand, string> = {
  new_0_5: 'New (0-5 years old)',
  young_6_15: 'Young (6-15 years old)',
  established_16_30: 'Established (16-30 years old)',
  older_31_plus: 'Older (31+ years old)',
};

export const HOME_AGE_BAND_OPTIONS: HomeAgeBand[] = [
  'new_0_5',
  'young_6_15',
  'established_16_30',
  'older_31_plus',
];

export function homeAgeBandFromYearBuilt(yearBuilt: number, now: Date = new Date()): HomeAgeBand {
  const age = now.getFullYear() - yearBuilt;
  if (age <= 5) return 'new_0_5';
  if (age <= 15) return 'young_6_15';
  if (age <= 30) return 'established_16_30';
  return 'older_31_plus';
}

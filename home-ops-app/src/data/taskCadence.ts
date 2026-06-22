import type { TaskCadence } from '../types/models';

export const TASK_CADENCE_LABELS: Record<TaskCadence, string> = {
  monthly: 'Monthly',
  every_90_days: 'Every 90 days',
  seasonal: 'Seasonal (every 3 months)',
  annual: 'Annual',
  every_3_years: 'Every 3 years',
};

export const TASK_CADENCE_OPTIONS: TaskCadence[] = [
  'monthly',
  'every_90_days',
  'seasonal',
  'annual',
  'every_3_years',
];

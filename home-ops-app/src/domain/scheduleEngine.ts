import type { ClimateZone, HomeAgeBand, TaskCadence } from '../types/models';

export interface SeedTask {
  title: string;
  description: string;
  category: string;
  defaultCadence: TaskCadence;
  /** Month (1-12) the task should first become due, used for seasonal/annual tasks. */
  startMonth?: number;
}

export interface SeedRule {
  homeAgeBands: HomeAgeBand[] | 'all';
  climateZones: ClimateZone[] | 'all';
  tasks: SeedTask[];
}

function matchesBand(bands: HomeAgeBand[] | 'all', band: HomeAgeBand): boolean {
  return bands === 'all' || bands.includes(band);
}

function matchesZone(zones: ClimateZone[] | 'all', zone: ClimateZone): boolean {
  return zones === 'all' || zones.includes(zone);
}

export function selectSeedTasks(
  rules: SeedRule[],
  homeAgeBand: HomeAgeBand,
  climateZone: ClimateZone
): SeedTask[] {
  const tasks: SeedTask[] = [];
  const seenTitles = new Set<string>();
  for (const rule of rules) {
    if (!matchesBand(rule.homeAgeBands, homeAgeBand)) continue;
    if (!matchesZone(rule.climateZones, climateZone)) continue;
    for (const task of rule.tasks) {
      if (seenTitles.has(task.title)) continue;
      seenTitles.add(task.title);
      tasks.push(task);
    }
  }
  return tasks;
}

/**
 * Adds `months` calendar months to `from`, clamping the day-of-month so e.g.
 * Jan 31 + 1 month lands on the last day of February rather than rolling into March.
 */
function addMonthsClamped(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const targetMonth = result.getMonth() + months;
  result.setDate(1);
  result.setMonth(targetMonth);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(from.getDate(), daysInTargetMonth));
  return result;
}

/**
 * Computes the next due date for a task cadence, anchored to `from`.
 * Seasonal tasks recur quarterly (every 3 months); annual tasks recur yearly
 * from `startMonth` when provided, otherwise from `from`'s month.
 */
export function computeNextDueDate(
  cadence: TaskCadence,
  from: Date,
  startMonth?: number
): Date {
  switch (cadence) {
    case 'monthly':
      return addMonthsClamped(from, 1);
    case 'every_90_days': {
      const next = new Date(from.getTime());
      next.setDate(next.getDate() + 90);
      return next;
    }
    case 'seasonal':
      return addMonthsClamped(from, 3);
    case 'annual': {
      if (startMonth) {
        const next = new Date(from.getFullYear(), startMonth - 1, from.getDate());
        if (next.getTime() <= from.getTime()) {
          next.setFullYear(next.getFullYear() + 1);
        }
        return next;
      }
      return addMonthsClamped(from, 12);
    }
    case 'every_3_years':
      return addMonthsClamped(from, 36);
    default:
      throw new Error(`Unknown cadence: ${cadence}`);
  }
}

export function isDueNow(nextDueDate: Date, now: Date = new Date()): boolean {
  return nextDueDate.getTime() <= now.getTime();
}

export function isDueSoon(nextDueDate: Date, now: Date = new Date(), withinDays = 14): boolean {
  const horizon = new Date(now.getTime());
  horizon.setDate(horizon.getDate() + withinDays);
  return nextDueDate.getTime() > now.getTime() && nextDueDate.getTime() <= horizon.getTime();
}

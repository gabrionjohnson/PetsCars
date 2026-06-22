import { computeNextDueDate, isDueNow, isDueSoon, selectSeedTasks } from '../src/domain/scheduleEngine';
import type { SeedRule } from '../src/domain/scheduleEngine';

describe('computeNextDueDate', () => {
  it('adds 1 month for monthly cadence', () => {
    const result = computeNextDueDate('monthly', new Date('2026-01-15T00:00:00.000Z'));
    expect(result.toISOString()).toBe(new Date('2026-02-15T00:00:00.000Z').toISOString());
  });

  it('clamps day-of-month when the target month is shorter', () => {
    const result = computeNextDueDate('monthly', new Date('2026-01-31T00:00:00.000Z'));
    expect(result.getUTCMonth()).toBe(1); // February
    expect(result.getUTCDate()).toBe(28); // 2026 is not a leap year
  });

  it('adds 90 days for every_90_days cadence', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const result = computeNextDueDate('every_90_days', from);
    const expectedMs = from.getTime() + 90 * 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBe(expectedMs);
  });

  it('adds 3 months for seasonal cadence', () => {
    const result = computeNextDueDate('seasonal', new Date('2026-01-15T00:00:00.000Z'));
    expect(result.toISOString()).toBe(new Date('2026-04-15T00:00:00.000Z').toISOString());
  });

  it('adds 12 months for annual cadence with no startMonth', () => {
    const result = computeNextDueDate('annual', new Date('2026-03-10T00:00:00.000Z'));
    expect(result.toISOString()).toBe(new Date('2027-03-10T00:00:00.000Z').toISOString());
  });

  it('anchors annual cadence to startMonth, rolling to next year if already past', () => {
    const from = new Date('2026-06-22T00:00:00.000Z');
    const result = computeNextDueDate('annual', from, 9); // September, still ahead this year
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(8); // September

    const resultPast = computeNextDueDate('annual', from, 1); // January, already passed
    expect(resultPast.getUTCFullYear()).toBe(2027);
    expect(resultPast.getUTCMonth()).toBe(0);
  });

  it('adds 36 months for every_3_years cadence', () => {
    const result = computeNextDueDate('every_3_years', new Date('2026-01-15T00:00:00.000Z'));
    expect(result.toISOString()).toBe(new Date('2029-01-15T00:00:00.000Z').toISOString());
  });
});

describe('isDueNow / isDueSoon', () => {
  const now = new Date('2026-06-22T00:00:00.000Z');

  it('treats past and present due dates as due now', () => {
    expect(isDueNow(new Date('2026-06-21T00:00:00.000Z'), now)).toBe(true);
    expect(isDueNow(now, now)).toBe(true);
    expect(isDueNow(new Date('2026-06-23T00:00:00.000Z'), now)).toBe(false);
  });

  it('treats dates within the horizon (but after now) as due soon', () => {
    expect(isDueSoon(new Date('2026-06-25T00:00:00.000Z'), now, 14)).toBe(true);
    expect(isDueSoon(new Date('2026-07-10T00:00:00.000Z'), now, 14)).toBe(false);
    expect(isDueSoon(new Date('2026-06-20T00:00:00.000Z'), now, 14)).toBe(false);
  });
});

describe('selectSeedTasks', () => {
  const rules: SeedRule[] = [
    {
      homeAgeBands: 'all',
      climateZones: 'all',
      tasks: [{ title: 'Change HVAC filter', description: '', category: 'hvac', defaultCadence: 'every_90_days' }],
    },
    {
      homeAgeBands: 'all',
      climateZones: ['cold'],
      tasks: [{ title: 'Test sump pump', description: '', category: 'plumbing', defaultCadence: 'annual' }],
    },
    {
      homeAgeBands: ['older_31_plus'],
      climateZones: 'all',
      tasks: [{ title: 'Check for asbestos', description: '', category: 'safety', defaultCadence: 'every_3_years' }],
    },
  ];

  it('includes all-band/all-zone tasks regardless of home profile', () => {
    const tasks = selectSeedTasks(rules, 'new_0_5', 'hot_dry');
    expect(tasks.map((t) => t.title)).toEqual(['Change HVAC filter']);
  });

  it('includes zone-specific tasks only for matching climate zones', () => {
    const tasks = selectSeedTasks(rules, 'new_0_5', 'cold');
    expect(tasks.map((t) => t.title)).toEqual(['Change HVAC filter', 'Test sump pump']);
  });

  it('includes age-band-specific tasks only for matching home age bands', () => {
    const tasks = selectSeedTasks(rules, 'older_31_plus', 'hot_dry');
    expect(tasks.map((t) => t.title)).toEqual(['Change HVAC filter', 'Check for asbestos']);
  });

  it('de-duplicates tasks with the same title across matching rules', () => {
    const dupedRules: SeedRule[] = [
      ...rules,
      {
        homeAgeBands: 'all',
        climateZones: 'all',
        tasks: [{ title: 'Change HVAC filter', description: 'duplicate', category: 'hvac', defaultCadence: 'monthly' }],
      },
    ];
    const tasks = selectSeedTasks(dupedRules, 'new_0_5', 'hot_dry');
    expect(tasks).toHaveLength(1);
  });
});

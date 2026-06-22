import type { SeedRule } from '../domain/scheduleEngine';

/**
 * Starter task library: a static rules table mapping
 * { home_age_band, climate_zone } -> seed maintenance tasks.
 * Users can toggle, edit cadence, or add custom tasks after onboarding.
 */
export const TASK_LIBRARY: SeedRule[] = [
  {
    homeAgeBands: 'all',
    climateZones: 'all',
    tasks: [
      {
        title: 'Change HVAC filter',
        description: 'Replace or clean your furnace/AC filter so air keeps flowing efficiently.',
        category: 'hvac',
        defaultCadence: 'every_90_days',
      },
      {
        title: 'Test smoke & CO detectors',
        description: 'Press the test button on every smoke and carbon monoxide detector and replace batteries if needed.',
        category: 'safety',
        defaultCadence: 'every_90_days',
      },
      {
        title: 'Clean refrigerator coils',
        description: 'Vacuum the coils behind or beneath your fridge so it runs efficiently.',
        category: 'appliances',
        defaultCadence: 'seasonal',
      },
      {
        title: 'Check caulk & weatherstripping',
        description: 'Inspect caulk around windows, doors, and tubs; reseal any cracked or peeling areas.',
        category: 'envelope',
        defaultCadence: 'annual',
        startMonth: 9,
      },
      {
        title: 'Deep clean dryer vent',
        description: 'Clear lint from the dryer vent duct and exterior flap to prevent fire risk.',
        category: 'appliances',
        defaultCadence: 'annual',
        startMonth: 3,
      },
      {
        title: 'Flush water heater',
        description: 'Drain a few gallons from your water heater tank to clear sediment buildup.',
        category: 'plumbing',
        defaultCadence: 'annual',
        startMonth: 4,
      },
      {
        title: 'Inspect fire extinguisher',
        description: 'Check the pressure gauge and expiration date on household fire extinguishers.',
        category: 'safety',
        defaultCadence: 'annual',
        startMonth: 1,
      },
    ],
  },
  {
    homeAgeBands: 'all',
    climateZones: ['cold'],
    tasks: [
      {
        title: 'Test sump pump',
        description: 'Pour water into the sump pit to confirm the pump kicks on and drains properly before spring thaw.',
        category: 'plumbing',
        defaultCadence: 'annual',
        startMonth: 3,
      },
      {
        title: 'Clean gutters before winter',
        description: 'Clear leaves and debris so gutters can handle snow melt and ice.',
        category: 'exterior',
        defaultCadence: 'annual',
        startMonth: 10,
      },
      {
        title: 'Drain outdoor faucets & hoses',
        description: 'Disconnect hoses and shut off outdoor water lines before the first freeze.',
        category: 'plumbing',
        defaultCadence: 'annual',
        startMonth: 10,
      },
      {
        title: 'Service furnace before winter',
        description: 'Have your furnace inspected and tuned up before heating season starts.',
        category: 'hvac',
        defaultCadence: 'annual',
        startMonth: 9,
      },
    ],
  },
  {
    homeAgeBands: 'all',
    climateZones: ['mixed_humid', 'hot_humid'],
    tasks: [
      {
        title: 'Clean gutters (storm season)',
        description: 'Clear gutters and downspouts ahead of heavy seasonal rain.',
        category: 'exterior',
        defaultCadence: 'seasonal',
      },
      {
        title: 'Check for moisture & mold',
        description: 'Inspect basements, crawlspaces, and bathrooms for signs of moisture or mold growth.',
        category: 'envelope',
        defaultCadence: 'seasonal',
      },
      {
        title: 'Service AC before summer',
        description: 'Have your air conditioning system inspected and tuned up before peak cooling season.',
        category: 'hvac',
        defaultCadence: 'annual',
        startMonth: 4,
      },
    ],
  },
  {
    homeAgeBands: 'all',
    climateZones: ['hot_dry', 'mixed_dry'],
    tasks: [
      {
        title: 'Inspect irrigation system',
        description: 'Check sprinklers and drip lines for leaks before the dry season.',
        category: 'exterior',
        defaultCadence: 'annual',
        startMonth: 3,
      },
      {
        title: 'Clear brush for fire safety',
        description: 'Trim back dry vegetation near the house to reduce wildfire risk.',
        category: 'exterior',
        defaultCadence: 'annual',
        startMonth: 5,
      },
    ],
  },
  {
    homeAgeBands: 'all',
    climateZones: ['marine'],
    tasks: [
      {
        title: 'Inspect roof for moss & moisture',
        description: 'Check the roof and gutters for moss buildup and trapped moisture common in wet climates.',
        category: 'exterior',
        defaultCadence: 'annual',
        startMonth: 9,
      },
    ],
  },
  {
    homeAgeBands: ['established_16_30', 'older_31_plus'],
    climateZones: 'all',
    tasks: [
      {
        title: 'Inspect water heater for corrosion',
        description: 'Older water heaters are more prone to leaks; check the tank, fittings, and pressure relief valve.',
        category: 'plumbing',
        defaultCadence: 'seasonal',
      },
      {
        title: 'Check electrical panel',
        description: 'Look for signs of wear, rust, or warm breakers in your electrical panel.',
        category: 'electrical',
        defaultCadence: 'annual',
        startMonth: 2,
      },
      {
        title: 'Inspect for galvanized or polybutylene pipes',
        description: 'Older plumbing materials can fail with age; confirm what your supply lines are made of.',
        category: 'plumbing',
        defaultCadence: 'every_3_years',
      },
    ],
  },
  {
    homeAgeBands: ['older_31_plus'],
    climateZones: 'all',
    tasks: [
      {
        title: 'Check for asbestos & lead paint risk areas',
        description: 'Homes built before 1980 may contain asbestos or lead paint; avoid disturbing old materials and consult a professional before renovating.',
        category: 'safety',
        defaultCadence: 'every_3_years',
      },
    ],
  },
  {
    homeAgeBands: ['new_0_5'],
    climateZones: 'all',
    tasks: [
      {
        title: 'Review builder warranty coverage',
        description: 'Confirm what is still covered under your builder or structural warranty and note expiration dates.',
        category: 'records',
        defaultCadence: 'annual',
        startMonth: 1,
      },
    ],
  },
];

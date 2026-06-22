import {
  matchApplianceToRecalls,
  matchAppliancesToRecalls,
  tokenize,
} from '../src/domain/recallMatching';
import type { MatchableAppliance, SlimRecallRecord } from '../src/domain/recallMatching';

describe('tokenize', () => {
  it('lowercases, splits on non-alphanumerics, and de-duplicates', () => {
    expect(tokenize('Northwind Dishwasher, Model DW-200')).toEqual([
      'northwind',
      'dishwasher',
      'model',
      '200',
    ]);
  });

  it('drops short tokens and stopwords', () => {
    expect(tokenize('Acme Co. of the Inc for and')).toEqual(['acme']);
  });
});

describe('matchApplianceToRecalls', () => {
  const recall: SlimRecallRecord = {
    id: 'r1',
    title: 'Northwind Dishwasher Fire Hazard',
    url: 'https://example.com/r1',
    hazard: 'Fire hazard',
    recallDate: '2026-01-01',
    keywords: ['northwind', 'dishwasher', 'fire'],
  };

  it('matches when both brand and product/type tokens overlap with the recall', () => {
    const appliance: MatchableAppliance = {
      id: 1,
      name: 'Kitchen dishwasher',
      type: 'dishwasher',
      brand: 'Northwind',
      model: null,
    };
    const matches = matchApplianceToRecalls(appliance, [recall]);
    expect(matches).toHaveLength(1);
    expect(matches[0].recall.id).toBe('r1');
    expect(matches[0].matchedOn).toContain('northwind');
    expect(matches[0].matchedOn).toContain('dishwasher');
  });

  it('does not match on brand alone without a product/type overlap', () => {
    const appliance: MatchableAppliance = {
      id: 2,
      name: 'Refrigerator',
      type: 'fridge',
      brand: 'Northwind',
      model: null,
    };
    expect(matchApplianceToRecalls(appliance, [recall])).toEqual([]);
  });

  it('does not match on product/type alone without a brand overlap', () => {
    const appliance: MatchableAppliance = {
      id: 3,
      name: 'Dishwasher',
      type: 'dishwasher',
      brand: 'BrightHome',
      model: null,
    };
    expect(matchApplianceToRecalls(appliance, [recall])).toEqual([]);
  });

  it('returns no matches when the appliance has no brand set', () => {
    const appliance: MatchableAppliance = {
      id: 4,
      name: 'Dishwasher',
      type: 'dishwasher',
      brand: null,
      model: null,
    };
    expect(matchApplianceToRecalls(appliance, [recall])).toEqual([]);
  });
});

describe('matchAppliancesToRecalls', () => {
  const recalls: SlimRecallRecord[] = [
    {
      id: 'r1',
      title: 'Northwind Dishwasher Fire Hazard',
      url: 'https://example.com/r1',
      hazard: 'Fire hazard',
      recallDate: '2026-01-01',
      keywords: ['northwind', 'dishwasher', 'fire'],
    },
    {
      id: 'r2',
      title: 'ColdGuard Space Heater Shock Hazard',
      url: 'https://example.com/r2',
      hazard: 'Shock hazard',
      recallDate: '2026-02-01',
      keywords: ['coldguard', 'space', 'heater', 'shock'],
    },
  ];

  it('matches each appliance independently against the full recall set', () => {
    const appliances: MatchableAppliance[] = [
      { id: 1, name: 'Kitchen dishwasher', type: 'dishwasher', brand: 'Northwind', model: null },
      { id: 2, name: 'Space heater', type: 'space heater', brand: 'ColdGuard', model: null },
      { id: 3, name: 'Microwave', type: 'microwave', brand: 'Acme', model: null },
    ];
    const results = matchAppliancesToRecalls(appliances, recalls);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.applianceId).sort()).toEqual([1, 2]);
  });
});

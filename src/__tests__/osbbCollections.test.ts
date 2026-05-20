import { calculateOsbbCollectionTotals } from '../services/osbbCollections';

describe('OSBB finance calculations', () => {
  it('calculates total target, collected amount, and remaining amount', () => {
    expect(
      calculateOsbbCollectionTotals([
        { targetAmount: 1000, collectedAmount: 250 },
        { targetAmount: 500, collectedAmount: 600 },
      ])
    ).toEqual({
      totalTarget: 1500,
      totalCollected: 850,
      remaining: 650,
    });
  });

  it('returns zero totals for an empty Firebase result', () => {
    expect(calculateOsbbCollectionTotals([])).toEqual({
      totalTarget: 0,
      totalCollected: 0,
      remaining: 0,
    });
  });

  it('never returns a negative remaining amount', () => {
    expect(
      calculateOsbbCollectionTotals([
        { targetAmount: 100, collectedAmount: 250 },
      ]).remaining
    ).toBe(0);
  });
});

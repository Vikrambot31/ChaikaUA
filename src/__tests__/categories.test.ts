import {
  SPECIAL,
  buildRequestText,
  getStoreLabel,
  getSubcategoryLabel,
  getTimeLabel,
} from '../data/categories';

describe('categories/buildRequestText', () => {
  it('formats foodsharing request text (TC-1)', () => {
    const result = buildRequestText({
      groupValue: 'foodsharing',
      subValue: SPECIAL.FOODSHARING,
      store: 'atb',
      timeSlot: 'now',
    });

    expect(result).toContain(getStoreLabel('atb'));
    expect(result).toContain(getTimeLabel('now'));
    expect(result).toMatch(/\s.\s/);
  });

  it('formats ride sharing request text (TC-2)', () => {
    const destination = 'Парк Перемога';
    const result = buildRequestText({
      groupValue: 'transport',
      subValue: SPECIAL.RIDE_SHARE,
      destination,
      timeSlot: 'tomorrow_morning',
    });

    expect(result).toContain(destination);
    expect(result).toContain(getTimeLabel('tomorrow_morning'));
    expect(result).toMatch(/\s.\s/);
  });

  it('returns plain subcategory label for regular category (TC-3)', () => {
    const result = buildRequestText({
      groupValue: 'repair',
      subValue: 'plumbing',
    });

    expect(result).toBe(getSubcategoryLabel('repair', 'plumbing'));
  });

  it('uses placeholders for incomplete special fields (TC-4 fallback)', () => {
    const food = buildRequestText({
      groupValue: 'foodsharing',
      subValue: SPECIAL.FOODSHARING,
    });

    const ride = buildRequestText({
      groupValue: 'transport',
      subValue: SPECIAL.RIDE_SHARE,
    });

    expect(food).toContain('—');
    expect(ride).toContain('—');
  });
});


import {
  SPECIAL,
  buildRequestText,
  getSubcategoryLabel,
} from '../data/categories';

describe('categories/buildRequestText', () => {
  it('formats foodsharing request text (TC-1)', () => {
    const result = buildRequestText({
      groupValue: 'foodsharing',
      subValue: SPECIAL.FOODSHARING,
      store: 'atb',
      timeSlot: 'now',
    });

    // buildRequestText now returns subcategory label only (store/time ignored)
    expect(result).toBe(getSubcategoryLabel('foodsharing', SPECIAL.FOODSHARING));
  });

  it('formats ride sharing request text (TC-2)', () => {
    const destination = 'Парк Перемога';
    const result = buildRequestText({
      groupValue: 'transport',
      subValue: SPECIAL.RIDE_SHARE,
      destination,
      timeSlot: 'tomorrow_morning',
    });

    // buildRequestText now returns subcategory label only
    expect(result).toBe(getSubcategoryLabel('transport', SPECIAL.RIDE_SHARE));
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


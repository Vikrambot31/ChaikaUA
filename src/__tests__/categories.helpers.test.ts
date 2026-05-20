import {
  CATEGORY_GROUPS,
  CHAIKA_STORES,
  TIME_SLOTS,
  getGroupLabel,
  getStoreLabel,
  getSubcategories,
  getSubcategoryLabel,
  getTimeLabel,
} from '../data/categories';

describe('categories/helpers', () => {
  it('returns subcategories for selected group', () => {
    const list = getSubcategories('repair');
    expect(list.length).toBeGreaterThan(0);
    expect(list.some((item) => item.value === 'plumbing')).toBe(true);
  });

  it('resolves group and subcategory labels', () => {
    const transport = CATEGORY_GROUPS.find((item) => item.value === 'transport');
    const rideShare = transport?.subcategories.find((item) => item.value === 'ride_share');
    expect(getGroupLabel('transport')).toBe(transport?.label);
    expect(getSubcategoryLabel('transport', 'ride_share')).toBe(rideShare?.label);
  });

  it('resolves store and time labels', () => {
    expect(getStoreLabel('silpo')).toBe(
      CHAIKA_STORES.find((item) => item.value === 'silpo')?.label,
    );
    expect(getTimeLabel('today_evening')).toBe(
      TIME_SLOTS.find((item) => item.value === 'today_evening')?.label,
    );
  });

  it('falls back to provided values when not found', () => {
    expect(getGroupLabel('unknown_group')).toBe('unknown_group');
    expect(getSubcategoryLabel('transport', 'unknown_sub')).toBe('unknown_sub');
    expect(getStoreLabel('unknown_store')).toBe('unknown_store');
    expect(getTimeLabel('unknown_time')).toBe('unknown_time');
  });
});

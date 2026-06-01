import AsyncStorage from '@react-native-async-storage/async-storage';

export type FoodAnalyticsEvent =
  | 'food_open_screen'
  | 'food_open_shopping'
  | 'food_select_category'
  | 'food_open_place'
  | 'food_call_place'
  | 'food_route_place'
  | 'food_open_telegram'
  | 'food_open_offer'
  | 'food_check_item';

type FoodAnalyticsMeta = {
  placeId?: string;
  category?: string;
};

type FoodAnalyticsCounters = Partial<Record<FoodAnalyticsEvent, number>>;
type FoodAnalyticsPayload = {
  counters: FoodAnalyticsCounters;
  byPlace: Record<string, FoodAnalyticsCounters>;
  byCategory: Record<string, FoodAnalyticsCounters>;
  updatedAt: number;
};

const ANALYTICS_KEY = '@chaika:food_analytics_v1';

const createEmptyPayload = (): FoodAnalyticsPayload => ({
  counters: {},
  byPlace: {},
  byCategory: {},
  updatedAt: Date.now(),
});

const incrementCounter = (target: FoodAnalyticsCounters, event: FoodAnalyticsEvent) => {
  target[event] = (target[event] ?? 0) + 1;
};

const readPayload = async (): Promise<FoodAnalyticsPayload> => {
  try {
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    if (!raw) return createEmptyPayload();
    const parsed = JSON.parse(raw) as Partial<FoodAnalyticsPayload>;
    return {
      counters: parsed.counters ?? {},
      byPlace: parsed.byPlace ?? {},
      byCategory: parsed.byCategory ?? {},
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return createEmptyPayload();
  }
};

export async function logFoodEvent(event: FoodAnalyticsEvent, meta: FoodAnalyticsMeta = {}): Promise<void> {
  try {
    const payload = await readPayload();
    incrementCounter(payload.counters, event);

    if (meta.placeId) {
      payload.byPlace[meta.placeId] = payload.byPlace[meta.placeId] ?? {};
      incrementCounter(payload.byPlace[meta.placeId], event);
    }

    if (meta.category) {
      payload.byCategory[meta.category] = payload.byCategory[meta.category] ?? {};
      incrementCounter(payload.byCategory[meta.category], event);
    }

    payload.updatedAt = Date.now();
    await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(payload));
  } catch {
    // Analytics must never block or break user flows.
  }
}

export async function getAnalyticsSummary(): Promise<FoodAnalyticsPayload> {
  return readPayload();
}

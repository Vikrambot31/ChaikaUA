import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { getFoodPlaces, getActiveFoodOffers, foodInfoSeed } from '../services/foodSeed';
import { logFoodEvent } from '../services/foodAnalytics';
import { FoodCategory, FoodOffer, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;
type ScreenMode = 'home' | 'eat';
type EatFilter = 'all' | 'pizza' | 'cafe' | 'restaurant';

const UI_TEXT = {
  ua: {
    title: 'Їжа на Чайці',
    subtitle: 'Поїсти, купити продукти, знайти акції',
    searchPlaceholder: 'Пошук: піца, кафе, магазин...',
    whatNeeded: 'Що потрібно?',
    eatNow: 'Поїсти зараз',
    eatNowDesc: 'Піца, кафе, ресторани поруч',
    shopping: 'Покупки на тиждень',
    shoppingDesc: 'Готовий список продуктів з галочками',
    offers: 'Акції поруч',
    offersDesc: 'Знижки кафе та магазинів',
    recommended: 'Рекомендуємо поруч',
    offersSection: 'Акції поруч',
    noOffers: 'Поки що немає активних акцій.',
    noPlaces: 'Нічого не знайдено.',
    back: 'Назад',
    call: 'Подзвонити',
    route: 'Маршрут',
    telegram: 'Telegram',
    open: 'Відчинено',
    openUntil: 'до',
    closed: 'Зачинено',
    hoursUnknown: 'Години уточнити',
    partner: 'Партнер',
    delivery: 'Доставка',
    validUntil: 'до',
    filters: {
      all: 'Всі',
      pizza: 'Піца',
      cafe: 'Кафе',
      restaurant: 'Ресторани',
    },
  },
  ru: {
    title: 'Еда на Чайке',
    subtitle: 'Поесть, купить продукты, найти акции',
    searchPlaceholder: 'Поиск: пицца, кафе, магазин...',
    whatNeeded: 'Что нужно?',
    eatNow: 'Поесть сейчас',
    eatNowDesc: 'Пицца, кафе, рестораны рядом',
    shopping: 'Покупки на неделю',
    shoppingDesc: 'Готовый список продуктов с галочками',
    offers: 'Акции рядом',
    offersDesc: 'Скидки кафе и магазинов',
    recommended: 'Рекомендуем рядом',
    offersSection: 'Акции рядом',
    noOffers: 'Пока нет активных акций.',
    noPlaces: 'Ничего не найдено.',
    back: 'Назад',
    call: 'Позвонить',
    route: 'Маршрут',
    telegram: 'Telegram',
    open: 'Открыто',
    openUntil: 'до',
    closed: 'Закрыто',
    hoursUnknown: 'Часы уточнить',
    partner: 'Партнёр',
    delivery: 'Доставка',
    validUntil: 'до',
    filters: {
      all: 'Все',
      pizza: 'Пицца',
      cafe: 'Кафе',
      restaurant: 'Рестораны',
    },
  },
  en: {
    title: 'Food at Chaika',
    subtitle: 'Eat, shop for groceries, find deals',
    searchPlaceholder: 'Search: pizza, cafe, shop...',
    whatNeeded: 'What do you need?',
    eatNow: 'Eat now',
    eatNowDesc: 'Pizza, cafes, restaurants nearby',
    shopping: 'Weekly shopping',
    shoppingDesc: 'Ready-made grocery list with checkboxes',
    offers: 'Deals nearby',
    offersDesc: 'Cafe and shop discounts',
    recommended: 'Recommended nearby',
    offersSection: 'Deals nearby',
    noOffers: 'No active deals yet.',
    noPlaces: 'Nothing found.',
    back: 'Back',
    call: 'Call',
    route: 'Route',
    telegram: 'Telegram',
    open: 'Open',
    openUntil: 'until',
    closed: 'Closed',
    hoursUnknown: 'Check hours',
    partner: 'Partner',
    delivery: 'Delivery',
    validUntil: 'until',
    filters: {
      all: 'All',
      pizza: 'Pizza',
      cafe: 'Cafe',
      restaurant: 'Restaurants',
    },
  },
} as const;

const EAT_FILTERS: { key: EatFilter; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { key: 'all', icon: 'view-grid-outline' },
  { key: 'pizza', icon: 'pizza' },
  { key: 'cafe', icon: 'coffee' },
  { key: 'restaurant', icon: 'silverware-fork-knife' },
];

// --- Helpers ---

/** Parse "09:00-22:00" format. Returns { isOpen, closingTime } or null if unparseable. */
function parseWorkingHours(workingHours?: string): { isOpen: boolean; closingTime: string } | null {
  if (!workingHours) return null;
  const match = workingHours.match(/^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const openH = parseInt(match[1], 10);
  const openM = parseInt(match[2], 10);
  const closeH = parseInt(match[3], 10);
  const closeM = parseInt(match[4], 10);

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  const closingTime = `${String(closeH).padStart(2, '0')}:${String(closeM).padStart(2, '0')}`;

  return { isOpen, closingTime };
}

function getPlaceFoodCategory(place: Place): FoodCategory | null {
  const info = foodInfoSeed[place.id];
  return info?.category ?? null;
}

function matchesEatFilter(place: Place, filter: EatFilter): boolean {
  if (filter === 'all') return true;
  const info = foodInfoSeed[place.id];
  if (!info) return false;
  if (filter === 'pizza') return info.subCategory === 'pizza';
  if (filter === 'cafe') return info.category === 'cafe';
  if (filter === 'restaurant') return info.category === 'restaurant';
  return false;
}

function openPhone(phone?: string) {
  const safePhone = phone?.trim();
  if (!safePhone) return;
  Linking.openURL(`tel:${safePhone}`);
}

function openRoute(lat: number, lng: number) {
  const url = Platform.select({
    ios: `maps:0,0?q=${lat},${lng}`,
    default: `geo:0,0?q=${lat},${lng}`,
  });
  Linking.openURL(url);
}

function openTelegram(telegram?: string) {
  const handle = telegram?.trim().replace('@', '').replace('https://t.me/', '');
  if (!handle) return;
  Linking.openURL(`https://t.me/${handle}`);
}

const formatOfferDate = (timestamp?: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// --- Component ---

export default function EdaNaChaykeScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const [mode, setMode] = useState<ScreenMode>('home');
  const [eatFilter, setEatFilter] = useState<EatFilter>('all');
  const [query, setQuery] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const offersSectionY = useRef(0);

  useEffect(() => {
    logFoodEvent('food_open_screen');
  }, []);

  const allFoodPlaces = useMemo(() => getFoodPlaces(chaykaPlaces), []);

  const activeOffers = useMemo(() => getActiveFoodOffers(chaykaPlaces), []);

  // Eat mode: filtered by category + search
  const eatPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allFoodPlaces.filter((place) => {
      // exclude grocery from eat mode
      const cat = getPlaceFoodCategory(place);
      if (cat === 'grocery') return false;
      if (!matchesEatFilter(place, eatFilter)) return false;
      if (!normalizedQuery) return true;
      return `${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery);
    });
  }, [allFoodPlaces, eatFilter, query]);

  // Home mode: recommended (non-grocery, max 4)
  const recommendedPlaces = useMemo(() => {
    return allFoodPlaces
      .filter((p) => getPlaceFoodCategory(p) !== 'grocery')
      .slice(0, 4);
  }, [allFoodPlaces]);

  // Home mode: offers with places
  const offersWithPlaces = useMemo(() => {
    return activeOffers.map((offer) => ({
      offer,
      place: allFoodPlaces.find((p) => p.id === offer.placeId),
    }));
  }, [activeOffers, allFoodPlaces]);

  // Home mode: search across all food places
  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return null;
    return allFoodPlaces.filter((place) =>
      `${place.name} ${place.address}`.toLowerCase().includes(normalizedQuery),
    );
  }, [allFoodPlaces, query]);

  const handleBack = useCallback(() => {
    if (mode === 'eat') {
      setMode('home');
      setEatFilter('all');
      setQuery('');
    } else {
      navigation.goBack();
    }
  }, [mode, navigation]);

  const handleEatNow = useCallback(() => {
    logFoodEvent('food_select_category', { category: 'eat_now' });
    setMode('eat');
    setQuery('');
  }, []);

  const handleShopping = useCallback(() => {
    navigation.navigate('SpisokPokupokScreen');
  }, [navigation]);

  const handleOffersScroll = useCallback(() => {
    logFoodEvent('food_open_offer', { category: 'offers' });
    scrollRef.current?.scrollTo({ y: Math.max(offersSectionY.current - 8, 0), animated: true });
  }, []);

  const handleCallPlace = useCallback((place: Place) => {
    if (!place.phone) return;
    logFoodEvent('food_call_place', { placeId: place.id });
    openPhone(place.phone);
  }, []);

  const handleRoutePlace = useCallback((place: Place) => {
    logFoodEvent('food_route_place', { placeId: place.id });
    openRoute(place.latitude, place.longitude);
  }, []);

  const handleTelegramPlace = useCallback((place: Place, telegram?: string) => {
    if (!telegram) return;
    logFoodEvent('food_open_telegram', { placeId: place.id });
    openTelegram(telegram);
  }, []);

  const handleOpenPlaceDetail = useCallback((place: Place) => {
    const parsed = parseWorkingHours(place.workingHours);
    logFoodEvent('food_open_place', { placeId: place.id });
    navigation.navigate('ItemDetailScreen', {
      item: {
        id: place.id,
        title: place.name,
        address: place.address,
        phone: place.phone,
        status: parsed
          ? parsed.isOpen
            ? `${text.open} ${text.openUntil} ${parsed.closingTime}`
            : text.closed
          : text.hoursUnknown,
        sourceType: 'place',
        sourceId: place.id,
      },
    });
  }, [navigation, text.closed, text.hoursUnknown, text.open, text.openUntil]);

  // --- Render helpers ---

  const renderStatusBadge = (place: Place) => {
    const parsed = parseWorkingHours(place.workingHours);
    if (!parsed) {
      return (
        <View style={[styles.statusBadge, styles.statusUnknown]}>
          <Text style={styles.statusUnknownText}>{text.hoursUnknown}</Text>
        </View>
      );
    }
    if (parsed.isOpen) {
      return (
        <View style={[styles.statusBadge, styles.statusOpen]}>
          <Text style={styles.statusOpenText}>{text.open} {text.openUntil} {parsed.closingTime}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.statusBadge, styles.statusClosed]}>
        <Text style={styles.statusClosedText}>{text.closed}</Text>
      </View>
    );
  };

  const renderPlaceCard = (place: Place) => {
    const info = foodInfoSeed[place.id];
    const hasTelegram = !!(info?.telegram);
    const hasPhone = !!place.phone;
    const isPartner = false; // MVP: no paid places yet
    const hasDelivery = !!info?.deliveryAvailable;

    return (
      <TouchableOpacity
        key={place.id}
        style={styles.placeCard}
        activeOpacity={0.88}
        onPress={() => handleOpenPlaceDetail(place)}
      >
        <View style={styles.placeHeader}>
          <View style={styles.placeTitleBlock}>
            <Text style={styles.placeTitle} numberOfLines={2}>{place.name}</Text>
            <View style={styles.placeMetaRow}>
              {renderStatusBadge(place)}
              {isPartner && (
                <View style={styles.partnerBadge}>
                  <Text style={styles.partnerBadgeText}>{text.partner}</Text>
                </View>
              )}
              {hasDelivery && (
                <View style={styles.deliveryBadge}>
                  <Text style={styles.deliveryBadgeText}>{text.delivery}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View style={styles.addressRow}>
          <MaterialCommunityIcons name="map-marker-outline" size={16} color={SCREEN_THEME.textMuted} />
          <Text style={styles.addressText} numberOfLines={1}>{place.address}</Text>
        </View>

        <View style={styles.cardActions}>
          {hasPhone && (
            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.85}
              onPress={(event) => {
                event.stopPropagation?.();
                handleCallPlace(place);
              }}
            >
              <MaterialCommunityIcons name="phone" size={16} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>{text.call}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            activeOpacity={0.85}
            onPress={(event) => {
              event.stopPropagation?.();
              handleRoutePlace(place);
            }}
          >
            <MaterialCommunityIcons name="map-marker-radius" size={16} color={SCREEN_THEME.enamelBlueDark} />
            <Text style={styles.actionButtonSecondaryText}>{text.route}</Text>
          </TouchableOpacity>
          {hasTelegram && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonTelegram]}
              activeOpacity={0.85}
              onPress={(event) => {
                event.stopPropagation?.();
                handleTelegramPlace(place, info?.telegram);
              }}
            >
              <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
              <Text style={styles.actionButtonText}>{text.telegram}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderOfferCard = (offer: FoodOffer, placeName?: string) => {
    const dateStr = offer.validUntil ? `${text.validUntil} ${formatOfferDate(offer.validUntil)}` : '';
    return (
      <TouchableOpacity
        key={offer.id}
        style={styles.offerCard}
        activeOpacity={0.86}
        onPress={() => logFoodEvent('food_open_offer', { placeId: offer.placeId })}
      >
        <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
        <Text style={styles.offerShortText} numberOfLines={2}>{offer.shortText}</Text>
        {dateStr ? <Text style={styles.offerMeta}>{dateStr}</Text> : null}
        {placeName ? <Text style={styles.offerPlaceName} numberOfLines={1}>{placeName}</Text> : null}
      </TouchableOpacity>
    );
  };

  const renderCTA = (
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'],
    title: string,
    desc: string,
    color: string,
    onPress: () => void,
  ) => (
    <TouchableOpacity style={styles.ctaButton} activeOpacity={0.88} onPress={onPress}>
      <View style={[styles.ctaIcon, { backgroundColor: color }]}>
        <MaterialCommunityIcons name={icon} size={28} color="#FFFFFF" />
      </View>
      <View style={styles.ctaTextBlock}>
        <Text style={styles.ctaTitle}>{title}</Text>
        <Text style={styles.ctaDesc}>{desc}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color={SCREEN_THEME.textMuted} />
    </TouchableOpacity>
  );

  // --- EAT MODE ---
  if (mode === 'eat') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.hero}>
            <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.8}>
              <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
            </TouchableOpacity>
            <View style={styles.heroTextBlock}>
              <Text style={styles.title}>{text.eatNow}</Text>
              <Text style={styles.subtitle}>{text.eatNowDesc}</Text>
            </View>
          </View>

          {/* Search */}
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={22} color={SCREEN_THEME.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={text.searchPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              style={styles.searchInput}
            />
          </View>

          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
            {EAT_FILTERS.map((filter) => {
              const isActive = eatFilter === filter.key;
              return (
                <TouchableOpacity
                  key={filter.key}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => {
                    logFoodEvent('food_select_category', { category: filter.key });
                    setEatFilter(filter.key);
                  }}
                  activeOpacity={0.84}
                >
                  <MaterialCommunityIcons
                    name={filter.icon}
                    size={18}
                    color={isActive ? '#FFFFFF' : SCREEN_THEME.enamelBlueDark}
                  />
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {text.filters[filter.key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Place list */}
          {eatPlaces.length > 0 ? (
            <View style={styles.cardList}>
              {eatPlaces.map((place) => renderPlaceCard(place))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="magnify-close" size={34} color={SCREEN_THEME.textMuted} />
              <Text style={styles.emptyText}>{text.noPlaces}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // --- HOME MODE ---
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroTextBlock}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={22} color={SCREEN_THEME.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={text.searchPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            style={styles.searchInput}
          />
        </View>

        {/* Search results */}
        {searchResults != null ? (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{text.recommended}</Text>
              <Text style={styles.resultCount}>{searchResults.length}</Text>
            </View>
            {searchResults.length > 0 ? (
              <View style={styles.cardList}>
                {searchResults.map((place) => renderPlaceCard(place))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="magnify-close" size={34} color={SCREEN_THEME.textMuted} />
                <Text style={styles.emptyText}>{text.noPlaces}</Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* CTA buttons */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{text.whatNeeded}</Text>
            </View>

            {renderCTA('pizza', text.eatNow, text.eatNowDesc, '#E07B39', handleEatNow)}
            {renderCTA('cart', text.shopping, text.shoppingDesc, SCREEN_THEME.enamelBlueDark, handleShopping)}
            {renderCTA('fire', text.offers, text.offersDesc, '#C0392B', handleOffersScroll)}

            {/* Recommended nearby */}
            {recommendedPlaces.length > 0 && (
              <>
                <View style={[styles.sectionHeaderRow, { marginTop: 10 }]}>
                  <Text style={styles.sectionTitle}>{text.recommended}</Text>
                </View>
                <View style={styles.cardList}>
                  {recommendedPlaces.map((place) => renderPlaceCard(place))}
                </View>
              </>
            )}

            <View onLayout={(event) => { offersSectionY.current = event.nativeEvent.layout.y; }}>
              {/* Offers */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{text.offersSection}</Text>
              </View>
              {offersWithPlaces.length > 0 ? (
                <View style={styles.cardList}>
                  {offersWithPlaces.map(({ offer, place }) =>
                    renderOfferCard(offer, place?.name),
                  )}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="tag-off-outline" size={34} color={SCREEN_THEME.textMuted} />
                  <Text style={styles.emptyText}>{text.noOffers}</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  content: {
    padding: 16,
    paddingBottom: 34,
  },

  // Hero
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    ...SCREEN_THEME.raisedShadow,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.accentCream,
    marginRight: 12,
  },
  heroTextBlock: {
    flex: 1,
  },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 19,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
  },

  // Search
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 50,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 18,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },

  // Section headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  resultCount: {
    minWidth: 30,
    textAlign: 'center',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: SCREEN_THEME.accentCream,
    color: SCREEN_THEME.textSecondary,
    fontWeight: '900',
  },

  // CTA
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    ...SCREEN_THEME.raisedShadow,
  },
  ctaIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  ctaTextBlock: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  ctaDesc: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 17,
  },

  // Category chips (eat mode)
  categoryList: {
    paddingBottom: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    borderColor: SCREEN_THEME.enamelBlueDark,
  },
  categoryChipText: {
    marginLeft: 6,
    fontSize: 13,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '900',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },

  // Place card
  cardList: {
    gap: 10,
    marginBottom: 18,
  },
  placeCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    shadowColor: '#5C3A1E',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  placeTitleBlock: {
    flex: 1,
  },
  placeTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  placeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },

  // Status badges
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusOpen: {
    backgroundColor: '#E8F5E9',
  },
  statusOpenText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2E7D32',
  },
  statusClosed: {
    backgroundColor: '#FFEBEE',
  },
  statusClosedText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C62828',
  },
  statusUnknown: {
    backgroundColor: '#F5F5F5',
  },
  statusUnknownText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9E9E9E',
  },
  partnerBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: SCREEN_THEME.accentCream,
  },
  partnerBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: SCREEN_THEME.accentGold,
  },
  deliveryBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#E3F2FD',
  },
  deliveryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },

  // Address
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  addressText: {
    flex: 1,
    marginLeft: 5,
    color: SCREEN_THEME.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    gap: 5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  actionButtonSecondary: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  actionButtonSecondaryText: {
    color: SCREEN_THEME.enamelBlueDark,
    fontWeight: '900',
    fontSize: 13,
  },
  actionButtonTelegram: {
    backgroundColor: '#2AABEE',
  },

  // Offers
  offerCard: {
    backgroundColor: '#FFF7E3',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(216, 175, 89, 0.35)',
  },
  offerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 18,
  },
  offerShortText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 16,
  },
  offerMeta: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '900',
    color: SCREEN_THEME.terracotta,
  },
  offerPlaceName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 18,
  },
  emptyText: {
    marginTop: 10,
    textAlign: 'center',
    color: SCREEN_THEME.textSecondary,
    fontWeight: '700',
    lineHeight: 20,
  },
});

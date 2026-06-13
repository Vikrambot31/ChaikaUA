import React, { useCallback, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { getFavorites, removeFavorite, invalidateFavoritesCache, type FavoriteItem, type FavoriteSource } from '../services/favoritesService';
import { useSoftToast } from '../hooks/useSoftToast';
import { Place } from '../types/app';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    title: 'Обране',
    subtitle: 'Ваші збережені місця',
    emptyTitle: 'Поки тут порожньо',
    emptyText: 'Зберігайте цікаві місця, натискаючи на закладку на картці.',
    remove: 'Видалити',
    removed: 'Видалено з обраного',
    removeFailed: 'Не вдалося видалити. Спробуйте ще раз.',
    openMissing: 'Місце не знайдено. Його можна видалити з обраного.',
    sources: {
      kids: 'Для дітей',
      food: 'Їжа',
      beauty: 'Краса',
      sport: 'Спорт',
      places: 'Місця',
      jobs: 'Робота',
    } as Record<FavoriteSource, string>,
  },
  ru: {
    title: 'Избранное',
    subtitle: 'Ваши сохраненные места',
    emptyTitle: 'Пока тут пусто',
    emptyText: 'Сохраняйте интересные места, нажимая на закладку на карточке.',
    remove: 'Удалить',
    removed: 'Удалено из избранного',
    removeFailed: 'Не удалось удалить. Попробуйте еще раз.',
    openMissing: 'Место не найдено. Его можно удалить из избранного.',
    sources: {
      kids: 'Для детей',
      food: 'Еда',
      beauty: 'Красота',
      sport: 'Спорт',
      places: 'Места',
      jobs: 'Работа',
    } as Record<FavoriteSource, string>,
  },
  en: {
    title: 'Favorites',
    subtitle: 'Your saved places',
    emptyTitle: 'Nothing here yet',
    emptyText: 'Save interesting places by tapping the bookmark icon on a card.',
    remove: 'Remove',
    removed: 'Removed from favorites',
    removeFailed: 'Could not remove it. Try again.',
    openMissing: 'This place was not found. You can remove it from favorites.',
    sources: {
      kids: 'For kids',
      food: 'Food',
      beauty: 'Beauty',
      sport: 'Sport',
      places: 'Places',
      jobs: 'Jobs',
    } as Record<FavoriteSource, string>,
  },
} as const;

const SOURCE_ICONS: Record<FavoriteSource, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  kids: 'baby-face-outline',
  food: 'silverware-fork-knife',
  beauty: 'content-cut',
  sport: 'basketball',
  places: 'map-marker-outline',
  jobs: 'briefcase-outline',
};

const SOURCE_COLORS: Record<FavoriteSource, string> = {
  kids: '#C77A5D',
  food: '#E8A44A',
  beauty: '#D87B8C',
  sport: '#5F84B4',
  places: '#7E9D69',
  jobs: '#8D7AB8',
};

type ResolvedFavorite = FavoriteItem & { place?: Place };

export default function FavoritesScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;
  const [items, setItems] = useState<ResolvedFavorite[]>([]);
  const { showError, showSuccess } = useSoftToast();

  useFocusEffect(
    useCallback(() => {
      invalidateFavoritesCache();
      getFavorites().then((favs) => {
        const placesMap = new Map(chaykaPlaces.map((p) => [p.id, p]));
        setItems(
          favs
            .map((fav) => ({ ...fav, place: placesMap.get(fav.id) }))
            .sort((a, b) => b.addedAt - a.addedAt),
        );
      });
    }, []),
  );

  const handleRemove = async (id: string, source: FavoriteSource) => {
    try {
      await removeFavorite(id, source);
      setItems((prev) => prev.filter((item) => !(item.id === id && item.source === source)));
      showSuccess(text.removed);
    } catch {
      showError(text.removeFailed);
    }
  };

  const handleOpen = (item: ResolvedFavorite) => {
    if (!item.place) {
      showError(text.openMissing);
      return;
    }
    switch (item.source) {
      case 'kids':
        navigation.navigate('DetalDetskogoMestaScreen', { place: item.place });
        break;
      case 'beauty':
        navigation.navigate('DetalSalonaScreen', { place: item.place });
        break;
      default:
        navigation.navigate('PlaceDetailsPanel', { place: item.place });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroTextBlock}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
          </View>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="bookmark-off-outline" size={40} color={SCREEN_THEME.textMuted} />
            <Text style={styles.emptyTitle}>{text.emptyTitle}</Text>
            <Text style={styles.emptyText}>{text.emptyText}</Text>
          </View>
        ) : (
          <View style={styles.cardList}>
            {items.map((item) => {
              const sourceLabel = text.sources[item.source] ?? item.source;
              const iconName = SOURCE_ICONS[item.source] ?? 'map-marker-outline';
              const iconColor = SOURCE_COLORS[item.source] ?? SCREEN_THEME.enamelBlueDark;

              return (
                <TouchableOpacity
                  key={`${item.source}-${item.id}`}
                  style={styles.card}
                  activeOpacity={0.88}
                  onPress={() => handleOpen(item)}
                >
                  <View style={[styles.cardIcon, { backgroundColor: iconColor + '20' }]}>
                    <MaterialCommunityIcons name={iconName} size={22} color={iconColor} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.place?.name ?? item.id}
                    </Text>
                    {item.place?.address ? (
                      <Text style={styles.cardAddress} numberOfLines={1}>{item.place.address}</Text>
                    ) : null}
                    <Text style={styles.cardSource}>{sourceLabel}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={(e) => { e.stopPropagation(); void handleRemove(item.id, item.source); }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="bookmark-remove-outline" size={22} color={SCREEN_THEME.textMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
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
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 18,
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 32,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginTop: 20,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  emptyText: {
    marginTop: 6,
    textAlign: 'center',
    color: SCREEN_THEME.textSecondary,
    fontWeight: '600',
    lineHeight: 20,
    fontSize: 13,
  },
  cardList: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    shadowColor: '#6B3A5A',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    lineHeight: 19,
  },
  cardAddress: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: SCREEN_THEME.textMuted,
  },
  cardSource: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.enamelBlueDark,
  },
  removeButton: {
    padding: 6,
    marginLeft: 8,
  },
});

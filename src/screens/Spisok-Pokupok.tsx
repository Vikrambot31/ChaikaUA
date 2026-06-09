import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { getDefaultShoppingList, getFoodPlaces, foodInfoSeed } from '../services/foodSeed';
import { logFoodEvent } from '../services/foodAnalytics';
import { ShoppingCategory, ShoppingItem, Place } from '../types/app';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';
type AppNavigation = NavigationProp<Record<string, object | undefined>>;

const STORAGE_KEY = '@chaika:shopping_list_v1';

const CATEGORY_ORDER: ShoppingCategory[] = [
  'dairy', 'bread', 'meat_fish', 'vegetables', 'groats', 'sauces', 'drinks', 'snacks',
];

const CATEGORY_ICONS: Record<ShoppingCategory, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  dairy: 'cheese',
  bread: 'bread-slice',
  meat_fish: 'food-steak',
  vegetables: 'carrot',
  groats: 'grain',
  sauces: 'bottle-soda-classic',
  drinks: 'cup-water',
  snacks: 'cookie',
  other: 'dots-horizontal',
};

const UI_TEXT = {
  ua: {
    title: 'Покупки на тиждень',
    subtitle: 'Відмічайте куплене',
    bought: 'Куплено',
    newWeek: 'Новий тиждень',
    restoreHidden: 'Повернути приховані',
    addItemPlaceholder: 'Додати свій пункт...',
    add: 'Додати',
    shopsNearby: 'Магазини поруч',
    noShops: 'Немає магазинів поруч.',
    route: 'Маршрут',
    call: 'Подзвонити',
    categories: {
      dairy: 'Молочні продукти',
      bread: 'Хліб та випічка',
      meat_fish: 'М\'ясо та риба',
      vegetables: 'Овочі та фрукти',
      groats: 'Крупи та макарони',
      sauces: 'Соуси та спеції',
      drinks: 'Напої',
      snacks: 'Снеки та солодощі',
      other: 'Інше',
    },
  },
  ru: {
    title: 'Покупки на неделю',
    subtitle: 'Отмечайте купленное',
    bought: 'Куплено',
    newWeek: 'Новая неделя',
    restoreHidden: 'Вернуть скрытые',
    addItemPlaceholder: 'Добавить свой пункт...',
    add: 'Добавить',
    shopsNearby: 'Магазины рядом',
    noShops: 'Нет магазинов рядом.',
    route: 'Маршрут',
    call: 'Позвонить',
    categories: {
      dairy: 'Молочные продукты',
      bread: 'Хлеб и выпечка',
      meat_fish: 'Мясо и рыба',
      vegetables: 'Овощи и фрукты',
      groats: 'Крупы и макароны',
      sauces: 'Соусы и специи',
      drinks: 'Напитки',
      snacks: 'Снеки и сладости',
      other: 'Другое',
    },
  },
  en: {
    title: 'Weekly Shopping',
    subtitle: 'Check off purchased items',
    bought: 'Bought',
    newWeek: 'New week',
    restoreHidden: 'Restore hidden',
    addItemPlaceholder: 'Add your own item...',
    add: 'Add',
    shopsNearby: 'Shops nearby',
    noShops: 'No shops nearby.',
    route: 'Route',
    call: 'Call',
    categories: {
      dairy: 'Dairy',
      bread: 'Bread & bakery',
      meat_fish: 'Meat & fish',
      vegetables: 'Vegetables & fruits',
      groats: 'Grains & pasta',
      sauces: 'Sauces & spices',
      drinks: 'Drinks',
      snacks: 'Snacks & sweets',
      other: 'Other',
    },
  },
} as const;

// --- Component ---

export default function SpisokPokupokScreen() {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ShoppingCategory>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const addInputRef = useRef<TextInput>(null);

  useEffect(() => {
    logFoodEvent('food_open_shopping');
  }, []);

  // Load from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed: ShoppingItem[] = JSON.parse(stored);
          // Merge with defaults: keep user state, add any new items from seed
          const defaults = getDefaultShoppingList();
          const storedIds = new Set(parsed.map((i) => i.id));
          const merged = [
            ...parsed,
            ...defaults.filter((d) => !storedIds.has(d.id)),
          ];
          setItems(merged);
        } catch {
          setItems(getDefaultShoppingList());
        }
      } else {
        setItems(getDefaultShoppingList());
      }
      setIsLoaded(true);
    });
  }, []);

  // Save to AsyncStorage on change
  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, isLoaded]);

  // Stats (only visible items)
  const visibleItems = useMemo(() => items.filter((i) => !i.isHidden), [items]);
  const checkedCount = useMemo(() => visibleItems.filter((i) => i.isChecked).length, [visibleItems]);
  const totalVisible = visibleItems.length;
  const progress = totalVisible > 0 ? checkedCount / totalVisible : 0;
  const hasHidden = useMemo(() => items.some((i) => i.isHidden), [items]);

  // Grouped by category
  const grouped = useMemo(() => {
    const map = new Map<ShoppingCategory, ShoppingItem[]>();
    for (const cat of CATEGORY_ORDER) {
      const catItems = visibleItems
        .filter((i) => i.category === cat)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (catItems.length > 0) map.set(cat, catItems);
    }
    return map;
  }, [visibleItems]);

  // Grocery shops
  const groceryShops = useMemo(() => {
    return getFoodPlaces(chaykaPlaces).filter(
      (p) => foodInfoSeed[p.id]?.category === 'grocery',
    );
  }, []);

  const toggleCheck = useCallback((id: string) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item) {
      logFoodEvent('food_check_item', { category: item.category });
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isChecked: !i.isChecked } : i)),
    );
  }, [items]);

  const hideItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isHidden: true } : i)),
    );
  }, []);

  const newWeek = useCallback(() => {
    setItems((prev) =>
      prev.map((i) => ({ ...i, isChecked: false })),
    );
  }, []);

  const restoreHidden = useCallback(() => {
    setItems((prev) =>
      prev.map((i) => ({ ...i, isHidden: false })),
    );
  }, []);

  const addCustomItem = useCallback(() => {
    const name = newItemText.trim();
    if (!name) return;
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem: ShoppingItem = {
      id,
      name,
      category: 'other',
      icon: 'dots-horizontal',
      isChecked: false,
      isHidden: false,
      sortOrder: Date.now(),
    };
    setItems((prev) => [...prev, newItem]);
    setNewItemText('');
    addInputRef.current?.blur();
  }, [newItemText]);

  const toggleCategory = useCallback((cat: ShoppingCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const openRoute = (place: Place) => {
    logFoodEvent('food_route_place', { placeId: place.id });
    const url = Platform.select({
      ios: `maps:0,0?q=${place.latitude},${place.longitude}`,
      default: `geo:0,0?q=${place.latitude},${place.longitude}`,
    });
    Linking.openURL(url);
  };

  const openPhone = (place: Place) => {
    const safePhone = place.phone?.trim();
    if (!safePhone) return;
    logFoodEvent('food_call_place', { placeId: place.id });
    Linking.openURL(`tel:${safePhone}`);
  };

  if (!isLoaded) return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={SCREEN_THEME.textPrimary} />
          </TouchableOpacity>
          <View style={styles.heroTextBlock}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.subtitle}>{text.subtitle}</Text>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressCard}>
          <Text style={styles.progressLabel}>
            {text.bought} {checkedCount}/{totalVisible}
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85} onPress={newWeek}>
            <MaterialCommunityIcons name="refresh" size={18} color={SCREEN_THEME.enamelBlueDark} />
            <Text style={styles.actionBtnText}>{text.newWeek}</Text>
          </TouchableOpacity>
          {hasHidden && (
            <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85} onPress={restoreHidden}>
              <MaterialCommunityIcons name="eye-outline" size={18} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={styles.actionBtnText}>{text.restoreHidden}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Add custom item */}
        <View style={styles.addItemRow}>
          <TextInput
            ref={addInputRef}
            style={styles.addItemInput}
            value={newItemText}
            onChangeText={setNewItemText}
            placeholder={text.addItemPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            onSubmitEditing={addCustomItem}
            returnKeyType="done"
            maxLength={80}
          />
          <TouchableOpacity style={styles.addItemBtn} activeOpacity={0.85} onPress={addCustomItem}>
            <MaterialCommunityIcons name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Shopping list by categories */}
        {Array.from(grouped.entries()).map(([cat, catItems]) => {
          const isCollapsed = collapsedCategories.has(cat);
          const catChecked = catItems.filter((i) => i.isChecked).length;
          return (
            <View key={cat} style={styles.categorySection}>
              <TouchableOpacity
                style={styles.categoryHeader}
                activeOpacity={0.85}
                onPress={() => toggleCategory(cat)}
              >
                <MaterialCommunityIcons
                  name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                  size={22}
                  color={SCREEN_THEME.textPrimary}
                />
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[cat]}
                  size={20}
                  color={SCREEN_THEME.enamelBlueDark}
                  style={{ marginLeft: 4 }}
                />
                <Text style={styles.categoryTitle}>{text.categories[cat]}</Text>
                <Text style={styles.categoryStat}>{catChecked}/{catItems.length}</Text>
              </TouchableOpacity>

              {!isCollapsed && catItems.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <TouchableOpacity
                    style={styles.checkboxArea}
                    activeOpacity={0.7}
                    onPress={() => toggleCheck(item.id)}
                  >
                    <MaterialCommunityIcons
                      name={item.isChecked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={24}
                      color={item.isChecked ? '#4CAF50' : SCREEN_THEME.textMuted}
                    />
                    <Text
                      style={[
                        styles.itemName,
                        item.isChecked && styles.itemNameChecked,
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.hideButton}
                    activeOpacity={0.7}
                    onPress={() => hideItem(item.id)}
                  >
                    <MaterialCommunityIcons name="close" size={18} color={SCREEN_THEME.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          );
        })}

        {/* Grocery shops nearby */}
        {groceryShops.length > 0 && (
          <>
            <View style={[styles.sectionHeaderRow, { marginTop: 14 }]}>
              <Text style={styles.sectionTitle}>{text.shopsNearby}</Text>
            </View>
            <View style={styles.shopsList}>
              {groceryShops.map((shop) => (
                <View key={shop.id} style={styles.shopCard}>
                  <View style={styles.shopInfo}>
                    <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
                    <View style={styles.shopAddressRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={14} color={SCREEN_THEME.textMuted} />
                      <Text style={styles.shopAddress} numberOfLines={1}>{shop.address}</Text>
                    </View>
                  </View>
                  <View style={styles.shopActions}>
                    {shop.phone && (
                      <TouchableOpacity
                        style={styles.shopActionBtn}
                        activeOpacity={0.85}
                        onPress={() => openPhone(shop)}
                      >
                        <MaterialCommunityIcons name="phone" size={16} color={SCREEN_THEME.enamelBlueDark} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.shopActionBtn}
                      activeOpacity={0.85}
                      onPress={() => openRoute(shop)}
                    >
                      <MaterialCommunityIcons name="map-marker-radius" size={16} color={SCREEN_THEME.enamelBlueDark} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
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

  // Progress
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 12,
    gap: 10,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  progressBarBg: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E8E8E8',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#4CAF50',
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '900',
    color: SCREEN_THEME.textSecondary,
    minWidth: 36,
    textAlign: 'right',
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: SCREEN_THEME.enamelBlueDark,
  },

  // Add custom item
  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  addItemInput: {
    flex: 1,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: SCREEN_THEME.textPrimary,
  },
  addItemBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: SCREEN_THEME.enamelBlueDark,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Category section
  categorySection: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    marginBottom: 10,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  categoryTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  categoryStat: {
    fontSize: 12,
    fontWeight: '800',
    color: SCREEN_THEME.textMuted,
  },

  // Item row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: SCREEN_THEME.borderSoft,
  },
  checkboxArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: SCREEN_THEME.textPrimary,
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: SCREEN_THEME.textMuted,
  },
  hideButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section header
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

  // Shops
  shopsList: {
    gap: 8,
    marginBottom: 18,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
  },
  shopInfo: {
    flex: 1,
  },
  shopName: {
    fontSize: 15,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  shopAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  shopAddress: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: SCREEN_THEME.textMuted,
  },
  shopActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  shopActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.accentCream,
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { database, firebaseChatAPI } from '../firebase-config';
import { RootState } from '../redux/store';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import {
  ChatRequestLike,
  filterChatRequests,
  getChatRequestTimestamp,
  normalizeChatRequests,
} from '../utils/chatRequests';
import TactileIcon from '../components/TactileIcon';
import TactileCard from '../components/TactileCard';
import TactileInput from '../components/TactileInput';
import TactileButton from '../components/TactileButton';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { getUserErrorMessage, showUserError } from '../utils/userFacingErrors';
import { pickUserAvatarUri, resolveUserAvatarMap } from '../utils/userAvatar';
import { useContactRequest } from '../hooks/useContactRequest';
import ContactReasonModal from '../components/ContactReasonModal';
import { safeCallPhone } from '../utils/communicationActions';

type ChatRequest = ChatRequestLike;

type ChatNavigation = NativeStackNavigationProp<Record<string, object | undefined>>;

const UI_TEXT = {
  ua: {
    title: 'Онлайн чат заявок',
    search: 'Пошук заявок...',
    empty: 'Нових заявок поки немає',
    add: 'Додати заявку',
    noDescription: 'Без опису',
    loadFailed: 'Не вдалося завантажити заявки.',
    retry: 'Спробувати ще раз',
    loadMore: 'Завантажити ще',
    requestsCount: 'заявок',
    timeMinute: 'хв',
    timeHour: 'год',
    timeDay: 'дн',
    allLabel: 'Всі',
    categories: [
      { id: 'repair', label: 'Ремонт', icon: 'wrench-outline' },
      { id: 'medical', label: 'Медична', icon: 'medical-bag' },
      { id: 'cleaning', label: 'Прибирання', icon: 'broom' },
      { id: 'delivery', label: 'Доставка', icon: 'package-variant' },
      { id: 'legal', label: 'Юрист', icon: 'scale-balance' },
      { id: 'care', label: 'Догляд', icon: 'heart-outline' },
      { id: 'tech', label: 'Техніка', icon: 'laptop' },
      { id: 'electricity', label: 'Світло', icon: 'transmission-tower' },
      { id: 'moving', label: 'Переїзд', icon: 'truck-outline' },
      { id: 'other', label: 'Інше', icon: 'dots-horizontal' },
    ],
  },
  ru: {
    title: 'Онлайн чат заявок',
    search: 'Поиск заявок...',
    empty: 'Новых заявок пока нет',
    add: 'Добавить заявку',
    noDescription: 'Без описания',
    loadFailed: 'Не удалось загрузить заявки.',
    retry: 'Повторить',
    loadMore: 'Загрузить ещё',
    requestsCount: 'заявок',
    timeMinute: 'мин',
    timeHour: 'ч',
    timeDay: 'дн',
    allLabel: 'Все',
    categories: [
      { id: 'repair', label: 'Ремонт', icon: 'wrench-outline' },
      { id: 'medical', label: 'Медицина', icon: 'medical-bag' },
      { id: 'cleaning', label: 'Уборка', icon: 'broom' },
      { id: 'delivery', label: 'Доставка', icon: 'package-variant' },
      { id: 'legal', label: 'Юрист', icon: 'scale-balance' },
      { id: 'care', label: 'Уход', icon: 'heart-outline' },
      { id: 'tech', label: 'Техника', icon: 'laptop' },
      { id: 'electricity', label: 'Свет', icon: 'transmission-tower' },
      { id: 'moving', label: 'Переезд', icon: 'truck-outline' },
      { id: 'other', label: 'Другое', icon: 'dots-horizontal' },
    ],
  },
  en: {
    title: 'Online request chat',
    search: 'Search requests...',
    empty: 'No new requests yet',
    add: 'Add request',
    noDescription: 'No description',
    loadFailed: 'Failed to load requests.',
    retry: 'Try again',
    loadMore: 'Load more',
    requestsCount: 'requests',
    timeMinute: 'min',
    timeHour: 'h',
    timeDay: 'd',
    allLabel: 'All',
    categories: [
      { id: 'repair', label: 'Repair', icon: 'wrench-outline' },
      { id: 'medical', label: 'Medical', icon: 'medical-bag' },
      { id: 'cleaning', label: 'Cleaning', icon: 'broom' },
      { id: 'delivery', label: 'Delivery', icon: 'package-variant' },
      { id: 'legal', label: 'Legal', icon: 'scale-balance' },
      { id: 'care', label: 'Care', icon: 'heart-outline' },
      { id: 'tech', label: 'Tech', icon: 'laptop' },
      { id: 'electricity', label: 'Power', icon: 'transmission-tower' },
      { id: 'moving', label: 'Moving', icon: 'truck-outline' },
      { id: 'other', label: 'Other', icon: 'dots-horizontal' },
    ],
  },
} as const;

const PAGE_SIZE = 20;
const CATEGORY_STORAGE_KEY = 'online-chat:selected-category';

const OnlineChatScreen = () => {
  const navigation = useNavigation<ChatNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();
  const text = UI_TEXT[language];
  const deleteText = language === 'en'
    ? {
        action: 'Delete',
        title: 'Delete request?',
        body: 'It will disappear from the requests chat for everyone.',
        error: 'Failed to delete request.',
        cancel: 'Cancel',
      }
    : language === 'ru'
      ? {
          action: 'Удалить',
          title: 'Удалить заявку?',
          body: 'Она исчезнет из чата заявок для всех.',
          error: 'Не удалось удалить заявку.',
          cancel: 'Отмена',
        }
      : {
          action: 'Видалити',
          title: 'Видалити заявку?',
          body: 'Вона зникне з чату заявок для всіх.',
          error: 'Не вдалося видалити заявку.',
          cancel: 'Скасувати',
        };
  const [requests, setRequests] = useState<ChatRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<ChatRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});
  const [actionModal, setActionModal] = useState<{ visible: boolean; userId: string; userName: string }>({ visible: false, userId: '', userName: '' });

  const loadRequests = async (cursorBefore: number | null = null) => {
    const result = await firebaseChatAPI.getRequestsPaginated({
      limit: PAGE_SIZE + 1,
      cursorBefore,
    });
    if (!result.success) {
      setLoadError(getUserErrorMessage(language, 'load', result.error));
      return false;
    }
    const normalized = normalizeChatRequests(result.data as ChatRequest[]);
    const page = normalized.slice(0, PAGE_SIZE);
    const oldestTimestamp = page.length > 0 ? getChatRequestTimestamp(page[page.length - 1]) : null;

    setRequests((prev) => {
      if (!cursorBefore) return page;
      const seen = new Set(prev.map((item) => item.id));
      return [...prev, ...page.filter((item) => !seen.has(item.id))];
    });
    setNextCursor(oldestTimestamp);
    setHasMore(normalized.length > PAGE_SIZE && oldestTimestamp !== null);
    setLoadError(null);
    return true;
  };

  // Store loadFailed text in ref so the timeout callback always uses the current value
  // without needing it in the dependency array (which would re-fetch on every language change)
  const loadFailedRef = useRef(text.loadFailed);
  useEffect(() => { loadFailedRef.current = text.loadFailed; }, [text.loadFailed]);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      setLoading(false);
      setLoadError(loadFailedRef.current);
    }, 8000);

    void loadRequests().finally(() => {
      clearTimeout(timeout);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setNextCursor(null);
    await loadRequests();
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (loadingMore || loading || refreshing || !hasMore) return;

    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      await loadRequests(nextCursor);
    } catch {
      // loadRequests handles its own errors internally
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setFilteredRequests(filterChatRequests(requests, debouncedSearch, selectedCategory));
  }, [requests, debouncedSearch, selectedCategory]);

  useEffect(() => {
    const userIds = Array.from(new Set(requests.map((item) => item.userId).filter((id): id is string => Boolean(id))));
    if (userIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      const resolved = await resolveUserAvatarMap(database, userIds);
      if (cancelled) return;
      setAvatarByUserId((prev) => {
        const next = { ...prev };
        Object.entries(resolved).forEach(([uid, photo]) => {
          if (photo) next[uid] = photo;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [requests]);

  useEffect(() => {
    let active = true;
    const loadCategory = async () => {
      try {
        const savedCategory = await AsyncStorage.getItem(CATEGORY_STORAGE_KEY);
        if (active && savedCategory) {
          const exists = text.categories.some((category) => category.id === savedCategory);
          setSelectedCategory(exists ? savedCategory : null);
        }
      } catch {
        // ignore storage errors for optional UX preference
      }
    };

    void loadCategory();
    return () => {
      active = false;
    };
  }, [text.categories]);

  useEffect(() => {
    const persistCategory = async () => {
      try {
        if (selectedCategory) {
          await AsyncStorage.setItem(CATEGORY_STORAGE_KEY, selectedCategory);
        } else {
          await AsyncStorage.removeItem(CATEGORY_STORAGE_KEY);
        }
      } catch {
        // ignore storage errors for optional UX preference
      }
    };
    void persistCategory();
  }, [selectedCategory]);

  // Clear pending debounce on unmount to avoid state update on unmounted component
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchText(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  }, []);

  const handleCategorySelect = (categoryId: string | null) => {
    setSelectedCategory(categoryId);
    setIsCategoryMenuOpen(false);
  };

  const isOwnRequest = (item: ChatRequest) => {
    if (!currentUser) return false;
    // Primary: compare Firebase userId (phone is masked in Firebase so digits comparison is unreliable)
    if (item.userId && currentUser.id) {
      return item.userId === currentUser.id;
    }
    // Fallback: name match
    const sameName = Boolean(currentUser.name?.trim()) && currentUser.name.trim().toLowerCase() === (item.name || '').trim().toLowerCase();
    return sameName;
  };

  const handleDeleteRequest = useCallback(async (requestId: string) => {
    setDeleteBusyId(requestId);
    try {
      const result = await firebaseChatAPI.deleteRequest(requestId);
      if (!result.success) {
        showUserError(language, 'delete', result.error || deleteText.error);
        return;
      }
      setRequests((prev) => prev.filter((item) => item.id !== requestId));
    } catch (error) {
      showUserError(language, 'delete', error);
    } finally {
      setDeleteBusyId(null);
    }
  }, [deleteText.error, language]);

  const handleViewProfile = useCallback((userId: string) => {
    setActionModal({ visible: false, userId: '', userName: '' });
    navigation.navigate('ViewUserProfile', { userId });
  }, [navigation]);

  const handleContact = useCallback((userId: string, name: string) => {
    setActionModal({ visible: false, userId: '', userName: '' });
    openContactModal({ userId, name, sourceType: 'help' });
  }, [openContactModal]);

  const handleDelete = (requestId: string) => {
    Alert.alert(deleteText.title, deleteText.body, [
      { text: deleteText.cancel, style: 'cancel' },
      {
        text: deleteText.action,
        style: 'destructive',
        onPress: () => { void handleDeleteRequest(requestId); },
      },
    ]);
  };

  const getTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff <= 0) return `0 ${text.timeMinute}`;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 60) return `${minutes} ${text.timeMinute}`;
    if (hours < 24) return `${hours} ${text.timeHour}`;
    return `${days} ${text.timeDay}`;
  };

  const counterText = useMemo(
    () => `${filteredRequests.length} ${text.requestsCount}`,
    [filteredRequests.length, text.requestsCount]
  );

  const categoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    text.categories.forEach((category) => {
      map[category.id] = category.label;
    });
    return map;
  }, [text.categories]);

  const selectedCategoryLabel = selectedCategory
    ? (categoryLabelMap[selectedCategory] ?? text.allLabel)
    : text.allLabel;

  return (
    <SafeAreaView style={styles.container}>
      <View pointerEvents="none" style={styles.backgroundOrbs}>
        {LIGHT_ORBS.map((orb, index) => (
          <View
            key={index}
            style={[
              styles.orb,
              {
                width: orb.size,
                height: orb.size,
                backgroundColor: orb.color,
                top: orb.top,
                left: orb.left,
                right: orb.right,
                bottom: orb.bottom,
              },
            ]}
          />
        ))}
      </View>

      <TactileCard elevated style={styles.headerCard} pressable={false}>
        <Text style={styles.headerTitle}>{text.title}</Text>
      </TactileCard>

      {loading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} style={styles.loader} />
      ) : loadError ? (
        <TactileCard elevated={false} style={styles.emptyState} pressable={false}>
          <TactileIcon icon="alert-circle-outline" size={54} iconSize={26} backgroundColor="#403933" />
          <Text style={styles.emptyStateText}>{loadError}</Text>
          <TactileButton
            title={text.retry}
            onPress={() => void handleRefresh()}
            variant="secondary"
            style={styles.retryButton}
          />
        </TactileCard>
      ) : filteredRequests.length === 0 ? (
        <TactileCard elevated={false} style={styles.emptyState} pressable={false}>
          <TactileIcon icon="message-text-outline" size={54} iconSize={26} backgroundColor="#403933" />
          <Text style={styles.emptyStateText}>{text.empty}</Text>
        </TactileCard>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={SCREEN_THEME.terracotta}
            />
          }
          ListHeaderComponent={
            <View>
              <TactileCard elevated={false} style={styles.searchCard} pressable={false}>
                <TactileIcon icon="magnify" size={38} iconSize={17} backgroundColor="#403933" />
                <View style={styles.searchInputWrap}>
                  <TactileInput
                    placeholder={text.search}
                    value={searchText}
                    onChangeText={handleSearch}
                    style={{ borderWidth: 0, backgroundColor: 'transparent', marginBottom: 0 }}
                  />
                </View>
              </TactileCard>

              <View style={styles.filterWrap}>
                <TouchableOpacity
                  style={styles.categoryPickerButton}
                  onPress={() => { setIsCategoryMenuOpen(true); }}
                  activeOpacity={0.84}
                >
                  <MaterialCommunityIcons name="view-grid-outline" size={14} color={SCREEN_THEME.textSecondary} style={styles.filterIcon} />
                  <Text style={styles.filterButtonText}>{selectedCategoryLabel}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color={SCREEN_THEME.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.counter}>{counterText}</Text>
            </View>
          }
          ListFooterComponent={
            !loading && !loadError && filteredRequests.length > 0 && hasMore ? (
              <TactileButton
                title={loadingMore ? '...' : text.loadMore}
                onPress={() => void handleLoadMore()}
                variant="secondary"
                disabled={loadingMore}
                style={styles.loadMoreButton}
              />
            ) : null
          }
          renderItem={({ item }) => {
            const timestamp = getChatRequestTimestamp(item) || Date.now();
            const categoryLabel = item.category ? categoryLabelMap[item.category] : null;
            const timeAgo = getTimeAgo(timestamp);
            const own = isOwnRequest(item);

            return (
              <TouchableOpacity
                style={styles.chatCard}
                onPress={() => navigation.navigate('RequestDetail', { request: item })}
                activeOpacity={0.88}
              >
                {/* TOP: avatar + name/info block */}
                <View style={styles.chatCardTop}>
                  <MiniUserAvatar
                    uri={(item.userId && avatarByUserId[item.userId]) || pickUserAvatarUri(item)}
                    name={item.name}
                    size={56}
                    borderRadius={14}
                    backgroundColor="#6A8BA5"
                  />
                  <View style={styles.chatCardRight}>
                    {/* Name row */}
                    <View style={styles.chatNameRow}>
                      <Text style={styles.chatName} numberOfLines={1}>{item.name?.trim() || '—'}</Text>
                      {categoryLabel ? (
                        <View style={styles.chatCategoryBadge}>
                          <Text style={styles.chatCategoryText}>{categoryLabel}</Text>
                        </View>
                      ) : null}
                      <View style={styles.chatDateBadge}>
                        <Text style={styles.chatDateText}>{timeAgo}</Text>
                      </View>
                    </View>
                    {/* Description box */}
                    <View style={styles.chatDescBox}>
                      <Text style={styles.chatDescText} numberOfLines={2}>
                        {item.text ?? text.noDescription}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* ACTIONS ROW */}
                <View style={styles.chatActionsRow}>
                  {item.phone ? (
                    <TouchableOpacity
                      style={styles.chatActionBtn}
                      onPress={() => { void safeCallPhone(item.phone as string, language); }}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="phone-outline" size={13} color={SCREEN_THEME.woodGreenDark} />
                      <Text style={styles.chatActionBtnText}>
                        {language === 'ua' ? 'Подзвонити' : language === 'ru' ? 'Позвонить' : 'Call'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {!own && item.userId ? (
                    <TouchableOpacity
                      style={styles.chatActionBtn}
                      onPress={() => setActionModal({ visible: true, userId: item.userId as string, userName: item.name ?? '' })}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="badge-account-outline" size={13} color={SCREEN_THEME.woodGreenDark} />
                      <Text style={styles.chatActionBtnText}>
                        {language === 'ua' ? 'Профіль' : language === 'ru' ? 'Профиль' : 'Profile'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {!own && item.userId ? (
                    <TouchableOpacity
                      style={styles.chatActionBtnAccent}
                      onPress={() => openContactModal({ userId: item.userId as string, name: item.name ?? 'Unknown', sourceType: 'help', sourceId: item.id, sourceTitle: (item.text ?? '').slice(0, 60) })}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="arrow-right-circle-outline" size={13} color="#fff" />
                      <Text style={styles.chatActionBtnAccentText}>
                        {language === 'ua' ? "Зв'язатись" : language === 'ru' ? 'Связаться' : 'Contact'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {own ? (
                    <TouchableOpacity
                      style={styles.chatActionBtnDelete}
                      onPress={() => handleDelete(item.id)}
                      disabled={deleteBusyId === item.id}
                      activeOpacity={0.8}
                    >
                      {deleteBusyId === item.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="trash-can-outline" size={13} color="#fff" />
                          <Text style={styles.chatActionBtnDeleteText}>{deleteText.action}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal
        visible={isCategoryMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCategoryMenuOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setIsCategoryMenuOpen(false)}>
          <Pressable style={[styles.categoryModalCard, styles.categoryMenu]} onPress={() => undefined}>
            <TouchableOpacity
              style={[styles.categoryMenuItem, selectedCategory === null && styles.categoryMenuItemActive]}
              onPress={() => handleCategorySelect(null)}
              activeOpacity={0.84}
            >
              <MaterialCommunityIcons
                name="view-grid-outline"
                size={14}
                color={selectedCategory === null ? SCREEN_THEME.textPrimary : SCREEN_THEME.textSecondary}
                style={styles.filterIcon}
              />
              <Text style={[styles.categoryMenuItemText, selectedCategory === null && styles.categoryMenuItemTextActive]}>
                {text.allLabel}
              </Text>
              {selectedCategory === null ? (
                <MaterialCommunityIcons name="check" size={16} color={SCREEN_THEME.textPrimary} style={styles.checkIcon} />
              ) : null}
            </TouchableOpacity>

            {text.categories.map((category) => {
              const active = selectedCategory === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryMenuItem, active && styles.categoryMenuItemActive]}
                  onPress={() => handleCategorySelect(category.id)}
                  activeOpacity={0.84}
                >
                  <MaterialCommunityIcons
                    name={category.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                    size={14}
                    color={active ? SCREEN_THEME.textPrimary : SCREEN_THEME.textSecondary}
                    style={styles.filterIcon}
                  />
                  <Text style={[styles.categoryMenuItemText, active && styles.categoryMenuItemTextActive]}>
                    {category.label}
                  </Text>
                  {active ? (
                    <MaterialCommunityIcons name="check" size={16} color={SCREEN_THEME.textPrimary} style={styles.checkIcon} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <TactileButton
        title={text.add}
        onPress={() => navigation.navigate('AddRequest')}
        variant="primary"
        style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 14 }}
        icon={<MaterialCommunityIcons name="plus-circle-outline" size={20} color="#FFFFFF" />}
      />
      <Modal
        visible={actionModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionModal({ visible: false, userId: '', userName: '' })}
      >
        <View style={styles.actionOverlay}>
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionPrimaryBtn} onPress={() => handleViewProfile(actionModal.userId)} activeOpacity={0.86}>
              <MaterialCommunityIcons name="account-box-outline" size={18} color="#fff" />
              <Text style={styles.actionPrimaryText}>{language === 'ru' ? 'Просмотреть профиль' : language === 'en' ? 'View profile' : 'Переглянути профіль'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSecondaryBtn} onPress={() => handleContact(actionModal.userId, actionModal.userName)} activeOpacity={0.86}>
              <MaterialCommunityIcons name="arrow-right-circle-outline" size={18} color={SCREEN_THEME.textPrimary} />
              <Text style={styles.actionSecondaryText}>{language === 'ru' ? 'Связаться' : language === 'en' ? 'Contact' : 'Зв\'язаться'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCancelBtn} onPress={() => setActionModal({ visible: false, userId: '', userName: '' })} activeOpacity={0.8}>
              <Text style={styles.actionCancelText}>{language === 'ru' ? 'Отмена' : language === 'en' ? 'Cancel' : 'Скасувати'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundOrbs: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999 },
  headerCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    padding: 18,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginTop: 10,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  content: { flex: 1, paddingHorizontal: 16 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInputWrap: { flex: 1, marginLeft: 10 },
  filterWrap: { marginBottom: 10 },
  categoryPickerButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    backgroundColor: SCREEN_THEME.cardCream,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryMenu: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    backgroundColor: SCREEN_THEME.cardCream,
    overflow: 'hidden',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(36,30,24,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  categoryModalCard: {
    maxHeight: '72%',
  },
  categoryMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderStrong,
  },
  categoryMenuItemActive: {
    backgroundColor: '#E8DFCF',
  },
  categoryMenuItemText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  categoryMenuItemTextActive: {
    color: SCREEN_THEME.textPrimary,
  },
  checkIcon: { marginLeft: 'auto' },
  filterIcon: { marginRight: 5 },
  filterButtonText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700' },
  counter: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 10, marginLeft: 4 },
  loader: { marginTop: 40 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 18,
  },
  emptyStateText: { marginTop: 12, fontSize: 15, fontWeight: '700', color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  retryButton: { marginTop: 14, minWidth: 160 },
  loadMoreButton: { marginTop: 6, marginBottom: 8 },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  requestContent: { flex: 1, marginRight: 12 },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B65A48',
    marginLeft: 8,
  },
  requestTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 4,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1,
  },
  requestMeta: { fontSize: 12, color: SCREEN_THEME.textSecondary, fontWeight: '600' },
  phoneAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  actionPrimaryBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  actionSecondaryBtn: {
    backgroundColor: '#F7F3EE',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  actionSecondaryText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  actionCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCancelText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Chat card (ProfileRequests-style) ──────────────────────────────────────
  chatCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    elevation: 2,
    shadowColor: '#A08060',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chatCardTop: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  chatCardRight: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  chatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  chatName: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
    flexShrink: 1,
  },
  chatCategoryBadge: {
    backgroundColor: '#EDE3D0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  chatCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
  },
  chatDateBadge: {
    backgroundColor: '#DDEAF0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginLeft: 'auto' as const,
    flexShrink: 0,
  },
  chatDateText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3D5D87',
  },
  chatDescBox: {
    borderWidth: 1,
    borderColor: '#E0D5C8',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FAF7F3',
  },
  chatDescText: {
    fontSize: 13,
    color: SCREEN_THEME.textSecondary,
    lineHeight: 18,
    fontWeight: '600',
  },
  chatActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  chatActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#C8D8C0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'transparent',
  },
  chatActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: SCREEN_THEME.woodGreenDark,
  },
  chatActionBtnAccent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#7A1E5C',
  },
  chatActionBtnAccentText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
  chatActionBtnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#B65A48',
    marginLeft: 'auto' as const,
  },
  chatActionBtnDeleteText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
  },
});

export default OnlineChatScreen;

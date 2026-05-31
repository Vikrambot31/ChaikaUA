import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSelector } from 'react-redux';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { firebaseChatAPI } from '../firebase-config';
import { COLORS, SIZES } from '../utils/constants';
import type { RootState } from '../redux/store';
import { getModerationUserMessage, getUserErrorMessage, showUserError } from '../utils/userFacingErrors';
import MiniUserAvatar from '../components/MiniUserAvatar';
import TactileIcon from '../components/TactileIcon';
import { safeCallPhone } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import { openRequestFormWithLimitCheck } from '../utils/requestFormLimitGuard';
import { getRequestTopicLabel } from '../data/categories';

const UI_TEXT = {
  ua: {
    loading: 'Завантаження заявок...',
    title: 'Мої заявки',
    subtitle: 'Всі ваші звернення в одному місці',
    empty: 'У вас ще немає заявок',
    emptySub: 'Створіть вашу першу заявку',
    createFirst: 'Створити заявку',
    statTotal: 'Всього',
    statPending: 'На модерації',
    statApproved: 'Схвалено',
    statusApproved: 'Схвалено',
    statusRejected: 'Відхилено',
    statusPending: 'На модерації',
    requestId: 'Номер заявки',
    delete: 'Видалити',
    deleteTitle: 'Видалити заявку?',
    deleteBody: 'Цю дію не можна буде скасувати.',
    deleteSuccess: 'Заявку видалено',
    deleteError: 'Не вдалося видалити заявку',
    clearHistory: 'Очистити всю історію заявок',
    clearTitle: 'Очистити історію?',
    clearBody: 'Усі ваші заявки буде видалено. Цю дію не можна буде скасувати.',
    clearYes: 'Так',
    clearNo: 'Ні',
    clearSuccess: 'Історію заявок очищено',
    clearError: 'Не вдалося очистити історію заявок',
    moderationInfo: 'Статус заявки',
    cancel: 'Скасувати',
    successTitle: 'Готово',
  },
  ru: {
    loading: 'Загрузка заявок...',
    title: 'Мои заявки',
    subtitle: 'Все ваши обращения в одном месте',
    empty: 'У вас ещё нет заявок',
    emptySub: 'Создайте вашу первую заявку',
    createFirst: 'Создать заявку',
    statTotal: 'Всего',
    statPending: 'На модерации',
    statApproved: 'Одобрено',
    statusApproved: 'Одобрено',
    statusRejected: 'Отклонено',
    statusPending: 'На модерации',
    requestId: 'Номер заявки',
    delete: 'Удалить',
    deleteTitle: 'Удалить заявку?',
    deleteBody: 'Это действие нельзя будет отменить.',
    deleteSuccess: 'Заявка удалена',
    deleteError: 'Не удалось удалить заявку',
    clearHistory: 'Очистить всю историю заявок',
    clearTitle: 'Очистить историю?',
    clearBody: 'Все ваши заявки будут удалены. Это действие нельзя будет отменить.',
    clearYes: 'Да',
    clearNo: 'Нет',
    clearSuccess: 'История заявок очищена',
    clearError: 'Не удалось очистить историю заявок',
    moderationInfo: 'Статус заявки',
    cancel: 'Отмена',
    successTitle: 'Готово',
  },
  en: {
    loading: 'Loading requests...',
    title: 'My Requests',
    subtitle: 'All your requests in one place',
    empty: 'You have no requests yet',
    emptySub: 'Create your first request',
    createFirst: 'Create request',
    statTotal: 'Total',
    statPending: 'Pending',
    statApproved: 'Approved',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    statusPending: 'Pending',
    requestId: 'Request ID',
    delete: 'Delete',
    deleteTitle: 'Delete request?',
    deleteBody: 'This action cannot be undone.',
    deleteSuccess: 'Request deleted',
    deleteError: 'Failed to delete request',
    clearHistory: 'Clear all request history',
    clearTitle: 'Clear history?',
    clearBody: 'All your requests will be deleted. This action cannot be undone.',
    clearYes: 'Yes',
    clearNo: 'No',
    clearSuccess: 'Request history cleared',
    clearError: 'Failed to clear request history',
    moderationInfo: 'Request status',
    cancel: 'Cancel',
    successTitle: 'Done',
  },
} as const;

type Lang = keyof typeof UI_TEXT;

type MyRequestItem = {
  id: string;
  category?: string;
  group?: string;
  subcategory?: string;
  status?: string;
  text?: string;
  phone?: string;
  createdAt?: Date | string | number;
  moderationReason?: string;
  rejectionReason?: string;
};

const MyRequestsScreen = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const user = useSelector((state: RootState) => state.auth.user);
  const [requests, setRequests] = useState<MyRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);

  const loadRequests = useCallback(async () => {
    const result = await firebaseChatAPI.getMyRequests();
    if (result.success && result.data) {
      setRequests(result.data);
    } else if (!result.success) {
      Alert.alert(text.moderationInfo, getUserErrorMessage(language, 'load', result.error));
    }
    setLoading(false);
    setRefreshing(false);
  }, [language, text.moderationInfo]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadRequests();
  }, [loadRequests]);

  const handleDelete = useCallback((requestId: string) => {
    Alert.alert(text.deleteTitle, text.deleteBody, [
      { text: text.cancel, style: 'cancel' },
      {
        text: text.delete,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(requestId);
            const result = await firebaseChatAPI.deleteRequest(requestId);
            if (!result.success) {
              setBusyId(null);
              showUserError(language, 'delete', result.error || text.deleteError);
              return;
            }

            setRequests((prev) => prev.filter((item) => item.id !== requestId));
            setBusyId(null);
            Alert.alert(text.successTitle, text.deleteSuccess);
          })();
        },
      },
    ]);
  }, [language, text.cancel, text.delete, text.deleteBody, text.deleteError, text.deleteSuccess, text.deleteTitle, text.successTitle]);

  const clearHistory = useCallback(async () => {
    if (clearingHistory || requests.length === 0) return;
    setClearingHistory(true);
    try {
      const results = await Promise.all(
        requests.map((item) => firebaseChatAPI.deleteRequest(item.id)),
      );
      const failedIds = new Set(
        requests
          .filter((_, index) => !results[index]?.success)
          .map((item) => item.id),
      );

      if (failedIds.size > 0) {
        setRequests((prev) => prev.filter((item) => failedIds.has(item.id)));
        showUserError(language, 'delete', text.clearError);
        return;
      }

      setRequests([]);
      Alert.alert(text.successTitle, text.clearSuccess);
    } finally {
      setClearingHistory(false);
    }
  }, [clearingHistory, language, requests, text.clearError, text.clearSuccess, text.successTitle]);

  const confirmClearHistory = useCallback(() => {
    Alert.alert(text.clearTitle, text.clearBody, [
      { text: text.clearNo, style: 'cancel' },
      { text: text.clearYes, style: 'destructive', onPress: () => { void clearHistory(); } },
    ]);
  }, [clearHistory, text.clearBody, text.clearNo, text.clearTitle, text.clearYes]);

  const getStatusColor = (status: string | undefined) => {
    switch (status) {
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#F44336';
      default:
        return '#FF9800';
    }
  };

  const getStatusText = (status: string | undefined) => {
    switch (status) {
      case 'approved':
        return text.statusApproved;
      case 'rejected':
        return text.statusRejected;
      default:
        return text.statusPending;
    }
  };

  const getCategoryIcon = (category: string | undefined) => {
    switch (category) {
      case 'repair':
        return 'wrench';
      case 'medical':
        return 'medical-bag';
      case 'cleaning':
        return 'broom';
      case 'delivery':
        return 'truck-delivery';
      default:
        return 'help-circle';
    }
  };

  const mapToDetailData = useCallback((item: MyRequestItem): DetailItemData => ({
    id: item.id,
    title: getRequestTopicLabel({ category: item.category, group: item.group, subcategory: item.subcategory }, language),
    description: item.text,
    phone: item.phone,
    category: item.category,
    status: getStatusText(item.status),
    userId: user?.id,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
    sourceType: 'help',
    sourceId: item.id,
  }), [language, text.statusApproved, text.statusPending, text.statusRejected, user?.id]);

  const openDetail = useCallback((item: MyRequestItem) => {
    navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) });
  }, [mapToDetailData, navigation]);

  const renderRequest = useCallback(({ item }: { item: MyRequestItem }) => (
    <TouchableOpacity style={styles.requestCard} onPress={() => openDetail(item)} activeOpacity={0.86}>
      <View style={styles.requestHeader}>
        <MiniUserAvatar uri={user?.photoURL || ''} name={user?.name} size={32} borderRadius={11} backgroundColor="#6A8BA5" />
        <View style={[styles.categoryBadge, { marginLeft: 8 }]}>
          <MaterialCommunityIcons name={getCategoryIcon(item.category)} size={16} color="#FFFFFF" />
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status), marginLeft: 'auto' }]}>
          <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>

      <Text style={styles.requestText}>{item.text || '—'}</Text>
      <Text style={styles.moderationInfo}>
        {getModerationUserMessage(language, item.status, item.rejectionReason || item.moderationReason)}
      </Text>
      <Text style={styles.requestId}>{text.requestId}: {String(item.id).slice(-6).toUpperCase()}</Text>

      <View style={styles.requestFooter}>
        <Text style={styles.requestDate}>
          {new Date(item.createdAt ?? Date.now()).toLocaleDateString('uk-UA', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        {item.phone ? (
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              void safeCallPhone(item.phone as string, language);
            }}
            activeOpacity={0.75}
            style={styles.requestPhoneAction}
          >
            <TactileIcon icon="phone-outline" size={30} iconSize={13} backgroundColor="#403933" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.deleteButton, busyId === item.id && styles.deleteButtonDisabled]}
          onPress={(event) => { event.stopPropagation(); handleDelete(item.id); }}
          disabled={busyId === item.id}
          activeOpacity={0.85}
        >
          {busyId === item.id ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
              <Text style={styles.deleteButtonText}>{text.delete}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  ), [busyId, handleDelete, language, openDetail, text.delete, text.requestId, user?.name, user?.photoURL]);

  const approvedCount = requests.filter((item) => item.status === 'approved').length;
  const pendingCount = requests.filter((item) => item.status !== 'approved' && item.status !== 'rejected').length;

  if (loading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>{text.loading}</Text>
      </SafeAreaView>
    );
  }

  if (requests.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.listContent}>
          <View style={styles.headerCard}>
            <Text style={styles.headerTitle}>{text.title}</Text>
            <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
          </View>
        </View>
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="clipboard-text-off" size={64} color={COLORS.gray} />
          <Text style={styles.emptyText}>{text.empty}</Text>
          <Text style={styles.emptySubtext}>{text.emptySub}</Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => { void openRequestFormWithLimitCheck(navigation, language); }}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#FFFFFF" />
            <Text style={styles.createButtonText}>{text.createFirst}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={requests}
        renderItem={renderRequest}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={(
          <>
            <View style={styles.headerCard}>
              <Text style={styles.headerTitle}>{text.title}</Text>
              <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statsCard}>
                <Text style={styles.statsValue}>{requests.length}</Text>
                <Text style={styles.statsLabel}>{text.statTotal}</Text>
              </View>
              <View style={styles.statsCard}>
                <Text style={styles.statsValue}>{pendingCount}</Text>
                <Text style={styles.statsLabel}>{text.statPending}</Text>
              </View>
              <View style={styles.statsCard}>
                <Text style={styles.statsValue}>{approvedCount}</Text>
                <Text style={styles.statsLabel}>{text.statApproved}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.clearHistoryButton, clearingHistory && styles.clearHistoryButtonDisabled]}
              onPress={confirmClearHistory}
              disabled={clearingHistory}
              activeOpacity={0.85}
            >
              {clearingHistory ? (
                <ActivityIndicator size="small" color="#A73737" />
              ) : (
                <MaterialCommunityIcons name="delete-sweep-outline" size={18} color="#A73737" />
              )}
              <Text style={styles.clearHistoryButtonText}>{text.clearHistory}</Text>
            </TouchableOpacity>
          </>
        )}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F3EE',
  },
  headerCard: {
    backgroundColor: '#7A1E5C',
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  headerSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    lineHeight: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statsCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
  statsValue: {
    fontSize: 19,
    fontWeight: '900',
    color: COLORS.primary,
  },
  statsLabel: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.gray,
    fontWeight: '700',
    textAlign: 'center',
  },
  clearHistoryButton: {
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7B6AE',
    backgroundColor: '#FFF1EF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  clearHistoryButtonDisabled: {
    opacity: 0.65,
  },
  clearHistoryButtonText: {
    color: '#A73737',
    fontSize: 13,
    fontWeight: '900',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F3EE',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: SIZES.fontRegular,
    color: COLORS.gray,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: SIZES.fontRegular,
    color: COLORS.gray,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  requestText: {
    fontSize: SIZES.fontRegular,
    color: COLORS.black,
    lineHeight: 20,
    marginBottom: 8,
  },
  moderationInfo: {
    fontSize: 13,
    color: '#5F5043',
    lineHeight: 19,
    backgroundColor: '#FFF8EA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  requestId: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '600',
    marginBottom: 12,
  },
  requestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0E7DF',
  },
  requestDate: {
    fontSize: SIZES.fontSmall,
    color: COLORS.gray,
  },
  requestPhone: {
    fontSize: SIZES.fontSmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  requestPhoneAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  deleteButton: {
    minWidth: 126,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#C85D4A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteButtonDisabled: {
    opacity: 0.72,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  createButton: {
    marginTop: 14,
    backgroundColor: '#7A1E5C',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

export default MyRequestsScreen;

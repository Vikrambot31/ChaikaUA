import React, { useEffect, useMemo, useState } from 'react';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../redux/store';
import { HelpRequest } from '../types/app';
import { addHelpRequest, selectTodayHelpRequests, syncFromRequests } from '../redux/slices/helpRequestsSlice';
import MiniTabBar from '../components/MiniTabBar';
import MiniUserAvatar from '../components/MiniUserAvatar';
import TactileIcon from '../components/TactileIcon';
import ErrorHandler from '../utils/errorHandler';
import { SCREEN_THEME } from '../utils/screenTheme';
import { safeCallPhone } from '../utils/communicationActions';
import { firebaseChatAPI } from '../firebase-config';
import { normalizePersonName, normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { validateName, validatePhone } from '../utils/validators';
import { createPendingModeration } from '../utils/moderation';
import { getRequests } from '../services/api';
import { showUserError } from '../utils/userFacingErrors';
import { database } from '../firebase-config';
import { pickUserAvatarUri, resolveUserAvatarMap } from '../utils/userAvatar';
import type { DetailItemData } from '../utils/detailViewTypes';

const HELP_NEIGHBORS_SPLASH_KEY = '@help_neighbors_first_visit_splash_seen';

const UI_TEXT = {
  ua: {
    headerTitle: 'Нужна помощь',
    headerSubtitle: 'Термінові прохання мешканців ЖК Чайка',
    formTitle: 'Залишити заявку',
    namePlaceholder: "Ваше ім'я",
    phonePlaceholder: 'Ваш телефон',
    helpTypePlaceholder: 'Оберіть тип допомоги...',
    descriptionPlaceholder: 'Коротко опишіть, яка допомога потрібна',
    submitButton: 'Відправити прохання',
    listTitle: 'Термінові запити',
    emptyTitle: 'Сьогодні все спокійно',
    emptySubtitle: 'Немає термінових прохань від сусідів',
    expired: 'Час минув',
    successTitle: 'Успішно',
    successMessage: 'Ваш запит надіслано на модерацію',
    errorTitle: 'Помилка',
    errorMessage: 'Заповніть усі поля',
    saveErrorMessage: 'Не вдалося додати прохання',
    splash: 'Зробимо Чайку місцем підтримки один для одного',
    helpTypes: [
      { label: 'Медична допомога', value: 'medical' },
      { label: 'Дрібний ремонт', value: 'repair' },
      { label: 'Психологічна підтримка', value: 'psychology' },
      { label: 'Догляд за дітьми', value: 'childcare' },
      { label: 'Сантехніка', value: 'plumbing' },
      { label: 'Електрика', value: 'electrical' },
      { label: 'Прибирання', value: 'cleaning' },
      { label: 'Доставка', value: 'delivery' },
      { label: 'Інше', value: 'other' },
    ],
  },
  ru: {
    headerTitle: 'Нужна помощь',
    headerSubtitle: 'Срочные просьбы жителей ЖК Чайка',
    formTitle: 'Оставить заявку',
    namePlaceholder: 'Ваше имя',
    phonePlaceholder: 'Ваш телефон',
    helpTypePlaceholder: 'Выберите тип помощи...',
    descriptionPlaceholder: 'Кратко опишите, какая помощь нужна',
    submitButton: 'Отправить просьбу',
    listTitle: 'Срочные запросы',
    emptyTitle: 'Сегодня все спокойно',
    emptySubtitle: 'Нет срочных просьб от соседей',
    expired: 'Срок вышел',
    successTitle: 'Успешно',
    successMessage: 'Ваш запрос отправлен на модерацию',
    errorTitle: 'Ошибка',
    errorMessage: 'Заполните все поля',
    saveErrorMessage: 'Не удалось добавить просьбу',
    splash: 'Сделаем Чайку друг для друга местом поддержки',
    helpTypes: [
      { label: 'Медицинская помощь', value: 'medical' },
      { label: 'Мелкий ремонт', value: 'repair' },
      { label: 'Психологическая поддержка', value: 'psychology' },
      { label: 'Уход за детьми', value: 'childcare' },
      { label: 'Сантехника', value: 'plumbing' },
      { label: 'Электрика', value: 'electrical' },
      { label: 'Уборка', value: 'cleaning' },
      { label: 'Доставка', value: 'delivery' },
      { label: 'Другое', value: 'other' },
    ],
  },
  en: {
    headerTitle: 'Need Help',
    headerSubtitle: 'Urgent requests from Chaika Life residents',
    formTitle: 'Leave a request',
    namePlaceholder: 'Your name',
    phonePlaceholder: 'Your phone',
    helpTypePlaceholder: 'Select help type...',
    descriptionPlaceholder: 'Briefly describe what help is needed',
    submitButton: 'Send request',
    listTitle: 'Urgent requests',
    emptyTitle: 'Everything is calm today',
    emptySubtitle: 'There are no urgent requests from neighbors',
    expired: 'Time expired',
    successTitle: 'Success',
    successMessage: 'Your request was sent to moderation',
    errorTitle: 'Error',
    errorMessage: 'Fill in all fields',
    saveErrorMessage: 'Failed to add the request',
    splash: "Let's make Chaika Life a place of support for one another",
    helpTypes: [
      { label: 'Medical help', value: 'medical' },
      { label: 'Small repair', value: 'repair' },
      { label: 'Psychological support', value: 'psychology' },
      { label: 'Childcare', value: 'childcare' },
      { label: 'Plumbing', value: 'plumbing' },
      { label: 'Electrical help', value: 'electrical' },
      { label: 'Cleaning', value: 'cleaning' },
      { label: 'Delivery', value: 'delivery' },
      { label: 'Other', value: 'other' },
    ],
  },
} as const;

const formatTimeLeft = (expiresAt: Date, expiredLabel: string) => {
  const diff = expiresAt.getTime() - Date.now();
  if (diff <= 0) return expiredLabel;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
};

const HelpNeighborsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [helpType, setHelpType] = useState('');
  const [showHelpSplash, setShowHelpSplash] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string>>({});

  const todayRequests = useSelector((state: RootState) => selectTodayHelpRequests(state)) as HelpRequest[];
  const burningRequests = useMemo(
    () => todayRequests.filter((request) => request.isBurning && request.expiresAt > new Date()),
    [todayRequests]
  );

  useEffect(() => {
    const userIds = Array.from(new Set(burningRequests.map((item) => item.userId).filter((id): id is string => Boolean(id))));
    if (userIds.length === 0) return;
    let cancelled = false;
    void resolveUserAvatarMap(database, userIds).then((resolved) => {
      if (cancelled) return;
      setAvatarByUserId((prev) => ({ ...prev, ...resolved }));
    });
    return () => {
      cancelled = true;
    };
  }, [burningRequests]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loadSplashState = async () => {
      try {
        const seenSplash = await AsyncStorage.getItem(HELP_NEIGHBORS_SPLASH_KEY);
        if (!isMounted) return;

        if (seenSplash === 'true') {
          setIsReady(true);
          return;
        }

        setShowHelpSplash(true);
        timeoutId = setTimeout(async () => {
          if (!isMounted) return;
          setShowHelpSplash(false);
          setIsReady(true);
          try {
            await AsyncStorage.setItem(HELP_NEIGHBORS_SPLASH_KEY, 'true');
          } catch {}
        }, 3000);
      } catch {
        if (!isMounted) return;
        setShowHelpSplash(true);
        timeoutId = setTimeout(() => {
          if (!isMounted) return;
          setShowHelpSplash(false);
          setIsReady(true);
        }, 3000);
      }
    };

    void loadSplashState();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleSubmit = async () => {
    if (!user) {
      navigation.navigate('LoginScreen');
      return;
    }
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);

    if (!normalizedName || !normalizedPhone || !helpType) {
      Alert.alert(text.errorTitle, text.errorMessage);
      return;
    }

    if (!validateName(normalizedName) || !validatePhone(normalizedPhone)) {
      Alert.alert(text.errorTitle, text.errorMessage);
      return;
    }

    const helpTypeLabel = text.helpTypes.find((type) => type.value === helpType)?.label || helpType;

    try {
      const serverResult = await firebaseChatAPI.addRequest({
        name: normalizedName,
        phone: normalizedPhone,
        description: sanitizeStoredText(`[${helpTypeLabel}]`),
        category: helpType,
        group: 'help_neighbors',
      });

      if (!serverResult.success) {
        throw new Error(serverResult.error || 'Failed to submit help request');
      }

      const newRequest: HelpRequest = {
        id: serverResult.data?.id || `help-${Date.now()}`,
        userId: user.id,
        name: normalizedName,
        phone: normalizedPhone,
        description: sanitizeStoredText(`[${helpTypeLabel}]`),
        createdAt: new Date(),
        expiresAt: new Date(new Date().setHours(23, 59, 59, 999)),
        isBurning: true,
        ...createPendingModeration(),
      };

      dispatch(addHelpRequest(newRequest));
      const requestsResponse = await getRequests();
      if (requestsResponse.success && requestsResponse.data) {
        dispatch(syncFromRequests(requestsResponse.data));
      }
      setName('');
      setPhone('');
      setHelpType('');
      Alert.alert(text.successTitle, text.successMessage);
    } catch (err) {
      ErrorHandler.createError(err, 'HelpNeighborsScreen: addHelpRequest');
      showUserError(language, 'send', err);
    }
  };

  const mapToDetailData = (item: HelpRequest): DetailItemData => ({
    id: item.id,
    title: item.name,
    description: item.description,
    phone: item.phone,
    category: item.description.match(/^\[(.*?)\]/)?.[1],
    status: item.isBurning && item.expiresAt > new Date() ? text.listTitle : text.expired,
    userId: item.userId,
    createdAt: item.createdAt.toISOString(),
    sourceType: 'help',
    sourceId: item.id,
  });

  const openDetail = (item: HelpRequest) => {
    navigation.navigate('ItemDetailScreen', { item: mapToDetailData(item) });
  };

  return (
    <SafeAreaView style={styles.container}>
      {showHelpSplash ? (
        <View style={styles.splashContainer}>
          <Image source={require('../../assets/dopomoga1.png')} style={styles.splashImage} resizeMode="cover" />
          <View style={styles.splashOverlay} />
          <View style={styles.splashCaption}>
            <Text style={styles.splashText}>{text.splash}</Text>
          </View>
        </View>
      ) : null}

      {isReady ? (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerCard}>
            <Image source={require('../../assets/Sosedi pomogaut.png')} style={styles.headerImage} resizeMode="cover" />
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{text.formTitle}</Text>

            <TextInput
              placeholder={text.namePlaceholder}
              placeholderTextColor="#A0938D"
              value={name}
              onChangeText={(value) => setName(normalizePersonName(value))}
              style={styles.input}
            />
            <TextInput
              placeholder={text.phonePlaceholder}
              placeholderTextColor="#A0938D"
              value={phone}
              onChangeText={(value) => setPhone(normalizePhoneText(value))}
              keyboardType="phone-pad"
              style={styles.input}
            />

            <View style={styles.pickerWrapper}>
              <Picker selectedValue={helpType} onValueChange={(itemValue: string) => setHelpType(itemValue)} style={styles.picker}>
                <Picker.Item label={text.helpTypePlaceholder} value="" />
                {text.helpTypes.map((type) => (
                  <Picker.Item key={type.value} label={type.label} value={type.value} />
                ))}
              </Picker>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={() => { void handleSubmit(); }} activeOpacity={0.85}>
              <Text style={styles.submitButtonText}>{text.submitButton}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{text.listTitle}</Text>
            <View style={styles.listCountBadge}>
              <Text style={styles.listCount}>{burningRequests.length}</Text>
            </View>
          </View>

          {burningRequests.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>{text.emptyTitle}</Text>
              <Text style={styles.emptySubtext}>{text.emptySubtitle}</Text>
            </View>
          ) : (
            burningRequests.map((item: HelpRequest) => (
              <TouchableOpacity key={item.id} style={styles.requestCard} onPress={() => openDetail(item)} activeOpacity={0.86}>
                <View style={styles.requestHeader}>
                  <MiniUserAvatar
                    uri={(item.userId && avatarByUserId[item.userId]) || pickUserAvatarUri(item)}
                    name={item.name}
                    size={34}
                    borderRadius={11}
                    backgroundColor="#6A8BA5"
                  />
                  <View style={[styles.userInfo, { marginLeft: 8 }]}>
                    <Text style={styles.userName}>{item.name}</Text>
                  </View>
                  {item.phone ? (
                    <TouchableOpacity
                      onPress={(event) => { event.stopPropagation(); void safeCallPhone(item.phone, language); }}
                      activeOpacity={0.75}
                      style={styles.phoneAction}
                    >
                      <TactileIcon icon="phone-outline" size={30} iconSize={13} backgroundColor="#403933" />
                    </TouchableOpacity>
                  ) : null}
                  <View style={styles.timeBadge}>
                    <Text style={styles.timeText}>{formatTimeLeft(item.expiresAt, text.expired)}</Text>
                  </View>
                </View>
                <Text style={styles.requestDescription}>{item.description}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      ) : null}

      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    backgroundColor: '#1F221A',
    justifyContent: 'flex-end',
  },
  splashImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22, 28, 18, 0.24)',
  },
  splashCaption: {
    marginHorizontal: 18,
    marginBottom: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 248, 238, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(96, 102, 63, 0.18)',
    shadowColor: '#26301E',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  splashText: {
    color: '#2A2D22',
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900',
  },
  scrollContent: { paddingBottom: 40, paddingHorizontal: 16, paddingTop: 16 },
  headerCard: {
    marginBottom: 14,
    overflow: 'hidden',
    borderRadius: 18,
  },
  headerImage: { width: '100%', height: 200, resizeMode: 'cover' },
  formCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  formTitle: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 14 },
  input: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: SCREEN_THEME.textPrimary,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
  pickerWrapper: {
    backgroundColor: '#F7F3EE',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    overflow: 'hidden',
    marginBottom: 10,
  },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: SCREEN_THEME.textSecondary, textAlign: 'right', marginBottom: 10, fontWeight: '700' },
  submitButton: { backgroundColor: SCREEN_THEME.terracotta, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  submitButtonText: { color: '#FFFFFF', fontWeight: '800' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 8 },
  listTitle: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  listCountBadge: { backgroundColor: SCREEN_THEME.terracotta, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  listCount: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
  requestCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  requestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  userInfo: { flex: 1 },
  userName: { fontWeight: '900', color: SCREEN_THEME.textPrimary },
  phoneAction: { alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  timeBadge: { backgroundColor: SCREEN_THEME.terracotta, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  timeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  requestDescription: { color: SCREEN_THEME.textPrimary, lineHeight: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 12 },
  emptySubtext: { color: SCREEN_THEME.textSecondary, marginTop: 4 },
});

export default HelpNeighborsScreen;









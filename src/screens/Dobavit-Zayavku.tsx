import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp, ParamListBase } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../redux/store';
import type { HelpRequest } from '../types/app';
import { addHelpRequest, syncFromRequests } from '../redux/slices/helpRequestsSlice';
import { useRequests } from '../hooks/useRequests';
import CategorySelector from '../components/CategorySelector';
import SubcategorySelector from '../components/SubcategorySelector';
import FoodSharingForm from '../components/FoodSharingForm';
import RideSharingForm from '../components/RideSharingForm';
import FormSectionLabel from '../components/FormSectionLabel';
import { FormFieldError } from '../components/ValidationErrorMessage';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { normalizePersonName, normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { validateName, validatePhone } from '../utils/validators';
import { SPECIAL, buildRequestText } from '../data/categories';
import { STORAGE_KEYS } from '../utils/constants';
import { firebaseChatAPI } from '../firebase-config';
import { createPendingModeration } from '../utils/moderation';
import { getRequests } from '../services/api';
import { RATE_LIMITERS } from '../utils/rateLimiter';
import { showUserError } from '../utils/userFacingErrors';

const DRAFT_KEY = `${STORAGE_KEYS.SETTINGS}:request-form-draft`;
const MAX_DESC_LENGTH = 500;

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    errorTitle: 'Помилка',
    nameError: "Введіть ім'я (мінімум 2 символи)",
    phoneError: 'Введіть коректний телефон у форматі +380...',
    groupError: 'Оберіть групу категорій (наприклад: Фудшеринг, Транспорт)',
    subcategoryError: 'Оберіть підкатегорію всередині групи',
    foodError: 'Вкажіть магазин та час для фудшерингу',
    rideError: 'Вкажіть напрямок та час для поїздки',
    detailsError: 'Заповніть усі деталі',
    descTooShort: 'Якщо описуєте ситуацію - вкажіть хоча б 10 символів',
    doneTitle: 'Готово',
    doneBody: 'Заявку надіслано на модерацію',
    doneRequestId: 'Номер заявки',
    urgentSuccess: 'Вашу термінову заявку надіслано сусідам',
    submitErrorDefault: "Не вдалося додати заявку. Перевірте з'єднання та спробуйте ще раз.",
    heroTitle: 'Нова заявка',
    heroSubtitle: "Оберіть категорію - після перевірки модератором сусіди зможуть з вами зв'язатися",
    heroSubtitleUrgent: 'Термінова заявка потрапить до розділу «Допомога сусідам» і пропаде о 23:59',
    urgentToggle: 'Терміново (тільки сьогодні)',
    contacts: 'Контакти',
    nameLabel: "Ім'я",
    namePlaceholder: "Ваше ім'я",
    phoneLabel: 'Телефон',
    categoryTitle: 'Категорія',
    addDetails: '+ Додати деталі',
    hideDetails: '− Сховати деталі',
    descLabel: 'Опис ситуації (необов\'язково)',
    descPlaceholder: 'Розкажіть детальніше, що саме потрібно...',
    charsLeft: 'символів',
    submit: 'Відправити заявку',
    submitUrgent: 'Надіслати термінову заявку',
    ok: 'OK',
  },
  ru: {
    errorTitle: 'Ошибка',
    nameError: 'Введите имя (минимум 2 символа)',
    phoneError: 'Введите корректный телефон в формате +380...',
    groupError: 'Выберите группу категорий (например: Фудшеринг, Транспорт)',
    subcategoryError: 'Выберите подкатегорию внутри группы',
    foodError: 'Укажите магазин и время для фудшеринга',
    rideError: 'Укажите направление и время для поездки',
    detailsError: 'Заполните все детали',
    descTooShort: 'Если описываете ситуацию - укажите хотя бы 10 символов',
    doneTitle: 'Готово',
    doneBody: 'Заявка отправлена на модерацию',
    doneRequestId: 'Номер заявки',
    urgentSuccess: 'Ваша срочная заявка отправлена соседям',
    submitErrorDefault: 'Не удалось добавить заявку. Проверьте соединение и попробуйте снова.',
    heroTitle: 'Новая заявка',
    heroSubtitle: 'Выберите категорию - после проверки модератором соседи смогут с вами связаться',
    heroSubtitleUrgent: 'Срочная заявка попадёт в раздел «Помощь соседям» и исчезнет в 23:59',
    urgentToggle: 'Срочно (только сегодня)',
    contacts: 'Контакты',
    nameLabel: 'Имя',
    namePlaceholder: 'Ваше имя',
    phoneLabel: 'Телефон',
    categoryTitle: 'Категория',
    addDetails: '+ Добавить детали',
    hideDetails: '− Скрыть детали',
    descLabel: 'Описание ситуации (необязательно)',
    descPlaceholder: 'Расскажите подробнее, что именно нужно...',
    charsLeft: 'символов',
    submit: 'Отправить заявку',
    submitUrgent: 'Отправить срочную заявку',
    ok: 'OK',
  },
  en: {
    errorTitle: 'Error',
    nameError: 'Enter a name (at least 2 characters)',
    phoneError: 'Enter a valid phone in format +380...',
    groupError: 'Choose a category group (for example: Foodsharing, Transport)',
    subcategoryError: 'Choose a subcategory in the selected group',
    foodError: 'Specify store and time for foodsharing',
    rideError: 'Specify direction and time for the ride',
    detailsError: 'Fill in all details',
    descTooShort: 'If you are describing the situation - enter at least 10 characters',
    doneTitle: 'Done',
    doneBody: 'Request sent for moderation',
    doneRequestId: 'Request ID',
    urgentSuccess: 'Your urgent request was sent to neighbors',
    submitErrorDefault: 'Failed to add request. Check connection and try again.',
    heroTitle: 'New Request',
    heroSubtitle: 'Choose a category and a moderator will review it before neighbors can contact you',
    heroSubtitleUrgent: 'Urgent request will appear in "Neighbor Help" and expire at 23:59 today',
    urgentToggle: 'Urgent (today only)',
    contacts: 'Contacts',
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    phoneLabel: 'Phone',
    categoryTitle: 'Category',
    addDetails: '+ Add details',
    hideDetails: '− Hide details',
    descLabel: 'Situation description (optional)',
    descPlaceholder: 'Describe in more detail what you need...',
    charsLeft: 'chars',
    submit: 'Send request',
    submitUrgent: 'Send urgent request',
    ok: 'OK',
  },
} as const;

const AddRequestScreen = ({ navigation }: { navigation: NavigationProp<ParamListBase> }) => {
  const { sendRequest } = useRequests();
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+380');
  const [group, setGroup] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [store, setStore] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);

  // Новые поля единой формы
  const [isUrgent, setIsUrgent] = useState(false);
  const [description, setDescription] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    group?: string;
    subcategory?: string;
    special?: string;
    description?: string;
  }>({});

  const isFoodsharing = subcategory === SPECIAL.FOODSHARING;
  const isRide = subcategory === SPECIAL.RIDE_SHARE;

  const isSpecialComplete = useMemo(() => {
    if (isFoodsharing) return Boolean(store && timeSlot);
    if (isRide) return Boolean(destination.trim() && timeSlot);
    return true;
  }, [destination, isFoodsharing, isRide, store, timeSlot]);
  const isContactsComplete = useMemo(() => validateName(normalizePersonName(name)) && validatePhone(normalizePhoneText(phone)), [name, phone]);
  // Для срочной заявки категория не обязательна
  const isCategoryComplete = useMemo(() => isUrgent ? true : Boolean(group) && Boolean(subcategory), [group, subcategory, isUrgent]);
  const isDescriptionValid = description.trim().length === 0 || description.trim().length >= 10;

  // Загрузка черновика
  useEffect(() => {
    const loadDraft = async () => {
      const raw = await AsyncStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        setName(normalizePersonName(parsed.name ?? ''));
        setPhone(normalizePhoneText(parsed.phone ?? '+380'));
        setGroup(parsed.group ?? '');
        setSubcategory(parsed.subcategory ?? '');
        setStore(parsed.store ?? '');
        setTimeSlot(parsed.timeSlot ?? '');
        setDestination(parsed.destination ?? '');
        if (parsed.description) setDescription(parsed.description);
      } catch {
        await AsyncStorage.removeItem(DRAFT_KEY);
      }
    };
    void loadDraft();
  }, []);

  // Автосохранение черновика
  useEffect(() => {
    void AsyncStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ name, phone, group, subcategory, store, timeSlot, destination, description })
    );
  }, [name, phone, group, subcategory, store, timeSlot, destination, description]);

  const clearDraft = useCallback(async () => {
    await AsyncStorage.removeItem(DRAFT_KEY);
  }, []);

  const handleGroupChange = useCallback((value: string) => {
    setGroup(value);
    setSubcategory('');
    setStore('');
    setTimeSlot('');
    setDestination('');
  }, []);

  const handleSubcategoryChange = useCallback((value: string) => {
    setSubcategory(value);
    setStore('');
    setTimeSlot('');
    setDestination('');
  }, []);

  const handleToggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  const handleUrgentToggle = useCallback((value: boolean) => {
    setIsUrgent(value);
  }, []);

  const handleSubmit = async () => {
    const nextErrors: {
      name?: string;
      phone?: string;
      group?: string;
      subcategory?: string;
      special?: string;
      description?: string;
    } = {};
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);

    if (!validateName(normalizedName)) {
      nextErrors.name = text.nameError;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.nameError);
      return;
    }
    if (!validatePhone(normalizedPhone)) {
      nextErrors.phone = text.phoneError;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.phoneError);
      return;
    }

    // Для обычной заявки категория обязательна
    if (!isUrgent) {
      if (!group) {
        nextErrors.group = text.groupError;
        setFieldErrors(nextErrors);
        Alert.alert(text.errorTitle, text.groupError);
        return;
      }
      if (!subcategory) {
        nextErrors.subcategory = text.subcategoryError;
        setFieldErrors(nextErrors);
        Alert.alert(text.errorTitle, text.subcategoryError);
        return;
      }
      if (!isSpecialComplete) {
        nextErrors.special = isFoodsharing ? text.foodError : isRide ? text.rideError : text.detailsError;
        setFieldErrors(nextErrors);
        Alert.alert(text.errorTitle, isFoodsharing ? text.foodError : isRide ? text.rideError : text.detailsError);
        return;
      }
    }

    // Если описание заполнено - минимум 10 символов
    if (showDetails && description.trim().length > 0 && description.trim().length < 10) {
      nextErrors.description = text.descTooShort;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.descTooShort);
      return;
    }

    setFieldErrors({});

    // Ограничитель частоты - только для заявок с описанием и не срочных
    if (!isUrgent && showDetails && description.trim().length >= 10) {
      const secsLeft = RATE_LIMITERS.helpRequest.cooldownSecondsLeft();
      if (secsLeft > 0) {
        Alert.alert(
          language === 'ru' ? 'Подождите немного' : language === 'en' ? 'Please wait' : 'Зачекайте трохи',
          language === 'ru'
            ? `Заявку уже отправили. Следующую с описанием можно через ${secsLeft} сек.`
            : language === 'en'
              ? `Request already sent. You can send the next detailed request in ${secsLeft} seconds.`
              : `Заявку вже надіслали. Наступну з описом можна через ${secsLeft} сек.`
        );
        return;
      }
    }

    setLoading(true);
    try {
      if (isUrgent) {
        // --- Путь срочной заявки (помощь соседям) ---
        const descText = description.trim()
          ? sanitizeStoredText(description.trim())
          : sanitizeStoredText(subcategory ? `[${subcategory}]` : '[Термінова допомога]');

        const serverResult = await firebaseChatAPI.addRequest({
          name: normalizedName,
          phone: normalizedPhone,
          description: descText,
          category: subcategory || 'other',
          group: 'help_neighbors',
        });

        if (!serverResult.success) {
          showUserError(language, 'send', serverResult.error || text.submitErrorDefault);
          return;
        }

        const newRequest: HelpRequest = {
          id: serverResult.data?.id || `help-${Date.now()}`,
          name: normalizedName,
          phone: normalizedPhone,
          description: descText,
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

        await clearDraft();
        setName('');
        setPhone('+380');
        setGroup('');
        setSubcategory('');
        setStore('');
        setTimeSlot('');
        setDestination('');
        setDescription('');
        setIsUrgent(false);
        setShowDetails(false);

        Alert.alert(text.doneTitle, text.urgentSuccess, [{ text: text.ok, onPress: () => navigation.goBack() }]);
      } else {
        // --- Обычный путь ---
        const requestText = buildRequestText({
          groupValue: group,
          subValue: subcategory,
          store,
          timeSlot,
          destination,
        });

        const hasDescription = showDetails && description.trim().length >= 10;
        const finalDescription = hasDescription
          ? sanitizeStoredText(`[${subcategory}] ${description.trim()}`)
          : sanitizeStoredText(requestText);
        const finalText = hasDescription
          ? sanitizeStoredText(description.trim())
          : sanitizeStoredText(requestText);

        const createdRequest = await sendRequest({
          name: normalizedName,
          phone: normalizedPhone,
          category: subcategory,
          group,
          subcategory,
          store,
          timeSlot,
          destination: destination.trim(),
          building: 'Чайка Life',
          description: finalDescription,
          text: finalText,
        });

        if (hasDescription) {
          RATE_LIMITERS.helpRequest.recordSubmit();
        }

        const shortRequestId = createdRequest?.id ? String(createdRequest.id).slice(-6).toUpperCase() : null;
        const successMessage = shortRequestId
          ? `${text.doneBody}\n\n${text.doneRequestId}: ${shortRequestId}`
          : text.doneBody;

        await clearDraft();
        Alert.alert(text.doneTitle, successMessage, [{ text: text.ok, onPress: () => navigation.goBack() }]);
      }
    } catch (err: unknown) {
      showUserError(language, 'send', err || text.submitErrorDefault);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Герой-картка */}
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
                <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
                <MaterialCommunityIcons name="close" size={20} color={SCREEN_THEME.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.heroTitle}>{text.heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{isUrgent ? text.heroSubtitleUrgent : text.heroSubtitle}</Text>

            {/* Перемикач терміновості */}
            <View style={styles.urgentRow}>
              <View style={styles.urgentTextWrap}>
                <MaterialCommunityIcons
                  name="fire"
                  size={18}
                  color={isUrgent ? SCREEN_THEME.terracotta : SCREEN_THEME.textMuted}
                />
                <Text style={[styles.urgentLabel, isUrgent && styles.urgentLabelActive]}>
                  {text.urgentToggle}
                </Text>
              </View>
              <Switch
                value={isUrgent}
                onValueChange={handleUrgentToggle}
                trackColor={{ false: '#E0D4BA', true: SCREEN_THEME.terracotta }}
                thumbColor={isUrgent ? '#FFF9EE' : '#F5EDD8'}
              />
            </View>
          </View>

          {/* Контакти */}
          <View style={styles.card}>
            <FormSectionLabel label={text.contacts} completed={isContactsComplete} labelStyle={styles.sectionTitle} />
            <FormSectionLabel label={text.nameLabel} completed={validateName(normalizePersonName(name))} containerStyle={styles.labelRow} labelStyle={styles.label} />
            <TextInput style={styles.input} placeholder={text.namePlaceholder} placeholderTextColor={SCREEN_THEME.textMuted} value={name} onChangeText={(v) => { setName(normalizePersonName(v)); if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined })); }} />
            <FormFieldError error={fieldErrors.name} />
            <FormSectionLabel label={text.phoneLabel} completed={validatePhone(normalizePhoneText(phone))} containerStyle={styles.labelRow} labelStyle={styles.label} />
            <TextInput style={styles.input} placeholder="+380..." placeholderTextColor={SCREEN_THEME.textMuted} value={phone} onChangeText={(v) => { setPhone(normalizePhoneText(v)); if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined })); }} keyboardType="phone-pad" />
            <FormFieldError error={fieldErrors.phone} />
          </View>

          {/* Категорія (завжди видна, для термінових - опціонально) */}
          <View style={styles.card}>
            <FormSectionLabel
              label={isUrgent ? `${text.categoryTitle} (необов'язково)` : text.categoryTitle}
              completed={isCategoryComplete && isSpecialComplete}
              labelStyle={styles.sectionTitle}
            />
            <CategorySelector value={group} onSelect={handleGroupChange} disabled={loading} />
            <FormFieldError error={fieldErrors.group} />
            {group ? <SubcategorySelector group={group} value={subcategory} onSelect={handleSubcategoryChange} disabled={loading} /> : null}
            <FormFieldError error={fieldErrors.subcategory} />
          </View>

          {isFoodsharing ? <FoodSharingForm store={store} timeSlot={timeSlot} onStoreChange={setStore} onTimeChange={setTimeSlot} /> : null}
          {isRide ? <RideSharingForm destination={destination} timeSlot={timeSlot} onDestinationChange={setDestination} onTimeChange={setTimeSlot} /> : null}
          <View style={styles.inlineErrorWrap}><FormFieldError error={fieldErrors.special} /></View>

          {/* Кнопка "Додати деталі" */}
          <TouchableOpacity style={styles.detailsToggle} onPress={handleToggleDetails} activeOpacity={0.75}>
            <MaterialCommunityIcons
              name={showDetails ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={SCREEN_THEME.textSecondary}
            />
            <Text style={styles.detailsToggleText}>
              {showDetails ? text.hideDetails : text.addDetails}
            </Text>
          </TouchableOpacity>

          {/* Блок деталей - разворачивается по кнопке */}
          {showDetails ? (
            <View style={styles.card}>
              <FormSectionLabel
                label={text.descLabel}
                completed={description.trim().length === 0 || description.trim().length >= 10}
                labelStyle={styles.sectionTitle}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={text.descPlaceholder}
                placeholderTextColor={SCREEN_THEME.textMuted}
                value={description}
                onChangeText={(v) => setDescription(v.slice(0, MAX_DESC_LENGTH))}
                multiline
                maxLength={MAX_DESC_LENGTH}
                textAlignVertical="top"
              />
              <Text style={[styles.charCounter, !isDescriptionValid && styles.charCounterError]}>
                {description.length}/{MAX_DESC_LENGTH} {text.charsLeft}
              </Text>
              <FormFieldError error={fieldErrors.description} />
            </View>
          ) : null}

          {/* Кнопка отправки */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                isUrgent && styles.submitButtonUrgent,
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF9EE" />
              ) : (
                <>
                  {isUrgent ? (
                    <MaterialCommunityIcons name="fire" size={18} color="#FFF9EE" />
                  ) : (
                    <MaterialCommunityIcons name="send-outline" size={18} color="#FFF9EE" />
                  )}
                  <Text style={styles.submitButtonText}>
                    {isUrgent ? text.submitUrgent : text.submit}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  flex: { flex: 1 },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  container: { flex: 1 },
  heroCard: { marginHorizontal: 20, marginTop: 16, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 30, padding: 20, borderWidth: 1, borderColor: '#E4D0AB' },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1E1BC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0C89A' },
  heroTitle: { fontSize: 26, fontWeight: '900', color: SCREEN_THEME.textPrimary, textAlign: 'center' },
  heroSubtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  urgentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EBD9B6' },
  urgentTextWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  urgentLabel: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  urgentLabelActive: { color: SCREEN_THEME.terracotta },
  card: { marginHorizontal: 20, marginTop: 16, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 26, padding: 18, borderWidth: 1, borderColor: '#E4D0AB' },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary, marginBottom: 6, marginTop: 8 },
  labelRow: { marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#FFFDF6', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: SCREEN_THEME.textPrimary, borderWidth: 1, borderColor: '#E7D6B3' },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  charCounter: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 6, textAlign: 'right', fontWeight: '700' },
  charCounterError: { color: SCREEN_THEME.terracotta },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, marginHorizontal: 20, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: '#E4D0AB', backgroundColor: SCREEN_THEME.paperStrong },
  detailsToggleText: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textSecondary },
  footer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 30 },
  submitButton: { minHeight: 56, borderRadius: 18, backgroundColor: SCREEN_THEME.woodGreen, borderWidth: 1, borderColor: SCREEN_THEME.woodGreenDark, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  submitButtonUrgent: { backgroundColor: SCREEN_THEME.terracotta, borderColor: SCREEN_THEME.terracottaDark },
  submitButtonDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#FFF9EE', fontWeight: '900', fontSize: 16 },
  inlineErrorWrap: { marginHorizontal: 20, marginTop: 6 },
});

export default AddRequestScreen;

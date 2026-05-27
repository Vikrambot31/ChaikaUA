import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import FormSectionLabel from '../components/FormSectionLabel';
import { FormFieldError } from '../components/ValidationErrorMessage';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { normalizePersonName, normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { validateName, validatePhone } from '../utils/validators';
import { firebaseChatAPI } from '../firebase-config';
import { RATE_LIMITERS } from '../utils/rateLimiter';
import { showUserError } from '../utils/userFacingErrors';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { getDonePhotos, getRequiredPhotoLabel, validateSubmissionRequirements } from '../utils/submissionRequirements';

// RootState type for language selector
interface LangState { language?: { current?: string } }

const UI_TEXT = {
  ua: {
    heroTitle: 'Запросити допомогу',
    heroSubtitle: 'Опишіть ситуацію, і сусіди побачать ваш запит у відповідній категорії.',
    authNoticeTitle: 'Потрібна реєстрація',
    authNoticeBody: 'Щоб надіслати заявку, увійдіть або зареєструйтесь. Це займе 1 хвилину.',
    authNoticeBtn: 'Увійти / Зареєструватись',
    labelName: 'Ім\'я',
    labelPhone: 'Телефон',
    labelHelpType: 'Тип допомоги',
    labelSubtype: 'Уточнення',
    labelDescription: 'Опис ситуації',
    namePlaceholder: 'Ваше ім\'я',
    phonePlaceholder: 'Телефон',
    descriptionPlaceholder: 'Розкажіть детальніше, що саме потрібно...',
    selectHelpType: 'Оберіть тип допомоги...',
    selectSubtype: 'Уточніть запит...',
    submitting: 'Надсилання...',
    submitBtn: 'Надіслати запит',
    errorTitle: 'Помилка',
    errorFields: 'Заповніть усі поля.',
    errorValidate: 'Перевірте ім\'я та телефон.',
    errorDescTooShort: 'Опис має бути не менше 10 символів.',
    successTitle: 'Готово',
    successMsg: 'Ваш запит на допомогу надіслано сусідам.',
    successRequestId: 'Номер заявки',
    errorSend: 'Не вдалося надіслати запит.',
    charsLeft: 'символів',
  },
  ru: {
    heroTitle: 'Запросить помощь',
    heroSubtitle: 'Опишите ситуацию, и соседи увидят ваш запрос в подходящей категории.',
    authNoticeTitle: 'Нужна регистрация',
    authNoticeBody: 'Чтобы отправить заявку, войдите или зарегистрируйтесь. Это займёт 1 минуту.',
    authNoticeBtn: 'Войти / Зарегистрироваться',
    labelName: 'Имя',
    labelPhone: 'Телефон',
    labelHelpType: 'Тип помощи',
    labelSubtype: 'Уточнение',
    labelDescription: 'Описание ситуации',
    namePlaceholder: 'Ваше имя',
    phonePlaceholder: 'Телефон',
    descriptionPlaceholder: 'Расскажите подробнее, что именно нужно...',
    selectHelpType: 'Выберите тип помощи...',
    selectSubtype: 'Уточните запрос...',
    submitting: 'Отправка...',
    submitBtn: 'Отправить запрос',
    errorTitle: 'Ошибка',
    errorFields: 'Заполните все поля.',
    errorValidate: 'Проверьте имя и телефон.',
    errorDescTooShort: 'Описание должно быть не менее 10 символов.',
    successTitle: 'Готово',
    successMsg: 'Ваш запрос на помощь отправлен соседям.',
    successRequestId: 'Номер заявки',
    errorSend: 'Не удалось отправить запрос.',
    charsLeft: 'симв.',
  },
  en: {
    heroTitle: 'Request help',
    authNoticeTitle: 'Registration required',
    authNoticeBody: 'To send a request, sign in or register. It takes 1 minute.',
    authNoticeBtn: 'Sign in / Register',
    heroSubtitle: 'Describe the situation and neighbors will see your request in the right category.',
    labelName: 'Name',
    labelPhone: 'Phone',
    labelHelpType: 'Type of help',
    labelSubtype: 'Details',
    labelDescription: 'Situation description',
    namePlaceholder: 'Your name',
    phonePlaceholder: 'Phone',
    descriptionPlaceholder: 'Describe in more detail what you need...',
    selectHelpType: 'Select type of help...',
    selectSubtype: 'Specify your request...',
    submitting: 'Sending...',
    submitBtn: 'Send request',
    errorTitle: 'Error',
    errorFields: 'Fill in all fields.',
    errorValidate: 'Check name and phone.',
    errorDescTooShort: 'Description must be at least 10 characters.',
    successTitle: 'Done',
    successMsg: 'Your help request has been sent to neighbors.',
    successRequestId: 'Request ID',
    errorSend: 'Failed to send request.',
    charsLeft: 'chars',
  },
} as const;

// Localized labels for HELP_TYPES — same order as the HELP_TYPES values array
const HELP_TYPES_LABELS = {
  ua: ['Медична допомога', 'Терміновий ремонт', 'Юридична консультація', 'Психологічна підтримка', 'Догляд за літніми', 'Допомога з дітьми', "Комп'ютерна допомога", 'Допомога з переїздом', 'Сантехніка', 'Електрика', 'Прибирання', 'Доставка та покупки', 'Навчання', 'Пошук роботи', 'Допомога з тваринами', 'Переклад та мова', 'Музика та творчість', 'Допомога з документами', 'Спорт та фітнес', 'Інше'],
  ru: ['Медицинская помощь', 'Срочный ремонт', 'Юридическая консультация', 'Психологическая поддержка', 'Уход за пожилыми', 'Помощь с детьми', 'Компьютерная помощь', 'Помощь с переездом', 'Сантехника', 'Электрика', 'Уборка', 'Доставка и покупки', 'Обучение', 'Поиск работы', 'Помощь с животными', 'Перевод и язык', 'Музыка и творчество', 'Помощь с документами', 'Спорт и фитнес', 'Другое'],
  en: ['Medical help', 'Emergency repair', 'Legal consultation', 'Psychological support', 'Elderly care', 'Childcare', 'Computer help', 'Moving help', 'Plumbing', 'Electrical', 'Cleaning', 'Delivery & shopping', 'Education', 'Job search', 'Pet care', 'Translation', 'Music & arts', 'Document help', 'Sports & fitness', 'Other'],
} as const;

const HELP_TYPES = [
  { label: 'Медицинская помощь', value: 'medical' },
  { label: 'Срочный ремонт', value: 'repair' },
  { label: 'Юридическая консультация', value: 'legal' },
  { label: 'Психологическая поддержка', value: 'psychology' },
  { label: 'Уход за пожилыми', value: 'elderly_care' },
  { label: 'Помощь с детьми', value: 'childcare' },
  { label: 'Компьютерная помощь', value: 'computer' },
  { label: 'Помощь с переездом', value: 'moving' },
  { label: 'Сантехника', value: 'plumbing' },
  { label: 'Электрика', value: 'electrical' },
  { label: 'Уборка', value: 'cleaning' },
  { label: 'Доставка и покупки', value: 'delivery' },
  { label: 'Обучение', value: 'education' },
  { label: 'Поиск работы', value: 'job_search' },
  { label: 'Помощь с животными', value: 'pets' },
  { label: 'Перевод и язык', value: 'translation' },
  { label: 'Музыка и творчество', value: 'music' },
  { label: 'Помощь с документами', value: 'documents' },
  { label: 'Спорт и фитнес', value: 'fitness' },
  { label: 'Другое', value: 'other' },
] as const;

const CATEGORY_MAP: Record<string, string> = {
  medical: 'medical',
  repair: 'repair',
  plumbing: 'repair',
  electrical: 'repair',
  cleaning: 'cleaning',
  delivery: 'delivery',
  legal: 'legal',
  documents: 'legal',
  elderly_care: 'care',
  childcare: 'care',
  pets: 'care',
  psychology: 'care',
  computer: 'tech',
  moving: 'moving',
  job_search: 'other',
  translation: 'other',
  music: 'other',
  education: 'other',
  fitness: 'other',
};

const HELP_SUBTYPES: Record<string, { label: string; value: string }[]> = {
  medical: [
    { label: 'Вызвать скорую', value: 'call_ambulance' },
    { label: 'Нужен врач на дому', value: 'doctor_home' },
    { label: 'Нужны лекарства', value: 'need_medicine' },
    { label: 'Сопроводить в больницу', value: 'hospital_escort' },
    { label: 'Другое', value: 'other' },
  ],
  repair: [
    { label: 'Сантехника', value: 'plumbing' },
    { label: 'Электрика', value: 'electrical' },
    { label: 'Дверь / замок', value: 'door_lock' },
    { label: 'Окно / балкон', value: 'window' },
    { label: 'Потолок / стены', value: 'ceiling_walls' },
    { label: 'Мебель', value: 'furniture' },
    { label: 'Другое', value: 'other' },
  ],
  legal: [
    { label: 'Консультация юриста', value: 'lawyer_consult' },
    { label: 'Составить заявление', value: 'write_statement' },
    { label: 'Жилищные вопросы', value: 'housing' },
    { label: 'Трудовые вопросы', value: 'labor' },
    { label: 'Другое', value: 'other' },
  ],
  documents: [
    { label: 'Нотариус', value: 'notary' },
    { label: 'Перевод документов', value: 'translation' },
    { label: 'Копии и справки', value: 'copies' },
    { label: 'Оформление субсидии', value: 'subsidy' },
    { label: 'Другое', value: 'other' },
  ],
  childcare: [
    { label: 'Посидеть с ребёнком', value: 'babysit' },
    { label: 'Отвести / забрать из школы', value: 'school_transport' },
    { label: 'Помощь с уроками', value: 'homework' },
    { label: 'Другое', value: 'other' },
  ],
  elderly_care: [
    { label: 'Сопроводить в больницу', value: 'hospital_escort' },
    { label: 'Купить продукты', value: 'grocery' },
    { label: 'Помощь по дому', value: 'household' },
    { label: 'Просто поговорить', value: 'talk' },
    { label: 'Другое', value: 'other' },
  ],
  computer: [
    { label: 'Настройка компьютера', value: 'pc_setup' },
    { label: 'Установка программ', value: 'software' },
    { label: 'Помощь со смартфоном', value: 'smartphone' },
    { label: 'Интернет / Wi-Fi', value: 'internet' },
    { label: 'Другое', value: 'other' },
  ],
  moving: [
    { label: 'Помочь с переноской', value: 'carry' },
    { label: 'Нужна машина', value: 'car_needed' },
    { label: 'Помочь с упаковкой', value: 'packing' },
    { label: 'Другое', value: 'other' },
  ],
  delivery: [
    { label: 'Купить продукты', value: 'grocery' },
    { label: 'Аптека / лекарства', value: 'pharmacy' },
    { label: 'Передать посылку', value: 'parcel' },
    { label: 'Другое', value: 'other' },
  ],
  cleaning: [
    { label: 'Уборка квартиры', value: 'apartment' },
    { label: 'Вынести мусор', value: 'trash' },
    { label: 'Уборка после ремонта', value: 'after_repair' },
    { label: 'Другое', value: 'other' },
  ],
  pets: [
    { label: 'Выгулять собаку', value: 'dog_walk' },
    { label: 'Покормить питомца', value: 'feed_pet' },
    { label: 'Присмотреть за питомцем', value: 'pet_sit' },
    { label: 'Другое', value: 'other' },
  ],
  education: [
    { label: 'Репетитор (школа)', value: 'school_tutor' },
    { label: 'Иностранный язык', value: 'language' },
    { label: 'Музыка', value: 'music' },
    { label: 'Другое', value: 'other' },
  ],
  fitness: [
    { label: 'Компания для бега', value: 'running' },
    { label: 'Тренировка в зале', value: 'gym' },
    { label: 'Йога / растяжка', value: 'yoga' },
    { label: 'Другое', value: 'other' },
  ],
};

const HelpRequestScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: LangState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: { auth?: { user?: { id?: string; name?: string; photoURL?: string } } }) => state.auth?.user);
  const text = UI_TEXT[language];
  const requiredPhotoLabel = getRequiredPhotoLabel(language);
  const helpTypeLabels = HELP_TYPES_LABELS[language];
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+380');
  const [helpType, setHelpType] = useState('');
  const [subType, setSubType] = useState('');
  const [description, setDescription] = useState('');
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    helpType?: string;
    subType?: string;
    description?: string;
  }>({});

  const MAX_DESCRIPTION_LENGTH = 500;

  const subtypes = useMemo(() => HELP_SUBTYPES[helpType] ?? [], [helpType]);
  const hasSubtypes = subtypes.length > 0;

  const canSubmit = useMemo(() => {
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);
    return (
      validateName(normalizedName) &&
      validatePhone(normalizedPhone) &&
      Boolean(helpType) &&
      (!hasSubtypes || Boolean(subType)) &&
      description.trim().length >= 10 &&
      getDonePhotos(formPhotos).length > 0
    );
  }, [hasSubtypes, helpType, name, phone, subType, description, formPhotos]);
  const isNameComplete = useMemo(() => validateName(normalizePersonName(name)), [name]);
  const isPhoneComplete = useMemo(() => validatePhone(normalizePhoneText(phone)), [phone]);
  const isHelpTypeComplete = Boolean(helpType);
  const isSubtypeComplete = !hasSubtypes || Boolean(subType);
  const isDescriptionComplete = description.trim().length >= 10;

  const handleSubmit = async () => {
    const nextErrors: {
      name?: string;
      phone?: string;
      helpType?: string;
      subType?: string;
      description?: string;
    } = {};
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);

    if (!normalizedName || !normalizedPhone || !helpType) {
      if (!normalizedName) nextErrors.name = text.errorValidate;
      if (!normalizedPhone) nextErrors.phone = text.errorValidate;
      if (!helpType) nextErrors.helpType = text.errorFields;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.errorFields);
      return;
    }

    if (!validateName(normalizedName) || !validatePhone(normalizedPhone)) {
      if (!validateName(normalizedName)) nextErrors.name = text.errorValidate;
      if (!validatePhone(normalizedPhone)) nextErrors.phone = text.errorValidate;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.errorValidate);
      return;
    }

    if (hasSubtypes && !subType) {
      nextErrors.subType = text.errorFields;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.errorFields);
      return;
    }

    if (description.trim().length < 10) {
      nextErrors.description = text.errorDescTooShort;
      setFieldErrors(nextErrors);
      Alert.alert(text.errorTitle, text.errorDescTooShort);
      return;
    }

    setFieldErrors({});
    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, photos: formPhotos, navigation })) {
      return;
    }
    const firstPhoto = getDonePhotos(formPhotos)[0];

    const secsLeft = RATE_LIMITERS.helpRequest.cooldownSecondsLeft();
    if (secsLeft > 0) {
      Alert.alert(text.errorTitle, language === 'ru'
        ? `Следующий запрос можно отправить через ${secsLeft} сек.`
        : language === 'en'
          ? `Please wait ${secsLeft} seconds before sending another request.`
          : `Наступний запит можна надіслати через ${secsLeft} сек.`);
      return;
    }

    const category = CATEGORY_MAP[helpType] || 'other';
    // Use localized label for the stored text
    const helpTypeIndex = HELP_TYPES.findIndex((h) => h.value === helpType);
    const helpLabel = helpTypeIndex >= 0 ? helpTypeLabels[helpTypeIndex] : helpType;
    const subLabel = subtypes.find((s) => s.value === subType)?.label;
    const categoryLabel = subLabel ? `${helpLabel} • ${subLabel}` : helpLabel;
    const finalText = sanitizeStoredText(description.trim() || categoryLabel);
    const finalDescription = sanitizeStoredText(
      description.trim() ? description.trim() : categoryLabel
    );

    setSubmitting(true);
    try {
      const result = await firebaseChatAPI.addRequest({
        name: normalizedName,
        phone: normalizedPhone,
        language,
        category,
        group: 'care',
        subcategory: helpType,
        building: 'Чайка',
        text: finalText,
        description: finalDescription,
        photoUri: firstPhoto?.downloadUrl ?? '',
        photoStoragePath: firstPhoto?.storagePath ?? '',
      });

      if (!result.success) {
        showUserError(language, 'send', result.error || text.errorSend);
        return;
      }
      RATE_LIMITERS.helpRequest.recordSubmit();

      // Show success with request ID when available
      const requestId = result.data?.id;
      const successDetail = requestId
        ? `${text.successMsg}\n\n${text.successRequestId}: ${String(requestId).slice(-6).toUpperCase()}`
        : text.successMsg;
      Alert.alert(text.successTitle, successDetail);
      setName('');
      setPhone('+380');
      setHelpType('');
      setSubType('');
      setDescription('');
      setFormPhotos([]);
    } catch (error) {
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{text.heroTitle}</Text>
          <Text style={styles.heroSubtitle}>{text.heroSubtitle}</Text>
        </View>

        {!user && (
          <View style={styles.authNoticeCard}>
            <Text style={styles.authNoticeTitle}>{text.authNoticeTitle}</Text>
            <Text style={styles.authNoticeBody}>{text.authNoticeBody}</Text>
            <TouchableOpacity
              style={styles.authNoticeBtn}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('LoginScreen', {})}
            >
              <Text style={styles.authNoticeBtnText}>{text.authNoticeBtn}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.formCard}>
          <FormSectionLabel label={text.labelName} completed={isNameComplete} containerStyle={styles.labelRow} labelStyle={styles.label} />
            <TextInput
              placeholder={text.namePlaceholder}
              value={name}
              onChangeText={(value) => { setName(normalizePersonName(value)); if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined })); }}
              style={styles.input}
              placeholderTextColor={SCREEN_THEME.textMuted}
            />
            <FormFieldError error={fieldErrors.name} />

          <FormSectionLabel label={text.labelPhone} completed={isPhoneComplete} containerStyle={styles.labelRow} labelStyle={styles.label} />
            <TextInput
              placeholder={text.phonePlaceholder}
              value={phone}
              onChangeText={(value) => { setPhone(normalizePhoneText(value)); if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined })); }}
              keyboardType="phone-pad"
              style={styles.input}
              placeholderTextColor={SCREEN_THEME.textMuted}
            />
            <FormFieldError error={fieldErrors.phone} />

          <FormSectionLabel label={text.labelHelpType} completed={isHelpTypeComplete} containerStyle={styles.labelRow} labelStyle={styles.label} />
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={helpType}
                onValueChange={(v) => { setHelpType(v); setSubType(''); if (fieldErrors.helpType) setFieldErrors((prev) => ({ ...prev, helpType: undefined })); }}
                style={styles.picker}
              >
              <Picker.Item label={text.selectHelpType} value="" />
              {HELP_TYPES.map((type, index) => (
                <Picker.Item key={type.value} label={helpTypeLabels[index]} value={type.value} />
              ))}
              </Picker>
            </View>
            <FormFieldError error={fieldErrors.helpType} />

          {hasSubtypes && (
            <>
              <FormSectionLabel label={text.labelSubtype} completed={isSubtypeComplete} containerStyle={styles.labelRow} labelStyle={styles.label} />
                <View style={styles.pickerWrapper}>
                  <Picker selectedValue={subType} onValueChange={(value) => { setSubType(value); if (fieldErrors.subType) setFieldErrors((prev) => ({ ...prev, subType: undefined })); }} style={styles.picker}>
                    <Picker.Item label={text.selectSubtype} value="" />
                    {subtypes.map((s) => (
                      <Picker.Item key={s.value} label={s.label} value={s.value} />
                    ))}
                  </Picker>
                </View>
                <FormFieldError error={fieldErrors.subType} />
              </>
            )}

          {/* Description field - required, min 10 chars */}
          <FormSectionLabel label={text.labelDescription} completed={isDescriptionComplete} containerStyle={styles.labelRow} labelStyle={styles.label} />
          <TextInput
            placeholder={text.descriptionPlaceholder}
            value={description}
            onChangeText={(value) => setDescription(value.slice(0, MAX_DESCRIPTION_LENGTH))}
            style={[styles.input, styles.textArea]}
            placeholderTextColor={SCREEN_THEME.textMuted}
            multiline
            maxLength={MAX_DESCRIPTION_LENGTH}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>
            {description.length}/{MAX_DESCRIPTION_LENGTH} {text.charsLeft}
          </Text>
          <FormFieldError error={fieldErrors.description} />

          <FormSectionLabel label={requiredPhotoLabel} completed={getDonePhotos(formPhotos).length > 0} containerStyle={styles.labelRow} labelStyle={styles.label} />
          <PhotoUploadField
            uid={user?.id ?? ''}
            userName={user?.name ?? ''}
            maxPhotos={3}
            storagePath="requests"
            onPhotosChange={setFormPhotos}
          />

          <TouchableOpacity style={[styles.submitBtn, (!canSubmit || submitting) && styles.submitBtnDisabled]} onPress={handleSubmit} activeOpacity={0.88} disabled={!canSubmit || submitting}>
            {submitting ? (
              <ActivityIndicator color="#FFF9EE" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>{text.submitBtn}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 34, gap: 16 },
  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadowDeep,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroTitle: { marginTop: 16, fontSize: 27, fontWeight: '900', color: SCREEN_THEME.textPrimary, textAlign: 'center' },
  heroSubtitle: { marginTop: 10, fontSize: 14, lineHeight: 21, color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  formCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  label: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textSecondary, marginBottom: 6, marginTop: 8 },
  labelRow: { marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#FFFDF6',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: SCREEN_THEME.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E7D6B3',
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  counter: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 6, textAlign: 'right', fontWeight: '700' },
  pickerWrapper: { backgroundColor: '#FFFDF6', borderRadius: 18, borderWidth: 1, borderColor: '#E7D6B3', overflow: 'hidden' },
  picker: { color: SCREEN_THEME.textPrimary, height: 52 },
  submitBtn: {
    marginTop: 18,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: SCREEN_THEME.terracotta,
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFF9EE', fontWeight: '900', fontSize: 16 },
  authNoticeCard: {
    backgroundColor: '#FFF8E7',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0C96B',
  },
  authNoticeTitle: { fontSize: 15, fontWeight: '900', color: '#7A5C00', marginBottom: 6 },
  authNoticeBody: { fontSize: 13, color: '#7A5C00', lineHeight: 19, marginBottom: 12 },
  authNoticeBtn: {
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  authNoticeBtnText: { color: '#FFF9EE', fontWeight: '900', fontSize: 14 },
});

export default HelpRequestScreen;



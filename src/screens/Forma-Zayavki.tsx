import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { firebaseChatAPI } from '../firebase-config';
import { addHelpRequest, syncFromRequests } from '../redux/slices/helpRequestsSlice';
import { getRequests } from '../services/api';
import { SCREEN_THEME } from '../utils/screenTheme';
import { getDonePhotos } from '../utils/submissionRequirements';
import { normalizePersonName, sanitizeStoredText } from '../utils/textUtils';
import { showUserError } from '../utils/userFacingErrors';
import { normalizeUkrainianPhoneStrict, validateName, validatePhone } from '../utils/validators';

const HELP_TYPES = [
  { value: 'medicine', label: 'Медицина' },
  { value: 'repair', label: 'Ремонт' },
  { value: 'psychology', label: 'Психология' },
  { value: 'transport', label: 'Транспорт' },
  { value: 'shopping', label: 'Покупки' },
  { value: 'documents', label: 'Документы' },
  { value: 'other', label: 'Другое' },
] as const;

const MAX_DESCRIPTION_LENGTH = 500;
const REQUEST_FORM_DRAFT_KEY = '@chaika:request-form-draft:v1';

type Lang = 'ua' | 'ru' | 'en';

const formatPhoneParts = (prefix: string, parts: string[]): string => {
  const filledParts = parts.filter(Boolean);
  return filledParts.length > 0 ? `${prefix} ${filledParts.join(' ')}` : prefix;
};

const formatPhoneInput = (value: string): string => {
  const startsWithPlus = value.trimStart().startsWith('+');
  const digits = value.replace(/\D/g, '');

  if (!digits) {
    return startsWithPlus ? '+' : '';
  }

  if (digits.startsWith('380')) {
    const capped = digits.slice(0, 12);
    return formatPhoneParts(`+${capped.slice(0, 3)}`, [
      capped.slice(3, 5),
      capped.slice(5, 8),
      capped.slice(8, 10),
      capped.slice(10, 12),
    ]);
  }

  if (startsWithPlus && digits.startsWith('38')) {
    const capped = digits.slice(0, 12);
    return formatPhoneParts(`+${capped.slice(0, Math.min(3, capped.length))}`, [
      capped.slice(3, 5),
      capped.slice(5, 8),
      capped.slice(8, 10),
      capped.slice(10, 12),
    ]);
  }

  const capped = digits.slice(0, 10);
  return [
    capped.slice(0, 3),
    capped.slice(3, 6),
    capped.slice(6, 8),
    capped.slice(8, 10),
  ].filter(Boolean).join(' ');
};

const TEXT = {
  title: 'Додати прохання',
  subtitle: 'Коротко опишіть, яка допомога потрібна. Прохання одразу зʼявиться у стрічці сусідів.',
  name: 'Імʼя',
  phone: 'Телефон',
  helpType: 'Тип допомоги',
  description: 'Опис',
  photo: 'Фото (необовʼязково)',
  namePlaceholder: 'Ваше імʼя',
  phonePlaceholder: '+380...',
  descriptionPlaceholder: 'Напишіть, що саме потрібно...',
  chooseType: 'Оберіть тип допомоги',
  submit: 'Надіслати прохання',
  submitting: 'Надсилання...',
  successTitle: 'Готово',
  successBody: 'Ваше прохання додано у стрічку допомоги сусідам.',
  errorTitle: 'Помилка',
  required: 'Заповніть імʼя, телефон, тип допомоги та опис.',
  invalidContact: 'Перевірте імʼя та телефон.',
  shortDescription: 'Опис має бути не менше 10 символів.',
  photoUploading: 'Зачекайте, поки фото завантажиться, або видаліть його.',
  photoError: 'Фото не завантажилось. Видаліть його або спробуйте ще раз.',
  authRequiredTitle: '\u041d\u0443\u0436\u0435\u043d \u0432\u0445\u043e\u0434',
  authRequiredBody: '\u0427\u0442\u043e\u0431\u044b \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443, \u0441\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u043e\u0439\u0434\u0438\u0442\u0435 \u0438\u043b\u0438 \u043f\u0440\u043e\u0439\u0434\u0438\u0442\u0435 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044e.',
  authLater: '\u041f\u043e\u0437\u0436\u0435',
  authGoLogin: '\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043d\u0430 \u0432\u0445\u043e\u0434',
};

const RequestFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const user = useSelector((state: RootState) => state.auth.user);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(() => formatPhoneInput(user?.phone || '+38'));
  const [helpType, setHelpType] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const hasUserId = Boolean(user?.id);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(REQUEST_FORM_DRAFT_KEY).then((raw) => {
      if (!raw || cancelled) return;
      try {
        const draft = JSON.parse(raw) as Partial<{
          name: string;
          phone: string;
          helpType: string;
          description: string;
        }>;
        if (typeof draft.name === 'string') setName(draft.name);
        if (typeof draft.phone === 'string') setPhone(formatPhoneInput(draft.phone));
        if (typeof draft.helpType === 'string') setHelpType(draft.helpType);
        if (typeof draft.description === 'string') setDescription(draft.description.slice(0, MAX_DESCRIPTION_LENGTH));
      } catch {
        // Ignore invalid draft payload.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveDraft = async () => {
    await AsyncStorage.setItem(REQUEST_FORM_DRAFT_KEY, JSON.stringify({
      name,
      phone,
      helpType,
      description,
    })).catch(() => undefined);
  };

  const promptAuthRequired = () => {
    Alert.alert(TEXT.authRequiredTitle, TEXT.authRequiredBody, [
      { text: TEXT.authLater, style: 'cancel' },
      {
        text: TEXT.authGoLogin,
        onPress: () => navigation.navigate('LoginScreen', { redirectTo: 'RequestFormScreen', redirectMode: 'auth' }),
      },
    ]);
  };

  const submit = async () => {
    if (!hasUserId) {
      promptAuthRequired();
      return;
    }

    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizeUkrainianPhoneStrict(phone.trim());
    const cleanDescription = sanitizeStoredText(description.trim());

    if (!normalizedName || !normalizedPhone || !helpType || !cleanDescription) {
      Alert.alert(TEXT.errorTitle, TEXT.required);
      return;
    }

    if (!validateName(normalizedName) || !validatePhone(normalizedPhone)) {
      Alert.alert(TEXT.errorTitle, TEXT.invalidContact);
      return;
    }

    if (cleanDescription.length < 10) {
      Alert.alert(TEXT.errorTitle, TEXT.shortDescription);
      return;
    }

    if (photos.some((photo) => photo.status === 'error')) {
      Alert.alert(TEXT.errorTitle, TEXT.photoError);
      return;
    }

    if (photos.some((photo) => photo.status === 'uploading')) {
      Alert.alert(TEXT.errorTitle, TEXT.photoUploading);
      return;
    }

    const firstPhoto = getDonePhotos(photos)[0];
    const photoPayload = firstPhoto
      ? {
          photoUri: firstPhoto.downloadUrl,
          photoStoragePath: firstPhoto.storagePath,
        }
      : {};

    setSubmitting(true);
    try {
      const result = await firebaseChatAPI.addRequest({
        name: normalizedName,
        phone: normalizedPhone,
        language,
        category: helpType,
        group: 'help_neighbors',
        subcategory: helpType,
        building: 'Чайка',
        text: cleanDescription,
        description: cleanDescription,
        ...photoPayload,
      });

      if (!result.success) {
        showUserError(language, 'send', result.error || 'Не вдалося надіслати прохання.');
        return;
      }

      dispatch(addHelpRequest({
        id: result.data?.id || `help-${Date.now()}`,
        userId: user?.id,
        name: normalizedName,
        phone: normalizedPhone,
        description: cleanDescription,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        isBurning: true,
        moderationStatus: 'approved',
        moderatedAt: new Date().toISOString(),
      }));

      const requestsResponse = await getRequests();
      if (requestsResponse.success && requestsResponse.data) {
        dispatch(syncFromRequests(requestsResponse.data));
      }

      Alert.alert(TEXT.successTitle, TEXT.successBody, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
      setName(user?.name ?? '');
      setPhone(formatPhoneInput(user?.phone || '+38'));
      setHelpType('');
      setDescription('');
      setPhotos([]);
      void AsyncStorage.removeItem(REQUEST_FORM_DRAFT_KEY).catch(() => undefined);
    } catch (error) {
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.84}>
            <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.backText}>Назад</Text>
          </TouchableOpacity>

          <View style={styles.heroCard}>
            <Text style={styles.title}>{TEXT.title}</Text>
            <Text style={styles.subtitle}>{TEXT.subtitle}</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.label}>{TEXT.name}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={TEXT.namePlaceholder}
              placeholderTextColor={SCREEN_THEME.textSecondary}
              style={styles.input}
              editable={!submitting}
            />

            <Text style={styles.label}>{TEXT.phone}</Text>
            <TextInput
              value={phone}
              onChangeText={(value) => setPhone(formatPhoneInput(value))}
              placeholder={TEXT.phonePlaceholder}
              placeholderTextColor={SCREEN_THEME.textSecondary}
              style={styles.input}
              keyboardType="phone-pad"
              editable={!submitting}
            />

            <Text style={styles.label}>{TEXT.helpType}</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={helpType}
                onValueChange={(value) => setHelpType(String(value))}
                enabled={!submitting}
                style={styles.picker}
              >
                <Picker.Item label={TEXT.chooseType} value="" />
                {HELP_TYPES.map((item) => (
                  <Picker.Item key={item.value} label={item.label} value={item.value} />
                ))}
              </Picker>
            </View>

            <Text style={styles.label}>{TEXT.description}</Text>
            <TextInput
              value={description}
              onChangeText={(value) => setDescription(value.slice(0, MAX_DESCRIPTION_LENGTH))}
              placeholder={TEXT.descriptionPlaceholder}
              placeholderTextColor={SCREEN_THEME.textSecondary}
              style={[styles.input, styles.textArea]}
              multiline
              textAlignVertical="top"
              editable={!submitting}
            />
            <Text style={styles.hint}>{description.trim().length}/500, мін. 10 символів</Text>

            <Text style={styles.label}>{TEXT.photo}</Text>
            {hasUserId ? (
              <PhotoUploadField
                uid={user?.id ?? ''}
                userName={user?.name || name || user?.id || 'user'}
                maxPhotos={1}
                storagePath="requests"
                onPhotosChange={setPhotos}
                onBeforePickerOpen={saveDraft}
              />
            ) : (
              <TouchableOpacity style={styles.authNotice} onPress={promptAuthRequired} activeOpacity={0.86}>
                <MaterialCommunityIcons name="lock-outline" size={20} color={SCREEN_THEME.terracotta} />
                <Text style={styles.authNoticeText}>{TEXT.authRequiredBody}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={submit}
              activeOpacity={0.86}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
                  <Text style={styles.submitText}>{TEXT.submit}</Text>
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
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  keyboard: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    marginBottom: 12,
  },
  backText: { color: SCREEN_THEME.textPrimary, fontWeight: '900' },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  title: { color: SCREEN_THEME.textPrimary, fontSize: 24, fontWeight: '900', marginBottom: 8 },
  subtitle: { color: SCREEN_THEME.textSecondary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  formCard: {
    borderRadius: 24,
    padding: 16,
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  label: { color: SCREEN_THEME.textPrimary, fontSize: 14, fontWeight: '900', marginTop: 12, marginBottom: 7 },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9BF91',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  textArea: { minHeight: 118, paddingTop: 12, lineHeight: 21 },
  pickerWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9BF91',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  picker: { color: SCREEN_THEME.textPrimary },
  hint: { marginTop: 6, color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700' },
  submitButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.terracotta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: { opacity: 0.68 },
  submitText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  authNotice: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D9BF91',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authNoticeText: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
});

export default RequestFormScreen;

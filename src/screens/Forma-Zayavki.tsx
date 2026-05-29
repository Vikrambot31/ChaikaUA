import React, { useState } from 'react';
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
import { normalizePersonName, normalizePhoneText, sanitizeStoredText } from '../utils/textUtils';
import { showUserError } from '../utils/userFacingErrors';
import { validateName, validatePhone } from '../utils/validators';

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

type Lang = 'ua' | 'ru' | 'en';

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
};

const RequestFormScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const user = useSelector((state: RootState) => state.auth.user);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone || '+380');
  const [helpType, setHelpType] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const normalizedName = normalizePersonName(name);
    const normalizedPhone = normalizePhoneText(phone);
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
        photoUri: firstPhoto?.downloadUrl ?? '',
        photoStoragePath: firstPhoto?.storagePath ?? '',
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
      setPhone(user?.phone || '+380');
      setHelpType('');
      setDescription('');
      setPhotos([]);
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
              onChangeText={setPhone}
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
            <PhotoUploadField
              uid={user?.id ?? ''}
              userName={user?.name || name || user?.id || 'user'}
              maxPhotos={1}
              storagePath="requests"
              onPhotosChange={setPhotos}
            />

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
});

export default RequestFormScreen;

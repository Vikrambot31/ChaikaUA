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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { ref, set } from 'firebase/database';
import { useSelector } from 'react-redux';

import { database } from '../firebase-core';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import type { DetailItemData } from '../utils/detailViewTypes';
import { normalizeUkrainianPhoneStrict, validatePhone } from '../utils/validators';

type Lang = 'ua' | 'ru' | 'en';

type Params = {
  BusinessClaimScreen: { item: DetailItemData };
};

const UI_TEXT = {
  ua: {
    title: 'Я власник закладу',
    subtitle: 'Заповніть форму для підтвердження прав на заклад. Модератор перевірить заявку.',
    labelName: "Ваше ім'я",
    placeholderName: "Введіть ім'я",
    labelPhone: 'Телефон',
    placeholderPhone: '+380XXXXXXXXX',
    labelPlace: 'Назва закладу',
    labelAddress: 'Адреса',
    labelComment: 'Підтвердження прав (необов\'язково)',
    placeholderComment: 'Розкажіть, чому ви є власником: документи, ІПН, інше...',
    submit: 'Надіслати заявку',
    submitting: 'Надсилається...',
    successTitle: 'Заявку надіслано',
    successBody: 'Модератор розгляне вашу заявку. Ви отримаєте повідомлення.',
    errorTitle: 'Помилка',
    errorBody: 'Не вдалося надіслати заявку. Спробуйте ще раз.',
    requiredName: "Введіть ім'я",
    requiredPhone: 'Введіть коректний номер телефону',
    notLoggedIn: 'Увійдіть в акаунт, щоб надіслати заявку.',
    back: 'Назад',
  },
  ru: {
    title: 'Я владелец заведения',
    subtitle: 'Заполните форму для подтверждения прав на заведение. Модератор проверит заявку.',
    labelName: 'Ваше имя',
    placeholderName: 'Введите имя',
    labelPhone: 'Телефон',
    placeholderPhone: '+380XXXXXXXXX',
    labelPlace: 'Название заведения',
    labelAddress: 'Адрес',
    labelComment: 'Подтверждение прав (необязательно)',
    placeholderComment: 'Расскажите, почему вы являетесь владельцем: документы, ИНН, другое...',
    submit: 'Отправить заявку',
    submitting: 'Отправляется...',
    successTitle: 'Заявка отправлена',
    successBody: 'Модератор рассмотрит вашу заявку. Вы получите уведомление.',
    errorTitle: 'Ошибка',
    errorBody: 'Не удалось отправить заявку. Попробуйте снова.',
    requiredName: 'Введите имя',
    requiredPhone: 'Введите корректный номер телефона',
    notLoggedIn: 'Войдите в аккаунт, чтобы отправить заявку.',
    back: 'Назад',
  },
  en: {
    title: 'I am the owner',
    subtitle: 'Fill in the form to confirm ownership. A moderator will review your request.',
    labelName: 'Your name',
    placeholderName: 'Enter your name',
    labelPhone: 'Phone',
    placeholderPhone: '+380XXXXXXXXX',
    labelPlace: 'Place name',
    labelAddress: 'Address',
    labelComment: 'Ownership proof (optional)',
    placeholderComment: 'Describe why you are the owner: documents, tax ID, etc.',
    submit: 'Submit claim',
    submitting: 'Submitting...',
    successTitle: 'Claim submitted',
    successBody: 'A moderator will review your claim. You will receive a notification.',
    errorTitle: 'Error',
    errorBody: 'Failed to submit claim. Please try again.',
    requiredName: 'Enter your name',
    requiredPhone: 'Enter a valid phone number',
    notLoggedIn: 'Please log in to submit a claim.',
    back: 'Back',
  },
} as const;

export default function BusinessClaimScreen({
  navigation,
  route,
}: {
  navigation: NavigationProp<RootStackParamList, 'BusinessClaimScreen'>;
  route: RouteProp<Params, 'BusinessClaimScreen'>;
}) {
  const { item } = route.params;
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];

  const [name, setName] = useState(currentUser?.name ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const normalizedPhone = normalizeUkrainianPhoneStrict(phone.trim());

    if (!trimmedName) {
      Alert.alert(text.errorTitle, text.requiredName);
      return;
    }
    if (!validatePhone(phone.trim())) {
      Alert.alert(text.errorTitle, text.requiredPhone);
      return;
    }

    if (!currentUser?.id) {
      Alert.alert(text.errorTitle, text.notLoggedIn);
      return;
    }

    setSubmitting(true);
    try {
      const claimRef = ref(database, `business_plus_claims/${item.sourceId}`);
      await set(claimRef, {
        placeId: item.sourceId,
        placeName: item.title,
        placeAddress: item.address ?? '',
        ownerUid: currentUser.id,
        ownerName: trimmedName,
        ownerPhone: normalizedPhone ?? phone.trim(),
        comment: comment.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      Alert.alert(text.successTitle, text.successBody, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert(text.errorTitle, text.errorBody);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#403933" />
          <Text style={styles.backText}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="store-check-outline" size={28} color={SCREEN_THEME.terracotta} />
            <Text style={styles.infoText}>{text.subtitle}</Text>
          </View>

          {/* Place info (readonly) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{text.labelPlace}</Text>
            <View style={styles.readonlyField}>
              <Text style={styles.readonlyText}>{item.title}</Text>
            </View>
          </View>

          {item.address ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{text.labelAddress}</Text>
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyText}>{item.address}</Text>
              </View>
            </View>
          ) : null}

          {/* Owner name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{text.labelName} *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={text.placeholderName}
              placeholderTextColor="#B0A49A"
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>

          {/* Owner phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{text.labelPhone} *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder={text.placeholderPhone}
              placeholderTextColor="#B0A49A"
              keyboardType="phone-pad"
              returnKeyType="next"
            />
          </View>

          {/* Comment / proof */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{text.labelComment}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={comment}
              onChangeText={setComment}
              placeholder={text.placeholderComment}
              placeholderTextColor="#B0A49A"
              multiline
              numberOfLines={4}
              maxLength={500}
              returnKeyType="done"
            />
            <Text style={styles.charCount}>{comment.length}/500</Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={() => void handleSubmit()}
            disabled={submitting}
            activeOpacity={0.86}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>{text.submit}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderBottomWidth: 1,
    borderBottomColor: '#E6D6BF',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 78 },
  backText: { color: '#403933', fontSize: 14, fontWeight: '800' },
  headerTitle: { color: '#2D2520', fontSize: 17, fontWeight: '900', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 78 },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FFF5E6',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F2D9A0',
  },
  infoText: {
    flex: 1,
    color: '#5C4A1E',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  fieldGroup: { gap: 6 },
  label: { color: '#7A6D64', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  input: {
    backgroundColor: '#FBF7F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0D4C8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2D2520',
    fontWeight: '600',
  },
  inputMultiline: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  readonlyField: {
    backgroundColor: '#F0EDE8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E0D4C8',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readonlyText: { fontSize: 15, color: '#5A4F46', fontWeight: '600' },
  charCount: { textAlign: 'right', fontSize: 11, color: '#B0A49A', fontWeight: '700' },
  submitBtn: {
    marginTop: 8,
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  submitBtnDisabled: { backgroundColor: '#C4B5A8' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});

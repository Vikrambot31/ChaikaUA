import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../utils/constants';
import { submitInviteRequest } from '../services/sponsorService';
import { formatCountdown, mapInviteCFErrorToField } from '../utils/userFacingErrors';
import {
  containsBannedWords,
  formatPhoneForConfirmation,
  normalizeSponsorPhone,
  refreshBannedWordsFromSecurityConfig,
  validateTextLength,
} from '../utils/rulesEngine';
import { pickPhotoFromLibrary, takePhotoWithCamera } from '../utils/photoPicker';

type InviteAccessScreenProps = {
  requesterPhone: string;
  onSubmitted: () => void;
  onContinue: () => void;
  allowContinue?: boolean;
  hardLocked?: boolean;
};

type InviteDraft = {
  step?: number;
  name?: string;
  apartment?: string;
  sponsorPhone?: string;
  noSponsor?: boolean;
  sponsorConfirmed?: boolean;
  profilePhotoUri?: string;
  text?: string;
};

const PHONE_PLACEHOLDER = '+380XXXXXXXXX';
const DRAFT_KEY = 'invite_access_wizard_draft';

export default function InviteAccessScreen({
  requesterPhone,
  onSubmitted,
  onContinue,
  allowContinue = true,
  hardLocked = false,
}: InviteAccessScreenProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [apartment, setApartment] = useState('');
  const [sponsorPhone, setSponsorPhone] = useState('');
  const [noSponsor, setNoSponsor] = useState(false);
  const [sponsorConfirmed, setSponsorConfirmed] = useState(false);
  const [profilePhotoUri, setProfilePhotoUri] = useState('');
  const [text, setText] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ sponsorPhone?: string; text?: string }>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  const requesterPhoneResult = useMemo(() => normalizeSponsorPhone(requesterPhone), [requesterPhone]);
  const sponsorPhoneResult = useMemo(() => normalizeSponsorPhone(sponsorPhone), [sponsorPhone]);
  const normalizedRequesterPhone = 'normalized' in requesterPhoneResult ? requesterPhoneResult.normalized : '';
  const normalizedSponsorPhone = 'normalized' in sponsorPhoneResult ? sponsorPhoneResult.normalized : '';
  const cleanText = text.trim();
  const textValidation = validateTextLength(cleanText, 20, 280);
  const rateLimitSeconds = Math.max(0, Math.ceil((rateLimitUntil - now) / 1000));
  const sponsorStepReady = noSponsor || (Boolean(normalizedSponsorPhone) && sponsorConfirmed);
  const canSubmit = Boolean(normalizedRequesterPhone) && sponsorStepReady && textValidation.valid && !loading && rateLimitSeconds <= 0;

  useEffect(() => {
    void refreshBannedWordsFromSecurityConfig();
    void AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        let draft: InviteDraft;
        try { draft = JSON.parse(raw) as InviteDraft; } catch { return; }
        setStep(Math.min(3, Math.max(1, Number(draft.step || 1))));
        setName(String(draft.name || ''));
        setApartment(String(draft.apartment || ''));
        setSponsorPhone(String(draft.sponsorPhone || ''));
        setNoSponsor(draft.noSponsor === true);
        setSponsorConfirmed(draft.sponsorConfirmed === true);
        setProfilePhotoUri(String(draft.profilePhotoUri || ''));
        setText(String(draft.text || ''));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const draft: InviteDraft = { step, name, apartment, sponsorPhone, noSponsor, sponsorConfirmed, profilePhotoUri, text };
    void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => undefined);
  }, [step, name, apartment, sponsorPhone, noSponsor, sponsorConfirmed, profilePhotoUri, text]);

  useEffect(() => {
    if (rateLimitUntil <= Date.now()) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [rateLimitUntil]);

  const goNext = () => {
    setMessage(null);
    if (step === 1) {
      setStep(2);
      return;
    }
    if (!sponsorStepReady) {
      setFieldErrors({
        sponsorPhone: 'error' in sponsorPhoneResult
          ? sponsorPhoneResult.error
          : 'Подтвердите распознанный телефон поручителя.',
      });
      return;
    }
    setStep(3);
  };

  const pickProfilePhoto = async (source: 'library' | 'camera') => {
    try {
      const photo = source === 'camera'
        ? await takePhotoWithCamera({ allowsEditing: true, quality: 0.82 })
        : await pickPhotoFromLibrary({ allowsEditing: true, quality: 0.82 });
      if (photo?.uri) {
        setProfilePhotoUri(photo.uri);
      }
    } catch {
      setMessage('Не удалось выбрать фото. Проверьте доступ к фото или камере.');
    }
  };

  const openProfilePhotoPicker = () => {
    Alert.alert('Фото профиля', 'Фото необязательно. Оно сохранится как черновик и не влияет на решение сервера.', [
      { text: 'Галерея', onPress: () => { void pickProfilePhoto('library'); } },
      { text: 'Камера', onPress: () => { void pickProfilePhoto('camera'); } },
      ...(profilePhotoUri ? [{ text: 'Удалить', style: 'destructive' as const, onPress: () => setProfilePhotoUri('') }] : []),
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  const handleSubmit = async () => {
    if (!normalizedRequesterPhone) {
      setMessage('Ваш телефон має бути у форматі +380XXXXXXXXX.');
      return;
    }
    if (!noSponsor && !normalizedSponsorPhone) {
      setStep(2);
      setMessage('Телефон поручителя має бути у форматі +380XXXXXXXXX.');
      return;
    }
    if (!noSponsor && normalizedRequesterPhone === normalizedSponsorPhone) {
      setStep(2);
      setMessage('Телефон поручителя має відрізнятися від вашого телефону.');
      return;
    }
    if (!textValidation.valid) {
      setStep(3);
      setFieldErrors({ text: textValidation.message });
      setMessage('Проверьте текст заявки.');
      return;
    }

    setLoading(true);
    setMessage(null);
    setFieldErrors({});
    try {
      await submitInviteRequest(normalizedRequesterPhone, noSponsor ? '' : normalizedSponsorPhone, {
        text: cleanText,
        apartment,
      });
      await AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
      setMessage('Заявку надіслано. Статус зʼявиться після перевірки.');
      onSubmitted();
    } catch (error) {
      const mapped = mapInviteCFErrorToField(error);
      setMessage(mapped.message);
      if (mapped.field === 'sponsorPhone') {
        setStep(2);
        setFieldErrors({ sponsorPhone: mapped.message });
      } else if (mapped.field === 'text') {
        setStep(3);
        setFieldErrors({ text: mapped.message });
      }
      if (mapped.retryAfterSeconds) {
        setRateLimitUntil(Date.now() + mapped.retryAfterSeconds * 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Доступ за запрошенням</Text>
        <Text style={styles.title}>Заявка, шаг {step} из 3</Text>
        <Text style={styles.subtitle}>Заполните данные по шагам. Клиент только подсказывает ошибки, финальное решение принимает сервер.</Text>

        {step === 1 ? (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Расскажите о себе</Text>
              <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Имя (необязательно)" maxLength={60} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Ваш телефон</Text>
              <TextInput value={normalizedRequesterPhone} editable={false} style={[styles.input, styles.inputDisabled]} placeholder={PHONE_PLACEHOLDER} keyboardType="phone-pad" />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Фото профиля</Text>
              <TouchableOpacity activeOpacity={0.86} onPress={openProfilePhotoPicker} style={styles.photoDraftBox}>
                {profilePhotoUri ? (
                  <Image source={{ uri: profilePhotoUri }} style={styles.profilePhoto} resizeMode="cover" />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>Выбрать фото</Text>
                    <Text style={styles.photoHint}>Необязательно</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Квартира / как связаться</Text>
              <TextInput value={apartment} onChangeText={setApartment} style={styles.input} placeholder="Необязательно" maxLength={80} />
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <View style={styles.field}>
            <Text style={styles.label}>Кто вас знает в Чайке?</Text>
            <Text style={styles.helpText}>Поручитель — сосед, который подтвердит, что вы живёте в Чайке.</Text>
            <TextInput
              value={sponsorPhone}
              onChangeText={(value) => {
                setSponsorPhone(value);
                setNoSponsor(false);
                setSponsorConfirmed(false);
                setFieldErrors((prev) => ({ ...prev, sponsorPhone: undefined }));
              }}
              style={[styles.input, fieldErrors.sponsorPhone ? styles.inputError : undefined]}
              placeholder={PHONE_PLACEHOLDER}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="phone-pad"
              maxLength={24}
            />
            {normalizedSponsorPhone && !sponsorConfirmed ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>Мы распознали номер: {formatPhoneForConfirmation(normalizedSponsorPhone)} — верно?</Text>
                <View style={styles.confirmActions}>
                  <TouchableOpacity onPress={() => setSponsorConfirmed(true)} style={styles.smallButton}>
                    <Text style={styles.smallButtonText}>Да, верно</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSponsorPhone('')} style={styles.smallButtonGhost}>
                    <Text style={styles.smallButtonGhostText}>Изменить</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {fieldErrors.sponsorPhone ? <Text style={styles.fieldError}>{fieldErrors.sponsorPhone}</Text> : null}
            <TouchableOpacity onPress={() => { setNoSponsor(true); setSponsorConfirmed(false); setFieldErrors({}); }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Никого не знаю</Text>
            </TouchableOpacity>
            {noSponsor ? <Text style={styles.message}>Можно подать заявку без поручителя, но проверка может занять больше времени.</Text> : null}
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.field}>
            <Text style={styles.label}>Почему вы хотите вступить?</Text>
            <TextInput
              value={text}
              onChangeText={(value) => {
                setText(value);
                setFieldErrors((prev) => ({ ...prev, text: undefined }));
              }}
              style={[styles.input, styles.textArea, fieldErrors.text ? styles.inputError : undefined]}
              placeholder="Напишите 20-280 символов"
              multiline
              maxLength={280}
            />
            <Text style={[styles.counter, cleanText.length > 0 && !textValidation.valid && styles.counterWarning]}>{cleanText.length}/280</Text>
            {containsBannedWords(cleanText) ? <Text style={styles.fieldWarning}>Текст может содержать запрещённые слова и будет отклонён.</Text> : null}
            {fieldErrors.text ? <Text style={styles.fieldError}>{fieldErrors.text}</Text> : null}
          </View>
        ) : null}

        {hardLocked ? <Text style={styles.message}>Строгий режим больше не используется. Можно подать заявку или продолжить с базовым доступом.</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading || (step === 3 && !canSubmit)}
          onPress={step === 3 ? handleSubmit : goNext}
          style={[styles.primaryButton, (loading || (step === 3 && !canSubmit)) && styles.buttonDisabled]}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{step === 3 ? (rateLimitSeconds > 0 ? `Отправить заявку (через ${formatCountdown(rateLimitSeconds)})` : 'Подать заявку') : 'Далее'}</Text>}
        </TouchableOpacity>

        {step > 1 ? (
          <TouchableOpacity activeOpacity={0.85} disabled={loading} onPress={() => setStep(step - 1)} style={styles.backButton}>
            <Text style={styles.secondaryButtonText}>Назад</Text>
          </TouchableOpacity>
        ) : null}

        {allowContinue ? (
          <TouchableOpacity activeOpacity={0.85} disabled={loading} onPress={onContinue} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Продовжити без заявки</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#EEF3FB' },
  panel: { padding: 20, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8E4F4' },
  eyebrow: { color: COLORS.primary, fontSize: 12, fontWeight: '900', letterSpacing: 0, textTransform: 'uppercase', marginBottom: 8 },
  title: { color: '#25324A', fontSize: 28, fontWeight: '900', marginBottom: 10 },
  subtitle: { color: '#607594', fontSize: 15, lineHeight: 22, marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { color: '#40516A', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  helpText: { color: '#607594', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#C9D9EF', borderRadius: 10, paddingHorizontal: 14, backgroundColor: '#FFFFFF', color: '#25324A', fontSize: 16, fontWeight: '700' },
  inputDisabled: { backgroundColor: '#F4F7FB', color: '#607594' },
  inputError: { borderColor: '#B3261E' },
  textArea: { minHeight: 92, paddingTop: 12, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', color: '#607594', fontSize: 12, marginTop: 4 },
  counterWarning: { color: '#B3261E', fontWeight: '800' },
  fieldError: { color: '#B3261E', fontSize: 12, lineHeight: 17, marginTop: 6 },
  fieldWarning: { color: '#9A5B00', fontSize: 12, lineHeight: 17, marginTop: 6 },
  message: { color: '#40516A', lineHeight: 20, marginBottom: 14 },
  photoDraftBox: { minHeight: 96, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C9D9EF', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FBFF', overflow: 'hidden' },
  profilePhoto: { width: '100%', height: 150 },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoPlaceholderText: { color: COLORS.primary, fontSize: 15, fontWeight: '900' },
  photoHint: { color: '#607594', fontSize: 12, fontWeight: '700' },
  confirmBox: { marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#F4F7FB', borderWidth: 1, borderColor: '#D8E4F4' },
  confirmText: { color: '#25324A', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  confirmActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: COLORS.primary },
  smallButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  smallButtonGhost: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C9D9EF' },
  smallButtonGhostText: { color: '#40516A', fontSize: 12, fontWeight: '900' },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: COLORS.primary, marginTop: 4 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  secondaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#C9D9EF', marginTop: 10, backgroundColor: '#FFFFFF' },
  backButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginTop: 8, backgroundColor: '#F4F7FB' },
  secondaryButtonText: { color: '#40516A', fontSize: 15, fontWeight: '800' },
  buttonDisabled: { opacity: 0.55 },
});

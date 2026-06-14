import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import { RootState } from '../redux/store';
import { buySellService } from '../services/buySellService';
import { SCREEN_THEME } from '../utils/screenTheme';
import { normalizePhoneText } from '../utils/textUtils';
import { checkYellowList } from '../utils/yellowListCheck';
import { getLanguageValidationError } from '../utils/contentLanguageGuard';
import { getDonePhotos, validateSubmissionRequirements } from '../utils/submissionRequirements';
import { showUserError } from '../utils/userFacingErrors';
import { useOperationTrace } from '../hooks/useOperationTrace';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { ITEM_CATEGORY_VALUES, ITEM_CONDITION_VALUES, THREE_MONTHS_MS, UI_TEXT } from './Kuplu-Prodam';
import { useAppTheme } from '../hooks/useAppTheme';

const DRAFT_KEY = '@chaika:buy_sell_draft';

const CreateBuySellScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const { colors } = useAppTheme();
  const { startOperation, trace } = useOperationTrace('CreateBuySellScreen');
  const allowLeaveRef = useRef(false);
  const draftHadPhotos = useRef(false);

  const [itemName, setItemName] = useState('');
  const [listingType, setListingType] = useState<'buy' | 'sell'>('sell');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState(() => (user?.phone ? normalizePhoneText(user.phone) : ''));
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const hasUploadingPhotos = formPhotos.some((photo) => photo.status === 'uploading');
  const hasPhotoErrors = formPhotos.some((photo) => photo.status === 'error');

  const isDirty = useMemo(() => {
    const defaultPhone = user?.phone ? normalizePhoneText(user.phone) : '';
    return Boolean(
      itemName.trim() ||
      listingType !== 'sell' ||
      category ||
      condition ||
      price.trim() ||
      description.trim() ||
      phone.trim() !== defaultPhone ||
      formPhotos.length > 0
    );
  }, [category, condition, description, formPhotos.length, itemName, listingType, phone, price, user?.phone]);

  const resetDraft = useCallback(() => {
    void AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  }, []);

  const leaveScreen = useCallback(() => {
    allowLeaveRef.current = true;
    resetDraft();
    navigation.goBack();
  }, [navigation, resetDraft]);

  const requestClose = useCallback(() => {
    if (!isDirty) {
      leaveScreen();
      return;
    }
    const closeTitle = language === 'ru' ? 'Закрыть форму?' : language === 'en' ? 'Close form?' : 'Закрити форму?';
    const closeMsg = language === 'ru'
      ? 'Вы еще не отправили объявление. Закрыть?'
      : language === 'en'
        ? "You haven't submitted the listing yet. Close?"
        : 'Ви ще не надіслали оголошення. Закрити?';
    const closeNo = language === 'ru' ? 'Нет' : language === 'en' ? 'No' : 'Ні';
    const closeYes = language === 'ru' ? 'Да' : language === 'en' ? 'Yes' : 'Так';
    Alert.alert(closeTitle, closeMsg, [
      { text: closeNo, style: 'cancel' },
      { text: closeYes, style: 'destructive', onPress: leaveScreen },
    ]);
  }, [isDirty, language, leaveScreen]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (allowLeaveRef.current || !isDirty || submitting) return;
      event.preventDefault();
      requestClose();
    });
    return unsubscribe;
  }, [isDirty, navigation, requestClose, submitting]);

  useEffect(() => {
    if (phone || !user?.phone) return;
    setPhone(normalizePhoneText(user.phone));
  }, [phone, user?.phone]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!mounted || !raw) return;
      try {
        const draft = JSON.parse(raw) as Partial<{ itemName: string; listingType: 'buy' | 'sell'; category: string; condition: string; price: string; description: string; phone: string; hadPhotos: boolean }>;
        if (draft.itemName) setItemName(draft.itemName);
        if (draft.listingType === 'buy' || draft.listingType === 'sell') setListingType(draft.listingType);
        if (draft.category) setCategory(draft.category);
        if (draft.condition) setCondition(draft.condition);
        if (draft.price) setPrice(draft.price);
        if (draft.description) setDescription(draft.description);
        if (draft.phone) setPhone(draft.phone);
        if (draft.hadPhotos) draftHadPhotos.current = true;
      } catch {
        resetDraft();
      }
    });
    return () => {
      mounted = false;
    };
  }, [resetDraft]);

  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ itemName, listingType, category, condition, price, description, phone, hadPhotos: formPhotos.length > 0 }),
      ).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [category, condition, description, formPhotos.length, isDirty, itemName, listingType, phone, price]);

  useEffect(() => {
    if (!draftHadPhotos.current) return;
    draftHadPhotos.current = false;
    Alert.alert(text.draftRestoredTitle, text.draftRestoredMsg, [{ text: text.draftRestoredOk }]);
  }, [text.draftRestoredMsg, text.draftRestoredOk, text.draftRestoredTitle]);

  const handleSubmit = async () => {
    if (submitting) return;
    startOperation();

    trace('validate', 'start');
    if (!validateSubmissionRequirements({ language, userId: user?.id, userPhotoURL: user?.photoURL, userStartAvatarKey: user?.startAvatarKey, navigation })) {
      trace('validate', 'fail', { missing: 'submissionRequirements' });
      return;
    }
    if (await checkYellowList(user?.id, language)) {
      trace('validate', 'fail', { missing: 'yellowList' });
      return;
    }

    const normalizedPrice = price.replace(',', '.').replace(/[^\d.]/g, '');
    const numericPrice = Number(normalizedPrice);

    if (!itemName.trim()) {
      trace('validate', 'fail', { missing: 'itemName' });
      Alert.alert(text.errorTitle, text.itemNameError);
      return;
    }
    if (!normalizedPrice || !Number.isFinite(numericPrice) || numericPrice < 0) {
      trace('validate', 'fail', { missing: 'price' });
      Alert.alert(text.errorTitle, text.priceError);
      return;
    }
    if (!category || !condition || !description.trim() || !phone.trim()) {
      trace('validate', 'fail', { missing: 'requiredFields' });
      Alert.alert(text.errorTitle, text.errorFill);
      return;
    }
    if (phone.replace(/\D/g, '').length < 7) {
      trace('validate', 'fail', { missing: 'phone' });
      Alert.alert(text.errorTitle, text.errorPhone);
      return;
    }
    const langError = getLanguageValidationError(`${itemName.trim()} ${description.trim()}`, language);
    if (langError) {
      trace('validate', 'fail', { missing: 'language' });
      Alert.alert(text.errorTitle, langError);
      return;
    }

    trace('photo_check', 'start');
    if (hasUploadingPhotos) {
      trace('photo_check', 'fail', { reason: 'uploadsInProgress' });
      Alert.alert(text.errorTitle, text.photoUploading);
      return;
    }
    if (hasPhotoErrors) {
      trace('photo_check', 'fail', { reason: 'photoErrors' });
      Alert.alert(text.errorTitle, text.photoUploadError);
      return;
    }
    const donePhotos = getDonePhotos(formPhotos);
    if (donePhotos.length === 0) {
      trace('photo_check', 'fail', { reason: 'noPhotos' });
      Alert.alert(text.errorTitle, text.photoRequired);
      return;
    }

    setSubmitting(true);
    try {
      const createdAt = new Date();
      const numericPriceText = Number.isFinite(numericPrice)
        ? numericPrice.toFixed(Number.isInteger(numericPrice) ? 0 : 2)
        : normalizedPrice;

      trace('api_call', 'start', { path: 'buy_sell' });
      await buySellService.add({
        listingType,
        itemName: itemName.trim(),
        category,
        condition,
        price: numericPriceText,
        description: description.trim(),
        phone: normalizePhoneText(phone),
        photoUri: donePhotos[0]?.downloadUrl ?? '',
        photoStoragePath: donePhotos[0]?.storagePath ?? '',
        photoId: '',
        photos: donePhotos.map((p) => ({ downloadUrl: p.downloadUrl, storagePath: p.storagePath })),
        moderationStatus: 'pending',
        submittedForModerationAt: createdAt.toISOString(),
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + THREE_MONTHS_MS).toISOString(),
        userId: user?.id || '',
        language,
      });
      trace('api_call', 'success');

      allowLeaveRef.current = true;
      resetDraft();
      Alert.alert(text.successTitle, text.successMsg, [
        { text: text.ok, onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      trace('api_call', 'fail', {}, error);
      showUserError(language, 'send', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={requestClose} activeOpacity={0.8}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>{text.formTitle}</Text>
            <Text style={styles.subtitle}>{text.submitBtn}</Text>
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View style={styles.typeToggleRow}>
            <TouchableOpacity
              style={[styles.typeToggleBtn, listingType === 'buy' ? styles.typeToggleBuyActive : styles.typeToggleInactive]}
              onPress={() => setListingType('buy')}
              activeOpacity={0.82}
            >
              <Text style={[styles.typeToggleText, listingType === 'buy' && styles.typeToggleTextActive]}>{text.buyToggle}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeToggleBtn, listingType === 'sell' ? styles.typeToggleSellActive : styles.typeToggleInactive]}
              onPress={() => setListingType('sell')}
              activeOpacity={0.82}
            >
              <Text style={[styles.typeToggleText, listingType === 'sell' && styles.typeToggleTextActive]}>{text.sellToggle}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.formLabel}>{text.itemNameLabel}</Text>
          <TextInput
            placeholder={text.itemNamePlaceholder}
            value={itemName}
            onChangeText={setItemName}
            style={styles.input}
            placeholderTextColor="#A0938D"
            maxLength={80}
          />

          <Text style={styles.formLabel}>{text.categoryLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker}>
              <Picker.Item label={text.selectCategory} value="" />
              {ITEM_CATEGORY_VALUES.map((value, index) => (
                <Picker.Item key={value} label={text.categories[index]} value={value} />
              ))}
            </Picker>
          </View>

          <Text style={styles.formLabel}>{text.conditionLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={condition} onValueChange={setCondition} style={styles.picker}>
              <Picker.Item label={text.selectCondition} value="" />
              {ITEM_CONDITION_VALUES.map((value) => (
                <Picker.Item key={value} label={text.conditionLabels[value]} value={value} />
              ))}
            </Picker>
          </View>

          <Text style={styles.formLabel}>{text.priceLabel}</Text>
          <TextInput
            placeholder="0"
            value={price}
            onChangeText={(value) => setPrice(value.replace(',', '.').replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            style={styles.input}
            placeholderTextColor="#A0938D"
          />

          <Text style={styles.formLabel}>{text.descriptionLabel}</Text>
          <TextInput
            placeholder={text.descriptionLabel}
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea]}
            placeholderTextColor="#A0938D"
            multiline
            maxLength={260}
          />

          <Text style={styles.formLabel}>{text.phoneLabel}</Text>
          <TextInput
            placeholder="+380..."
            value={phone}
            onChangeText={(value) => setPhone(normalizePhoneText(value))}
            keyboardType="phone-pad"
            style={styles.input}
            placeholderTextColor="#A0938D"
          />

          <View style={styles.photoLabelRow}>
            <Text style={styles.formLabel}>{text.photoLabel}</Text>
            <Text style={styles.requiredMark}>{text.photoRequiredMark}</Text>
          </View>
          {user?.id ? (
            <PhotoUploadField
              uid={user.id}
              userName={user?.name ?? ''}
              maxPhotos={5}
              storagePath="buy_sell_listings"
              onPhotosChange={setFormPhotos}
            />
          ) : (
            <Text style={styles.signInNote}>{text.authRequired}</Text>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, (submitting || hasUploadingPhotos) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={submitting || hasUploadingPhotos}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>{hasUploadingPhotos ? text.photoUploading : text.submitBtn}</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  keyboard: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4E8D8',
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  backText: { color: SCREEN_THEME.textPrimary, fontSize: 34, fontWeight: '700', lineHeight: 36 },
  headerTextWrap: { flex: 1 },
  title: { color: SCREEN_THEME.textPrimary, fontSize: 20, fontWeight: '900' },
  subtitle: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '700', marginTop: 2 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  formLabel: { fontWeight: '700', color: SCREEN_THEME.textPrimary, marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: '#F7F3EE', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, color: SCREEN_THEME.textPrimary, borderWidth: 1, borderColor: '#E8DDD3' },
  textarea: { minHeight: 92, textAlignVertical: 'top' },
  pickerWrapper: { backgroundColor: '#F7F3EE', borderRadius: 16, borderWidth: 1, borderColor: '#E8DDD3', overflow: 'hidden' },
  picker: { color: SCREEN_THEME.textPrimary, height: 50 },
  typeToggleRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  typeToggleBtn: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10 },
  typeToggleBuyActive: { backgroundColor: SCREEN_THEME.woodGreen },
  typeToggleSellActive: { backgroundColor: SCREEN_THEME.terracotta },
  typeToggleInactive: { backgroundColor: '#ECE7E1', borderWidth: 1, borderColor: '#D9CFC4' },
  typeToggleText: { color: SCREEN_THEME.textPrimary, fontWeight: '900', fontSize: 13, textAlign: 'center' },
  typeToggleTextActive: { color: '#fff' },
  photoLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requiredMark: { fontSize: 11, fontWeight: '700', color: SCREEN_THEME.terracottaDark, marginBottom: 8, marginTop: 12 },
  signInNote: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700', paddingVertical: 10, lineHeight: 18 },
  submitBtn: { backgroundColor: '#7d0e59', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  submitBtnDisabled: { opacity: 0.65 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center', paddingHorizontal: 10 },
});

export default CreateBuySellScreen;

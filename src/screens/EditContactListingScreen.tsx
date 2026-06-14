import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { contactsService } from '../services/contactsService';
import { normalizePhoneText } from '../utils/textUtils';
import { getLanguageValidationError } from '../utils/contentLanguageGuard';
import { FormFieldError } from '../components/ValidationErrorMessage';
import { useSoftToast } from '../hooks/useSoftToast';
import { showUserError } from '../utils/userFacingErrors';
import PhotoUploadField, { type UploadedPhoto } from '../components/PhotoUploadField';
import AppPhotoImage from '../components/AppPhotoImage';
import MiniTabBar from '../components/MiniTabBar';
import { SCREEN_THEME } from '../utils/screenTheme';
import { useAppTheme } from '../hooks/useAppTheme';

type Lang = 'ua' | 'ru' | 'en';

const CONTACT_CATEGORY_VALUES = [
  'furniture', 'appliances', 'electronics', 'kids', 'clothes',
  'sport', 'books', 'kitchen', 'construction', 'plants', 'other',
] as const;

const ITEM_CONDITION_VALUES = ['new', 'like_new', 'good', 'fair'] as const;
const ZODIAC_VALUES = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const;
const HUMAN_DESIGN_TYPE_VALUES = ['generator', 'projector', 'manifestor', 'reflector'] as const;
const HUMAN_DESIGN_PROFILE_VALUES = ['1/3', '1/4', '2/4', '2/5', '3/5', '3/6', '4/1', '4/6', '5/1', '5/2', '6/2', '6/3'] as const;
const LOOKING_FOR_GENDER_VALUES = ['male', 'female', 'any', 'couple'] as const;

const UI_TEXT = {
  ua: {
    header: 'Редагування анкети',
    back: 'Назад',
    categoryLabel: 'Хто я',
    conditionLabel: 'Шукаю',
    lookingForLabel: 'Кого шукаю',
    priceLabel: 'Вік',
    priceError: 'Вкажіть коректний вік.',
    phoneLabel: 'Контактний телефон',
    descriptionLabel: 'Про себе',
    descriptionRequired: 'Додайте кілька слів про себе.',
    zodiacLabel: 'Знак зодіаку',
    humanDesignTypeLabel: 'Тип за Дизайном Людини',
    humanDesignProfileLabel: 'Профіль за Дизайном Людини',
    showPhoneToggle: 'Показувати телефон на картці',
    saveBtn: 'Зберегти та надіслати на модерацію',
    errorTitle: 'Помилка',
    errorFill: 'Заповніть усі поля',
    errorPhone: 'Перевірте номер телефону',
    successTitle: 'Готово',
    successMsg: 'Зміни надіслано на модерацію. Зазвичай до 24 годин.',
    cooldownMsg: 'Редагувати можна раз на 3 дні. Спробуйте пізніше.',
    pendingMsg: 'Анкета зараз на модерації. Дочекайтесь результату.',
    photoSection: 'Фото (до 3)',
    photoUploading: 'Дочекайтесь завершення завантаження фото.',
    selectCategory: 'Оберіть...',
    selectCondition: 'Оберіть...',
    selectLookingFor: 'Оберіть...',
    selectZodiac: 'Оберіть знак...',
    selectHumanDesignType: 'Оберіть тип...',
    selectHumanDesignProfile: 'Оберіть профіль...',
    statusApproved: 'Схвалено',
    statusPending: 'На модерації',
    statusRejected: 'Відхилено',
    statusExpired: 'Термін дії закінчився',
    categories: {
      furniture: 'Чоловік', appliances: 'Жінка', electronics: 'Пара', kids: 'Компанія друзів',
      clothes: 'Сусід по будинку', sport: 'Сусід по району', books: 'Хтось для спілкування',
      kitchen: 'Хтось для прогулянок', construction: 'Хтось для спорту', plants: 'Хтось для подорожей', other: 'Інше',
    } as Record<string, string>,
    conditionLabels: { new: 'Дружбу', like_new: 'Спілкування', good: 'Романтику', fair: 'Спільні інтереси' } as Record<string, string>,
    lookingForValues: { male: 'Чоловiка', female: 'Жiнку', any: 'Будь-кого', couple: 'Пару' } as Record<string, string>,
    zodiacLabels: {
      aries: 'Овен', taurus: 'Телець', gemini: 'Близнюки', cancer: 'Рак', leo: 'Лев', virgo: 'Діва',
      libra: 'Терези', scorpio: 'Скорпіон', sagittarius: 'Стрілець', capricorn: 'Козоріг', aquarius: 'Водолій', pisces: 'Риби',
    } as Record<string, string>,
    humanDesignTypeLabels: { generator: 'Генератор', projector: 'Проектор', manifestor: 'Маніфестор', reflector: 'Рефлектор' } as Record<string, string>,
  },
  ru: {
    header: 'Редактирование анкеты',
    back: 'Назад',
    categoryLabel: 'Кто я',
    conditionLabel: 'Ищу',
    lookingForLabel: 'Кого ищу',
    priceLabel: 'Возраст',
    priceError: 'Укажите корректный возраст.',
    phoneLabel: 'Контактный телефон',
    descriptionLabel: 'О себе',
    descriptionRequired: 'Добавьте несколько слов о себе.',
    zodiacLabel: 'Знак зодиака',
    humanDesignTypeLabel: 'Тип по Дизайну Человека',
    humanDesignProfileLabel: 'Профиль по Дизайну Человека',
    showPhoneToggle: 'Показывать телефон на карточке',
    saveBtn: 'Сохранить и отправить на модерацию',
    errorTitle: 'Ошибка',
    errorFill: 'Заполните все поля',
    errorPhone: 'Проверьте номер телефона',
    successTitle: 'Готово',
    successMsg: 'Изменения отправлены на модерацию. Обычно до 24 часов.',
    cooldownMsg: 'Редактировать можно раз в 3 дня. Попробуйте позже.',
    pendingMsg: 'Анкета на модерации. Дождитесь результата.',
    photoSection: 'Фото (до 3)',
    photoUploading: 'Дождитесь завершения загрузки фото.',
    selectCategory: 'Выберите...',
    selectCondition: 'Выберите...',
    selectLookingFor: 'Выберите...',
    selectZodiac: 'Выберите знак...',
    selectHumanDesignType: 'Выберите тип...',
    selectHumanDesignProfile: 'Выберите профиль...',
    statusApproved: 'Одобрено',
    statusPending: 'На модерации',
    statusRejected: 'Отклонено',
    statusExpired: 'Срок действия истёк',
    categories: {
      furniture: 'Мужчина', appliances: 'Женщина', electronics: 'Пара', kids: 'Компания друзей',
      clothes: 'Сосед по дому', sport: 'Сосед по району', books: 'Кто-то для общения',
      kitchen: 'Кто-то для прогулок', construction: 'Кто-то для спорта', plants: 'Кто-то для путешествий', other: 'Другое',
    } as Record<string, string>,
    conditionLabels: { new: 'Дружбу', like_new: 'Общение', good: 'Романтику', fair: 'Общие интересы' } as Record<string, string>,
    lookingForValues: { male: 'Мужчину', female: 'Женщину', any: 'Кого угодно', couple: 'Пару' } as Record<string, string>,
    zodiacLabels: {
      aries: 'Овен', taurus: 'Телец', gemini: 'Близнецы', cancer: 'Рак', leo: 'Лев', virgo: 'Дева',
      libra: 'Весы', scorpio: 'Скорпион', sagittarius: 'Стрелец', capricorn: 'Козерог', aquarius: 'Водолей', pisces: 'Рыбы',
    } as Record<string, string>,
    humanDesignTypeLabels: { generator: 'Генератор', projector: 'Проектор', manifestor: 'Манифестор', reflector: 'Рефлектор' } as Record<string, string>,
  },
  en: {
    header: 'Edit profile',
    back: 'Back',
    categoryLabel: 'Who I am',
    conditionLabel: 'Looking for',
    lookingForLabel: 'Looking for gender',
    priceLabel: 'Age',
    priceError: 'Enter a valid age.',
    phoneLabel: 'Contact phone',
    descriptionLabel: 'About me',
    descriptionRequired: 'Add a few words about yourself.',
    zodiacLabel: 'Zodiac sign',
    humanDesignTypeLabel: 'Human Design type',
    humanDesignProfileLabel: 'Human Design profile',
    showPhoneToggle: 'Show phone on card',
    saveBtn: 'Save & submit for moderation',
    errorTitle: 'Error',
    errorFill: 'Fill in all fields',
    errorPhone: 'Check phone number',
    successTitle: 'Done',
    successMsg: 'Changes sent for moderation. Usually within 24 hours.',
    cooldownMsg: 'You can edit once every 3 days. Try later.',
    pendingMsg: 'Profile is under moderation. Wait for the result.',
    photoSection: 'Photos (up to 3)',
    photoUploading: 'Wait for photo upload to complete.',
    selectCategory: 'Select...',
    selectCondition: 'Select...',
    selectLookingFor: 'Select...',
    selectZodiac: 'Select sign...',
    selectHumanDesignType: 'Select type...',
    selectHumanDesignProfile: 'Select profile...',
    statusApproved: 'Approved',
    statusPending: 'Pending moderation',
    statusRejected: 'Rejected',
    statusExpired: 'Expired',
    categories: {
      furniture: 'Man', appliances: 'Woman', electronics: 'Couple', kids: 'Group of friends',
      clothes: 'Building neighbor', sport: 'Area neighbor', books: 'Someone to chat',
      kitchen: 'Someone to walk', construction: 'Someone for sports', plants: 'Someone to travel', other: 'Other',
    } as Record<string, string>,
    conditionLabels: { new: 'Friendship', like_new: 'Communication', good: 'Romance', fair: 'Common interests' } as Record<string, string>,
    lookingForValues: { male: 'A man', female: 'A woman', any: 'Anyone', couple: 'A couple' } as Record<string, string>,
    zodiacLabels: {
      aries: 'Aries', taurus: 'Taurus', gemini: 'Gemini', cancer: 'Cancer', leo: 'Leo', virgo: 'Virgo',
      libra: 'Libra', scorpio: 'Scorpio', sagittarius: 'Sagittarius', capricorn: 'Capricorn', aquarius: 'Aquarius', pisces: 'Pisces',
    } as Record<string, string>,
    humanDesignTypeLabels: { generator: 'Generator', projector: 'Projector', manifestor: 'Manifestor', reflector: 'Reflector' } as Record<string, string>,
  },
} as const;

type EditParams = {
  EditContactListingScreen: { itemId: string; initialData: import('../utils/detailViewTypes').DetailItemData };
};

export default function EditContactListingScreen({
  navigation,
  route,
}: {
  navigation: NavigationProp<RootStackParamList>;
  route: RouteProp<EditParams, 'EditContactListingScreen'>;
}) {
  const { itemId, initialData } = route.params;
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const user = useSelector((state: RootState) => state.auth.user);
  const { colors, isDark } = useAppTheme();
  const text = UI_TEXT[language];
  const toast = useSoftToast();

  // Form state — pre-filled from initialData
  const [category, setCategory] = useState(initialData.rawCondition ? (CONTACT_CATEGORY_VALUES.find(v => v === initialData.category) ? initialData.category : '') : '');
  const [condition, setCondition] = useState(initialData.rawCondition || '');
  const [price, setPrice] = useState(initialData.price || '');
  const [description, setDescription] = useState(initialData.description || '');
  const [phone, setPhone] = useState(initialData.rawPhone || initialData.phone || '');
  const [showPhone, setShowPhone] = useState(initialData.showPhone !== false);
  const [zodiac, setZodiac] = useState(initialData.zodiacSign || '');
  const [hdType, setHdType] = useState(initialData.humanDesignType || '');
  const [hdProfile, setHdProfile] = useState(initialData.humanDesignProfile || '');
  const [lookingForGender, setLookingForGender] = useState(initialData.lookingForGender || '');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Photo state
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<string[]>(
    () => initialData.photoStoragePaths?.length ? initialData.photoStoragePaths : (initialData.photoStoragePath ? [initialData.photoStoragePath] : []),
  );

  // Resolve category from label back to key (initialData.category is a label)
  const [resolvedCategory] = useState(() => {
    // Try to find the raw category key
    for (const key of CONTACT_CATEGORY_VALUES) {
      if (text.categories[key] === initialData.category) return key;
    }
    // Might already be a key
    if (CONTACT_CATEGORY_VALUES.includes(initialData.category as any)) return initialData.category;
    return '';
  });
  // Use resolvedCategory as initial if category was not set properly
  const effectiveCategory = category || resolvedCategory;

  const totalPhotos = existingPhotos.length + uploadedPhotos.filter(p => p.status !== 'error').length;
  const maxNewPhotos = 3 - existingPhotos.length;
  const isUploading = uploadedPhotos.some(p => p.status === 'uploading');

  const handleRemoveExistingPhoto = useCallback((index: number) => {
    setExistingPhotos(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handlePhotosChange = useCallback((photos: UploadedPhoto[]) => {
    setUploadedPhotos(photos);
  }, []);

  const handleSubmit = async () => {
    setSubmitAttempted(true);

    if (!effectiveCategory || !condition || !description.trim() || !phone.trim() || !price.trim()) {
      toast.showWarning(text.errorTitle, text.errorFill);
      return;
    }
    const normalizedPrice = price.replace(',', '.').replace(/[^\d.]/g, '');
    const numericPrice = Number(normalizedPrice);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0 || numericPrice > 120) {
      toast.showWarning(text.errorTitle, text.priceError);
      return;
    }
    if (phone.replace(/\D/g, '').length < 7) {
      toast.showWarning(text.errorTitle, text.errorPhone);
      return;
    }
    const langError = getLanguageValidationError(description.trim(), language);
    if (langError) {
      toast.showWarning(text.errorTitle, langError);
      return;
    }
    if (isUploading) {
      toast.showWarning(text.errorTitle, text.photoUploading);
      return;
    }

    setSubmitting(true);
    try {
      // Build combined photo paths: existing + newly uploaded
      const newPaths = uploadedPhotos
        .filter(p => p.status === 'done' && p.storagePath)
        .map(p => p.storagePath);
      const allPaths = [...existingPhotos, ...newPaths];

      await contactsService.edit(itemId, {
        category: effectiveCategory,
        condition,
        price: normalizedPrice,
        description: description.trim(),
        phone: normalizePhoneText(phone),
        showPhone: showPhone,
        zodiacSign: zodiac,
        humanDesignType: hdType,
        humanDesignProfile: hdProfile,
        lookingForGender: lookingForGender,
        photoStoragePaths: allPaths,
        language,
      });
      toast.showSuccess(text.successTitle, text.successMsg);
      navigation.goBack();
    } catch (error: any) {
      if (error?.message === 'edit_cooldown') {
        toast.showWarning(text.errorTitle, text.cooldownMsg);
      } else if (error?.message === 'edit_while_pending') {
        toast.showWarning(text.errorTitle, text.pendingMsg);
      } else {
        showUserError(language, 'send', error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = initialData.moderationStatus === 'approved' ? text.statusApproved
    : initialData.moderationStatus === 'pending' ? text.statusPending
    : initialData.moderationStatus === 'rejected' ? text.statusRejected
    : text.statusExpired;

  const statusColor = initialData.moderationStatus === 'approved' ? '#2E7D32'
    : initialData.moderationStatus === 'pending' ? '#8A7A5A'
    : initialData.moderationStatus === 'rejected' ? '#C62828'
    : '#78716C';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.appBg }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#403933" />
          <Text style={styles.backText}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? '#F5E8F0' : undefined }]}>{text.header}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Status badge */}
          <View style={[styles.statusBadge, { borderColor: statusColor + '44' }]}>
            <MaterialCommunityIcons
              name={initialData.moderationStatus === 'approved' ? 'check-circle-outline' : initialData.moderationStatus === 'pending' ? 'clock-outline' : 'close-circle-outline'}
              size={16}
              color={statusColor}
            />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>

          {/* Existing photos */}
          <Text style={styles.sectionLabel}>{text.photoSection}</Text>
          {existingPhotos.length > 0 ? (
            <View style={styles.existingPhotosRow}>
              {existingPhotos.map((path, index) => (
                <View key={`existing-${index}`} style={styles.existingPhotoWrapper}>
                  <AppPhotoImage
                    storagePath={path}
                    style={styles.existingPhoto}
                    resizeMode="cover"
                    debugLabel={`EditContact:existing:${index}`}
                  />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => handleRemoveExistingPhoto(index)}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="close-circle" size={22} color="#C62828" />
                  </TouchableOpacity>
                  {index === 0 ? (
                    <View style={styles.mainPhotoBadge}>
                      <Text style={styles.mainPhotoText}>{language === 'ua' ? 'Головне' : language === 'ru' ? 'Главное' : 'Main'}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {/* Upload new photos */}
          {totalPhotos < 3 && user?.id ? (
            <PhotoUploadField
              uid={user.id}
              userName={user.name || ''}
              maxPhotos={maxNewPhotos}
              storagePath={`contacts_listings/${user.id}`}
              onPhotosChange={handlePhotosChange}
              metadata={{ sourceScreen: 'EditContactListingScreen', sourceFeature: 'contacts_edit' }}
            />
          ) : null}

          {/* Category */}
          <Text style={styles.formLabel}>{text.categoryLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={effectiveCategory} onValueChange={(v) => setCategory(v)} style={styles.picker}>
              <Picker.Item label={text.selectCategory} value="" />
              {CONTACT_CATEGORY_VALUES.map((value) => (
                <Picker.Item key={`cat-${value}`} label={text.categories[value] ?? value} value={value} />
              ))}
            </Picker>
          </View>
          <FormFieldError error={!effectiveCategory && submitAttempted ? text.errorFill : undefined} />

          {/* Condition */}
          <Text style={styles.formLabel}>{text.conditionLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={condition} onValueChange={setCondition} style={styles.picker}>
              <Picker.Item label={text.selectCondition} value="" />
              {ITEM_CONDITION_VALUES.map((value) => (
                <Picker.Item key={`cond-${value}`} label={text.conditionLabels[value] ?? value} value={value} />
              ))}
            </Picker>
          </View>
          <FormFieldError error={!condition && submitAttempted ? text.errorFill : undefined} />

          {/* Looking for gender */}
          <Text style={styles.formLabel}>{text.lookingForLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={lookingForGender} onValueChange={setLookingForGender} style={styles.picker}>
              <Picker.Item label={text.selectLookingFor} value="" />
              {LOOKING_FOR_GENDER_VALUES.map((value) => (
                <Picker.Item key={`lfg-${value}`} label={text.lookingForValues[value] ?? value} value={value} />
              ))}
            </Picker>
          </View>

          {/* Age */}
          <Text style={styles.formLabel}>{text.priceLabel}</Text>
          <TextInput
            placeholder="0"
            value={price}
            onChangeText={(v) => setPrice(v.replace(',', '.').replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            style={styles.input}
            placeholderTextColor="#A0938D"
          />
          <FormFieldError error={submitAttempted && (!price.trim() || Number(price) <= 0) ? text.priceError : undefined} />

          {/* Description */}
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
          <FormFieldError error={submitAttempted && !description.trim() ? text.descriptionRequired : undefined} />

          {/* Phone */}
          <Text style={styles.formLabel}>{text.phoneLabel}</Text>
          <TextInput
            placeholder="+380..."
            value={phone}
            onChangeText={(v) => setPhone(normalizePhoneText(v))}
            keyboardType="phone-pad"
            style={styles.input}
            placeholderTextColor="#A0938D"
          />
          <FormFieldError error={submitAttempted && phone.replace(/\D/g, '').length < 7 ? text.errorPhone : undefined} />

          {/* Zodiac */}
          <Text style={styles.formLabel}>{text.zodiacLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={zodiac} onValueChange={setZodiac} style={styles.picker}>
              <Picker.Item label={text.selectZodiac} value="" />
              {ZODIAC_VALUES.map((value) => (
                <Picker.Item key={`z-${value}`} label={text.zodiacLabels[value] ?? value} value={value} />
              ))}
            </Picker>
          </View>

          {/* Human Design Type */}
          <Text style={styles.formLabel}>{text.humanDesignTypeLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={hdType} onValueChange={setHdType} style={styles.picker}>
              <Picker.Item label={text.selectHumanDesignType} value="" />
              {HUMAN_DESIGN_TYPE_VALUES.map((value) => (
                <Picker.Item key={`hd-${value}`} label={text.humanDesignTypeLabels[value] ?? value} value={value} />
              ))}
            </Picker>
          </View>

          {/* Human Design Profile */}
          <Text style={styles.formLabel}>{text.humanDesignProfileLabel}</Text>
          <View style={styles.pickerWrapper}>
            <Picker selectedValue={hdProfile} onValueChange={setHdProfile} style={styles.picker}>
              <Picker.Item label={text.selectHumanDesignProfile} value="" />
              {HUMAN_DESIGN_PROFILE_VALUES.map((value) => (
                <Picker.Item key={`hdp-${value}`} label={value} value={value} />
              ))}
            </Picker>
          </View>

          {/* Show phone toggle */}
          <View style={styles.toggleRow}>
            <Text style={styles.formLabel}>{text.showPhoneToggle}</Text>
            <Switch
              value={showPhone}
              onValueChange={setShowPhone}
              trackColor={{ false: '#E8DDD3', true: '#6A8BA5' }}
              thumbColor={showPhone ? '#403933' : '#A0938D'}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="send-check-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>{text.saveBtn}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <MiniTabBar />
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
  headerTitle: { color: '#2D2520', fontSize: 17, fontWeight: '900' },
  headerSpacer: { width: 78 },
  content: { padding: 16, paddingBottom: 112, gap: 8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F0EA',
    borderWidth: 1,
    marginBottom: 4,
  },
  statusText: { fontSize: 13, fontWeight: '800' },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#403933',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  existingPhotosRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  existingPhotoWrapper: {
    position: 'relative',
    width: 92,
    height: 108,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F0EDE8',
  },
  existingPhoto: {
    width: 92,
    height: 108,
    borderRadius: 14,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#fff',
    borderRadius: 11,
  },
  mainPhotoBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 3,
    alignItems: 'center',
  },
  mainPhotoText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  formLabel: {
    color: '#7A6D64',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 2,
  },
  pickerWrapper: {
    backgroundColor: '#FBF7F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    overflow: 'hidden',
  },
  picker: {
    color: '#2D2520',
  },
  input: {
    backgroundColor: '#FBF7F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DDD3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
    color: '#2D2520',
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7d0e59',
    borderRadius: 16,
    paddingVertical: 15,
    marginTop: 12,
  },
  submitBtnDisabled: {
    backgroundColor: '#7d0e59',
    opacity: 0.55,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
});

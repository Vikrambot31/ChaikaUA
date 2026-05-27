import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MiniTabBar from '../components/MiniTabBar';
import { photoAPI } from '../firebase-config';
import ErrorHandler from '../utils/errorHandler';
import { normalizePersonName } from '../utils/textUtils';
import { RootState } from '../redux/store';
import { BUILDINGS, getFullAddress } from '../data/buildings';
import { chaykaPlaces } from '../services/chaykaPlacesData';
import { safeLogError } from '../utils/errorLogger';
import PhotoUploadField, { UploadedPhoto } from '../components/PhotoUploadField';
import UploadedPhotosGrid from '../components/UploadedPhotosGrid';
import InlineFieldHint from '../components/InlineFieldHint';
import { useSoftToast } from '../hooks/useSoftToast';

const UI_TEXT = {
  ua: {
    permissionError: 'Помилка',
    galleryPermission: 'Потрібен дозвіл для доступу до галереї',
    cameraPermission: 'Потрібен дозвіл для доступу до камери',
    addPhoto: 'Додати фото',
    chooseSource: 'Виберіть джерело',
    gallery: 'Галерея',
    camera: 'Камера',
    cancelBtn: 'Скасувати',
    addressTitle: 'Де зроблено фото',
    addressOptional: 'Необов\'язково — оберіть категорію',
    searchPlaceholder: 'Пошук...',
    selected: 'Обрано:',
    clear: 'Прибрати',
    send: 'Надіслати на модерацію',
    authorPlaceholder: 'Ваше ім\'я',
    titlePlaceholder: 'Назва фото',
    descPlaceholder: 'Короткий опис',
    headerTitle: 'Додати фото',
    headerSub: 'Спочатку фото перевіряє модератор, потім воно потрапляє в галерею',
    tapToSelect: 'Натисніть, щоб вибрати фото',
    hintAuthor: 'Заповнюється автоматично з вашого профілю',
    hintTitle: 'Обов\'язково — коротка назва фото',
    hintDesc: 'Необов\'язково — короткий опис',
    hintPhoto: 'Обов\'язково — фото з галереї або камери',
    moderationSuccess: 'Фото завантажено, чекає перевірки адміна',
    signInRequired: 'Увійдіть в акаунт, щоб надіслати фото на модерацію.',
    addPhotoWarning: 'Додайте хоча б одне фото перед надсиланням.',
    addTitleWarning: 'Додайте коротку назву фото.',
    waitUploadWarning: 'Дочекайтесь завершення завантаження фото.',
    fixPhotoWarning: 'Одне з фото не завантажилось. Видаліть його або спробуйте ще раз.',
    saveError: 'Не вдалося надіслати фото. Перевірте інтернет і спробуйте ще раз.',
    photoUploading: 'Фото завантажується...',
    photoUploadError: 'Помилка завантаження фото',
    categories: {
      building: 'Будинок',
      place: 'Місце',
      square: 'Сквер',
      park: 'Парк',
      forest: 'Ліс',
      other: 'Інше',
    },
  },
  ru: {
    permissionError: 'Ошибка',
    galleryPermission: 'Нужно разрешение для доступа к галерее',
    cameraPermission: 'Нужно разрешение для доступа к камере',
    addPhoto: 'Добавить фото',
    chooseSource: 'Выберите источник',
    gallery: 'Галерея',
    camera: 'Камера',
    cancelBtn: 'Отмена',
    addressTitle: 'Где сделано фото',
    addressOptional: 'Необязательно — выберите категорию',
    searchPlaceholder: 'Поиск...',
    selected: 'Выбрано:',
    clear: 'Убрать',
    send: 'Отправить на модерацию',
    authorPlaceholder: 'Ваше имя',
    titlePlaceholder: 'Название фото',
    descPlaceholder: 'Краткое описание',
    headerTitle: 'Добавить фото',
    headerSub: 'Сначала фото проверяет модератор, затем оно попадает в галерею',
    tapToSelect: 'Нажмите, чтобы выбрать фото',
    hintAuthor: 'Заполняется автоматически из вашего профиля',
    hintTitle: 'Обязательно — краткое название фото',
    hintDesc: 'Необязательно — краткое описание',
    hintPhoto: 'Обязательно — фото из галереи или камеры',
    moderationSuccess: 'Фото загружено, ожидает проверки админа',
    signInRequired: 'Войдите в аккаунт, чтобы отправить фото на модерацию.',
    addPhotoWarning: 'Добавьте хотя бы одно фото перед отправкой.',
    addTitleWarning: 'Добавьте короткое название фото.',
    waitUploadWarning: 'Дождитесь завершения загрузки фото.',
    fixPhotoWarning: 'Одно из фото не загрузилось. Удалите его или попробуйте ещё раз.',
    saveError: 'Не удалось отправить фото. Проверьте интернет и попробуйте ещё раз.',
    photoUploading: 'Фото загружается...',
    photoUploadError: 'Ошибка загрузки фото',
    categories: {
      building: 'Дом',
      place: 'Место',
      square: 'Сквер',
      park: 'Парк',
      forest: 'Лес',
      other: 'Другое',
    },
  },
  en: {
    permissionError: 'Error',
    galleryPermission: 'Gallery access permission is required',
    cameraPermission: 'Camera access permission is required',
    addPhoto: 'Add photo',
    chooseSource: 'Choose source',
    gallery: 'Gallery',
    camera: 'Camera',
    cancelBtn: 'Cancel',
    addressTitle: 'Where was this taken',
    addressOptional: 'Optional — choose a category',
    searchPlaceholder: 'Search...',
    selected: 'Selected:',
    clear: 'Clear',
    send: 'Submit for moderation',
    authorPlaceholder: 'Your name',
    titlePlaceholder: 'Photo title',
    descPlaceholder: 'Short description',
    headerTitle: 'Add photo',
    headerSub: 'A moderator reviews the photo before it appears in the gallery',
    tapToSelect: 'Tap to select a photo',
    hintAuthor: 'Auto-filled from your profile',
    hintTitle: 'Required — short photo title',
    hintDesc: 'Optional — short description',
    hintPhoto: 'Required — photo from gallery or camera',
    moderationSuccess: 'Photo uploaded and waiting for admin review',
    signInRequired: 'Sign in to submit a photo for moderation.',
    addPhotoWarning: 'Add at least one photo before submitting.',
    addTitleWarning: 'Add a short photo title.',
    waitUploadWarning: 'Wait until photo upload is complete.',
    fixPhotoWarning: 'One photo failed to upload. Remove it or try again.',
    saveError: 'Failed to submit the photo. Check your internet connection and try again.',
    photoUploading: 'Photo is uploading...',
    photoUploadError: 'Photo upload error',
    categories: {
      building: 'Building',
      place: 'Place',
      square: 'Square',
      park: 'Park',
      forest: 'Forest',
      other: 'Other',
    },
  },
} as const;

type CategoryKey = 'building' | 'place' | 'square' | 'park' | 'forest' | 'other';

const CATEGORY_ICONS: Record<CategoryKey, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  building: 'home-city-outline',
  place: 'storefront-outline',
  square: 'flower-outline',
  park: 'tree-outline',
  forest: 'pine-tree',
  other: 'map-marker-outline',
};

// Categories that don't need a specific location picked from a list
const SIMPLE_CATEGORIES: CategoryKey[] = ['square', 'park', 'forest', 'other'];
const PHOTO_UPLOAD_DRAFT_KEY = '@chaika:community_photo_draft';

type PhotoLocation = {
  id: string;
  label: string;
  type: 'building' | 'place';
};

const BUILDING_LOCATIONS: PhotoLocation[] = BUILDINGS.map((b) => ({
  id: `building-${b.id}`,
  label: getFullAddress(b),
  type: 'building' as const,
}));

const PLACE_LOCATIONS: PhotoLocation[] = chaykaPlaces.map((p) => ({
  id: `place-${p.id}`,
  label: `${p.name} · ${p.address}`,
  type: 'place' as const,
}));

const PhotoUploadScreen: React.FC = () => {
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const toast = useSoftToast();
  const [author, setAuthor] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<PhotoLocation | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formPhotos, setFormPhotos] = useState<UploadedPhoto[]>([]);

  useEffect(() => {
    ErrorHandler.setLanguage(language);
  }, [language]);

  useEffect(() => {
    if (user?.name) setAuthor(normalizePersonName(user.name));
  }, [user?.name]);

  // Clear draft when leaving the screen without submitting
  useEffect(() => {
    return () => {
      void AsyncStorage.removeItem(PHOTO_UPLOAD_DRAFT_KEY).catch(() => {});
    };
  }, []);

  useEffect(() => {
    // Restore draft if Android restarts activity while picker/camera is open.
    void AsyncStorage.getItem(PHOTO_UPLOAD_DRAFT_KEY).then((raw) => {
      if (!raw) return;
      try {
        const draft = JSON.parse(raw) as Partial<{
          title: string;
          description: string;
          selectedCategory: CategoryKey | null;
          locationSearch: string;
        }>;
        if (draft.title) setTitle(draft.title);
        if (draft.description) setDescription(draft.description);
        if (draft.selectedCategory) setSelectedCategory(draft.selectedCategory);
        if (draft.locationSearch) setLocationSearch(draft.locationSearch);
      } catch {
        // ignore invalid draft payload
      }
    }).catch(() => {});
  }, []);

  // Save draft whenever text fields change so Android activity-kill can't wipe them.
  useEffect(() => {
    if (!title && !description && !selectedCategory && !locationSearch) return;
    const draft = { title, description, selectedCategory, locationSearch };
    void AsyncStorage.setItem(PHOTO_UPLOAD_DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
  }, [title, description, selectedCategory, locationSearch]);

  const donePhotos = useMemo(() => formPhotos.filter((photo) => photo.status === 'done'), [formPhotos]);
  const hasUploadingPhotos = formPhotos.some((photo) => photo.status === 'uploading');
  const hasPhotoErrors = formPhotos.some((photo) => photo.status === 'error');

  // location is optional — title and completed photo required
  const canSubmit = useMemo(
    () => Boolean(title.trim()) && donePhotos.length > 0 && !hasUploadingPhotos && !hasPhotoErrors && !uploading,
    [donePhotos.length, hasPhotoErrors, hasUploadingPhotos, title, uploading]
  );

  const locationOptions = useMemo(() => {
    const source = selectedCategory === 'building' ? BUILDING_LOCATIONS : PLACE_LOCATIONS;
    const query = locationSearch.trim().toLowerCase();
    return query ? source.filter((item) => item.label.toLowerCase().includes(query)) : source;
  }, [selectedCategory, locationSearch]);

  const handleCategorySelect = (cat: CategoryKey) => {
    if (selectedCategory === cat) {
      // deselect
      setSelectedCategory(null);
      setSelectedLocation(null);
      setLocationSearch('');
      return;
    }
    setSelectedCategory(cat);
    setSelectedLocation(null);
    setLocationSearch('');
    // For simple categories set location label automatically
    if (SIMPLE_CATEGORIES.includes(cat)) {
      setSelectedLocation({ id: cat, label: text.categories[cat], type: 'place' });
    }
  };

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    if (!user?.id) {
      toast.showWarning(text.permissionError, text.signInRequired);
      return;
    }
    setUploading(true);
    try {
      const uploadedBy = normalizePersonName(author || user?.name || user?.email || 'Anonymous');
      const results = await Promise.all(
        donePhotos.map((photo) =>
          photoAPI.addPhoto({
            title: title.trim(),
            description: description.trim(),
            uploadedBy,
            imageUri: photo.downloadUrl,
            storagePath: photo.storagePath,
            target: 'gallery_public',
            sourceScreen: 'PhotoUploadScreen',
            sourceScreenLabel: 'Добавить фото',
            sourceFeature: 'gallery_full_form',
            locationLabel: selectedLocation?.label,
            locationType: selectedLocation?.type,
          }),
        ),
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        const saveError = ('error' in failed[0] ? failed[0].error : undefined) ?? 'Save failed';
        safeLogError('PhotoUploadScreen.submit.save_metadata', saveError, {
          feature: 'gallery',
          stage: 'save_metadata',
          firebasePath: 'community_photos',
          failedCount: failed.length,
        });
        toast.showError(text.permissionError, saveError || text.saveError);
        return;
      }
      toast.showSuccess(text.moderationSuccess);
      void AsyncStorage.removeItem(PHOTO_UPLOAD_DRAFT_KEY).catch(() => {});
      setTitle('');
      setDescription('');
      setSelectedCategory(null);
      setLocationSearch('');
      setSelectedLocation(null);
      setFormPhotos([]);
    } catch (error) {
      safeLogError('PhotoUploadScreen.submit.unexpected', error, {
        feature: 'gallery',
        stage: 'unexpected',
      });
      toast.showError(text.permissionError, error instanceof Error ? error.message : text.saveError);
    } finally {
      setUploading(false);
    }
  }, [author, canSubmit, description, donePhotos, selectedLocation, text, title, toast, user?.email, user?.id, user?.name]);

  const needsLocationList = selectedCategory === 'building' || selectedCategory === 'place';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.headerTitle}</Text>
          <Text style={styles.headerSub}>{text.headerSub}</Text>
        </View>

        <View style={styles.previewWrapper}>
          <PhotoUploadField
            uid={user?.id ?? ''}
            userName={user?.name ?? ''}
            maxPhotos={5}
            storagePath="community_photos"
            onPhotosChange={setFormPhotos}
          />
          <UploadedPhotosGrid />
        </View>
        <Text style={styles.fieldHint}>{text.hintPhoto}</Text>
        <InlineFieldHint message={text.addPhotoWarning} type="warning" visible={donePhotos.length === 0} />
        <InlineFieldHint message={text.waitUploadWarning} type="hint" visible={hasUploadingPhotos} />
        <InlineFieldHint message={text.fixPhotoWarning} type="error" visible={hasPhotoErrors} />

        <View style={styles.card}>
          <TextInput
            placeholder={text.authorPlaceholder}
            placeholderTextColor="#8a8178"
            value={author}
            editable={false}
            style={[styles.input, styles.inputReadonly]}
          />
          <Text style={styles.fieldHint}>{text.hintAuthor}</Text>
          <TextInput
            placeholder={text.titlePlaceholder}
            placeholderTextColor="#8a8178"
            value={title}
            onChangeText={setTitle}
            style={styles.input}
            maxLength={80}
          />
          <Text style={styles.fieldHint}>{text.hintTitle}</Text>
          <InlineFieldHint message={text.addTitleWarning} type="warning" visible={!title.trim()} />
          <TextInput
            placeholder={text.descPlaceholder}
            placeholderTextColor="#8a8178"
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textarea]}
            multiline
            maxLength={300}
          />
          <Text style={styles.fieldHint}>{text.hintDesc}</Text>

          {/* Location section */}
          <Text style={styles.locationTitle}>{text.addressTitle}</Text>
          <Text style={styles.locationHint}>{text.addressOptional}</Text>

          {/* Category chips */}
          <View style={styles.categoryRow}>
            {(Object.keys(CATEGORY_ICONS) as CategoryKey[]).map((cat) => {
              const active = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, active && styles.categoryChipActive]}
                  onPress={() => handleCategorySelect(cat)}
                  activeOpacity={0.78}
                >
                  <MaterialCommunityIcons
                    name={CATEGORY_ICONS[cat]}
                    size={16}
                    color={active ? '#fff' : '#665A52'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                    {text.categories[cat]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* List for building/place */}
          {needsLocationList && (
            <View style={styles.locationBlock}>
              <TextInput
                placeholder={text.searchPlaceholder}
                placeholderTextColor="#8a8178"
                value={locationSearch}
                onChangeText={(v) => { setLocationSearch(v); setSelectedLocation(null); }}
                style={[styles.input, { marginBottom: 8 }]}
              />
              {selectedLocation ? (
                <TouchableOpacity style={styles.selectedLocation} onPress={() => setSelectedLocation(null)} activeOpacity={0.8}>
                  <Text style={styles.selectedLocationText}>{selectedLocation.label}</Text>
                  <Text style={styles.clearLocation}>{text.clear}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.locationList}>
                  {locationOptions.slice(0, 30).map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.locationChip}
                      onPress={() => setSelectedLocation(item)}
                      activeOpacity={0.78}
                    >
                      <Text style={styles.locationChipText} numberOfLines={2}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Show selected label for simple categories */}
          {selectedLocation && !needsLocationList && (
            <View style={styles.selectedLocation}>
              <MaterialCommunityIcons name={CATEGORY_ICONS[selectedCategory!]} size={16} color="#344D25" style={{ marginRight: 6 }} />
              <Text style={styles.selectedLocationText}>{selectedLocation.label}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={() => void submit()}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{hasUploadingPhotos ? text.photoUploading : hasPhotoErrors ? text.photoUploadError : text.send}</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <MiniTabBar />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F3EE' },
  scrollContent: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 110 },
  headerCard: { backgroundColor: '#7A1E5C', borderRadius: 20, padding: 16, marginBottom: 14 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#fff' },
  headerSub: { marginTop: 6, color: 'rgba(255,255,255,0.88)', lineHeight: 20 },
  previewWrapper: { marginBottom: 12 },
  previewTouch: { borderRadius: 18, overflow: 'hidden' },
  preview: { width: '100%', height: 220, borderRadius: 18 },
  previewPlaceholder: { backgroundColor: '#EDE3D9' },
  previewOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.38)', paddingVertical: 10,
    alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18,
  },
  previewOverlayText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  input: {
    backgroundColor: '#F3ECE4', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#302621', marginBottom: 12, fontWeight: '600',
  },
  textarea: { minHeight: 82, textAlignVertical: 'top' },
  locationTitle: { color: '#302621', fontWeight: '900', marginBottom: 4, fontSize: 15 },
  locationHint: { color: '#8a8178', fontSize: 12, marginBottom: 10 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999, backgroundColor: '#F3ECE4',
    borderWidth: 1, borderColor: '#E8DDD3',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  categoryChipActive: { backgroundColor: '#7A1E5C', borderColor: '#7A1E5C' },
  categoryChipText: { color: '#665A52', fontWeight: '700', fontSize: 13 },
  categoryChipTextActive: { color: '#fff' },
  locationBlock: { marginBottom: 8 },
  locationList: { gap: 6, maxHeight: 260 },
  locationChip: {
    borderRadius: 14, backgroundColor: '#F3ECE4',
    borderWidth: 1, borderColor: '#E8DDD3',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  locationChipText: { color: '#665A52', fontWeight: '700', fontSize: 12, lineHeight: 17 },
  selectedLocation: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, backgroundColor: '#E9F0E0',
    borderWidth: 1, borderColor: '#8BA36F',
    padding: 10, marginBottom: 10,
  },
  selectedLocationText: { flex: 1, color: '#344D25', fontWeight: '800', lineHeight: 18 },
  clearLocation: { color: '#7A1E5C', fontWeight: '900', fontSize: 12, marginLeft: 8 },
  button: {
    backgroundColor: '#5a2c2c', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '800' },
  fieldHint: { color: '#8a8178', fontSize: 11, marginTop: -8, marginBottom: 12, paddingHorizontal: 4 },
  inputReadonly: { opacity: 0.7, color: '#665A52' },
});

export default PhotoUploadScreen;

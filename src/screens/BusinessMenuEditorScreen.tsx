import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { ref, get, update } from 'firebase/database';
import { useSelector } from 'react-redux';

import { database } from '../firebase-core';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import type { BusinessMenuItem } from '../utils/detailViewTypes';
import { pickPhotoFromLibrary } from '../utils/photoPicker';
import { uploadPhotoToNamespace } from '../services/photoUploadService';

const MAX_MENU_ITEMS = 20;

type Lang = 'ua' | 'ru' | 'en';

type Params = {
  BusinessMenuEditorScreen: { placeId: string; placeName: string };
};

const UI_TEXT = {
  ua: {
    title: 'Меню та фото',
    back: 'Назад',
    photoSection: 'Фото закладу',
    addPhoto: 'Додати фото',
    changePhoto: 'Змінити фото',
    uploading: 'Завантаження...',
    menuSection: 'Меню та ціни',
    dishName: 'Назва страви',
    dishPrice: 'Ціна',
    addDish: '+ Додати страву',
    maxReached: `Максимум ${MAX_MENU_ITEMS} страв`,
    save: 'Зберегти та надіслати на модерацію',
    saving: 'Збереження...',
    successTitle: 'Збережено',
    successBody: 'Зміни надіслані на модерацію. Після схвалення — з\'являться у картці.',
    errorTitle: 'Помилка',
    errorBody: 'Не вдалося зберегти. Спробуйте ще раз.',
    deleteConfirm: 'Видалити страву?',
    yes: 'Так',
    cancel: 'Скасувати',
    photoHint: 'Фото буде відображатися на картці закладу для всіх користувачів.',
  },
  ru: {
    title: 'Меню и фото',
    back: 'Назад',
    photoSection: 'Фото заведения',
    addPhoto: 'Добавить фото',
    changePhoto: 'Изменить фото',
    uploading: 'Загрузка...',
    menuSection: 'Меню и цены',
    dishName: 'Название блюда',
    dishPrice: 'Цена',
    addDish: '+ Добавить блюдо',
    maxReached: `Максимум ${MAX_MENU_ITEMS} блюд`,
    save: 'Сохранить и отправить на модерацию',
    saving: 'Сохранение...',
    successTitle: 'Сохранено',
    successBody: 'Изменения отправлены на модерацию. После одобрения — появятся в карточке.',
    errorTitle: 'Ошибка',
    errorBody: 'Не удалось сохранить. Попробуйте снова.',
    deleteConfirm: 'Удалить блюдо?',
    yes: 'Да',
    cancel: 'Отмена',
    photoHint: 'Фото будет отображаться на карточке заведения для всех пользователей.',
  },
  en: {
    title: 'Menu & photo',
    back: 'Back',
    photoSection: 'Business photo',
    addPhoto: 'Add photo',
    changePhoto: 'Change photo',
    uploading: 'Uploading...',
    menuSection: 'Menu & prices',
    dishName: 'Dish name',
    dishPrice: 'Price',
    addDish: '+ Add dish',
    maxReached: `Maximum ${MAX_MENU_ITEMS} dishes`,
    save: 'Save & send for review',
    saving: 'Saving...',
    successTitle: 'Saved',
    successBody: 'Changes sent for moderation. They will appear after approval.',
    errorTitle: 'Error',
    errorBody: 'Failed to save. Please try again.',
    deleteConfirm: 'Delete this dish?',
    yes: 'Yes',
    cancel: 'Cancel',
    photoHint: 'The photo will be shown on your venue card for all users.',
  },
} as const;

export default function BusinessMenuEditorScreen({
  navigation,
  route,
}: {
  navigation: NavigationProp<RootStackParamList, 'BusinessMenuEditorScreen'>;
  route: RouteProp<Params, 'BusinessMenuEditorScreen'>;
}) {
  const { placeId, placeName } = route.params;
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];

  const [menuItems, setMenuItems] = useState<BusinessMenuItem[]>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoStoragePath, setPhotoStoragePath] = useState<string | null>(null);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null); // preview before upload
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing data
  useEffect(() => {
    void (async () => {
      try {
        const snap = await get(ref(database, `business_plus_cards/${placeId}`));
        if (snap.exists()) {
          const data = snap.val() as {
            menuItems?: BusinessMenuItem[];
            photoUri?: string;
            photoStoragePath?: string;
          };
          if (Array.isArray(data.menuItems)) setMenuItems(data.menuItems);
          if (data.photoUri) setPhotoUri(data.photoUri);
          if (data.photoStoragePath) setPhotoStoragePath(data.photoStoragePath);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [placeId]);

  const handlePickPhoto = async () => {
    try {
      const picked = await pickPhotoFromLibrary({ allowsEditing: true, quality: 0.82 });
      if (!picked) return;
      setLocalPhotoUri(picked.uri);
      setUploading(true);
      try {
        const result = await uploadPhotoToNamespace(picked.uri, {
          namespace: `business_photos/${placeId}`,
          feature: 'firebase_storage',
          sourceLabel: 'business-menu-editor',
          logContext: { placeId, uid: currentUser?.id },
        });
        setPhotoStoragePath(result.storagePath);
        setPhotoUri(result.downloadUrl ?? null);
      } catch {
        Alert.alert(text.errorTitle, text.errorBody);
        setLocalPhotoUri(null);
      } finally {
        setUploading(false);
      }
    } catch {
      // permission denied or cancelled — no-op
    }
  };

  const handleAddDish = () => {
    if (menuItems.length >= MAX_MENU_ITEMS) return;
    setMenuItems((prev) => [...prev, { name: '', price: '' }]);
  };

  const handleUpdateDish = (index: number, field: 'name' | 'price', value: string) => {
    setMenuItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleDeleteDish = (index: number) => {
    Alert.alert('', text.deleteConfirm, [
      { text: text.cancel, style: 'cancel' },
      { text: text.yes, style: 'destructive', onPress: () => setMenuItems((prev) => prev.filter((_, i) => i !== index)) },
    ]);
  };

  const handleSave = async () => {
    const validItems = menuItems.filter((d) => d.name.trim());
    setSaving(true);
    try {
      const cardRef = ref(database, `business_plus_cards/${placeId}`);
      const snap = await get(cardRef);
      const existing = snap.exists() ? snap.val() as Record<string, unknown> : {};

      await update(cardRef, {
        ...existing,
        placeId,
        placeName,
        ownerId: currentUser?.id ?? '',
        menuItems: validItems,
        ...(photoStoragePath ? { photoStoragePath } : {}),
        ...(photoUri ? { photoUri } : {}),
        moderationStatus: 'pending',
        updatedAt: new Date().toISOString(),
      });

      Alert.alert(text.successTitle, text.successBody, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert(text.errorTitle, text.errorBody);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} />
        </View>
      </SafeAreaView>
    );
  }

  const displayPhoto = localPhotoUri ?? photoUri;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#403933" />
          <Text style={styles.backText}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{placeName}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Photo section */}
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="image-outline" size={16} color="#7A1E5C" />
            <Text style={styles.sectionTitle}>{text.photoSection}</Text>
          </View>

          <View style={styles.photoCard}>
            {displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={styles.photoPreview} resizeMode="cover" />
            ) : null}
            <TouchableOpacity
              style={[styles.photoBtn, uploading && styles.btnDisabled]}
              onPress={() => void handlePickPhoto()}
              disabled={uploading}
              activeOpacity={0.86}
            >
              {uploading ? (
                <>
                  <ActivityIndicator size="small" color="#7A1E5C" />
                  <Text style={styles.photoBtnText}>{text.uploading}</Text>
                </>
              ) : (
                <>
                  <MaterialCommunityIcons name="image-plus" size={18} color="#7A1E5C" />
                  <Text style={styles.photoBtnText}>{displayPhoto ? text.changePhoto : text.addPhoto}</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={styles.photoHint}>{text.photoHint}</Text>
          </View>

          {/* Menu section */}
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="silverware-fork-knife" size={16} color="#7A1E5C" />
            <Text style={styles.sectionTitle}>{text.menuSection}</Text>
          </View>

          <View style={styles.menuCard}>
            {menuItems.map((dish, i) => (
              <View key={i} style={[styles.dishRow, i < menuItems.length - 1 && styles.dishRowDivider]}>
                <TextInput
                  style={styles.dishNameInput}
                  value={dish.name}
                  onChangeText={(v) => handleUpdateDish(i, 'name', v)}
                  placeholder={text.dishName}
                  placeholderTextColor="#B0A49A"
                  returnKeyType="next"
                  maxLength={80}
                />
                <TextInput
                  style={styles.dishPriceInput}
                  value={dish.price}
                  onChangeText={(v) => handleUpdateDish(i, 'price', v)}
                  placeholder={text.dishPrice}
                  placeholderTextColor="#B0A49A"
                  returnKeyType="done"
                  maxLength={20}
                />
                <TouchableOpacity onPress={() => handleDeleteDish(i)} style={styles.deleteBtn} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="close-circle-outline" size={20} color="#C0A898" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.addDishBtn, menuItems.length >= MAX_MENU_ITEMS && styles.addDishBtnDisabled]}
              onPress={handleAddDish}
              disabled={menuItems.length >= MAX_MENU_ITEMS}
              activeOpacity={0.82}
            >
              <Text style={[styles.addDishText, menuItems.length >= MAX_MENU_ITEMS && styles.addDishTextDisabled]}>
                {menuItems.length >= MAX_MENU_ITEMS ? text.maxReached : text.addDish}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={() => void handleSave()}
            disabled={saving || uploading}
            activeOpacity={0.86}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>{text.save}</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  backBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 68 },
  backText: { color: '#403933', fontSize: 14, fontWeight: '800' },
  headerTitle: { color: '#2D2520', fontSize: 16, fontWeight: '900', flex: 1, textAlign: 'center' },
  headerSpacer: { minWidth: 68 },
  content: { padding: 16, paddingBottom: 48, gap: 10 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  sectionTitle: {
    fontSize: 12, fontWeight: '900', color: '#7A1E5C',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  photoCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 10,
  },
  photoPreview: { width: '100%', height: 180, borderRadius: 12 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDF5FA',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#E8C4DC',
    alignSelf: 'flex-start',
  },
  photoBtnText: { fontSize: 14, fontWeight: '800', color: '#7A1E5C' },
  photoHint: { fontSize: 12, color: '#9A8D84', fontWeight: '600', lineHeight: 17 },

  menuCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    gap: 0,
  },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dishRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#EFE7DC',
  },
  dishNameInput: {
    flex: 1,
    fontSize: 14,
    color: '#2D2520',
    fontWeight: '600',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F5F0EB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0D4C8',
    minHeight: 38,
  },
  dishPriceInput: {
    width: 80,
    fontSize: 14,
    color: '#7A1E5C',
    fontWeight: '900',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#F5F0EB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0D4C8',
    textAlign: 'right',
    minHeight: 38,
  },
  deleteBtn: { padding: 4 },
  addDishBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#7A1E5C',
    borderStyle: 'dashed',
  },
  addDishBtnDisabled: { borderColor: '#C0A898' },
  addDishText: { fontSize: 14, fontWeight: '900', color: '#7A1E5C' },
  addDishTextDisabled: { color: '#C0A898' },

  saveBtn: {
    marginTop: 10,
    backgroundColor: '#7A1E5C',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});

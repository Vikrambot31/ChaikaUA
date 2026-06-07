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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { ref, get, update } from 'firebase/database';
import { useSelector } from 'react-redux';

import { database } from '../firebase-core';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import type { BusinessPromotion } from '../utils/detailViewTypes';

const MAX_PROMOS = 3;

type Lang = 'ua' | 'ru' | 'en';

type Params = {
  BusinessPromoEditorScreen: { placeId: string; placeName: string };
};

const UI_TEXT = {
  ua: {
    title: 'Акції та знижки',
    back: 'Назад',
    subtitle: `До ${MAX_PROMOS} акцій. Кожна картка — жовта, помітна для всіх.`,
    promoTitle: 'Назва акції',
    promoDesc: 'Опис (умови, розмір знижки...)',
    promoDate: 'Діє до (ДД.ММ.РРРР)',
    addPromo: '+ Додати акцію',
    maxReached: `Максимум ${MAX_PROMOS} акцій`,
    save: 'Зберегти та надіслати на модерацію',
    saving: 'Збереження...',
    successTitle: 'Збережено',
    successBody: 'Акції надіслані на модерацію. Після схвалення — з\'являться у картці.',
    errorTitle: 'Помилка',
    errorBody: 'Не вдалося зберегти. Спробуйте ще раз.',
    deleteConfirm: 'Видалити цю акцію?',
    yes: 'Так',
    cancel: 'Скасувати',
    dateHint: 'Формат: 31.12.2025',
    invalidDate: 'Невірний формат дати. Використовуйте ДД.ММ.РРРР',
  },
  ru: {
    title: 'Акции и скидки',
    back: 'Назад',
    subtitle: `До ${MAX_PROMOS} акций. Каждая карточка — жёлтая, заметная для всех.`,
    promoTitle: 'Название акции',
    promoDesc: 'Описание (условия, размер скидки...)',
    promoDate: 'Действует до (ДД.ММ.ГГГГ)',
    addPromo: '+ Добавить акцию',
    maxReached: `Максимум ${MAX_PROMOS} акций`,
    save: 'Сохранить и отправить на модерацию',
    saving: 'Сохранение...',
    successTitle: 'Сохранено',
    successBody: 'Акции отправлены на модерацию. После одобрения — появятся в карточке.',
    errorTitle: 'Ошибка',
    errorBody: 'Не удалось сохранить. Попробуйте снова.',
    deleteConfirm: 'Удалить эту акцию?',
    yes: 'Да',
    cancel: 'Отмена',
    dateHint: 'Формат: 31.12.2025',
    invalidDate: 'Неверный формат даты. Используйте ДД.ММ.ГГГГ',
  },
  en: {
    title: 'Promotions',
    back: 'Back',
    subtitle: `Up to ${MAX_PROMOS} promotions. Each shows as a yellow card visible to all users.`,
    promoTitle: 'Promotion title',
    promoDesc: 'Description (conditions, discount size...)',
    promoDate: 'Valid until (DD.MM.YYYY)',
    addPromo: '+ Add promotion',
    maxReached: `Maximum ${MAX_PROMOS} promotions`,
    save: 'Save & send for review',
    saving: 'Saving...',
    successTitle: 'Saved',
    successBody: 'Promotions sent for moderation. They will appear after approval.',
    errorTitle: 'Error',
    errorBody: 'Failed to save. Please try again.',
    deleteConfirm: 'Delete this promotion?',
    yes: 'Yes',
    cancel: 'Cancel',
    dateHint: 'Format: 31.12.2025',
    invalidDate: 'Invalid date format. Use DD.MM.YYYY',
  },
} as const;

/** Parse "DD.MM.YYYY" → ISO string. Returns null if invalid. */
function parseDateInput(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const d = new Date(`${yyyy}-${mm!.padStart(2, '0')}-${dd!.padStart(2, '0')}`);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function BusinessPromoEditorScreen({
  navigation,
  route,
}: {
  navigation: NavigationProp<RootStackParamList, 'BusinessPromoEditorScreen'>;
  route: RouteProp<Params, 'BusinessPromoEditorScreen'>;
}) {
  const { placeId, placeName } = route.params;
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];

  // Raw date strings as typed by user (DD.MM.YYYY)
  const [promos, setPromos] = useState<{ title: string; description: string; dateRaw: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing promotions
  useEffect(() => {
    void (async () => {
      try {
        const snap = await get(ref(database, `business_plus_cards/${placeId}`));
        if (snap.exists()) {
          const data = snap.val() as { promotions?: BusinessPromotion[] };
          if (Array.isArray(data.promotions)) {
            setPromos(data.promotions.map((p) => ({
              title: p.title,
              description: p.description,
              dateRaw: p.dateUntil ? formatIsoToDisplay(p.dateUntil) : '',
            })));
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [placeId]);

  const handleAdd = () => {
    if (promos.length >= MAX_PROMOS) return;
    setPromos((prev) => [...prev, { title: '', description: '', dateRaw: '' }]);
  };

  const handleUpdate = (index: number, field: 'title' | 'description' | 'dateRaw', value: string) => {
    setPromos((prev) => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const handleDelete = (index: number) => {
    Alert.alert('', text.deleteConfirm, [
      { text: text.cancel, style: 'cancel' },
      { text: text.yes, style: 'destructive', onPress: () => setPromos((prev) => prev.filter((_, i) => i !== index)) },
    ]);
  };

  const handleSave = async () => {
    // Validate dates
    for (const p of promos) {
      if (p.dateRaw.trim() && !parseDateInput(p.dateRaw)) {
        Alert.alert(text.errorTitle, text.invalidDate);
        return;
      }
    }

    const validPromos: BusinessPromotion[] = promos
      .filter((p) => p.title.trim())
      .map((p) => ({
        title: p.title.trim(),
        description: p.description.trim(),
        dateUntil: parseDateInput(p.dateRaw) ?? '',
      }));

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
        promotions: validPromos,
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

          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="tag-multiple-outline" size={20} color="#B8860B" />
            <Text style={styles.infoText}>{text.subtitle}</Text>
          </View>

          {promos.map((promo, i) => (
            <View key={i} style={styles.promoCard}>
              <View style={styles.promoCardHeader}>
                <Text style={styles.promoCardNum}>#{i + 1}</Text>
                <TouchableOpacity onPress={() => handleDelete(i)} style={styles.deleteBtn} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="close-circle-outline" size={20} color="#C0A898" />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.input}
                value={promo.title}
                onChangeText={(v) => handleUpdate(i, 'title', v)}
                placeholder={text.promoTitle}
                placeholderTextColor="#B0A49A"
                returnKeyType="next"
                maxLength={80}
              />

              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={promo.description}
                onChangeText={(v) => handleUpdate(i, 'description', v)}
                placeholder={text.promoDesc}
                placeholderTextColor="#B0A49A"
                multiline
                numberOfLines={3}
                maxLength={300}
                returnKeyType="next"
              />

              <View>
                <TextInput
                  style={styles.input}
                  value={promo.dateRaw}
                  onChangeText={(v) => handleUpdate(i, 'dateRaw', v)}
                  placeholder={text.promoDate}
                  placeholderTextColor="#B0A49A"
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  maxLength={10}
                />
                <Text style={styles.dateHint}>{text.dateHint}</Text>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.addBtn, promos.length >= MAX_PROMOS && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={promos.length >= MAX_PROMOS}
            activeOpacity={0.82}
          >
            <Text style={[styles.addBtnText, promos.length >= MAX_PROMOS && styles.addBtnTextDisabled]}>
              {promos.length >= MAX_PROMOS ? text.maxReached : text.addPromo}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={() => void handleSave()}
            disabled={saving}
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

function formatIsoToDisplay(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  } catch {
    return '';
  }
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
  content: { padding: 16, paddingBottom: 48, gap: 12 },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFDE7',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F9E076',
  },
  infoText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#5C4A1E', lineHeight: 19 },

  promoCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0D87A',
    gap: 10,
  },
  promoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promoCardNum: { fontSize: 13, fontWeight: '900', color: '#B8860B' },
  deleteBtn: { padding: 2 },

  input: {
    backgroundColor: '#FBF7F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0D4C8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#2D2520',
    fontWeight: '600',
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  dateHint: { fontSize: 11, color: '#B0A49A', fontWeight: '700', marginTop: 4, marginLeft: 4 },

  addBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#B8860B',
    borderStyle: 'dashed',
    backgroundColor: '#FFFDE7',
  },
  addBtnDisabled: { borderColor: '#C0A898', backgroundColor: '#F5F2EE' },
  addBtnText: { fontSize: 14, fontWeight: '900', color: '#B8860B' },
  addBtnTextDisabled: { color: '#C0A898' },

  saveBtn: {
    backgroundColor: '#7A1E5C',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});

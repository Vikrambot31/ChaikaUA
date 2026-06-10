import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { SCREEN_THEME } from '../utils/screenTheme';
import { featureRatingAPI } from '../firebase-config';
import { getScreenLabel } from '../utils/featureScreenMap';
import type { FeatureScreenId } from '../utils/featureScreenMap';
import type { RootState } from '../redux/store';

// ── Constants ──────────────────────────────────────────────────────────────────

const VISIT_THRESHOLD = 3;
const STORAGE_VISITS = '@chaika:screen_visits_';
const STORAGE_RATED  = '@chaika:screen_rated_';

type Lang = 'ua' | 'ru' | 'en';

const TEXTS: Record<Lang, {
  title: string;
  usability: string;
  usefulness: string;
  placeholder: string;
  submit: string;
  thanks: string;
  errorTitle: string;
  sendError: string;
  pickBoth: string;
}> = {
  ua: {
    title:       'Оцініть цей розділ',
    usability:   '🎯 Зручно — легко знайти що потрібно',
    usefulness:  '💡 Корисно — для життя на Чайці',
    placeholder: 'Коментар (необов\'язково)',
    submit:      'Відправити',
    thanks:      'Дякуємо за оцінку!',
    errorTitle:  'Помилка',
    sendError:   'Не вдалося відправити оцінку. Спробуйте пізніше.',
    pickBoth:    'Будь ласка, оцініть обидва пункти',
  },
  ru: {
    title:       'Оцените этот раздел',
    usability:   '🎯 Удобно — легко найти что нужно',
    usefulness:  '💡 Полезно — для жизни на Чайке',
    placeholder: 'Комментарий (необязательно)',
    submit:      'Отправить',
    thanks:      'Спасибо за оценку!',
    errorTitle:  'Ошибка',
    sendError:   'Не удалось отправить оценку. Попробуйте позже.',
    pickBoth:    'Пожалуйста, оцените оба пункта',
  },
  en: {
    title:       'Rate this section',
    usability:   '🎯 Convenient — easy to find what you need',
    usefulness:  '💡 Useful — for life on Chaika',
    placeholder: 'Comment (optional)',
    submit:      'Submit',
    thanks:      'Thanks for your rating!',
    errorTitle:  'Error',
    sendError:   'Could not submit rating. Please try again later.',
    pickBoth:    'Please rate both items',
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const getMonthKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ── Stars row sub-component ───────────────────────────────────────────────────

function StarsRow({ label, value, onChange }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.categoryRow}>
      <Text style={styles.categoryLabel}>{label}</Text>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            style={styles.starBtn}
            onPress={() => onChange(star)}
            activeOpacity={0.72}
          >
            <MaterialCommunityIcons
              name={star <= value ? 'star' : 'star-outline'}
              size={34}
              color={star <= value ? '#FFA000' : '#CDBB9A'}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = { screenId: FeatureScreenId };

export function FeatureRatingBanner({ screenId }: Props) {
  const lang = (useSelector((state: RootState) => state.language?.current) ?? 'ua') as Lang;
  const userId = useSelector((state: RootState) => state.auth.user?.id);

  const [visible,    setVisible]    = useState(false);
  const [usability,  setUsability]  = useState(0);
  const [usefulness, setUsefulness] = useState(0);
  const [expanded,   setExpanded]   = useState(false);
  const [comment,    setComment]    = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showThanks, setShowThanks] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const text = TEXTS[lang] ?? TEXTS.ua;

  // Track visits & check eligibility
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const check = async () => {
      try {
        const ratedMonth = await AsyncStorage.getItem(`${STORAGE_RATED}${screenId}`);
        if (ratedMonth === getMonthKey()) return;

        const visitKey = `${STORAGE_VISITS}${screenId}_${getMonthKey()}`;
        const visits = (parseInt(await AsyncStorage.getItem(visitKey) ?? '0', 10) || 0) + 1;
        await AsyncStorage.setItem(visitKey, String(visits));
        if (visits < VISIT_THRESHOLD) return;

        const result = await featureRatingAPI.canRate(screenId);
        if (!result.success || !result.data) return;

        if (active) {
          setVisible(true);
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        }
      } catch { /* silent */ }
    };
    void check();
    return () => { active = false; };
  }, [screenId, userId, fadeAnim]);

  // Expand comment box when any star is tapped
  const handleUsability  = useCallback((v: number) => { setUsability(v);  setExpanded(true); }, []);
  const handleUsefulness = useCallback((v: number) => { setUsefulness(v); setExpanded(true); }, []);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (usability < 1 || usefulness < 1) {
      Alert.alert(text.errorTitle, text.pickBoth);
      return;
    }
    setSubmitting(true);
    try {
      const result = await featureRatingAPI.submitRating(
        screenId, usability, usefulness, comment || undefined,
      );
      if (!result.success) {
        Alert.alert(text.errorTitle, text.sendError);
        setSubmitting(false);
        return;
      }
      await AsyncStorage.setItem(`${STORAGE_RATED}${screenId}`, getMonthKey());
      setShowThanks(true);
      setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true })
          .start(() => setVisible(false));
      }, 2000);
    } catch {
      Alert.alert(text.errorTitle, text.sendError);
      setSubmitting(false);
    }
  }, [submitting, usability, usefulness, screenId, comment, fadeAnim, text]);

  if (!visible || !userId) return null;

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {showThanks ? (
        <View style={styles.thanksRow}>
          <MaterialCommunityIcons name="check-circle" size={22} color="#388E3C" />
          <Text style={styles.thanksText}>{text.thanks}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.screenName}>{getScreenLabel(screenId, lang)}</Text>

          <StarsRow label={text.usability}  value={usability}  onChange={handleUsability}  />
          <StarsRow label={text.usefulness} value={usefulness} onChange={handleUsefulness} />

          {expanded && (
            <View style={styles.expandedArea}>
              <TextInput
                style={styles.input}
                placeholder={text.placeholder}
                placeholderTextColor={SCREEN_THEME.textMuted}
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={500}
                editable={!submitting}
              />
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.75}
                disabled={submitting}
              >
                <Text style={styles.submitText}>{submitting ? '...' : text.submit}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  screenName: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  categoryRow: {
    marginBottom: 8,
  },
  categoryLabel: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  starBtn: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedArea: {
    marginTop: 10,
    width: '100%',
  },
  input: {
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    borderRadius: 10,
    backgroundColor: SCREEN_THEME.paper,
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  submitBtn: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: SCREEN_THEME.terracotta,
    borderRadius: 10,
    paddingHorizontal: 28,
    paddingVertical: 10,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  thanksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  thanksText: {
    color: '#388E3C',
    fontSize: 15,
    fontWeight: '700',
  },
});

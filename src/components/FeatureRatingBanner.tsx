import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSelector } from 'react-redux';
import { SCREEN_THEME } from '../utils/screenTheme';
import { featureRatingAPI } from '../firebase-config';
import { getScreenLabel } from '../utils/featureScreenMap';
import type { FeatureScreenId } from '../utils/featureScreenMap';
import type { RootState } from '../redux/store';

// ─── Constants ────────────────────────────────────────────────────────────────

const VISIT_THRESHOLD = 3;
const STORAGE_PREFIX_VISITS = '@chaika:screen_visits_';
const STORAGE_PREFIX_RATED = '@chaika:screen_rated_';

type Lang = 'ua' | 'ru' | 'en';

const TEXTS: Record<Lang, {
  rateTitle: string;
  placeholder: string;
  submit: string;
  thanks: string;
  errorTitle: string;
  sendError: string;
}> = {
  ua: {
    rateTitle: 'Оцініть цей розділ',
    placeholder: 'Коментар (необов\'язково)',
    submit: 'Відправити',
    thanks: 'Дякуємо за оцінку!',
    errorTitle: 'Помилка',
    sendError: 'Не вдалося відправити оцінку. Спробуйте пізніше.',
  },
  ru: {
    rateTitle: 'Оцените этот раздел',
    placeholder: 'Комментарий (необязательно)',
    submit: 'Отправить',
    thanks: 'Спасибо за оценку!',
    errorTitle: 'Ошибка',
    sendError: 'Не удалось отправить оценку. Попробуйте позже.',
  },
  en: {
    rateTitle: 'Rate this section',
    placeholder: 'Comment (optional)',
    submit: 'Submit',
    thanks: 'Thanks for your rating!',
    errorTitle: 'Error',
    sendError: 'Could not submit rating. Please try again later.',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getMonthKey = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  screenId: FeatureScreenId;
};

export function FeatureRatingBanner({ screenId }: Props) {
  const lang = (useSelector((state: RootState) => state.language?.current) ?? 'ua') as Lang;
  const userId = useSelector((state: RootState) => state.auth.user?.id);

  const [visible, setVisible] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showThanks, setShowThanks] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const text = TEXTS[lang] || TEXTS.ua;

  // Track visits & check eligibility
  useEffect(() => {
    if (!userId) return;
    let active = true;

    const check = async () => {
      try {
        // Check if already rated this month
        const ratedKey = `${STORAGE_PREFIX_RATED}${screenId}`;
        const ratedMonth = await AsyncStorage.getItem(ratedKey);
        if (ratedMonth === getMonthKey()) return;

        // Increment visit count for this month
        const visitKey = `${STORAGE_PREFIX_VISITS}${screenId}_${getMonthKey()}`;
        const rawVisits = await AsyncStorage.getItem(visitKey);
        const visits = (parseInt(rawVisits || '0', 10) || 0) + 1;
        await AsyncStorage.setItem(visitKey, String(visits));

        if (visits < VISIT_THRESHOLD) return;

        // Check Firebase: can rate?
        const result = await featureRatingAPI.canRate(screenId);
        if (!result.success || !result.data) return;

        if (active) {
          setVisible(true);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start();
        }
      } catch {
        // Silent — don't block the screen
      }
    };

    void check();
    return () => { active = false; };
  }, [screenId, userId, fadeAnim]);

  const handleStarPress = useCallback((star: number) => {
    setSelectedRating(star);
    setExpanded(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (selectedRating < 1 || submitting) return;
    setSubmitting(true);

    try {
      const result = await featureRatingAPI.submitRating(screenId, selectedRating, comment || undefined);

      if (!result.success) {
        Alert.alert(text.errorTitle, text.sendError);
        setSubmitting(false);
        return;
      }

      // Mark as rated locally
      await AsyncStorage.setItem(`${STORAGE_PREFIX_RATED}${screenId}`, getMonthKey());

      setShowThanks(true);
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setVisible(false));
      }, 2000);
    } catch {
      Alert.alert(text.errorTitle, text.sendError);
      setSubmitting(false);
    }
  }, [screenId, selectedRating, comment, submitting, fadeAnim, text]);

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
          <Text style={styles.title}>{text.rateTitle}</Text>
          <Text style={styles.screenName}>{getScreenLabel(screenId, lang)}</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= selectedRating;
              return (
                <TouchableOpacity
                  key={star}
                  style={styles.starBtn}
                  onPress={() => handleStarPress(star)}
                  activeOpacity={0.72}
                >
                  <MaterialCommunityIcons
                    name={active ? 'star' : 'star-outline'}
                    size={36}
                    color={active ? '#FFA000' : '#CDBB9A'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {expanded && (
            <View style={styles.expandedArea}>
              <TextInput
                style={styles.commentInput}
                placeholder={text.placeholder}
                placeholderTextColor={SCREEN_THEME.textMuted}
                value={comment}
                onChangeText={setComment}
                multiline
                maxLength={500}
                editable={!submitting}
              />
              <TouchableOpacity
                style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.75}
                disabled={submitting}
              >
                <Text style={styles.submitText}>
                  {submitting ? '...' : text.submit}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    alignItems: 'center',
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
    marginTop: 2,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: 12,
  },
  starBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedArea: {
    width: '100%',
    marginTop: 12,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    borderRadius: 10,
    backgroundColor: SCREEN_THEME.paper,
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    minHeight: 60,
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
  submitBtnDisabled: {
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
    gap: 8,
    paddingVertical: 4,
  },
  thanksText: {
    color: '#388E3C',
    fontSize: 15,
    fontWeight: '700',
  },
});

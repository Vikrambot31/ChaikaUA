import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const HERO_IMAGE = require('../../assets/_readme.webp');
import { SCREEN_THEME } from '../utils/screenTheme';
import { Language } from '../i18n/translations';

type ScreenTooltipProps = {
  storageKey: string;
  title: Record<Language, string>;
  items: Record<Language, string[]>;
  language: Language;
  accentColor?: string;
  /** When provided, controls visibility externally (ignores AsyncStorage auto-open). */
  forceVisible?: boolean;
  /** Called when user closes the tooltip (only used with forceVisible). */
  onClose?: () => void;
};

const DONE_VALUE = '1';
const QUICK_READ_LABELS: Record<Language, string> = {
  ua: '15 СЕКУНД',
  ru: '15 СЕКУНД',
  en: '15 SECONDS',
};
const DONE_LABELS: Record<Language, string> = {
  ua: 'Зрозуміло',
  ru: 'Понятно',
  en: 'Got It',
};

export default function ScreenTooltip({
  storageKey,
  title,
  items,
  language,
  accentColor = SCREEN_THEME.terracotta,
  forceVisible,
  onClose,
}: ScreenTooltipProps) {
  const controlled = forceVisible !== undefined;
  const [autoVisible, setAutoVisible] = useState(false);

  useEffect(() => {
    if (controlled) return;
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active && value !== DONE_VALUE) setAutoVisible(true);
      })
      .catch(() => {
        if (active) setAutoVisible(true);
      });
    return () => {
      active = false;
    };
  }, [storageKey, controlled]);

  const visible = controlled ? forceVisible : autoVisible;

  const close = useCallback(() => {
    if (controlled) {
      onClose?.();
    } else {
      setAutoVisible(false);
      void AsyncStorage.setItem(storageKey, DONE_VALUE).catch(() => undefined);
    }
  }, [storageKey, controlled, onClose]);

  const localizedTitle = title[language];
  const localizedItems = items[language];
  const quickReadLabel = QUICK_READ_LABELS[language];
  const doneLabel = DONE_LABELS[language];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.card}>
          <View style={styles.topRow}>
            <View style={[styles.iconBubble, { backgroundColor: accentColor }]}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={24} color="#FFF9EE" />
            </View>
            <View style={styles.titleWrap}>
              <Text style={styles.kicker}>{quickReadLabel}</Text>
              <Text style={styles.title}>{localizedTitle}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={close} activeOpacity={0.78}>
              <MaterialCommunityIcons name="close" size={22} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          </View>

          <Image source={HERO_IMAGE} style={styles.heroImage} resizeMode="contain" />

          <ScrollView contentContainerStyle={styles.steps} showsVerticalScrollIndicator={false}>
            {localizedItems.map((item, index) => (
              <View key={`${storageKey}-${index}`} style={styles.stepRow}>
                <View style={[styles.stepNumber, { borderColor: accentColor }]}>
                  <Text style={[styles.stepNumberText, { color: accentColor }]}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{item}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: accentColor }]} onPress={close} activeOpacity={0.86}>
            <Text style={styles.actionText}>{doneLabel}</Text>
            <MaterialCommunityIcons name="check" size={18} color="#FFF9EE" />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(23, 21, 18, 0.56)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    maxHeight: '82%',
    borderRadius: 8,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
    overflow: 'hidden',
    padding: 18,
    shadowColor: '#2F241A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.26,
    shadowRadius: 22,
    elevation: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  kicker: {
    color: SCREEN_THEME.textMuted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.cardCream,
  },
  heroImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginTop: 14,
  },
  steps: {
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: SCREEN_THEME.lightCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderSoft,
    padding: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9EE',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '900',
  },
  stepText: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  actionButton: {
    minHeight: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionText: {
    color: '#FFF9EE',
    fontSize: 16,
    fontWeight: '900',
  },
});

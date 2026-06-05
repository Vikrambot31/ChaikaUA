import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SCREEN_THEME } from '../utils/screenTheme';

type ScreenTooltipProps = {
  storageKey: string;
  title: string;
  items: string[];
  accentColor?: string;
};

const DONE_VALUE = '1';
const QUICK_READ_LABEL = '15 \u0441\u0435\u043a\u0443\u043d\u0434';
const DONE_LABEL = '\u041f\u043e\u043d\u044f\u0442\u043d\u043e';

export default function ScreenTooltip({
  storageKey,
  title,
  items,
  accentColor = SCREEN_THEME.terracotta,
}: ScreenTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active && value !== DONE_VALUE) setVisible(true);
      })
      .catch(() => {
        if (active) setVisible(true);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const close = useCallback(() => {
    setVisible(false);
    void AsyncStorage.setItem(storageKey, DONE_VALUE).catch(() => undefined);
  }, [storageKey]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable style={styles.card}>
          <View style={styles.topRow}>
            <View style={[styles.iconBubble, { backgroundColor: accentColor }]}>
              <MaterialCommunityIcons name="lightbulb-on-outline" size={24} color="#FFF9EE" />
            </View>
            <View style={styles.titleWrap}>
              <Text style={styles.kicker}>{QUICK_READ_LABEL}</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={close} activeOpacity={0.78}>
              <MaterialCommunityIcons name="close" size={22} color={SCREEN_THEME.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.steps} showsVerticalScrollIndicator={false}>
            {items.map((item, index) => (
              <View key={`${storageKey}-${index}`} style={styles.stepRow}>
                <View style={[styles.stepNumber, { borderColor: accentColor }]}>
                  <Text style={[styles.stepNumberText, { color: accentColor }]}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{item}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={[styles.actionButton, { backgroundColor: accentColor }]} onPress={close} activeOpacity={0.86}>
            <Text style={styles.actionText}>{DONE_LABEL}</Text>
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

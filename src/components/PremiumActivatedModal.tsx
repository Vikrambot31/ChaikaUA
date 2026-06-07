import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface PremiumActivatedModalProps {
  visible: boolean;
  onDismiss: () => void;
}

const FEATURES = [
  'Люди Чайки — повний доступ',
  'Більше оголошень (до 5)',
  'Більше заявок (до 6)',
  'Більше фото (до 10/день)',
  'Бонуси x1.5',
  'Пріоритетна підтримка',
];

/**
 * Beautiful modal shown once when the admin grants the user a Premium
 * subscription while the app is running (detected via the realtime RTDB
 * listener in useSubscriptionSync).
 */
export function PremiumActivatedModal({ visible, onDismiss }: PremiumActivatedModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.crownWrapper}>
            <MaterialCommunityIcons name="crown" size={52} color="#C79C47" />
          </View>

          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>Вітаємо!</Text>
          <Text style={styles.subtitle}>Premium активовано</Text>

          <Text style={styles.desc}>
            Ваш преміум-доступ щойно активовано.{'\n'}
            Тепер вам доступні всі можливості:
          </Text>

          <ScrollView style={styles.featureScroll} showsVerticalScrollIndicator={false}>
            {FEATURES.map((f) => (
              <View key={f} style={styles.featureRow}>
                <MaterialCommunityIcons name="check-circle" size={16} color="#43a047" />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.btn}
            onPress={onDismiss}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="crown" size={18} color="#1a1a2e" />
            <Text style={styles.btnText}>Дякую! 🙌</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#12122a',
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    borderWidth: 1.5,
    borderColor: '#C79C47',
    shadowColor: '#C79C47',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  crownWrapper: {
    backgroundColor: 'rgba(199,156,71,0.12)',
    borderRadius: 50,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(199,156,71,0.3)',
    marginBottom: 6,
  },
  emoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#C79C47',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e8e8e8',
    marginBottom: 14,
    marginTop: 2,
  },
  desc: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  featureScroll: {
    width: '100%',
    maxHeight: 180,
    marginBottom: 22,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  featureText: {
    fontSize: 13,
    color: '#e0e0e0',
    fontWeight: '600',
    flexShrink: 1,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#C79C47',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 40,
  },
  btnText: {
    color: '#12122a',
    fontWeight: '900',
    fontSize: 16,
  },
});

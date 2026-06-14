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
import type { BusinessClaimNotification } from '../hooks/useBusinessClaimSync';

interface BusinessApprovalModalProps {
  notification: BusinessClaimNotification | null;
  onDismiss: () => void;
}

const APPROVED_FEATURES = [
  'Редагування картки закладу',
  'Завантаження фото та меню',
  'Додавання акцій та знижок',
  'Пріоритетне відображення в каталозі',
  'Значок "Власник" у профілі закладу',
];

/**
 * Modal shown when admin approves or rejects a business ownership claim.
 * Driven by useBusinessClaimSync real-time RTDB listener.
 */
export function BusinessApprovalModal({ notification, onDismiss }: BusinessApprovalModalProps) {
  const isApproved = notification?.type === 'claim_approved';

  return (
    <Modal
      visible={notification !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, isApproved ? styles.cardApproved : styles.cardRejected]}>

          {/* Icon */}
          <View style={[styles.iconWrapper, isApproved ? styles.iconWrapperApproved : styles.iconWrapperRejected]}>
            <MaterialCommunityIcons
              name={isApproved ? 'store-check' : 'store-remove'}
              size={52}
              color={isApproved ? '#3d9e56' : '#c0392b'}
            />
          </View>

          <Text style={styles.emoji}>{isApproved ? '🎉' : '😔'}</Text>

          <Text style={[styles.title, isApproved ? styles.titleApproved : styles.titleRejected]}>
            {isApproved ? 'Вітаємо!' : 'На жаль...'}
          </Text>

          <Text style={styles.subtitle}>
            {isApproved
              ? 'Ваш заклад підтверджено'
              : 'Заявку відхилено'}
          </Text>

          {notification?.placeName ? (
            <View style={styles.placeNameRow}>
              <MaterialCommunityIcons name="map-marker" size={15} color="#aaa" />
              <Text style={styles.placeName} numberOfLines={2}>{notification.placeName}</Text>
            </View>
          ) : null}

          {isApproved ? (
            <>
              <Text style={styles.desc}>
                Ваша заявка на підтвердження права власності схвалена модератором.{'\n'}
                Тепер вам доступно:
              </Text>
              <ScrollView style={styles.featureScroll} showsVerticalScrollIndicator={false}>
                {APPROVED_FEATURES.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#3d9e56" />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : (
            <View style={styles.rejectBox}>
              <Text style={styles.rejectLabel}>Причина відмови:</Text>
              <Text style={styles.rejectReason}>
                {notification?.rejectReason || 'Не вказано'}
              </Text>
              <Text style={styles.rejectHint}>
                Ви можете надіслати нову заявку, виправивши зазначені недоліки.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btn, isApproved ? styles.btnApproved : styles.btnRejected]}
            onPress={onDismiss}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons
              name={isApproved ? 'store-check' : 'close-circle-outline'}
              size={18}
              color={isApproved ? '#1a2e1a' : '#fff'}
            />
            <Text style={[styles.btnText, isApproved ? styles.btnTextApproved : styles.btnTextRejected]}>
              {isApproved ? 'Дякую! 🙌' : 'Зрозуміло'}
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    borderWidth: 1.5,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  cardApproved: {
    backgroundColor: '#0f1f12',
    borderColor: '#3d9e56',
    shadowColor: '#3d9e56',
  },
  cardRejected: {
    backgroundColor: '#1f0f0f',
    borderColor: '#c0392b',
    shadowColor: '#c0392b',
  },
  iconWrapper: {
    borderRadius: 50,
    padding: 14,
    borderWidth: 1,
    marginBottom: 6,
  },
  iconWrapperApproved: {
    backgroundColor: 'rgba(61,158,86,0.12)',
    borderColor: 'rgba(61,158,86,0.3)',
  },
  iconWrapperRejected: {
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderColor: 'rgba(192,57,43,0.3)',
  },
  emoji: { fontSize: 30, marginBottom: 4 },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: 0.5 },
  titleApproved: { color: '#3d9e56' },
  titleRejected: { color: '#c0392b' },
  subtitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e8e8e8',
    marginBottom: 10,
    marginTop: 2,
  },
  placeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  placeName: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  desc: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
  },
  featureScroll: {
    width: '100%',
    maxHeight: 160,
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
  rejectBox: {
    width: '100%',
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    gap: 6,
  },
  rejectLabel: { fontSize: 11, color: '#c0392b', fontWeight: '900', textTransform: 'uppercase' },
  rejectReason: { fontSize: 14, color: '#e8e8e8', fontWeight: '600', lineHeight: 20 },
  rejectHint: { fontSize: 12, color: '#aaa', lineHeight: 17 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 40,
  },
  btnApproved: { backgroundColor: '#3d9e56' },
  btnRejected: { backgroundColor: '#c0392b' },
  btnText: { fontWeight: '900', fontSize: 16 },
  btnTextApproved: { color: '#1a2e1a' },
  btnTextRejected: { color: '#fff' },
});

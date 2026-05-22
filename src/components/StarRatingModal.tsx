import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SCREEN_THEME } from '../utils/screenTheme';

type StarRatingModalProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  value?: number;
  onSelect: (value: number) => void;
  onClose: () => void;
};

export default function StarRatingModal({ visible, title, subtitle, value = 0, onSelect, onClose }: StarRatingModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.card}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.75}>
            <Text style={styles.closeText}>x</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => {
              const active = star <= value;
              return (
                <TouchableOpacity
                  key={star}
                  style={styles.starBtn}
                  onPress={() => onSelect(star)}
                  activeOpacity={0.72}
                >
                  <MaterialCommunityIcons
                    name={active ? 'star' : 'star-outline'}
                    size={42}
                    color={active ? '#FFA000' : '#CDBB9A'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(29, 34, 39, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.paperStrong,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: SCREEN_THEME.textMuted,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '700',
  },
  title: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 22,
  },
  subtitle: {
    marginTop: 8,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 18,
  },
  starBtn: {
    minWidth: 54,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React from 'react';
import { Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';

type PremiumPromoNoticeProps = {
  visible: boolean;
  onClose: () => void;
};

const COPY = {
  ua: {
    badge: 'Гарна новина',
    title: 'Перші 500 користувачів отримають Premium назавжди',
    body: 'Зараз триває пробний період застосунку, тому всі функції відкриті безкоштовно.',
    button: 'Чудово',
  },
  ru: {
    badge: 'Хорошая новость',
    title: 'Первые 500 пользователей получат Premium навсегда',
    body: 'Сейчас действует пробный период приложения, поэтому все функции открыты бесплатно.',
    button: 'Отлично',
  },
  en: {
    badge: 'Good news',
    title: 'The first 500 users get Premium forever',
    body: 'The app is currently in its trial period, so all features are available for free.',
    button: 'Great',
  },
} as const;

export default function PremiumPromoNotice({ visible, onClose }: PremiumPromoNoticeProps) {
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = COPY[language];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.screen}>
          <View style={styles.glow} />
          <View style={styles.card}>
            <View style={styles.logoWrap}>
              <Image source={require('../../assets/Logo-Chaika LIFE.png')} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>{text.badge}</Text>
            </View>

            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.body}>{text.body}</Text>

            <TouchableOpacity style={styles.button} onPress={onClose} activeOpacity={0.86}>
              <Text style={styles.buttonText}>{text.button}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#F4E7CF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: '#F4E7CF',
  },
  glow: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(199, 156, 71, 0.18)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    backgroundColor: '#FFF8ED',
    borderWidth: 1,
    borderColor: '#E6CFA3',
    alignItems: 'center',
    shadowColor: '#4B2E1B',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  logoWrap: {
    width: 108,
    height: 108,
    borderRadius: 30,
    backgroundColor: '#2C2342',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginBottom: 16,
    shadowColor: '#2C2342',
    shadowOpacity: 0.26,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  badge: {
    backgroundColor: '#F3E0BA',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  badgeText: {
    color: '#6F4524',
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: '#2A1E18',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    color: '#6A5446',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  button: {
    marginTop: 18,
    minWidth: 150,
    borderRadius: 18,
    backgroundColor: SCREEN_THEME.terracotta,
    paddingHorizontal: 22,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
  },
  buttonText: {
    color: '#FFF8EF',
    fontSize: 15,
    fontWeight: '900',
  },
});



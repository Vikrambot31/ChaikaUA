import React from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import MiniTabBar from '../components/MiniTabBar';
import TactileIcon from '../components/TactileIcon';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';

const DOWNLOAD_URL = 'https://chaika-life.netlify.app/';
const QR_IMAGE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(DOWNLOAD_URL)}`;

const UI_TEXT = {
  ua: {
    heroTitle: 'Завантажити застосунок',
    heroSubtitle: 'Оберіть зручний спосіб, щоб відкрити Chaika Life на телефоні за кілька секунд.',
    qrTitle: 'QR-код',
    qrDescription: 'Скануйте код камерою телефону для швидкого встановлення застосунку.',
    qrNote: 'Підійде для швидкого переходу без ручного введення посилання.',
    linkTitle: 'Пряме посилання',
    linkDescription: 'Використайте посилання, якщо хочете надіслати його в месенджер або відкрити на іншому пристрої.',
    storesTitle: 'Магазини застосунків',
    storesDescription: 'Незабаром Chaika Life можна буде встановити напряму з улюбленого магазину.',
  },
  ru: {
    heroTitle: 'Скачать приложение',
    heroSubtitle: 'Выберите удобный способ, чтобы открыть Chaika Life на телефоне за пару секунд.',
    qrTitle: 'QR-код',
    qrDescription: 'Сканируйте код камерой телефона для быстрой установки приложения.',
    qrNote: 'Подходит для быстрого перехода без ручного ввода ссылки.',
    linkTitle: 'Прямая ссылка',
    linkDescription: 'Используйте ссылку, если хотите отправить ее в мессенджер или открыть на другом устройстве.',
    storesTitle: 'Магазины приложений',
    storesDescription: 'Скоро Chaika Life можно будет установить напрямую из привычного магазина.',
  },
  en: {
    heroTitle: 'Download the app',
    heroSubtitle: 'Choose a convenient way to open Chaika Life on your phone in seconds.',
    qrTitle: 'QR code',
    qrDescription: 'Scan the code with your phone camera for quick app installation.',
    qrNote: 'Great for quick access without typing the link manually.',
    linkTitle: 'Direct link',
    linkDescription: 'Use the link if you want to share it in a messenger or open it on another device.',
    storesTitle: 'App stores',
    storesDescription: 'Soon you will be able to install Chaika Life directly from your app store.',
  },
} as const;

const DownloadCodeScreen: React.FC = () => {
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{text.heroTitle}</Text>
          <Text style={styles.heroSubtitle}>{text.heroSubtitle}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TactileIcon icon="qrcode" size={50} iconSize={22} backgroundColor={SCREEN_THEME.terracottaDark} />
            <Text style={styles.cardTitle}>{text.qrTitle}</Text>
          </View>
          <Text style={styles.cardDescription}>{text.qrDescription}</Text>
          <View style={styles.qrBox}>
            <Image source={{ uri: QR_IMAGE_URL }} style={styles.qrImage} resizeMode="contain" />
          </View>
          <Text style={styles.note}>{text.qrNote}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TactileIcon icon="link-variant" size={50} iconSize={22} backgroundColor={SCREEN_THEME.woodGreenDark} />
            <Text style={styles.cardTitle}>{text.linkTitle}</Text>
          </View>
          <Text style={styles.cardDescription}>{text.linkDescription}</Text>
          <View style={styles.linkCard}>
            <Text style={styles.link}>{DOWNLOAD_URL}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <TactileIcon icon="apps-box" size={50} iconSize={22} backgroundColor={SCREEN_THEME.enamelBlueDark} />
            <Text style={styles.cardTitle}>{text.storesTitle}</Text>
          </View>
          <Text style={styles.cardDescription}>{text.storesDescription}</Text>
          <View style={styles.storeRow}>
            <View style={styles.storeButton}>
              <MaterialCommunityIcons name="google-play" size={30} color={SCREEN_THEME.terracottaDark} />
              <Text style={styles.storeButtonText}>Google Play</Text>
            </View>
            <View style={styles.storeButton}>
              <MaterialCommunityIcons name="apple" size={30} color={SCREEN_THEME.terracottaDark} />
              <Text style={styles.storeButtonText}>App Store</Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 34, gap: 16 },
  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadowDeep,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroTitle: {
    marginTop: 16,
    fontSize: 27,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  cardDescription: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 21,
    color: SCREEN_THEME.textSecondary,
  },
  qrBox: {
    marginTop: 16,
    alignSelf: 'center',
    width: 158,
    height: 158,
    borderRadius: 24,
    backgroundColor: '#FFFDF7',
    borderWidth: 1,
    borderColor: '#E8D5AC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: {
    width: 140,
    height: 140,
  },
  note: {
    marginTop: 14,
    fontSize: 13,
    lineHeight: 19,
    color: SCREEN_THEME.textMuted,
    textAlign: 'center',
  },
  linkCard: {
    marginTop: 16,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#E8D5AC',
  },
  link: {
    fontSize: 15,
    fontWeight: '700',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  storeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  storeButton: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 18,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#E8D5AC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeButtonText: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
  },
});

export default DownloadCodeScreen;


import React, { useState } from 'react';
import { Alert, Image, Linking, SafeAreaView, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MiniTabBar from '../components/MiniTabBar';
import { useTranslation } from '../i18n/useTranslation';
import TactileIcon from '../components/TactileIcon';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';

const APP_URL = 'https://chaika-life.netlify.app/';
const QR_IMAGE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(APP_URL)}`;

export default function QRCodeScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { language } = useTranslation();
  const [qrError, setQrError] = useState(false);

  const t = language === 'ru'
    ? {
        title: 'Поделиться приложением',
        share: 'Поделиться ссылкой',
        copied: 'Ссылка готова',
        open: 'Показать ссылку',
        subtitle: 'Отправьте ссылку соседям или друзьям, чтобы они быстро установили приложение.',
        errorTitle: 'Ошибка',
        shareError: 'Не удалось поделиться ссылкой.',
      }
    : language === 'en'
      ? {
          title: 'Share app',
          share: 'Share link',
          copied: 'Link ready',
          open: 'Show link',
          subtitle: 'Send the app link to friends so they can install it quickly.',
          errorTitle: 'Error',
          shareError: 'Could not share the link.',
        }
      : {
          title: 'Поділитися додатком',
          share: 'Поділитися посиланням',
          copied: 'Посилання готове',
          open: 'Показати посилання',
          subtitle: 'Надішліть посилання сусідам або друзям, щоб вони швидко встановили додаток.',
          errorTitle: 'Помилка',
          shareError: 'Не вдалося поділитися посиланням.',
        };

  const onShare = async () => {
    try {
      await Share.share({ message: `Chaika Life\n${APP_URL}` });
    } catch {
      Alert.alert(t.errorTitle, t.shareError);
    }
  };

  const onOpenUrl = async () => {
    try {
      await Linking.openURL(APP_URL);
    } catch {
      Alert.alert(t.errorTitle, APP_URL);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.subtitle}>{t.subtitle}</Text>

          <View style={styles.qrShell}>
            <View style={styles.qrCard}>
              {!qrError ? (
                <Image
                  source={{ uri: QR_IMAGE_URL }}
                  style={styles.qrImage}
                  resizeMode="contain"
                  onError={() => setQrError(true)}
                />
              ) : (
                <View style={styles.qrFallback}>
                  <MaterialCommunityIcons name="qrcode" size={64} color="#2D2016" />
                  <Text style={styles.qrFallbackText}>{APP_URL}</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.urlCard} onPress={onOpenUrl} activeOpacity={0.85}>
            <Text style={styles.urlLabel}>Chaika Life</Text>
            <Text style={styles.url}>{APP_URL}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button} onPress={onShare} activeOpacity={0.88}>
            <TactileIcon icon="share-variant-outline" size={42} iconSize={18} backgroundColor="#7A4B36" tint="#FFF3CE" />
            <Text style={styles.buttonText}>{t.share}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.ghost} onPress={onOpenUrl}>
            <Text style={styles.ghostText}>{t.open}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#F1E1BC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0C89A',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    paddingHorizontal: 12,
  },
  headerSpacer: { width: 42 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 34 },
  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 30,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadowDeep,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    alignItems: 'center',
  },
  title: {
    marginTop: 16,
    fontSize: 24,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
  },
  qrShell: {
    marginTop: 22,
    borderRadius: 28,
    padding: 10,
    backgroundColor: '#EED9B4',
    borderWidth: 1,
    borderColor: '#DEC28E',
  },
  qrCard: {
    width: 210,
    height: 210,
    borderRadius: 24,
    backgroundColor: '#FFFDF7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9DABB',
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  urlCard: {
    width: '100%',
    marginTop: 18,
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#E8D5AC',
  },
  urlLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: SCREEN_THEME.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  url: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
  },
  button: {
    marginTop: 18,
    width: '100%',
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: SCREEN_THEME.terracotta,
    borderWidth: 1,
    borderColor: SCREEN_THEME.terracottaDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: { color: '#FFF9EE', fontWeight: '900', fontSize: 16 },
  ghost: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 16 },
  ghostText: { color: SCREEN_THEME.textSecondary, fontWeight: '800' },
  qrFallback: { alignItems: 'center', justifyContent: 'center', padding: 16, gap: 10 },
  qrFallbackText: { fontSize: 11, color: SCREEN_THEME.textSecondary, textAlign: 'center', fontWeight: '700' },
});

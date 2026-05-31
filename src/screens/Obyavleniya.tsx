import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import MiniTabBar from '../components/MiniTabBar';
import { useTranslation } from '../i18n/useTranslation';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';

const AnnouncementsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const { t } = useTranslation();
  const text = t.announcements;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.82} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>‹ {text.back}</Text>
        </TouchableOpacity>
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>{text.title}</Text>
          <Text style={styles.headerSubtitle}>{text.subtitle}</Text>
        </View>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('JobSearchScreen')} activeOpacity={0.85}>
          <View style={styles.cardRow}>
            <TactileIcon icon="briefcase-search-outline" size={52} iconSize={24} backgroundColor="#D05B4D" />
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{text.jobs}</Text>
              <Text style={styles.cardSub}>{text.jobsSub}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('BuySellScreen')} activeOpacity={0.85}>
          <View style={styles.cardRow}>
            <TactileIcon icon="shopping-outline" size={52} iconSize={24} backgroundColor={SCREEN_THEME.terracotta} />
            <View style={styles.cardCopy}>
              <Text style={styles.cardTitle}>{text.market}</Text>
              <Text style={styles.cardSub}>{text.marketSub}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{text.infoTitle}</Text>
          <Text style={styles.infoText}>{text.info}</Text>
        </View>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingTop: 16, paddingBottom: 110 },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  backButtonText: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  headerCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 28, padding: 18, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E4D0AB' },
  headerTitle: { color: SCREEN_THEME.textPrimary, fontSize: 24, fontWeight: '900', marginTop: 8 },
  headerSubtitle: { color: SCREEN_THEME.textSecondary, marginTop: 6, textAlign: 'center' },
  card: { borderRadius: 24, padding: 16, marginBottom: 12, backgroundColor: SCREEN_THEME.paperStrong, borderWidth: 1, borderColor: '#E4D0AB' },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardCopy: { flex: 1, marginLeft: 12 },
  cardTitle: { color: SCREEN_THEME.textPrimary, fontSize: 18, fontWeight: '900' },
  cardSub: { color: SCREEN_THEME.textSecondary, marginTop: 4 },
  infoCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 20, padding: 14, marginTop: 4, borderWidth: 1, borderColor: '#E4D0AB' },
  infoTitle: { fontSize: 14, fontWeight: '800', color: SCREEN_THEME.textPrimary, marginBottom: 6 },
  infoText: { color: SCREEN_THEME.textSecondary, lineHeight: 20 },
});

export default AnnouncementsScreen;


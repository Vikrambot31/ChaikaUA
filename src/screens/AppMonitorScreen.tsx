import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import type { RootState } from '../redux/store';

type AppNavigation = import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;

const AppMonitorScreen: React.FC = () => {
  const navigation = useNavigation<AppNavigation>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';

  const title = language === 'en' ? 'Application Monitor' : language === 'ru' ? 'Монитор Приложения' : 'Монітор Застосунку';
  const notifications = language === 'en' ? 'Notifications' : language === 'ru' ? 'Уведомления' : 'Сповіщення';
  const authDiagnostics = language === 'en' ? 'Auth diagnostics' : language === 'ru' ? 'Диагностика входа' : 'Діагностика входу';
  const errorMonitor = language === 'en' ? 'Error monitor' : language === 'ru' ? 'Монитор ошибок' : 'Монітор помилок';
  
  const crashDiagnostics = language === 'en' ? 'Crash diagnostics' : language === 'ru' ? 'Диагностика сбоев' : 'Діагностика збоїв';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.title}>{title}</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('NotificationSettingsScreen')} activeOpacity={0.84}>
            <MaterialCommunityIcons name="bell-outline" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.menuLabel}>{notifications}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AuthDiagnosticScreen')} activeOpacity={0.84}>
            <MaterialCommunityIcons name="shield-account-outline" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.menuLabel}>{authDiagnostics}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('UserErrorMonitorScreen')} activeOpacity={0.84}>
            <MaterialCommunityIcons name="alert-decagram-outline" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.menuLabel}>{errorMonitor}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => navigation.navigate('CrashDiagnosticsScreen')} activeOpacity={0.84}>
            <MaterialCommunityIcons name="bug-check-outline" size={20} color={SCREEN_THEME.textPrimary} />
            <Text style={styles.menuLabel}>{crashDiagnostics}</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  backgroundLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 36,
    gap: 16,
  },
  heroCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadowDeep,
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    textAlign: 'center',
  },
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    shadowColor: SCREEN_THEME.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  menuItem: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: '#FFFDF6',
    borderWidth: 1,
    borderColor: '#E7D6B3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  menuItemLast: {
    marginBottom: 0,
  },
  menuLabel: {
    flex: 1,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
});

export default AppMonitorScreen;


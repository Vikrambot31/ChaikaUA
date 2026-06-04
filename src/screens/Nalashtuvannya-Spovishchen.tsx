import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import MiniTabBar from '../components/MiniTabBar';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import TactileIcon from '../components/TactileIcon';
import TactileCard from '../components/TactileCard';
import { RootState } from '../redux/store';
import { setFCMToken } from '../redux/slices/authSlice';
import { fcmAPI } from '../firebase-config';
import { DEFAULT_NOTIFICATION_PREFS, NotificationPrefs, loadNotificationPrefs, saveNotificationPrefs } from '../utils/notificationPrefs';

type AppNavigation = import('@react-navigation/native').NavigationProp<Record<string, object | undefined>>;
type Language = 'ua' | 'ru' | 'en';

type ScreenText = {
  title: string;
  enableTitle: string;
  enableText: string;
  enableButton: string;
  categories: string;
  requests: string;
  requestsDesc: string;
  chat: string;
  chatDesc: string;
  osbb: string;
  osbbDesc: string;
  electricity: string;
  electricityDesc: string;
  general: string;
  generalDesc: string;
  testTitle: string;
  testBody: string;
  testButton: string;
  testCardTitle: string;
  testCardText: string;
  testSuccessTitle: string;
  testSuccessText: string;
  testFailed: string;
  errorTitle: string;
  enableFailed: string;
  permissionDenied: string;
};

const SCREEN_TEXT: Record<Language, ScreenText> = {
  ru: {
    title: 'Уведомления',
    enableTitle: 'Уведомления включены',
    enableText: 'Приложение теперь может отправлять уведомления на этот телефон.',
    enableButton: 'Включить уведомления',
    categories: 'Категории уведомлений',
    requests: 'Заявки соседей',
    requestsDesc: 'Новые заявки и ответы на ваши',
    chat: 'Чат и сообщения',
    chatDesc: 'Голосовые и текстовые сообщения',
    osbb: 'ОСББ',
    osbbDesc: 'Новости, сборы и голосования',
    electricity: 'Статус света',
    electricityDesc: 'Изменения в подаче электроэнергии',
    general: 'Общие',
    generalDesc: 'Обновления приложения и важные уведомления',
    testTitle: 'Тест уведомлений',
    testBody: 'Если вы видите это сообщение, уведомления на устройстве работают.',
    testButton: 'Проверить уведомления',
    testCardTitle: 'Проверка на этом телефоне',
    testCardText: 'Кнопка ниже отправляет локальное уведомление прямо на устройство без сервера.',
    testSuccessTitle: 'Тест отправлен',
    testSuccessText: 'На телефон отправлено локальное тестовое уведомление.',
    testFailed: 'Не удалось отправить тестовое уведомление.',
    errorTitle: 'Ошибка',
    enableFailed: 'Не удалось включить уведомления',
    permissionDenied: 'Система не выдала разрешение на уведомления. Проверьте настройки телефона.',
  },
  en: {
    title: 'Notifications',
    enableTitle: 'Notifications enabled',
    enableText: 'The app can now send notifications to this phone.',
    enableButton: 'Enable notifications',
    categories: 'Notification categories',
    requests: 'Neighbor requests',
    requestsDesc: 'New requests and replies to yours',
    chat: 'Chat and messages',
    chatDesc: 'Voice and text messages',
    osbb: 'OSBB',
    osbbDesc: 'News, collections and voting',
    electricity: 'Power status',
    electricityDesc: 'Electricity supply changes',
    general: 'General',
    generalDesc: 'App updates and important alerts',
    testTitle: 'Notification test',
    testBody: 'If you can see this message, notifications are working on this device.',
    testButton: 'Test notifications',
    testCardTitle: 'Check this phone',
    testCardText: 'The button below sends a local notification directly to the device without the server.',
    testSuccessTitle: 'Test sent',
    testSuccessText: 'A local test notification was sent to this phone.',
    testFailed: 'Failed to send a test notification.',
    errorTitle: 'Error',
    enableFailed: 'Failed to enable notifications',
    permissionDenied: 'The system did not grant notification permission. Check your phone settings.',
  },
  ua: {
    title: 'Сповіщення',
    enableTitle: 'Сповіщення увімкнено',
    enableText: 'Додаток тепер може надсилати сповіщення на цей телефон.',
    enableButton: 'Увімкнути сповіщення',
    categories: 'Категорії сповіщень',
    requests: 'Заявки сусідів',
    requestsDesc: 'Нові заявки та відповіді на ваші',
    chat: 'Чат та повідомлення',
    chatDesc: 'Голосові та текстові повідомлення',
    osbb: 'ОСББ',
    osbbDesc: 'Новини, збори та голосування',
    electricity: 'Статус світла',
    electricityDesc: 'Зміни в подачі електроенергії',
    general: 'Загальні',
    generalDesc: 'Оновлення додатку та важливі сповіщення',
    testTitle: 'Тест сповіщень',
    testBody: 'Якщо ви бачите це повідомлення, сповіщення на пристрої працюють.',
    testButton: 'Перевірити сповіщення',
    testCardTitle: 'Перевірка на цьому телефоні',
    testCardText: 'Кнопка нижче надсилає локальне сповіщення прямо на пристрій без сервера.',
    testSuccessTitle: 'Тест відправлено',
    testSuccessText: 'На телефон відправлено локальне тестове сповіщення.',
    testFailed: 'Не вдалося відправити тестове сповіщення.',
    errorTitle: 'Помилка',
    enableFailed: 'Не вдалося увімкнути сповіщення',
    permissionDenied: 'Система не надала дозвіл на сповіщення. Перевірте налаштування телефону.',
  },
};

export default function NotificationSettingsScreen() {
  const navigation = useNavigation<AppNavigation>();
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Language;
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const text = useMemo(() => SCREEN_TEXT[language] ?? SCREEN_TEXT.ua, [language]);

  useEffect(() => {
    const load = async () => {
      try {
        setPrefs(await loadNotificationPrefs());
        const { status } = await Notifications.getPermissionsAsync();
        setPermissionGranted(status === 'granted');
      } catch {
        setPermissionGranted(false);
      }
    };

    void load();
  }, []);

  const savePrefs = useCallback(async (newPrefs: NotificationPrefs) => {
    setPrefs(newPrefs);
    await saveNotificationPrefs(newPrefs);
  }, []);

  const togglePref = useCallback((key: keyof NotificationPrefs) => {
    const newPrefs = { ...prefs, [key]: !prefs[key] };
    void savePrefs(newPrefs);
  }, [prefs, savePrefs]);

  const requestPermission = useCallback(async () => {
    try {
      const token = await fcmAPI.registerToken();
      const { status } = await Notifications.requestPermissionsAsync();
      const granted = status === 'granted';

      setPermissionGranted(granted);

      if (granted && user?.id && token) {
        dispatch(setFCMToken(token));
        await fcmAPI.saveTokenForUser(user.id, token);
      }

      if (granted) {
        Alert.alert(text.enableTitle, text.enableText);
      } else {
        Alert.alert(text.errorTitle, text.permissionDenied);
      }
    } catch {
      Alert.alert(text.errorTitle, text.enableFailed);
    }
  }, [dispatch, text, user?.id]);

  const sendTestNotification = useCallback(async () => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: text.testTitle,
          body: text.testBody,
          sound: true,
        },
        trigger: null,
      });
      Alert.alert(text.testSuccessTitle, text.testSuccessText);
    } catch {
      Alert.alert(text.errorTitle, text.testFailed);
    }
  }, [text]);

  const toggleItems: Array<{ key: keyof NotificationPrefs; icon: string; color: string; title: string; desc: string }> = [
    { key: 'requests', icon: 'hand-heart-outline', color: '#C79C47', title: text.requests, desc: text.requestsDesc },
    { key: 'chat', icon: 'chat-outline', color: '#4B7F9E', title: text.chat, desc: text.chatDesc },
    { key: 'osbb', icon: 'home-city-outline', color: '#8A7AB1', title: text.osbb, desc: text.osbbDesc },
    { key: 'electricity', icon: 'lightning-bolt-outline', color: '#E8A838', title: text.electricity, desc: text.electricityDesc },
    { key: 'general', icon: 'bell-outline', color: '#607D8B', title: text.general, desc: text.generalDesc },
  ];

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
        <Text style={styles.headerTitle}>{text.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!permissionGranted && (
          <TactileCard elevated style={styles.card} pressable={false}>
            <View style={styles.enableRow}>
              <TactileIcon icon="bell-ring-outline" size={48} iconSize={22} backgroundColor={SCREEN_THEME.terracotta} />
              <View style={styles.enableCopy}>
                <Text style={styles.enableTitle}>{text.enableButton}</Text>
                <Text style={styles.enableText}>{text.enableText}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.enableBtn} onPress={requestPermission} activeOpacity={0.85}>
              <Text style={styles.enableBtnText}>{text.enableButton}</Text>
            </TouchableOpacity>
          </TactileCard>
        )}

        <Text style={styles.sectionLabel}>{text.categories}</Text>

        <TactileCard elevated style={styles.card} pressable={false}>
          {toggleItems.map((item, i) => (
            <View key={item.key} style={[styles.toggleRow, i < toggleItems.length - 1 && styles.toggleRowBorder]}>
              <TactileIcon icon={item.icon as never} size={40} iconSize={18} backgroundColor={item.color} />
              <View style={styles.toggleCopy}>
                <Text style={styles.toggleTitle}>{item.title}</Text>
                <Text style={styles.toggleDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={prefs[item.key]}
                onValueChange={() => togglePref(item.key)}
                trackColor={{ false: '#D4C8BA', true: SCREEN_THEME.woodGreen }}
                thumbColor={prefs[item.key] ? '#fff' : '#E8DDD0'}
                disabled={!permissionGranted}
              />
            </View>
          ))}
        </TactileCard>

        <TactileCard elevated style={styles.card} pressable={false}>
          <View style={styles.enableRow}>
            <TactileIcon icon="bell-check-outline" size={48} iconSize={22} backgroundColor={SCREEN_THEME.woodGreen} />
            <View style={styles.enableCopy}>
              <Text style={styles.enableTitle}>{text.testCardTitle}</Text>
              <Text style={styles.enableText}>{text.testCardText}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.enableBtn, !permissionGranted && styles.enableBtnDisabled]}
            onPress={sendTestNotification}
            activeOpacity={0.85}
            disabled={!permissionGranted}
          >
            <Text style={styles.enableBtnText}>{text.testButton}</Text>
          </TouchableOpacity>
        </TactileCard>
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    marginBottom: 8,
    marginTop: 18,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: { marginBottom: 14 },
  enableRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  enableCopy: { marginLeft: 12, flex: 1 },
  enableTitle: { fontSize: 16, fontWeight: '800', color: SCREEN_THEME.textPrimary },
  enableText: { fontSize: 13, color: SCREEN_THEME.textSecondary, marginTop: 3 },
  enableBtn: {
    backgroundColor: SCREEN_THEME.woodGreen,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  enableBtnDisabled: {
    opacity: 0.45,
  },
  enableBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#EDE4DA',
  },
  toggleCopy: { marginLeft: 12, flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '700', color: SCREEN_THEME.textPrimary },
  toggleDesc: { fontSize: 12, color: SCREEN_THEME.textSecondary, marginTop: 2 },
});


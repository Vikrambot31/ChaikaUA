import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { useDispatch, useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BUILDINGS, getBuildingsByStreet, getStreets, getFullAddress } from '../data/buildings';
import {
  addReport,
  selectTodayReports,
  selectElectricityError,
  clearError,
} from '../redux/slices/electricitySlice';
import { firebaseChatAPI } from '../firebase-config';
import { COLORS, SIZES } from '../utils/constants';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileCard from '../components/TactileCard';
import TactileIcon from '../components/TactileIcon';
import TactileButton from '../components/TactileButton';
import MiniTabBar from '../components/MiniTabBar';
import type { RootState } from '../redux/store';
import { selectUser } from '../redux/selectors';
import type { AppDispatch } from '../redux/store';
import { createPendingModeration } from '../utils/moderation';
import { showUserError } from '../utils/userFacingErrors';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { pickUserAvatarUri } from '../utils/userAvatar';

const RATE_LIMIT_KEY = 'electricity_report_timestamps';
const MAX_PER_DAY = 2;
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

const getTs = (value: Date | string): number => {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseNumberArray = (raw: string | null): number[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : [];
  } catch {
    return [];
  }
};

const UI_TEXT = {
  ua: {
    title: 'СВІТЛО: ПОВІДОМЛЕННЯ СУСІДІВ',
    subtitle: 'Це не офіційний моніторинг мережі, а свіжі повідомлення мешканців вашого будинку',
    errorNotLoggedIn: 'Лише зареєстровані користувачі можуть повідомляти про статус світла',
    errorDailyLimit: 'Ви вже надіслали 2 повідомлення сьогодні',
    errorInterval: 'Між повідомленнями має бути не менше 4 годин',
    selectStatus: 'Виберіть статус',
    btnOn: 'СВІТЛО Є',
    btnOnSub: 'Електрика працює',
    btnOff: 'СВІТЛО НЕМА',
    btnOffSub: 'Немає електрики',
    whereAreYou: 'Де ви знаходитесь?',
    selectStreet: 'Виберіть вулицю...',
    selectBuilding: 'Виберіть будинок...',
    building: 'Будинок',
    helper: 'ℹ️ Дані базуються на повідомленнях мешканців і можуть відрізнятися від офіційного графіка',
    todayStatus: 'Світло сьогодні у вашому будинку',
    allReports: 'Усі звіти сьогодні в комплексі',
    recentFeed: 'Останні повідомлення мешканців',
    lightOn: '✅ Світло є',
    lightOff: '🕯️ Світло нема',
    lightOnShort: 'Світло є',
    lightOffShort: 'Світло нема',
    successTitle: 'Успішно!',
    successMsg: 'Світло оновлено для',
    errorSelect: 'Будь ласка, виберіть вулицю та дім',
    errorUpdate: 'Не вдалося оновити статус',
    errorTitle: 'Помилка',
    resident: 'Мешканець',
    retry: 'Спробуйте знову',
    chatTextOn: '⚡ Світло є',
    chatTextOff: '🕯️ Нема світла',
  },
  ru: {
    title: 'СВЕТ: СООБЩЕНИЯ СОСЕДЕЙ',
    subtitle: 'Это не официальный мониторинг сети, а свежие сообщения жителей вашего дома',
    errorNotLoggedIn: 'Только зарегистрированные пользователи могут сообщать о статусе света',
    errorDailyLimit: 'Вы уже отправили 2 сообщения сегодня',
    errorInterval: 'Между сообщениями должно быть не менее 4 часов',
    selectStatus: 'Выберите статус',
    btnOn: 'СВЕТ ЕСТЬ',
    btnOnSub: 'Электричество работает',
    btnOff: 'СВЕТА НЕТ',
    btnOffSub: 'Нет электричества',
    whereAreYou: 'Где вы находитесь?',
    selectStreet: 'Выберите улицу...',
    selectBuilding: 'Выберите дом...',
    building: 'Дом',
    helper: 'ℹ️ Данные основаны на сообщениях жителей и могут отличаться от официального графика',
    todayStatus: 'Свет сегодня в вашем доме',
    allReports: 'Все отчёты сегодня в комплексе',
    recentFeed: 'Последние сообщения жителей',
    lightOn: '✅ Свет есть',
    lightOff: '🕯️ Света нет',
    lightOnShort: 'Свет есть',
    lightOffShort: 'Света нет',
    successTitle: 'Успешно!',
    successMsg: 'Свет обновлён для',
    errorSelect: 'Пожалуйста, выберите улицу и дом',
    errorUpdate: 'Не удалось обновить статус',
    errorTitle: 'Ошибка',
    resident: 'Житель',
    retry: 'Попробовать снова',
    chatTextOn: '⚡ Свет есть',
    chatTextOff: '🕯️ Нет света',
  },
  en: {
    title: 'POWER: NEIGHBOR REPORTS',
    subtitle: 'This is not official grid monitoring, only recent resident reports for your building',
    errorNotLoggedIn: 'Only registered users can report power status',
    errorDailyLimit: 'You\'ve already sent 2 reports today',
    errorInterval: 'Please wait 4 hours between reports',
    selectStatus: 'Select status',
    btnOn: 'POWER ON',
    btnOnSub: 'Electricity is working',
    btnOff: 'POWER OFF',
    btnOffSub: 'No electricity',
    whereAreYou: 'Where are you?',
    selectStreet: 'Select street...',
    selectBuilding: 'Select building...',
    building: 'Building',
    helper: 'ℹ️ Data comes from resident reports and may differ from the official schedule',
    todayStatus: "Today's status in your building",
    allReports: 'All reports today in the complex',
    recentFeed: 'Latest resident reports',
    lightOn: '✅ Power on',
    lightOff: '🕯️ Power off',
    lightOnShort: 'Power on',
    lightOffShort: 'Power off',
    successTitle: 'Done!',
    successMsg: 'Status updated for',
    errorSelect: 'Please select a street and building',
    errorUpdate: 'Failed to update status',
    errorTitle: 'Error',
    resident: 'Resident',
    retry: 'Try again',
    chatTextOn: '⚡ Power on',
    chatTextOff: '🕯️ No power',
  },
} as const;

const ElectricityStatusScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const text = UI_TEXT[language];
  const [selectedStreet, setSelectedStreet] = useState<string>('');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const todayReports = useSelector((state: RootState) => selectTodayReports(state));
  const error = useSelector((state: RootState) => selectElectricityError(state));
  const [submitting, setSubmitting] = useState(false);
  const user = useSelector(selectUser);

  const streets = useMemo(() => getStreets(), []);
  const buildingsInStreet = useMemo(
    () => (selectedStreet ? getBuildingsByStreet(selectedStreet) : []),
    [selectedStreet]
  );
  const selectedBuilding = useMemo(
    () => BUILDINGS.find((b) => b.id === selectedBuildingId),
    [selectedBuildingId]
  );

  const buildingReports = useMemo(
    () => todayReports.filter((r) => r.buildingId === selectedBuildingId),
    [todayReports, selectedBuildingId]
  );

  const latestReports = useMemo(() => {
    return [...todayReports]
      .sort((a, b) => getTs(b.createdAt) - getTs(a.createdAt))
      .slice(0, 10);
  }, [todayReports]);

  const bottomFeedReports = useMemo(() => {
    return [...todayReports]
      .sort((a, b) => getTs(b.createdAt) - getTs(a.createdAt))
      .slice(0, 5);
  }, [todayReports]);

  const formatReportDateTime = useCallback((value: Date | string) => {
    const dt = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(dt.getTime())) return '--';
    const locale = language === 'ru' ? 'ru-RU' : language === 'en' ? 'en-GB' : 'uk-UA';
    return dt.toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [language]);

  const handleStreetChange = (street: string) => {
    setSelectedStreet(street);
    setSelectedBuildingId('');
  };

  const handleBuildingChange = (buildingId: string) => {
    setSelectedBuildingId(buildingId);
  };

  const handleStatusSubmit = useCallback(
    async (status: 'on' | 'off') => {
      if (!user) {
        Alert.alert(text.errorTitle, text.errorNotLoggedIn);
        return;
      }

      if (!selectedStreet || !selectedBuildingId) {
        Alert.alert(text.errorTitle, text.errorSelect);
        return;
      }

      // Rate limit check
      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const stored = await AsyncStorage.getItem(RATE_LIMIT_KEY);
      const timestamps = parseNumberArray(stored);
      const todayTs = timestamps.filter((ts) => ts >= todayStart.getTime()).sort((a, b) => a - b);
      if (todayTs.length >= MAX_PER_DAY) {
        Alert.alert(text.errorTitle, text.errorDailyLimit);
        return;
      }
      if (todayTs.length > 0 && now - todayTs[todayTs.length - 1] < MIN_INTERVAL_MS) {
        Alert.alert(text.errorTitle, text.errorInterval);
        return;
      }

      setSubmitting(true);
      try {
        const report = {
          id: `elec-${Date.now()}`,
          buildingId: selectedBuildingId,
          status: status as 'on' | 'off',
          createdAt: new Date(),
          userId: user.id,
          userName: user?.name || text.resident,
          userPhone: user?.phone || '',
          userPhotoURL: user.photoURL || '',
          startAvatarKey: user.startAvatarKey,
          ...createPendingModeration(),
        };

        dispatch(addReport(report));
        await AsyncStorage.setItem(RATE_LIMIT_KEY, JSON.stringify([...todayTs, now]));

        const address = selectedBuilding ? getFullAddress(selectedBuilding) : '';
        const statusText = status === 'on' ? text.lightOn : text.lightOff;
        const chatText = status === 'on'
          ? `${text.chatTextOn} — ${address}`
          : `${text.chatTextOff} — ${address}`;

        void firebaseChatAPI.addRequest({
          name: user?.name || text.resident,
          phone: user?.phone || '',
          language,
          category: 'electricity',
          group: 'electricity',
          subcategory: status === 'on' ? 'power_on' : 'power_off',
          building: address,
          text: chatText,
          description: chatText,
          userPhotoURL: user?.photoURL || '',
          startAvatarKey: user?.startAvatarKey || '',
        });

        Alert.alert(
          text.successTitle,
          `${text.successMsg} ${address}\n${statusText}`
        );
      } catch (err) {
        showUserError(language, 'send', err);
      } finally {
        setSubmitting(false);
      }
    },
    [selectedStreet, selectedBuildingId, selectedBuilding, dispatch, user?.id, user?.name, user?.phone, user?.photoURL, user?.startAvatarKey, language]
  );

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <TactileIcon icon="alert-circle" size={56} iconSize={28} backgroundColor={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TactileButton title={text.retry} onPress={() => dispatch(clearError())} variant="primary" style={{ marginTop: 16 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerImageFrame}>
          <Image
            source={require('../../assets/ImageToStl.com_svet-plus2.webp')}
            style={styles.headerImage}
            resizeMode="cover"
          />
        </View>

        <TactileCard elevated style={styles.statusCard} pressable={false}>
          <Text style={styles.cardTitle}>{text.selectStatus}</Text>

          <View style={styles.statusButtonsRow}>
            <TactileCard
              onPress={() => { if (!submitting) void handleStatusSubmit('on'); }}
              style={styles.statusButtonOn}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <View style={styles.ledIndicatorOn}>
                    <View style={styles.ledGlow} />
                    <View style={styles.ledShine} />
                  </View>
                  <MaterialCommunityIcons name="lightning-bolt" size={24} color="#FFFFFF" />
                  <Text style={styles.statusButtonText}>{text.btnOn}</Text>
                  <Text style={styles.statusButtonSubtext}>{text.btnOnSub}</Text>
                </>
              )}
            </TactileCard>

            <TactileCard
              onPress={() => { if (!submitting) void handleStatusSubmit('off'); }}
              style={styles.statusButtonOff}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <View style={styles.ledIndicatorOff}>
                    <View style={styles.ledShine} />
                  </View>
                  <MaterialCommunityIcons name="candle" size={24} color="#FFFFFF" />
                  <Text style={styles.statusButtonText}>{text.btnOff}</Text>
                  <Text style={styles.statusButtonSubtext}>{text.btnOffSub}</Text>
                </>
              )}
            </TactileCard>
          </View>
        </TactileCard>

        <TactileCard elevated style={styles.formCard} pressable={false}>
          <Text style={styles.cardTitle}>{text.whereAreYou}</Text>

          {/* Street Picker */}
          <View style={styles.pickerContainer}>
            <MaterialCommunityIcons name="road" size={20} color={COLORS.primary} />
            <Picker
              style={styles.picker}
              selectedValue={selectedStreet}
              onValueChange={handleStreetChange}
              mode="dropdown"
            >
              <Picker.Item label={text.selectStreet} value="" />
              {streets.map((street) => (
                <Picker.Item key={street} label={street} value={street} />
              ))}
            </Picker>
          </View>

          {/* Building Picker */}
          {selectedStreet && (
            <View style={styles.pickerContainer}>
              <MaterialCommunityIcons name="home-city" size={20} color={COLORS.primary} />
              <Picker
                style={styles.picker}
                selectedValue={selectedBuildingId}
                onValueChange={handleBuildingChange}
                mode="dropdown"
              >
                <Picker.Item label={text.selectBuilding} value="" />
                {buildingsInStreet.map((building) => (
                  <Picker.Item
                    key={building.id}
                    label={`${text.building} ${building.houseNumber}`}
                    value={building.id}
                  />
                ))}
              </Picker>
            </View>
          )}

          <Text style={styles.helperText}>{text.helper}</Text>
        </TactileCard>

        {buildingReports.length > 0 && selectedBuildingId && (
          <TactileCard elevated style={styles.reportsCard} pressable={false}>
            <View style={styles.reportsHeader}>
              <MaterialCommunityIcons name="history" size={20} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{text.todayStatus}</Text>
            </View>

            <FlatList
              data={buildingReports}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.reportItem}>
                  <View style={styles.reportLeft}>
                    <View style={styles.reportInfo}>
                      <Text style={styles.reportStatus}>
                        {item.status === 'on' ? text.lightOn : text.lightOff}
                      </Text>
                      <Text style={styles.reportApartment}>
                        {item.userName}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.reportTime}>
                    {item.createdAt.toLocaleTimeString('uk-UA', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <View style={styles.reportStatusImageFrame}>
                    <Image
                      source={item.status === 'on' ? require('../../assets/svet-plus3.webp') : require('../../assets/svet-plus4.webp')}
                      style={styles.reportStatusImage}
                      resizeMode="cover"
                    />
                  </View>
                </View>
              )}
            />
          </TactileCard>
        )}

        {latestReports.length > 0 && (
          <TactileCard elevated style={styles.allReportsCard} pressable={false}>
            <View style={styles.reportsHeader}>
              <MaterialCommunityIcons name="format-list-bulleted" size={20} color="#FF9800" />
              <Text style={styles.cardTitle}>{text.allReports} (10)</Text>
            </View>

            <FlatList
              data={latestReports}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.reportItem}>
                  <View style={styles.reportLeft}>
                    <View style={styles.reportInfo}>
                      <Text style={styles.reportStatus}>
                        {item.status === 'on' ? text.lightOnShort : text.lightOffShort}
                      </Text>
                      <Text style={styles.reportApartment}>
                        {getFullAddress(BUILDINGS.find((b) => b.id === item.buildingId) || {
                          id: item.buildingId,
                          street: selectedStreet || '-',
                          houseNumber: selectedBuilding?.houseNumber || '-',
                        })}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.reportTime}>
                    {item.createdAt.toLocaleTimeString('uk-UA', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <View style={styles.reportStatusImageFrame}>
                    <Image
                      source={item.status === 'on' ? require('../../assets/svet-plus3.webp') : require('../../assets/svet-plus4.webp')}
                      style={styles.reportStatusImage}
                      resizeMode="cover"
                    />
                  </View>
                </View>
              )}
            />
          </TactileCard>
        )}

        {bottomFeedReports.length > 0 && (
          <TactileCard elevated style={styles.residentFeedCard} pressable={false}>
            <View style={styles.reportsHeader}>
              <MaterialCommunityIcons name="account-group-outline" size={20} color={SCREEN_THEME.woodGreenDark} />
              <Text style={styles.cardTitle}>{text.recentFeed} (5)</Text>
            </View>

            {bottomFeedReports.map((item) => {
              const building = BUILDINGS.find((b) => b.id === item.buildingId);
              const address = building
                ? getFullAddress(building)
                : `${selectedStreet || '-'}, ${selectedBuilding?.houseNumber || '-'}`;
              const isOn = item.status === 'on';
              const statusColor = isOn ? '#2E7D32' : '#EF8E18';
              const statusText = isOn ? text.lightOnShort : text.lightOffShort;
              const avatarUri = pickUserAvatarUri(item);

              return (
                <View key={`mini-feed-${item.id}`} style={styles.residentItemCard}>
                  <View style={styles.residentItemMain}>
                    <View style={styles.residentItemContent}>
                      <View style={styles.residentTopRow}>
                        <View style={styles.residentUserRow}>
                          <MiniUserAvatar uri={avatarUri} name={item.userName || text.resident} size={34} borderRadius={11} backgroundColor="#6A8BA5" />
                          <View style={styles.residentTextBlock}>
                            <Text style={styles.residentName}>{item.userName || text.resident}</Text>
                            <Text style={styles.residentDate}>{formatReportDateTime(item.createdAt)}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.residentMetaRow}>
                        <MaterialCommunityIcons name="map-marker-outline" size={14} color={SCREEN_THEME.textMuted} />
                        <Text style={styles.residentMetaText}>{address}</Text>
                      </View>

                      <View style={styles.residentMetaRow}>
                        <MaterialCommunityIcons name={isOn ? 'flash' : 'power-plug-off-outline'} size={14} color={statusColor} />
                        <Text style={[styles.residentMetaText, { color: statusColor, fontWeight: '800' }]}>{statusText}</Text>
                      </View>
                    </View>
                    <View style={styles.residentStatusImageFrame}>
                      <Image
                        source={isOn ? require('../../assets/svet-plus3.webp') : require('../../assets/svet-plus4.webp')}
                        style={styles.reportStatusImage}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </TactileCard>
        )}
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SCREEN_THEME.appBg,
  },
  content: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  headerImageFrame: {
    width: '100%',
    height: 158,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: SCREEN_THEME.paper,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  ledIndicatorOn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  ledGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 11,
    backgroundColor: 'rgba(76, 175, 80, 0.35)',
  },
  ledShine: {
    position: 'absolute',
    top: 1,
    left: 3,
    width: 5,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  ledIndicatorOff: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#666',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  statusCard: {
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 12,
    textShadowColor: SCREEN_THEME.embossDark,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButtonOn: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    backgroundColor: '#4CAF50',
    borderColor: '#388E3C',
  },
  statusButtonOff: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    backgroundColor: '#111111',
    borderColor: '#000000',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 4,
    textAlign: 'center',
  },
  statusButtonSubtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    textAlign: 'center',
  },
  formCard: {
    padding: 16,
    marginBottom: 14,
  },
  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SCREEN_THEME.paper,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: SCREEN_THEME.borderStrong,
  },
  picker: {
    flex: 1,
    height: 50,
    color: SCREEN_THEME.textPrimary,
  },
  helperText: {
    fontSize: SIZES.fontSmall,
    color: SCREEN_THEME.textMuted,
    fontWeight: '600',
    marginTop: 8,
  },
  reportsCard: {
    padding: 16,
    marginBottom: 14,
  },
  allReportsCard: {
    padding: 16,
    marginBottom: 14,
  },
  residentFeedCard: {
    padding: 12,
    marginBottom: 12,
  },
  residentItemCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 16,
    marginBottom: 7,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    overflow: 'hidden',
  },
  residentItemMain: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  residentItemContent: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  residentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  residentUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  residentTextBlock: {
    marginLeft: 7,
    flex: 1,
  },
  residentName: {
    color: SCREEN_THEME.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  residentDate: {
    color: SCREEN_THEME.textMuted,
    fontSize: 11,
    marginTop: 1,
    fontWeight: '700',
  },
  statusSquare: {
    width: 23,
    height: 23,
    borderRadius: 6,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  residentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  residentMetaText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  residentStatusImageFrame: {
    width: 78,
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
    borderLeftWidth: 1,
    borderLeftColor: '#E4D0AB',
  },
  reportsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: SCREEN_THEME.paper,
    borderRadius: 14,
    padding: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: SCREEN_THEME.borderSoft,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: SCREEN_THEME.textMuted,
    marginTop: 4,
    fontWeight: '700',
  },
  reportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 70,
    paddingLeft: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: SCREEN_THEME.borderSoft,
  },
  reportLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  reportIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportStatusImageFrame: {
    width: 58,
    height: 58,
    marginLeft: 8,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  reportStatusImage: {
    width: '100%',
    height: '100%',
  },
  reportInfo: {
    flex: 1,
  },
  reportStatus: {
    fontSize: 14,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
  },
  reportApartment: {
    fontSize: 12,
    color: SCREEN_THEME.textMuted,
    marginTop: 2,
  },
  reportTime: {
    fontSize: 12,
    color: SCREEN_THEME.textMuted,
    fontWeight: '700',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  errorText: {
    fontSize: SIZES.fontRegular,
    color: COLORS.error,
    textAlign: 'center',
  },
});

export default ElectricityStatusScreen;

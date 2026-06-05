import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { SCREEN_THEME } from '../utils/screenTheme';
import type { RootState } from '../redux/store';
import { sportsService, SportKey, SportPlayer, SportTodayEntry } from '../services/sportsService';
import ContactReasonModal from '../components/ContactReasonModal';
import { useContactRequest } from '../hooks/useContactRequest';

type Lang = 'ua' | 'ru' | 'en';
type SportDetailParams = { sportKey: SportKey; sportTitle: string };
type ContactPlayer = { id: string; name: string; phone?: string; time?: string };

const TIME_SLOTS = ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

const UI_TEXT = {
  ua: {
    courtLabel: 'майданчик на вулиці',
    addPlayer: 'Додати себе як активного гравця',
    rating: 'Подивитися свій рейтинг',
    ratingDev: 'Функція рейтингу в розробці.',
    ratingLabel: 'Ваш рейтинг',
    chooseTime: 'Вказати час, коли сьогодні буду грати',
    todayList: 'Хто сьогодні хоче грати',
    activePlayers: 'Активні гравці',
    noActivePlayers: 'Поки немає активних гравців.',
    ratingShort: 'Рейтинг',
    empty: 'Поки ніхто не записався на сьогодні.',
    added: 'Ви додані як активний гравець.',
    addError: 'Не вдалося додати гравця.',
    contact: 'Контакт учасника',
    selectedTimeLabel: 'Вибраний час:',
    changeTime: 'Змінити час',
  },
  ru: {
    courtLabel: 'площадка на улице',
    addPlayer: 'Добавить себя как активного игрока',
    rating: 'Посмотреть свой рейтинг',
    ratingDev: 'Функция рейтинга в разработке.',
    ratingLabel: 'Ваш рейтинг',
    chooseTime: 'Указать время, когда сегодня буду играть',
    todayList: 'Кто сегодня хочет играть',
    activePlayers: 'Активные игроки',
    noActivePlayers: 'Пока нет активных игроков.',
    ratingShort: 'Рейтинг',
    empty: 'Пока никто не записался на сегодня.',
    added: 'Вы добавлены как активный игрок.',
    addError: 'Не удалось добавить игрока.',
    contact: 'Контакт участника',
    selectedTimeLabel: 'Выбранное время:',
    changeTime: 'Изменить время',
  },
  en: {
    courtLabel: 'outdoor court',
    addPlayer: 'Add myself as an active player',
    rating: 'View my rating',
    ratingDev: 'Rating is in development.',
    ratingLabel: 'Your rating',
    chooseTime: 'Set when I will play today',
    todayList: 'Who wants to play today',
    activePlayers: 'Active players',
    noActivePlayers: 'No active players yet.',
    ratingShort: 'Rating',
    empty: 'No one has joined for today yet.',
    added: 'You are added as an active player.',
    addError: 'Failed to add player.',
    contact: 'Player contact',
    selectedTimeLabel: 'Selected time:',
    changeTime: 'Change time',
  },
} as const;

const SportDetailScreen: React.FC = () => {
  const route = useRoute<RouteProp<Record<string, SportDetailParams>, string>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as Lang;
  const user = useSelector((state: RootState) => state.auth.user);
  const text = UI_TEXT[language];
  const title = route.params?.sportTitle || 'Спорт';
  const [todayPlayers, setTodayPlayers] = useState<SportTodayEntry[]>([]);
  const [players, setPlayers] = useState<SportPlayer[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showTimeSlots, setShowTimeSlots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const currentPlayerName = user?.name || user?.email || 'Chaika player';
  const sportKey = route.params?.sportKey || 'basketball';
  const myRating = players.find((player) => player.id === user?.id)?.rating ?? 0;
  const isMyPlayerAdded = players.some((player) => player.id === user?.id);
  const { modalVisible: contactModalVisible, pending: contactPending, currentTarget: contactTarget, openModal: openContactModal, closeModal: closeContactModal, sendRequest: sendContactRequest } = useContactRequest();

  const showAuthRequired = () => {
    const message = language === 'en'
      ? 'Sign in to add yourself as a player.'
      : language === 'ru'
        ? 'Войдите в аккаунт, чтобы добавить себя как игрока.'
        : 'Увійдіть в акаунт, щоб додати себе як гравця.';
    Alert.alert(title, message);
  };

  useEffect(() => {
    setLoading(true);
    const unsubscribePlayers = sportsService.subscribePlayers(sportKey, (playerList) => {
      setPlayers(playerList);
    });
    const unsubscribeToday = sportsService.subscribeTodayEntries(sportKey, (entries) => {
      setTodayPlayers(entries);
      const myTime = entries.find((entry) => entry.id === user?.id)?.time ?? null;
      setSelectedTime(myTime);
      setShowTimeSlots(!myTime);
      setLoading(false);
    });
    const loadingFallback = setTimeout(() => setLoading(false), 8000);

    return () => {
      unsubscribePlayers();
      unsubscribeToday();
      clearTimeout(loadingFallback);
    };
  }, [sportKey, user?.id]);

  const addActivePlayer = async () => {
    if (!user?.id) {
      showAuthRequired();
      return;
    }
    setSaving(true);
    try {
      await sportsService.savePlayer(sportKey, { id: user.id, name: currentPlayerName, phone: user.phone });
      Alert.alert(title, text.added);
    } catch (error) {
      Alert.alert(title, error instanceof Error ? error.message : text.addError);
    } finally {
      setSaving(false);
    }
  };

  const setTodayTime = async (time: string) => {
    if (!user?.id) {
      showAuthRequired();
      return;
    }
    const prevTime = selectedTime;
    setSelectedTime(time);
    setShowTimeSlots(false);
    setSaving(true);
    try {
      await sportsService.saveTodayEntry(sportKey, { id: user.id, name: currentPlayerName, phone: user.phone, time });
    } catch (error) {
      setSelectedTime(prevTime); // rollback optimistic update
      setShowTimeSlots(true);
      Alert.alert(title, error instanceof Error ? error.message : 'Failed to save time');
    } finally {
      setSaving(false);
    }
  };

  const showPlayerContact = (player: ContactPlayer) => {
    void openContactModal({ userId: player.id, name: player.name, sourceType: 'sport', sourceTitle: title });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <MaterialCommunityIcons name="trophy-outline" size={38} color="#FFFFFF" />
          <Text style={styles.title}>{title}</Text>
          {sportKey === 'basketball' ? <Text style={styles.heroSubtitle}>{text.courtLabel}</Text> : null}
        </View>

        {!isMyPlayerAdded ? (
          <TouchableOpacity style={styles.actionCard} onPress={() => { void addActivePlayer(); }} disabled={saving} activeOpacity={0.85}>
            <MaterialCommunityIcons name="account-plus-outline" size={24} color={SCREEN_THEME.woodGreenDark} />
            <Text style={styles.actionText}>{text.addPlayer}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.actionCard} onPress={() => Alert.alert(title, `${text.ratingLabel}: ${myRating}`)} activeOpacity={0.85}>
          <MaterialCommunityIcons name="chart-line" size={24} color={SCREEN_THEME.terracottaDark} />
          <Text style={styles.actionText}>{text.rating}</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{text.activePlayers}</Text>
        {loading ? (
          <ActivityIndicator size="small" color={SCREEN_THEME.terracottaDark} />
        ) : players.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>{text.noActivePlayers}</Text></View>
        ) : players.map((player) => (
          <TouchableOpacity key={player.id} style={styles.playerRow} onPress={() => showPlayerContact({ id: player.id, name: player.name, phone: player.phone })} activeOpacity={0.84}>
            <View>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerTime}>{text.ratingShort}: {player.rating ?? 0}</Text>
            </View>
            <MaterialCommunityIcons name="account-star-outline" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>
        ))}

        <Text style={styles.sectionTitle}>{text.chooseTime}</Text>
        {showTimeSlots ? (
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((time) => (
              <TouchableOpacity key={time} style={[styles.timeChip, selectedTime === time && styles.timeChipActive]} onPress={() => void setTodayTime(time)} activeOpacity={0.8}>
                <Text style={[styles.timeText, selectedTime === time && styles.timeTextActive]}>{time}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TouchableOpacity style={styles.editTimeCard} onPress={() => setShowTimeSlots(true)} activeOpacity={0.85}>
            <MaterialCommunityIcons name="pencil-outline" size={22} color={SCREEN_THEME.terracottaDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.editTimeTitle}>{text.selectedTimeLabel} {selectedTime || '-'}</Text>
              <Text style={styles.editTimeSubtitle}>{text.changeTime}</Text>
            </View>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>{text.todayList}</Text>
        {loading ? (
          <ActivityIndicator size="small" color={SCREEN_THEME.terracottaDark} />
        ) : todayPlayers.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>{text.empty}</Text></View>
        ) : todayPlayers.map((player) => (
          <TouchableOpacity key={player.id} style={styles.playerRow} onPress={() => showPlayerContact(player)} activeOpacity={0.84}>
            <View>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerTime}>{player.time}</Text>
            </View>
            <MaterialCommunityIcons name="phone-outline" size={20} color={SCREEN_THEME.textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ContactReasonModal
        visible={contactModalVisible}
        pending={contactPending}
        target={contactTarget}
        onSelect={(reason) => void sendContactRequest(reason)}
        onClose={closeContactModal}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 36 },
  hero: { borderRadius: 24, padding: 20, backgroundColor: SCREEN_THEME.terracottaDark, alignItems: 'center', marginBottom: 16, ...SCREEN_THEME.raisedShadowStrong },
  title: { marginTop: 10, fontSize: 27, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  heroSubtitle: { marginTop: 4, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.88)', textAlign: 'center' },
  actionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, marginBottom: 10, backgroundColor: SCREEN_THEME.paperStrong, borderWidth: 1, borderColor: '#E4D0AB', ...SCREEN_THEME.raisedShadow },
  actionText: { flex: 1, fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  sectionTitle: { marginTop: 18, marginBottom: 10, fontSize: 13, fontWeight: '900', color: SCREEN_THEME.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeChip: { minWidth: 86, alignItems: 'center', borderRadius: 16, paddingVertical: 12, backgroundColor: '#FFF8F1', borderWidth: 1, borderColor: '#E4D0AB' },
  timeChipActive: { backgroundColor: SCREEN_THEME.woodGreenDark, borderColor: SCREEN_THEME.woodGreenDark },
  timeText: { fontSize: 14, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  timeTextActive: { color: '#FFFFFF' },
  editTimeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, backgroundColor: SCREEN_THEME.paperStrong, borderWidth: 1, borderColor: '#E4D0AB' },
  editTimeTitle: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  editTimeSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  emptyCard: { borderRadius: 18, padding: 16, backgroundColor: SCREEN_THEME.paperStrong, borderWidth: 1, borderColor: '#E4D0AB' },
  emptyText: { fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textSecondary, textAlign: 'center' },
  playerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, padding: 14, marginBottom: 10, backgroundColor: SCREEN_THEME.paperStrong, borderWidth: 1, borderColor: '#E4D0AB' },
  playerName: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  playerTime: { marginTop: 3, fontSize: 12, fontWeight: '700', color: SCREEN_THEME.textSecondary },
});

export default SportDetailScreen;




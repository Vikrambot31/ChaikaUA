import React, { useEffect, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { onValue, ref } from 'firebase/database';
import type { RootState } from '../redux/store';
import { selectUser } from '../redux/slices/authSlice';
import { selectIsOsbbManager } from '../redux/slices/osbbSlice';
import { SCREEN_THEME } from '../utils/screenTheme';
import InlineFieldHint from '../components/InlineFieldHint';
import { useSoftToast } from '../hooks/useSoftToast';
import { database } from '../firebase-config';
import {
  OsbbVoteItem,
  OsbbVoteOption,
  OsbbVoteStatus,
  osbbVotingService,
} from '../services/osbbVotingService';
import { useOsbbMembership } from '../hooks/useOsbbMembership';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppNav = NativeStackNavigationProp<Record<string, object | undefined>>;
type Lang = 'ua' | 'ru' | 'en';


// ---------------------------------------------------------------------------
// Localisation
// ---------------------------------------------------------------------------

const UI_TEXT = {
  ua: {
    screenTitle: 'Голосування',
    tabActive: 'Активні',
    tabClosed: 'Завершені',
    deadline: 'Дедлайн',
    daysLeft: 'днів',
    participation: 'квартир проголосувало',
    of: 'з',
    voteBtn: 'Проголосувати',
    alreadyVoted: 'Ви вже голосували',
    closedBadge: 'Завершено',
    winnerBadge: 'Переможець',
    voteTitle: 'Голосування',
    voteMsg: 'Ваш голос зараховано.',
    selectOption: 'Оберіть варіант',
    questionPlaceholder: 'Тема голосування',
    addVote: 'Додати',
    setupRequired: 'Спочатку налаштуйте свій будинок в ОСББ.',
    managerOnly: 'Створювати голосування може тільки керуючий ОСББ.',
    yesOption: 'Так',
    noOption: 'Ні',
    emptyActive: 'Активних голосувань немає',
    emptyClosed: 'Завершених голосувань немає',
    fillQuestion: 'Введіть тему голосування.',
    voteCreated: 'Голосування створено',
    saveError: 'Не вдалося зберегти. Перевірте інтернет і спробуйте ще раз.',
  },
  ru: {
    screenTitle: 'Голосование',
    tabActive: 'Активные',
    tabClosed: 'Завершённые',
    deadline: 'Дедлайн',
    daysLeft: 'дней',
    participation: 'квартир проголосовало',
    of: 'из',
    voteBtn: 'Проголосовать',
    alreadyVoted: 'Вы уже голосовали',
    closedBadge: 'Завершено',
    winnerBadge: 'Победитель',
    voteTitle: 'Голосование',
    voteMsg: 'Ваш голос учтён.',
    selectOption: 'Выберите вариант',
    questionPlaceholder: 'Тема голосования',
    addVote: 'Добавить',
    setupRequired: 'Сначала настройте свой дом в ОСББ.',
    managerOnly: 'Создавать голосования может только управляющий ОСББ.',
    yesOption: 'Да',
    noOption: 'Нет',
    emptyActive: 'Активных голосований нет',
    emptyClosed: 'Завершённых голосований нет',
    fillQuestion: 'Введите тему голосования.',
    voteCreated: 'Голосование создано',
    saveError: 'Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.',
  },
  en: {
    screenTitle: 'Voting',
    tabActive: 'Active',
    tabClosed: 'Closed',
    deadline: 'Deadline',
    daysLeft: 'days',
    participation: 'apartments voted',
    of: 'of',
    voteBtn: 'Vote',
    alreadyVoted: 'You already voted',
    closedBadge: 'Closed',
    winnerBadge: 'Winner',
    voteTitle: 'Voting',
    voteMsg: 'Your vote has been recorded.',
    selectOption: 'Select an option',
    questionPlaceholder: 'Voting topic',
    addVote: 'Add',
    setupRequired: 'Set up your OSBB building first.',
    managerOnly: 'Only the OSBB manager can create votes.',
    yesOption: 'Yes',
    noOption: 'No',
    emptyActive: 'No active votes',
    emptyClosed: 'No closed votes',
    fillQuestion: 'Please enter the voting topic.',
    voteCreated: 'Voting created',
    saveError: 'Failed to save. Check your internet connection and try again.',
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(deadline: string): number {
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function totalVotes(options: OsbbVoteOption[]): number {
  return options.reduce((sum, o) => sum + o.votes, 0);
}

function winnerId(options: OsbbVoteOption[]): string {
  return options.reduce((best, o) => (o.votes > best.votes ? o : best)).id;
}

function getOptionLabel(language: Lang, option: OsbbVoteOption) {
  const t = UI_TEXT[language];
  return option.labelKey === 'no' ? t.noOption : t.yesOption;
}

// Bar color by option index
const BAR_COLORS = [SCREEN_THEME.woodGreen, SCREEN_THEME.terracotta, SCREEN_THEME.enamelBlue, '#C79C47', '#8A7AB1'];

// ---------------------------------------------------------------------------
// Vote card
// ---------------------------------------------------------------------------

interface VoteCardProps {
  item: OsbbVoteItem;
  language: Lang;
  selectedOptionId: string | null;
  onSelectOption: (voteId: string, optionId: string) => void;
  onVote: (voteId: string, optionId: string) => void;
}

const VoteCard: React.FC<VoteCardProps> = ({
  item,
  language,
  selectedOptionId,
  onSelectOption,
  onVote,
}) => {
  const t = UI_TEXT[language];
  const total = totalVotes(item.options);
  const winner = winnerId(item.options);
  const days = daysUntil(item.deadline);
  const isClosed = item.status === 'closed';
  const participationTotal = Math.max(item.totalApartments, total);

  return (
    <View style={styles.voteCard}>
      {/* Title row */}
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {isClosed && (
          <View style={styles.closedBadge}>
            <Text style={styles.closedBadgeText}>{t.closedBadge}</Text>
          </View>
        )}
      </View>

      {/* Question */}
      <Text style={styles.cardQuestion}>{item.question}</Text>

      {/* Options with bars */}
      <View style={styles.optionsList}>
        {item.options.map((opt, idx) => {
          const pct = total > 0 ? opt.votes / total : 0;
          const isWinner = isClosed && opt.id === winner;
          const barColor = BAR_COLORS[idx % BAR_COLORS.length];
          const isSelected = item.hasVoted
            ? item.selectedOptionId === opt.id
            : selectedOptionId === opt.id;

          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.optionRow, !isClosed && !item.hasVoted && styles.optionRowSelectable, isSelected && styles.optionRowSelected]}
              activeOpacity={!isClosed && !item.hasVoted ? 0.85 : 1}
              disabled={isClosed || item.hasVoted}
              onPress={() => onSelectOption(item.id, opt.id)}
            >
              <View style={styles.optionLabelRow}>
                <Text style={[styles.optionLabel, isWinner && styles.optionLabelWinner]}>
                  {getOptionLabel(language, opt)}
                </Text>
                {isSelected && !isClosed && (
                  <MaterialCommunityIcons name="check-circle" size={16} color={SCREEN_THEME.woodGreenDark} />
                )}
                {isWinner && (
                  <View style={styles.winnerBadge}>
                    <MaterialCommunityIcons name="trophy" size={12} color="#FFFFFF" />
                    <Text style={styles.winnerBadgeText}>{t.winnerBadge}</Text>
                  </View>
                )}
                <Text style={styles.optionVoteCount}>{opt.votes}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.round(pct * 100)}%` as any, backgroundColor: barColor },
                    isWinner && styles.barFillWinner,
                  ]}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Participation counter */}
      <Text style={styles.participationText}>
        {total} {t.of} {participationTotal} {t.participation}
      </Text>
      <InlineFieldHint message={t.selectOption} type="hint" visible={!isClosed && !item.hasVoted && !selectedOptionId} />

      {/* Footer row: deadline + vote button */}
      {!isClosed && (
        <View style={styles.cardFooter}>
          <View style={styles.deadlineChip}>
            <MaterialCommunityIcons name="calendar-clock" size={14} color={SCREEN_THEME.enamelBlue} />
            <Text style={styles.deadlineText}>{days} {t.daysLeft}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.voteButton,
              (item.hasVoted || !selectedOptionId) && styles.voteButtonDone,
            ]}
            onPress={() => selectedOptionId && !item.hasVoted && onVote(item.id, selectedOptionId)}
            activeOpacity={item.hasVoted || !selectedOptionId ? 1 : 0.85}
            disabled={item.hasVoted || !selectedOptionId}
          >
            <Text style={[styles.voteButtonText, item.hasVoted && styles.voteButtonTextDone]}>
              {item.hasVoted ? t.alreadyVoted : t.voteBtn}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

const OsbbGolosuvannyaScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector(
    (state: RootState) => state.language?.current ?? 'ua'
  ) as Lang;
  const buildingId = useSelector((state: RootState) => state.osbb.buildingId);
  const [totalApartments, setTotalApartments] = useState<number>(0);
  useEffect(() => {
    if (!buildingId) return undefined;
    const unsubscribe = onValue(
      ref(database, `buildings/${buildingId}/totalApartments`),
      (snap) => {
        const val = snap.val();
        setTotalApartments(typeof val === 'number' && val > 0 ? val : 0);
      },
      () => { setTotalApartments(0); },
    );
    return unsubscribe;
  }, [buildingId]);
  const user = useSelector(selectUser);
  useOsbbMembership();
  const isManager = useSelector(selectIsOsbbManager);
  const t = UI_TEXT[language];
  const toast = useSoftToast();

  const [activeTab, setActiveTab] = useState<OsbbVoteStatus>('active');
  const [newQuestion, setNewQuestion] = useState('');
  const [votes, setVotes] = useState<OsbbVoteItem[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [votingId, setVotingId] = useState<string | null>(null);

  useEffect(() => {
    return osbbVotingService.subscribe(buildingId, user?.id, setVotes);
  }, [buildingId, user?.id]);

  const displayed = votes.filter((v) => v.status === activeTab);

  const addVote = async () => {
    if (!buildingId) {
      toast.showWarning(t.voteTitle, t.setupRequired);
      return;
    }

    if (!isManager) {
      toast.showWarning(t.voteTitle, t.managerOnly);
      return;
    }

    if (!newQuestion.trim()) {
      toast.showWarning(t.voteTitle, t.fillQuestion);
      return;
    }

    if (!user?.id) {
      toast.showWarning(t.voteTitle, t.setupRequired);
      return;
    }

    try {
      await osbbVotingService.addVote(buildingId, {
        title: newQuestion.trim(),
        question: newQuestion.trim(),
        createdBy: user.id,
        totalApartments,
      });
      setNewQuestion('');
      toast.showSuccess(t.voteCreated);
    } catch {
      toast.showError(t.voteTitle, t.saveError);
    }
  };

  const handleSelectOption = (voteId: string, optionId: string) => {
    setSelectedOptions((current) => ({
      ...current,
      [voteId]: optionId,
    }));
  };

  const handleVote = async (voteId: string, optionId: string) => {
    if (!buildingId || !user?.id) {
      toast.showWarning(t.voteTitle, t.setupRequired);
      return;
    }

    if (votingId) return;
    setVotingId(voteId);

    try {
      await osbbVotingService.castVote(buildingId, voteId, user.id, optionId);
      setSelectedOptions((current) => {
        const next = { ...current };
        delete next[voteId];
        return next;
      });
      toast.showSuccess(t.voteMsg);
    } catch (error) {
      const message = error instanceof Error && error.message === 'already-voted'
        ? t.alreadyVoted
        : t.selectOption;
      toast.showWarning(t.voteTitle, message);
    } finally {
      setVotingId(null);
    }
  };

  const renderItem = ({ item }: { item: OsbbVoteItem }) => (
    <VoteCard
      item={item}
      language={language}
      selectedOptionId={selectedOptions[item.id] ?? null}
      onSelectOption={handleSelectOption}
      onVote={handleVote}
    />
  );

  const ListHeader = (
    <View>
      {/* Back + title */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{t.screenTitle}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.tabActive]}
          onPress={() => setActiveTab('active')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            {t.tabActive}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'closed' && styles.tabActive]}
          onPress={() => setActiveTab('closed')}
          activeOpacity={0.85}
        >
          <Text style={[styles.tabText, activeTab === 'closed' && styles.tabTextActive]}>
            {t.tabClosed}
          </Text>
        </TouchableOpacity>
      </View>

      {isManager && (
        <View style={styles.addVoteCard}>
          <TextInput
            value={newQuestion}
            onChangeText={setNewQuestion}
            placeholder={t.questionPlaceholder}
            placeholderTextColor={SCREEN_THEME.textMuted}
            style={styles.input}
          />
          <InlineFieldHint message={t.fillQuestion} type="warning" visible={!newQuestion.trim()} />
          <TouchableOpacity style={styles.addVoteBtn} onPress={() => void addVote()} activeOpacity={0.85}>
            <Text style={styles.addVoteText}>{t.addVote}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const EmptyState = (
    <View style={styles.emptyCard}>
      <MaterialCommunityIcons name="vote-outline" size={48} color={SCREEN_THEME.textSecondary} />
      <Text style={styles.emptyTitle}>
        {!buildingId ? t.setupRequired : activeTab === 'active' ? t.emptyActive : t.emptyClosed}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CARD_BASE = {
  backgroundColor: SCREEN_THEME.paperStrong,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: '#E4D0AB',
  shadowColor: '#6E573B',
  shadowOpacity: 0.10,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  listContent: { padding: 16, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 4,
  },
  backBtn: { width: 40, alignItems: 'center' },
  screenTitle: { fontSize: 20, fontWeight: '900', color: SCREEN_THEME.textPrimary },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#EDE4D0',
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  tabActive: { backgroundColor: SCREEN_THEME.paperStrong, shadowColor: '#6E573B', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textSecondary },
  tabTextActive: { color: SCREEN_THEME.textPrimary, fontWeight: '900' },
  addVoteCard: { ...CARD_BASE, padding: 12, gap: 8, marginBottom: 16 },
  input: { backgroundColor: '#FFF8EA', borderRadius: 14, borderWidth: 1, borderColor: '#E4D0AB', paddingHorizontal: 12, paddingVertical: 11, color: SCREEN_THEME.textPrimary, fontWeight: '800' },
  addVoteBtn: { borderRadius: 14, backgroundColor: SCREEN_THEME.enamelBlue, alignItems: 'center', paddingVertical: 12 },
  addVoteText: { color: '#fff', fontWeight: '900' },

  // Vote card
  voteCard: { ...CARD_BASE, padding: 16 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: SCREEN_THEME.textPrimary, lineHeight: 22 },
  closedBadge: {
    backgroundColor: SCREEN_THEME.textSecondary + '22',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  closedBadgeText: { fontSize: 11, fontWeight: '800', color: SCREEN_THEME.textSecondary },

  cardQuestion: {
    fontSize: 13,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
  },

  // Options
  optionsList: { gap: 10, marginBottom: 10 },
  optionRow: { gap: 4, borderRadius: 14, padding: 8 },
  optionRowSelectable: { borderWidth: 1, borderColor: '#E4D0AB', backgroundColor: '#FFF8EA' },
  optionRowSelected: { borderColor: SCREEN_THEME.woodGreenDark, backgroundColor: '#EEF6EC' },
  optionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: SCREEN_THEME.textPrimary },
  optionLabelWinner: { color: SCREEN_THEME.woodGreen },
  winnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#C79C47',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  winnerBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  optionVoteCount: { fontSize: 13, fontWeight: '900', color: SCREEN_THEME.textSecondary },

  barTrack: {
    height: 8,
    backgroundColor: '#EAE0CE',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  barFillWinner: { opacity: 1 },

  participationText: {
    fontSize: 12,
    fontWeight: '600',
    color: SCREEN_THEME.textSecondary,
    marginTop: 4,
    marginBottom: 12,
  },

  // Card footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  deadlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SCREEN_THEME.enamelBlue + '18',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deadlineText: { fontSize: 13, fontWeight: '700', color: SCREEN_THEME.enamelBlue },

  voteButton: {
    flex: 1,
    backgroundColor: SCREEN_THEME.enamelBlue,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  voteButtonDone: {
    backgroundColor: '#EAE0CE',
  },
  voteButtonText: { fontSize: 14, fontWeight: '900', color: '#FFFFFF' },
  voteButtonTextDone: { color: SCREEN_THEME.textSecondary },

  // Empty state
  emptyCard: {
    ...CARD_BASE,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
  },
});

export default OsbbGolosuvannyaScreen;


import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
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
import type { RootState } from '../redux/store';
import { selectOsbbBuilding } from '../redux/slices/osbbSlice';
import { subscribeOsbbNews } from '../services/osbbNews';
import { subscribeOsbbCollections } from '../services/osbbCollections';
import { osbbVotingService } from '../services/osbbVotingService';
import {
  ModeratorRecord,
  assignRole,
  getUserRole,
  revokeRole,
  subscribeModeratorList,
} from '../services/moderatorService';
import { SCREEN_THEME } from '../utils/screenTheme';

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
    screenTitle: 'Панель керуючого',
    managerBadge: 'ОСББ Менеджер',
    buildingCardTitle: 'Мій будинок',
    buildingStreet: 'Вулиця',
    buildingHouse: 'Будинок',
    buildingApartment: 'Квартира',
    statsTitle: 'Статистика',
    statRequests: 'Відкриті заявки',
    statNews: 'Нові новини',
    statVotes: 'Активні голосування',
    actionsTitle: 'Управління',
    actionAddNews: 'Додати новину',
    actionRequests: 'Заявки мешканців',
    actionVoting: 'Голосування',
    actionFinance: 'Фінанси',
    actionSecurity: 'Безпека',
    roleNoteTitle: 'Ролі та доступ',
    roleNoteBody: 'Для зміни ролей зверніться до адміністратора системи.',
    moderatorsTitle: 'Модератори системи',
    roleAdmin: 'Адміністратор',
    roleModerator: 'Модератор',
    revoke: 'Зняти',
    assignTitle: 'Призначити модератора',
    assignUidPlaceholder: 'UID користувача',
    assignEmailPlaceholder: 'Email (необов\'язково)',
    assignBtn: 'Призначити',
    assignBtnLoading: 'Зберігаємо...',
    noModerators: 'Модераторів поки немає.',
    revokeConfirmTitle: 'Зняти роль?',
    revokeConfirmMsg: 'Ви впевнені, що хочете зняти роль у цього користувача?',
    cancel: 'Скасувати',
    confirm: 'Так, зняти',
    errorAssign: 'Вкажіть UID.',
    assignedAt: 'Призначено',
  },
  ru: {
    screenTitle: 'Панель управляющего',
    managerBadge: 'ОСББ Менеджер',
    buildingCardTitle: 'Мой дом',
    buildingStreet: 'Улица',
    buildingHouse: 'Дом',
    buildingApartment: 'Квартира',
    statsTitle: 'Статистика',
    statRequests: 'Открытые заявки',
    statNews: 'Новые новости',
    statVotes: 'Активные голосования',
    actionsTitle: 'Управление',
    actionAddNews: 'Добавить новость',
    actionRequests: 'Заявки жильцов',
    actionVoting: 'Голосование',
    actionFinance: 'Финансы',
    actionSecurity: 'Безопасность',
    roleNoteTitle: 'Роли и доступ',
    roleNoteBody: 'Для изменения ролей обратитесь к администратору системы.',
    moderatorsTitle: 'Модераторы системы',
    roleAdmin: 'Администратор',
    roleModerator: 'Модератор',
    revoke: 'Снять',
    assignTitle: 'Назначить модератора',
    assignUidPlaceholder: 'UID пользователя',
    assignEmailPlaceholder: 'Email (необязательно)',
    assignBtn: 'Назначить',
    assignBtnLoading: 'Сохраняем...',
    noModerators: 'Модераторов пока нет.',
    revokeConfirmTitle: 'Снять роль?',
    revokeConfirmMsg: 'Вы уверены, что хотите снять роль у этого пользователя?',
    cancel: 'Отмена',
    confirm: 'Да, снять',
    errorAssign: 'Укажите UID.',
    assignedAt: 'Назначен',
  },
  en: {
    screenTitle: 'Manager Panel',
    managerBadge: 'HOA Manager',
    buildingCardTitle: 'My building',
    buildingStreet: 'Street',
    buildingHouse: 'Building',
    buildingApartment: 'Apartment',
    statsTitle: 'Stats',
    statRequests: 'Open requests',
    statNews: 'Pending news',
    statVotes: 'Active votes',
    actionsTitle: 'Management',
    actionAddNews: 'Add news',
    actionRequests: 'Resident requests',
    actionVoting: 'Voting',
    actionFinance: 'Finance',
    actionSecurity: 'Security',
    roleNoteTitle: 'Roles & access',
    roleNoteBody: 'To change roles contact the system administrator.',
    moderatorsTitle: 'System moderators',
    roleAdmin: 'Administrator',
    roleModerator: 'Moderator',
    revoke: 'Revoke',
    assignTitle: 'Assign moderator',
    assignUidPlaceholder: 'User UID',
    assignEmailPlaceholder: 'Email (optional)',
    assignBtn: 'Assign',
    assignBtnLoading: 'Saving...',
    noModerators: 'No moderators yet.',
    revokeConfirmTitle: 'Revoke role?',
    revokeConfirmMsg: 'Are you sure you want to revoke this user\'s role?',
    cancel: 'Cancel',
    confirm: 'Yes, revoke',
    errorAssign: 'Enter a UID.',
    assignedAt: 'Assigned',
  },
} as const;

// ---------------------------------------------------------------------------
// Action menu item definition
// ---------------------------------------------------------------------------

interface ActionItem {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  labelKey: keyof typeof UI_TEXT['ua'];
  color: string;
  onPress: (navigation: AppNav) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const OsbbAdminScreen: React.FC = () => {
  const navigation = useNavigation<AppNav>();
  const language = useSelector(
    (state: RootState) => state.language?.current ?? 'ua'
  ) as Lang;
  const t = UI_TEXT[language];
  const osbbBuilding = useSelector(selectOsbbBuilding);
  const userId = useSelector((state: RootState) => state.auth.user?.id);
  const [newsCount, setNewsCount] = useState(0);
  const [activeVotes, setActiveVotes] = useState(0);
  const [collectionsCount, setCollectionsCount] = useState(0);

  // Moderator list state
  const [moderators, setModerators] = useState<ModeratorRecord[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [assignUid, setAssignUid] = useState('');
  const [assignEmail, setAssignEmail] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    return subscribeOsbbNews(osbbBuilding.buildingId, (items) => {
      setNewsCount(items.length);
    });
  }, [osbbBuilding.buildingId]);

  useEffect(() => {
    return subscribeOsbbCollections(osbbBuilding.buildingId, (items) => {
      setCollectionsCount(items.length);
    });
  }, [osbbBuilding.buildingId]);

  useEffect(() => {
    return osbbVotingService.subscribe(osbbBuilding.buildingId, userId, (items) => {
      setActiveVotes(items.filter((item) => item.status === 'active').length);
    });
  }, [osbbBuilding.buildingId, userId]);

  useEffect(() => {
    return subscribeModeratorList(setModerators);
  }, []);

  useEffect(() => {
    if (!userId) return;
    void getUserRole(userId).then((role) => setIsAdmin(role === 'admin')).catch(() => {});
  }, [userId]);

  const stats = useMemo(() => ({
    openRequests: collectionsCount,
    pendingNews: newsCount,
    activeVotes,
  }), [activeVotes, collectionsCount, newsCount]);

  const handleAssign = async () => {
    if (!assignUid.trim()) {
      Alert.alert('', t.errorAssign);
      return;
    }
    setIsAssigning(true);
    const result = await assignRole(assignUid.trim(), 'moderator', assignEmail.trim() || undefined);
    setIsAssigning(false);
    if (result.success) {
      setAssignUid('');
      setAssignEmail('');
    } else {
      Alert.alert('', result.error);
    }
  };

  const handleRevoke = (uid: string) => {
    Alert.alert(t.revokeConfirmTitle, t.revokeConfirmMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.confirm,
        style: 'destructive',
        onPress: async () => {
          const result = await revokeRole(uid);
          if (!result.success) Alert.alert('', result.error);
        },
      },
    ]);
  };

  // Action menu items
  const ACTION_ITEMS: ActionItem[] = [
    {
      icon: 'newspaper-plus',
      labelKey: 'actionAddNews',
      color: '#8A7AB1',
      onPress: (nav) => nav.navigate('OsbbAddNewsScreen'),
    },
    {
      icon: 'clipboard-check-outline',
      labelKey: 'actionRequests',
      color: SCREEN_THEME.terracotta,
      onPress: (nav) => nav.navigate('RequestsScreen'),
    },
    {
      icon: 'vote-outline',
      labelKey: 'actionVoting',
      color: SCREEN_THEME.enamelBlue,
      onPress: (nav) => nav.navigate('OsbbGolosuvannyaScreen'),
    },
    {
      icon: 'cash-multiple',
      labelKey: 'actionFinance',
      color: SCREEN_THEME.woodGreen,
      onPress: (nav) => nav.navigate('OsbbFinansyScreen'),
    },
    {
      icon: 'shield-lock-outline',
      labelKey: 'actionSecurity',
      color: SCREEN_THEME.terracottaDark,
      onPress: (nav) => nav.navigate('SecurityControlScreen'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* в"Ђв"Ђ Header в"Ђв"Ђ */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={24}
            color={SCREEN_THEME.textPrimary}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.screenTitle}</Text>
          <View style={styles.managerBadge}>
            <MaterialCommunityIcons name="shield-account" size={13} color="#8A7AB1" />
            <Text style={styles.managerBadgeText}>{t.managerBadge}</Text>
          </View>
        </View>

        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* в"Ђв"Ђ Building info card в"Ђв"Ђ */}
        <View style={styles.buildingCard}>
          <View style={styles.buildingCardHeader}>
            <MaterialCommunityIcons
              name="office-building-outline"
              size={22}
              color="#FFFFFF"
            />
            <Text style={styles.buildingCardTitle}>{t.buildingCardTitle}</Text>
          </View>

          <View style={styles.buildingRow}>
            <Text style={styles.buildingFieldLabel}>{t.buildingStreet}</Text>
            <Text style={styles.buildingFieldValue}>
              {osbbBuilding.street ?? '—'}
            </Text>
          </View>
          <View style={styles.buildingRow}>
            <Text style={styles.buildingFieldLabel}>{t.buildingHouse}</Text>
            <Text style={styles.buildingFieldValue}>
              {osbbBuilding.houseNumber ?? '—'}
            </Text>
          </View>
          <View style={[styles.buildingRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.buildingFieldLabel}>{t.buildingApartment}</Text>
            <Text style={styles.buildingFieldValue}>
              {osbbBuilding.apartment ?? '—'}
            </Text>
          </View>
        </View>

        {/* в"Ђв"Ђ Quick stats в"Ђв"Ђ */}
        <Text style={styles.sectionTitle}>{t.statsTitle}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons
              name="clipboard-list-outline"
              size={24}
              color={SCREEN_THEME.terracotta}
            />
            <Text style={styles.statNum}>{stats.openRequests}</Text>
            <Text style={styles.statLabel}>{t.statRequests}</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons
              name="newspaper-variant-outline"
              size={24}
              color="#8A7AB1"
            />
            <Text style={styles.statNum}>{stats.pendingNews}</Text>
            <Text style={styles.statLabel}>{t.statNews}</Text>
          </View>
          <View style={styles.statCard}>
            <MaterialCommunityIcons
              name="vote-outline"
              size={24}
              color={SCREEN_THEME.enamelBlue}
            />
            <Text style={styles.statNum}>{stats.activeVotes}</Text>
            <Text style={styles.statLabel}>{t.statVotes}</Text>
          </View>
        </View>

        {/* в"Ђв"Ђ Actions card в"Ђв"Ђ */}
        <Text style={styles.sectionTitle}>{t.actionsTitle}</Text>
        <View style={styles.actionsCard}>
          {ACTION_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.labelKey}
              style={[
                styles.actionRow,
                index < ACTION_ITEMS.length - 1 && styles.actionRowBorder,
              ]}
              onPress={() => item.onPress(navigation)}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: item.color + '1A' }]}>
                <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={styles.actionLabel}>{t[item.labelKey] as string}</Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={SCREEN_THEME.textSecondary}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* в"Ђв"Ђ Moderator list в"Ђв"Ђ */}
        <Text style={styles.sectionTitle}>{t.moderatorsTitle}</Text>
        <View style={styles.moderatorsCard}>
          {moderators.length === 0 ? (
            <Text style={styles.noModeratorsText}>{t.noModerators}</Text>
          ) : moderators.map((mod, index) => (
            <View
              key={mod.uid}
              style={[styles.modRow, index < moderators.length - 1 && styles.modRowBorder]}
            >
              <View style={styles.modIconWrap}>
                <MaterialCommunityIcons
                  name={mod.role === 'admin' ? 'shield-crown' : 'shield-account'}
                  size={20}
                  color={mod.role === 'admin' ? '#C08B3A' : '#8A7AB1'}
                />
              </View>
              <View style={styles.modInfo}>
                <Text style={styles.modUid} numberOfLines={1}>{mod.email ?? mod.uid}</Text>
                <Text style={styles.modRole}>
                  {mod.role === 'admin' ? t.roleAdmin : t.roleModerator}
                  {mod.assignedAt ? ` В· ${t.assignedAt} ${new Date(mod.assignedAt).toLocaleDateString()}` : ''}
                </Text>
              </View>
              {isAdmin && mod.role !== 'admin' ? (
                <TouchableOpacity
                  style={styles.revokeBtn}
                  onPress={() => handleRevoke(mod.uid)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.revokeBtnText}>{t.revoke}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}

          {/* Assign moderator form (admin only) */}
          {isAdmin ? (
            <View style={styles.assignForm}>
              <Text style={styles.assignTitle}>{t.assignTitle}</Text>
              <TextInput
                value={assignUid}
                onChangeText={setAssignUid}
                placeholder={t.assignUidPlaceholder}
                placeholderTextColor={SCREEN_THEME.textMuted}
                autoCapitalize="none"
                style={styles.assignInput}
              />
              <TextInput
                value={assignEmail}
                onChangeText={setAssignEmail}
                placeholder={t.assignEmailPlaceholder}
                placeholderTextColor={SCREEN_THEME.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.assignInput}
              />
              <TouchableOpacity
                style={[styles.assignBtn, isAssigning && styles.assignBtnDisabled]}
                onPress={handleAssign}
                disabled={isAssigning}
                activeOpacity={0.85}
              >
                {isAssigning
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.assignBtnText}>{t.assignBtn}</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* в"Ђв"Ђ Role management note card в"Ђв"Ђ */}
        <View style={styles.roleNoteCard}>
          <View style={styles.roleNoteHeader}>
            <MaterialCommunityIcons
              name="information-outline"
              size={18}
              color={SCREEN_THEME.enamelBlue}
            />
            <Text style={styles.roleNoteTitle}>{t.roleNoteTitle}</Text>
          </View>
          <Text style={styles.roleNoteBody}>{t.roleNoteBody}</Text>
        </View>
      </ScrollView>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: SCREEN_THEME.appBg,
  },
  backBtn: { width: 40, alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  managerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#8A7AB1' + '1A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  managerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8A7AB1',
  },

  scrollContent: { padding: 16, paddingBottom: 48 },

  // Building card
  buildingCard: {
    backgroundColor: '#3A352F',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#1A1510',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  buildingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  buildingCardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  buildingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  buildingFieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.60)',
  },
  buildingFieldValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: '65%',
    textAlign: 'right',
  },

  // Section titles
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: SCREEN_THEME.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    ...CARD_BASE,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: SCREEN_THEME.textSecondary,
    textAlign: 'center',
  },

  // Actions card
  actionsCard: {
    ...CARD_BASE,
    overflow: 'hidden',
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  actionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E4D0AB',
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: SCREEN_THEME.textPrimary,
  },

  // Moderators card
  moderatorsCard: {
    ...CARD_BASE,
    overflow: 'hidden',
    marginBottom: 16,
  },
  noModeratorsText: {
    padding: 16,
    color: SCREEN_THEME.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  modRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  modRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E4D0AB',
  },
  modIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F5EFE3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modInfo: { flex: 1 },
  modUid: { fontSize: 13, fontWeight: '800', color: SCREEN_THEME.textPrimary },
  modRole: { fontSize: 11, fontWeight: '600', color: SCREEN_THEME.textSecondary, marginTop: 2 },
  revokeBtn: {
    backgroundColor: '#FDECEA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  revokeBtnText: {
    color: '#D94F3D',
    fontWeight: '800',
    fontSize: 12,
  },
  assignForm: {
    borderTopWidth: 1,
    borderTopColor: '#E4D0AB',
    padding: 14,
    gap: 9,
  },
  assignTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
    marginBottom: 2,
  },
  assignInput: {
    backgroundColor: '#FFF8EA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: SCREEN_THEME.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  assignBtn: {
    borderRadius: 12,
    backgroundColor: '#8A7AB1',
    paddingVertical: 11,
    alignItems: 'center',
  },
  assignBtnDisabled: { opacity: 0.6 },
  assignBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  // Role note card
  roleNoteCard: {
    ...CARD_BASE,
    padding: 16,
    gap: 8,
  },
  roleNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  roleNoteTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: SCREEN_THEME.textPrimary,
  },
  roleNoteBody: {
    fontSize: 13,
    fontWeight: '500',
    color: SCREEN_THEME.textSecondary,
    lineHeight: 19,
  },
});

export default OsbbAdminScreen;


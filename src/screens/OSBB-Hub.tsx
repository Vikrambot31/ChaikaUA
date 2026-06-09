import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import { selectOsbbBuilding, selectOsbbIsSetupDone } from '../redux/slices/osbbSlice';
import { selectUser } from '../redux/slices/authSlice';
import { SCREEN_THEME } from '../utils/screenTheme';
import OsbbSetupScreen from './OSBB-Setup';
import { useOsbbMembership } from '../hooks/useOsbbMembership';
import { OsbbCollection, addOsbbCollection, subscribeOsbbCollections } from '../services/osbbCollections';
import {
  OsbbHouseTopic,
  addHouseTopicForModeration,
  normalizeHouseTopicTitle,
  subscribeApprovedHouseTopics,
  supportHouseTopic,
} from '../services/osbbHouseTopicsService';
import { safeOpenExternalUrl } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import MiniTabBar from '../components/MiniTabBar';

const AMOUNTS = [100, 200, 300, 500, 1000];
type Lang = 'ua' | 'ru' | 'en';

const mapToDetailData = (item: OsbbHouseTopic): DetailItemData => ({
  id: item.id,
  title: item.title,
  description: item.title,
  votesCount: item.votes,
  hasVoted: item.hasVoted,
  sourceType: 'osbb',
  sourceId: item.id,
});

const UI_TEXT = {
  ua: {
    title: 'ОСББ Чайка',
    changeData: 'Змінити дані',
    managerPending: 'Потрібне підтвердження модератора застосунку на статус представника правління ОСББ.',
    opinionTitle: 'Залиште свою думку',
    opinionBody: 'Що найбільше потребує уваги і ремонту в нашому будинку?',
    topicsTitle: 'Теми будинку',
    topicsSubtitle: 'Оберіть уже додану тему або надішліть нову на модерацію.',
    topicPlaceholder: 'Наприклад: ремонт дверей',
    send: 'Надіслати',
    noTopics: 'Поки немає схвалених тем.',
    votesPercent: '% голосів',
    yourVoteCounted: 'Ваш голос за цю тему враховано.',
    totalVotes: 'Всього голосів за теми',
    chooseTopicHint: 'Оберіть тему зі списку або запропонуйте нову.',
    paymentTitle: 'Оплата маленькими частинами',
    paymentSubtitle: 'Оберіть збір і суму. До кожного проєкту привʼязана безпечна Monobank-оплата.',
    collectionTopic: 'Тема збору',
    target: 'Ціль, грн',
    monobankLink: 'Посилання Monobank',
    addCollection: 'Додати збір',
    onlyApproved: 'Лише підтверджений голова правління ОСББ може створювати теми зборів і реквізити оплати.',
    currentCollection: 'Збір зараз',
    collected: 'Зібрано',
    from: 'із',
    addFirstCollection: 'Додайте перший збір.',
    pay: 'Оплатити',
    noActiveCollection: 'Немає активного збору',
    dahSubtitle: 'Сервіс для дому і мешканців ЖК',
    dahBody: 'Зручні сповіщення, новини будинку і швидкий доступ до важливої інформації для мешканців.',
    openDah: 'Відкрити ДАХ',
    topicExistsTitle: 'Тема вже є',
    topicExistsBody: 'Оберіть уже додану тему нижче та підтримайте її голосом.',
    topicSentTitle: 'Тему надіслано',
    topicSentBody: 'Нова тема збережена і відправлена на модерацію. Вона зʼявиться після схвалення.',
    alreadyVoted: 'Ви вже підтримали цю тему.',
    voteError: 'Не вдалося зарахувати голос.',
    topicNotFound: 'Тему не знайдено або вона була видалена.',
    topicNotApproved: 'Ця тема ще не схвалена модератором.',
    votingTitle: 'Голосування',
    setupTitle: 'Збір',
    setupBody: 'Спочатку налаштуйте будинок ОСББ.',
    invalidCollection: 'Вкажіть тему, ціль і посилання на оплату.',
    dahErrorTitle: 'ДАХ',
    dahErrorBody: 'Не вдалося відкрити сайт ДАХ. Спробуйте пізніше.',
    housePrefix: 'буд.',
    aptPrefix: 'кв.',
  },
  ru: {
    title: 'ОСББ Чайка',
    changeData: 'Изменить данные',
    managerPending: 'Требуется подтверждение модератора приложения для статуса представителя правления ОСББ.',
    opinionTitle: 'Оставьте своё мнение',
    opinionBody: 'Что больше всего требует внимания и ремонта в нашем доме?',
    topicsTitle: 'Темы дома',
    topicsSubtitle: 'Выберите уже добавленную тему или отправьте новую на модерацию.',
    topicPlaceholder: 'Например: ремонт двери',
    send: 'Отправить',
    noTopics: 'Пока нет одобренных тем.',
    votesPercent: '% голосов',
    yourVoteCounted: 'Ваш голос по этой теме учтён.',
    totalVotes: 'Всего голосов по темам',
    chooseTopicHint: 'Выберите тему из списка или предложите новую.',
    paymentTitle: 'Оплата маленькими частями',
    paymentSubtitle: 'Выберите сбор и сумму. К каждому проекту привязана безопасная Monobank-оплата.',
    collectionTopic: 'Тема сбора',
    target: 'Цель, грн',
    monobankLink: 'Ссылка Monobank',
    addCollection: 'Добавить сбор',
    onlyApproved: 'Только подтверждённый глава правления ОСББ может создавать темы сборов и реквизиты оплаты.',
    currentCollection: 'Текущий сбор',
    collected: 'Собрано',
    from: 'из',
    addFirstCollection: 'Добавьте первый сбор.',
    pay: 'Оплатить',
    noActiveCollection: 'Нет активного сбора',
    dahSubtitle: 'Сервис для дома и жителей ЖК',
    dahBody: 'Удобные уведомления, новости дома и быстрый доступ к важной информации для жителей.',
    openDah: 'Открыть ДАХ',
    topicExistsTitle: 'Тема уже есть',
    topicExistsBody: 'Выберите уже добавленную тему ниже и поддержите её голосом.',
    topicSentTitle: 'Тема отправлена',
    topicSentBody: 'Новая тема сохранена и отправлена на модерацию. Она появится после одобрения.',
    alreadyVoted: 'Вы уже поддержали эту тему.',
    voteError: 'Не удалось засчитать голос.',
    topicNotFound: 'Тема не найдена или была удалена.',
    topicNotApproved: 'Эта тема ещё не одобрена модератором.',
    votingTitle: 'Голосование',
    setupTitle: 'Сбор',
    setupBody: 'Сначала настройте дом ОСББ.',
    invalidCollection: 'Укажите тему, цель и ссылку на оплату.',
    dahErrorTitle: 'ДАХ',
    dahErrorBody: 'Не удалось открыть сайт ДАХ. Попробуйте позже.',
    housePrefix: 'дом',
    aptPrefix: 'кв.',
  },
  en: {
    title: 'OSBB Chaika Life',
    changeData: 'Change details',
    managerPending: 'Moderator confirmation is required for OSBB board representative status.',
    opinionTitle: 'Share your opinion',
    opinionBody: 'What needs attention and repair in our building the most?',
    topicsTitle: 'Building topics',
    topicsSubtitle: 'Choose an existing topic or submit a new one for moderation.',
    topicPlaceholder: 'For example: entrance door repair',
    send: 'Send',
    noTopics: 'No approved topics yet.',
    votesPercent: '% votes',
    yourVoteCounted: 'Your vote for this topic is counted.',
    totalVotes: 'Total votes on topics',
    chooseTopicHint: 'Choose a topic from the list or suggest a new one.',
    paymentTitle: 'Split payments',
    paymentSubtitle: 'Choose a collection and amount. Each project has a secure Monobank payment link.',
    collectionTopic: 'Collection topic',
    target: 'Target, UAH',
    monobankLink: 'Monobank link',
    addCollection: 'Add collection',
    onlyApproved: 'Only an approved OSBB board head can create collection topics and payment details.',
    currentCollection: 'Current collection',
    collected: 'Collected',
    from: 'of',
    addFirstCollection: 'Add the first collection.',
    pay: 'Pay',
    noActiveCollection: 'No active collection',
    dahSubtitle: 'Service for building residents',
    dahBody: 'Useful notifications, building news and quick access to important resident information.',
    openDah: 'Open DAH',
    topicExistsTitle: 'Topic already exists',
    topicExistsBody: 'Select the existing topic below and support it with your vote.',
    topicSentTitle: 'Topic submitted',
    topicSentBody: 'New topic is saved and sent for moderation. It will appear after approval.',
    alreadyVoted: 'You have already supported this topic.',
    voteError: 'Failed to count vote.',
    topicNotFound: 'Topic not found or has been deleted.',
    topicNotApproved: 'This topic has not been approved by a moderator yet.',
    votingTitle: 'Voting',
    setupTitle: 'Collection',
    setupBody: 'Set up OSBB building first.',
    invalidCollection: 'Enter topic, target and payment link.',
    dahErrorTitle: 'DAH',
    dahErrorBody: 'Failed to open DAH website. Try again later.',
    housePrefix: 'bld.',
    aptPrefix: 'apt.',
  },
} as const;

const OsbbHubScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const navLock = useRef(false);
  const isSetupDone = useSelector(selectOsbbIsSetupDone);
  const osbb = useSelector(selectOsbbBuilding);
  useOsbbMembership();
  const user = useSelector(selectUser);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language];
  const [showSetup, setShowSetup] = useState(!isSetupDone);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [houseTopics, setHouseTopics] = useState<OsbbHouseTopic[]>([]);
  const [pollTitle, setPollTitle] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(300);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collections, setCollections] = useState<OsbbCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [newCollectionTitle, setNewCollectionTitle] = useState('');
  const [newCollectionTarget, setNewCollectionTarget] = useState('');
  const [newCollectionUrl, setNewCollectionUrl] = useState('');

  useEffect(() => {
    if (!osbb.buildingId) {
      setCollections([]);
      setSelectedCollectionId('');
      return undefined;
    }
    return subscribeOsbbCollections(osbb.buildingId, (items) => {
      setCollections(items);
      setSelectedCollectionId((current) => current || items[0]?.id || '');
    });
  }, [osbb.buildingId]);

  useEffect(() => {
    if (!osbb.buildingId) {
      setHouseTopics([]);
      setSelectedTopicId(null);
      return undefined;
    }
    return subscribeApprovedHouseTopics(osbb.buildingId, user?.id, (items) => {
      setHouseTopics(items);
      setSelectedTopicId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || null);
    });
  }, [osbb.buildingId, user?.id]);

  const addPollTopic = async () => {
    if (!osbb.buildingId || !user?.id || !pollTitle.trim()) return;

    const normalizedInput = normalizeHouseTopicTitle(pollTitle);
    const duplicate = houseTopics.find((item) => normalizeHouseTopicTitle(item.title) === normalizedInput);
    if (duplicate) {
      setSelectedTopicId(duplicate.id);
      Alert.alert(text.topicExistsTitle, text.topicExistsBody);
      return;
    }

    await addHouseTopicForModeration(osbb.buildingId, {
      title: pollTitle.trim(),
      createdBy: user.id,
    });

    setPollTitle('');
    Alert.alert(text.topicSentTitle, text.topicSentBody);
  };

  const handleSupportTopic = async (topicId: string) => {
    if (!osbb.buildingId || !user?.id) return;

    try {
      await supportHouseTopic(osbb.buildingId, topicId, user.id);
      setSelectedTopicId(topicId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      const message = msg === 'already-voted'
        ? text.alreadyVoted
        : msg === 'topic-not-found'
        ? text.topicNotFound
        : msg === 'topic-not-approved'
        ? text.topicNotApproved
        : text.voteError;
      Alert.alert(text.votingTitle, message);
    }
  };

  const canManageCollections = osbb.membershipRole === 'manager' && osbb.membershipStatus === 'approved';

  const addCollection = async () => {
    if (!canManageCollections) {
      Alert.alert(language === 'en' ? 'OSBB' : language === 'ru' ? 'ОСББ' : 'ОСББ', text.onlyApproved);
      return;
    }
    if (!osbb.buildingId) {
      Alert.alert(text.setupTitle, text.setupBody);
      return;
    }

    const targetAmount = Number(newCollectionTarget);
    if (!newCollectionTitle.trim() || !Number.isFinite(targetAmount) || targetAmount <= 0 || !newCollectionUrl.trim()) {
      Alert.alert(text.setupTitle, text.invalidCollection);
      return;
    }

    await addOsbbCollection(osbb.buildingId, {
      title: newCollectionTitle.trim(),
      targetAmount,
      paymentUrl: newCollectionUrl.trim(),
    });
    setNewCollectionTitle('');
    setNewCollectionTarget('');
    setNewCollectionUrl('');
  };

  const openDahSite = async () => {
    try {
      await safeOpenExternalUrl('https://dah-online.com/', language);
    } catch {
      Alert.alert(text.dahErrorTitle, text.dahErrorBody);
    }
  };

  const totalVotes = useMemo(
    () => houseTopics.reduce((sum, option) => sum + option.votes, 0),
    [houseTopics]
  );
  const selectedCollection = collections.find((item) => item.id === selectedCollectionId) ?? collections[0];

  if (showSetup) {
    return <OsbbSetupScreen onDone={() => setShowSetup(false)} />;
  }

  const isManagerPending =
    osbb.membershipRole === 'manager' && osbb.membershipStatus === 'pending';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/WEBP-version/OSBB.webp')} style={styles.headerImage} resizeMode="cover" />
          <View style={styles.headerBody}>
            <Text style={styles.title}>{text.title}</Text>
            <Text style={styles.address}>
              {osbb.street}, {text.housePrefix} {osbb.houseNumber}, {text.aptPrefix} {osbb.apartment}
            </Text>
            <TouchableOpacity style={styles.changeBtn} onPress={() => setShowSetup(true)} activeOpacity={0.82}>
              <Text style={styles.changeText}>{text.changeData}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isManagerPending ? (
          <View style={styles.pendingBanner}>
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#fff" />
            <Text style={styles.pendingText}>{text.managerPending}</Text>
          </View>
        ) : null}

        <View style={styles.opinionCard}>
          <Text style={styles.opinionTitle}>{text.opinionTitle}</Text>
          <Text style={styles.opinionText}>{text.opinionBody}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{text.topicsTitle}</Text>
          <Text style={styles.sectionSub}>{text.topicsSubtitle}</Text>

          <View style={styles.inlineForm}>
            <TextInput
              value={pollTitle}
              onChangeText={setPollTitle}
              placeholder={text.topicPlaceholder}
              placeholderTextColor={SCREEN_THEME.textMuted}
              style={styles.input}
            />
            <TouchableOpacity style={styles.smallButton} onPress={() => void addPollTopic()} activeOpacity={0.84}>
              <Text style={styles.smallButtonText}>{text.send}</Text>
            </TouchableOpacity>
          </View>

          {houseTopics.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topicPickerRow}>
              {houseTopics.map((topic) => (
                <TouchableOpacity
                  key={`picker-${topic.id}`}
                  style={[styles.topicPickerChip, selectedTopicId === topic.id && styles.topicPickerChipActive]}
                  onPress={() => setSelectedTopicId(topic.id)}
                  activeOpacity={0.84}
                >
                  <Text style={[styles.topicPickerText, selectedTopicId === topic.id && styles.topicPickerTextActive]} numberOfLines={1}>
                    {topic.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.pollList}>
            {houseTopics.length === 0 ? (
              <Text style={styles.emptyInline}>{text.noTopics}</Text>
            ) : houseTopics.map((option) => {
              const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
              const isSelected = selectedTopicId === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.pollOption, isSelected && styles.pollOptionActive]}
                  onPress={() => { if (navLock.current) return; navLock.current = true; navigation.navigate('ItemDetailScreen', { item: mapToDetailData(option) }); setTimeout(() => { navLock.current = false; }, 800); }}
                  activeOpacity={0.86}
                >
                  <View style={styles.pollTop}>
                    <Text style={styles.pollTitle}>{option.title}</Text>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); setSelectedTopicId(option.id); if (!option.hasVoted) { void handleSupportTopic(option.id); } }}
                      activeOpacity={0.75}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.pollVotes}>{option.votes}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.resultBar}>
                    <View style={[styles.resultFill, { width: `${percent}%` }]} />
                  </View>
                  <Text style={styles.percentText}>{percent}{text.votesPercent}</Text>
                  {option.hasVoted ? <Text style={styles.votedText}>{text.yourVoteCounted}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedTopicId ? (
            <Text style={styles.hintText}>{text.totalVotes}: {totalVotes}</Text>
          ) : (
            <Text style={styles.hintText}>{text.chooseTopicHint}</Text>
          )}
        </View>

        <View style={styles.payCard}>
          <MaterialCommunityIcons name="hand-coin-outline" size={34} color="#fff" />
          <Text style={styles.payTitle}>{text.paymentTitle}</Text>
          <Text style={styles.paySub}>{text.paymentSubtitle}</Text>

          {canManageCollections ? (
            <View style={styles.collectionForm}>
              <TextInput value={newCollectionTitle} onChangeText={setNewCollectionTitle} placeholder={text.collectionTopic} placeholderTextColor="rgba(255,255,255,0.5)" style={styles.darkInput} />
              <TextInput value={newCollectionTarget} onChangeText={(value) => setNewCollectionTarget(value.replace(/[^0-9]/g, ''))} placeholder={text.target} placeholderTextColor="rgba(255,255,255,0.5)" keyboardType="number-pad" style={styles.darkInput} />
              <TextInput value={newCollectionUrl} onChangeText={setNewCollectionUrl} placeholder={text.monobankLink} placeholderTextColor="rgba(255,255,255,0.5)" autoCapitalize="none" style={styles.darkInput} />
              <TouchableOpacity style={styles.addCollectionBtn} onPress={() => void addCollection()} activeOpacity={0.86}>
                <Text style={styles.addCollectionText}>{text.addCollection}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.noCollectionText}>{text.onlyApproved}</Text>
          )}

          {selectedCollection ? (
            <TouchableOpacity style={styles.collectionSelect} onPress={() => setCollectionsOpen((value) => !value)} activeOpacity={0.86}>
              <View style={styles.collectionSelectCopy}>
                <Text style={styles.collectionLabel}>{text.currentCollection}</Text>
                <Text style={styles.collectionTitle}>{selectedCollection.title}</Text>
                <Text style={styles.collectionMeta}>{text.collected} {selectedCollection.collectedAmount} {text.from} {selectedCollection.targetAmount} грн</Text>
                <View style={styles.darkProgress}>
                  <View style={[styles.darkProgressFill, { width: `${Math.min(100, Math.round((selectedCollection.collectedAmount / selectedCollection.targetAmount) * 100))}%` }]} />
                </View>
              </View>
              <MaterialCommunityIcons name={collectionsOpen ? 'chevron-up' : 'chevron-down'} size={24} color="#fff" />
            </TouchableOpacity>
          ) : (
            <Text style={styles.noCollectionText}>{text.addFirstCollection}</Text>
          )}

          {collectionsOpen ? (
            <View style={styles.collectionList}>
              {collections.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.collectionItem, selectedCollectionId === item.id && styles.collectionItemActive]}
                  onPress={() => {
                    setSelectedCollectionId(item.id);
                    setCollectionsOpen(false);
                  }}
                  activeOpacity={0.84}
                >
                  <Text style={styles.collectionItemTitle}>{item.title}</Text>
                  <Text style={styles.collectionItemMeta}>{text.collected} {item.collectedAmount} {text.from} {item.targetAmount} грн</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.amountGrid}>
            {AMOUNTS.map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[styles.amountBtn, selectedAmount === amount && styles.amountBtnActive]}
                onPress={() => setSelectedAmount(amount)}
                activeOpacity={0.85}
              >
                <Text style={[styles.amountText, selectedAmount === amount && styles.amountTextActive]}>{amount} грн</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.payButton, !selectedCollection && styles.payButtonDisabled]}
            disabled={!selectedCollection}
            onPress={() => {
              if (selectedCollection) void safeOpenExternalUrl(selectedCollection.paymentUrl, language);
            }}
            activeOpacity={0.86}
          >
            <Text style={styles.payButtonText}>{text.pay} {selectedAmount} грн</Text>
            <Text style={styles.payButtonSub}>{selectedCollection ? `Monobank: ${selectedCollection.title}` : text.noActiveCollection}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dahCard}>
          <View style={styles.dahTopRow}>
            <View style={styles.dahIconWrap}>
              <MaterialCommunityIcons name="home-group" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dahTitle}>ДАХ</Text>
              <Text style={styles.dahSubtitle}>{text.dahSubtitle}</Text>
            </View>
          </View>

          <View style={styles.dahIconsRow}>
            <View style={styles.dahMiniIcon}><MaterialCommunityIcons name="bell-outline" size={18} color={SCREEN_THEME.enamelBlue} /></View>
            <View style={styles.dahMiniIcon}><MaterialCommunityIcons name="cellphone" size={18} color={SCREEN_THEME.enamelBlue} /></View>
            <View style={styles.dahMiniIcon}><MaterialCommunityIcons name="shield-check-outline" size={18} color={SCREEN_THEME.enamelBlue} /></View>
          </View>

          <Text style={styles.dahText}>{text.dahBody}</Text>

          <TouchableOpacity style={styles.dahButton} onPress={() => void openDahSite()} activeOpacity={0.86}>
            <Text style={styles.dahButtonText}>{text.openDah}</Text>
            <MaterialCommunityIcons name="open-in-new" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </ScrollView>
      <MiniTabBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  content: { padding: 16, paddingBottom: 110 },
  header: {
    backgroundColor: '#3A352F',
    borderRadius: 28,
    overflow: 'hidden',
    padding: 0,
    alignItems: 'center',
    marginBottom: 12,
    ...SCREEN_THEME.raisedShadowStrong,
  },
  headerImage: { width: '100%', height: 200 },
  headerBody: { width: '100%', padding: 18, alignItems: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  address: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  changeBtn: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 11,
  },
  changeText: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '800' },
  pendingBanner: {
    backgroundColor: '#C84A4A',
    borderRadius: 18,
    padding: 13,
    flexDirection: 'row',
    gap: 9,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  pendingText: { color: '#fff', flex: 1, fontSize: 13, fontWeight: '900', lineHeight: 18 },
  opinionCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    ...SCREEN_THEME.raisedShadow,
  },
  opinionTitle: { color: SCREEN_THEME.textPrimary, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  opinionText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 16,
    marginBottom: 14,
    ...SCREEN_THEME.raisedShadow,
  },
  sectionTitle: { color: SCREEN_THEME.textPrimary, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  sectionSub: { color: SCREEN_THEME.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center', fontWeight: '600' },
  inlineForm: { gap: 8, marginTop: 14 },
  input: { backgroundColor: '#FFF8EA', borderRadius: 14, borderWidth: 1, borderColor: '#E4D0AB', paddingHorizontal: 12, paddingVertical: 11, color: SCREEN_THEME.textPrimary, fontWeight: '800' },
  smallButton: { borderRadius: 14, backgroundColor: SCREEN_THEME.enamelBlue, alignItems: 'center', paddingVertical: 12 },
  smallButtonText: { color: '#fff', fontWeight: '900' },
  topicPickerRow: { gap: 8, marginTop: 12, paddingRight: 4 },
  topicPickerChip: {
    maxWidth: 220,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FFF8EA',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  topicPickerChipActive: { borderColor: SCREEN_THEME.enamelBlue, backgroundColor: SCREEN_THEME.enamelBlue + '14' },
  topicPickerText: { color: SCREEN_THEME.textPrimary, fontSize: 13, fontWeight: '800' },
  topicPickerTextActive: { color: SCREEN_THEME.enamelBlue },
  emptyInline: { color: SCREEN_THEME.textSecondary, fontWeight: '800', textAlign: 'center', paddingVertical: 12 },
  pollList: { gap: 9, marginTop: 14 },
  pollOption: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.cardCream,
    padding: 12,
  },
  pollOptionActive: { borderColor: SCREEN_THEME.enamelBlue, backgroundColor: SCREEN_THEME.enamelBlue + '16' },
  pollTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pollTitle: { flex: 1, color: SCREEN_THEME.textPrimary, fontSize: 15, fontWeight: '900' },
  pollVotes: { color: SCREEN_THEME.enamelBlue, fontSize: 16, fontWeight: '900' },
  resultBar: { height: 8, backgroundColor: '#E9DFCC', borderRadius: 999, overflow: 'hidden', marginTop: 9 },
  resultFill: { height: '100%', backgroundColor: SCREEN_THEME.enamelBlue, borderRadius: 999 },
  percentText: { color: SCREEN_THEME.textSecondary, fontSize: 12, fontWeight: '800', marginTop: 5 },
  votedText: { color: SCREEN_THEME.woodGreenDark, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  hintText: { color: SCREEN_THEME.textSecondary, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  payCard: {
    backgroundColor: '#3A352F',
    borderRadius: 26,
    padding: 18,
    alignItems: 'center',
    ...SCREEN_THEME.raisedShadowStrong,
  },
  payTitle: { color: '#fff', fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 10, lineHeight: 27 },
  paySub: { color: 'rgba(255,255,255,0.76)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, fontWeight: '600' },
  collectionForm: { width: '100%', gap: 8, marginTop: 16 },
  darkInput: { color: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 11, fontWeight: '800' },
  addCollectionBtn: { borderRadius: 14, backgroundColor: SCREEN_THEME.terracotta, paddingVertical: 12, alignItems: 'center' },
  addCollectionText: { color: '#fff', fontWeight: '900' },
  collectionSelect: {
    width: '100%',
    marginTop: 16,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  collectionSelectCopy: { flex: 1 },
  collectionLabel: { color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  collectionTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 3 },
  collectionMeta: { color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: '700', marginTop: 4 },
  darkProgress: { height: 8, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, overflow: 'hidden', marginTop: 9 },
  darkProgressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 999 },
  noCollectionText: { color: 'rgba(255,255,255,0.72)', fontWeight: '900', marginTop: 16 },
  collectionList: { width: '100%', gap: 8, marginTop: 9 },
  collectionItem: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    padding: 12,
  },
  collectionItemActive: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: '#fff' },
  collectionItemTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
  collectionItemMeta: { color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: '700', marginTop: 4 },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16, justifyContent: 'center' },
  amountBtn: {
    minWidth: '30%',
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  amountBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  amountText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  amountTextActive: { color: '#3A352F' },
  payButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  payButtonDisabled: { opacity: 0.5 },
  payButtonText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  payButtonSub: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '800', marginTop: 2 },
  dahCard: {
    marginTop: 14,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    padding: 16,
    ...SCREEN_THEME.raisedShadow,
  },
  dahTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dahIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: SCREEN_THEME.enamelBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dahTitle: { color: SCREEN_THEME.textPrimary, fontSize: 20, fontWeight: '900' },
  dahSubtitle: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 2 },
  dahIconsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  dahMiniIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFF8EA',
    borderWidth: 1,
    borderColor: '#E4D0AB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dahText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  dahButton: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: SCREEN_THEME.enamelBlue,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dahButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});

export default OsbbHubScreen;

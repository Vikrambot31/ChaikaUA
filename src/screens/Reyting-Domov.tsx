import React, { useMemo, useState, useEffect } from 'react';
import { Alert, FlatList, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MiniTabBar from '../components/MiniTabBar';
import AlertHelper from '../utils/alertHelper';
import ErrorHandler from '../utils/errorHandler';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';
import { BUILDINGS, getFullAddress } from '../data/buildings';
import { LastRatingMap, canRateNow, getRatingDaysLeft } from '../utils/monthlyRating';
import { useTranslation } from '../i18n/useTranslation';

const STORAGE_KEY = '@chaika:building_ratings_v1';
const LAST_VOTE_KEY = '@chaika:building_rating_votes_v1';

type Building = {
  id: string;
  address: string;
  complaints: number | null;
  cleaning: number;
  elevator: number;
  electricity: number;
  services: number;
  votes: number;
};

type RatingValue = {
  cleaning: number;
  elevator: number;
  electricity: number;
  services: number;
  votes: number;
  complaints: number;
};

type RatingsByBuilding = Record<string, RatingValue>;

const RATING_EXPLANATION = {
  ua: {
    title: 'Як рахується рейтинг',
    body: 'Підсумкова оцінка - це середнє значення чотирьох категорій: прибирання, ліфт, електрика та сервіси. Чим більше голосів, тим надійніший рейтинг будинку.',
  },
  ru: {
    title: 'Как рассчитывается рейтинг',
    body: 'Итоговая оценка - это среднее значение четырёх категорий: уборка, лифт, электричество и сервисы. Чем больше голосов, тем надёжнее рейтинг дома.',
  },
  en: {
    title: 'How the rating is calculated',
    body: 'The final score is the average of four categories: cleaning, elevator, electricity, and services. More votes make the building rating more reliable.',
  },
} as const;

const getEmptyRating = (): RatingValue => ({
  cleaning: 0,
  elevator: 0,
  electricity: 0,
  services: 0,
  votes: 0,
  complaints: 0,
});

function StarRow({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <View style={styles.starRow}>
        <Text style={styles.starValue}>—</Text>
      </View>
    );
  }
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <MaterialCommunityIcons key={s} name={s <= Math.round(value) ? 'star' : 'star-outline'} size={12} color={s <= Math.round(value) ? '#FFA000' : '#D6C4A3'} />
      ))}
      <Text style={styles.starValue}>{value.toFixed(1)}</Text>
    </View>
  );
}

export default function RatingScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const { t } = useTranslation();
  const explanation = RATING_EXPLANATION[language];
  const [tab, setTab] = useState<'top20' | 'vote'>('top20');
  const [ratings, setRatings] = useState<Record<string, number>>({ cleaning: 0, elevator: 0, electricity: 0, services: 0 });
  const [selectedBuildingId, setSelectedBuildingId] = useState(BUILDINGS[0]?.id ?? '');
  const [buildingPickerOpen, setBuildingPickerOpen] = useState(false);
  const [storedRatings, setStoredRatings] = useState<RatingsByBuilding>({});
  const [lastVotes, setLastVotes] = useState<LastRatingMap>({});
  const [voted, setVoted] = useState(false);

  const CATEGORIES = [
    { key: 'cleaning', label: t.ratingScreen.categories.cleaning, icon: 'broom' as const },
    { key: 'elevator', label: t.ratingScreen.categories.elevator, icon: 'elevator' as const },
    { key: 'electricity', label: t.ratingScreen.categories.electricity, icon: 'lightning-bolt' as const },
    { key: 'services', label: t.ratingScreen.categories.services, icon: 'office-building' as const },
  ];

  useEffect(() => {
    ErrorHandler.setLanguage(language);
    AlertHelper.setAlertLanguage(language);
  }, [language]);

  useEffect(() => {
    const loadRatings = async () => {
      try {
        const [raw, rawVotes] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(LAST_VOTE_KEY),
        ]);
        setStoredRatings(raw ? (JSON.parse(raw) as RatingsByBuilding) : {});
        setLastVotes(rawVotes ? (JSON.parse(rawVotes) as LastRatingMap) : {});
      } catch {
        setStoredRatings({});
        setLastVotes({});
      }
    };

    void loadRatings();
  }, []);

  useEffect(() => {
    setVoted(!canRateNow(lastVotes[selectedBuildingId]));
  }, [lastVotes, selectedBuildingId]);

  const buildingList: Building[] = useMemo(() => {
    return BUILDINGS.map((b) => {
      const saved = storedRatings[b.id];
      const rating = saved ?? getEmptyRating();
      return {
        id: b.id,
        address: getFullAddress(b),
        cleaning: rating.cleaning,
        elevator: rating.elevator,
        electricity: rating.electricity,
        services: rating.services,
        votes: rating.votes,
        complaints: rating.complaints,
      };
    }).sort((a, b) => Number(getBuildingScoreValue(b)) - Number(getBuildingScoreValue(a)));
  }, [storedRatings]);

  const selectedBuilding = BUILDINGS.find((building) => building.id === selectedBuildingId) ?? BUILDINGS[0];

  const handleVote = (category: string, value: number) => setRatings((prev) => ({ ...prev, [category]: value }));
  const handleSubmitVote = async () => {
    const daysLeft = getRatingDaysLeft(lastVotes[selectedBuildingId]);
    if (daysLeft > 0) {
      Alert.alert(t.ratingScreen.ratingAlreadySubmitted, `${t.ratingScreen.canRateAgainIn} ${daysLeft} ${t.ratingScreen.days}`);
      return;
    }
    const allFilled = CATEGORIES.every((c) => ratings[c.key] > 0);
    if (!allFilled) {
      AlertHelper.rateAllCategories();
      return;
    }
    const previous = storedRatings[selectedBuildingId] ?? getEmptyRating();
    const nextVotes = previous.votes + 1;
    const nextRating: RatingValue = {
      cleaning: (previous.cleaning * previous.votes + ratings.cleaning) / nextVotes,
      elevator: (previous.elevator * previous.votes + ratings.elevator) / nextVotes,
      electricity: (previous.electricity * previous.votes + ratings.electricity) / nextVotes,
      services: (previous.services * previous.votes + ratings.services) / nextVotes,
      votes: nextVotes,
      complaints: previous.complaints,
    };
    const next = { ...storedRatings, [selectedBuildingId]: nextRating };
    const nextLastVotes = { ...lastVotes, [selectedBuildingId]: new Date().toISOString() };
    setStoredRatings(next);
    setLastVotes(nextLastVotes);
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)),
      AsyncStorage.setItem(LAST_VOTE_KEY, JSON.stringify(nextLastVotes)),
    ]);
    setVoted(true);
    AlertHelper.success(t.ratingScreen.thankYou);
  };

  function getBuildingScoreValue(b: Building | RatingValue): number {
    return (b.cleaning + b.elevator + b.electricity + b.services) / 4;
  }

  const getBuildingScore = (b: Building): string => {
    return getBuildingScoreValue(b).toFixed(1);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundLayer}>
        {LIGHT_ORBS.map((orb, index) => (
          <View key={index} style={[styles.orb, orb]} />
        ))}
      </View>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t.ratingScreen.title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Image source={require('../../assets/Reiting_Domov.png')} style={styles.headerImage} resizeMode="contain" />

      <>
          <View style={styles.tabBar}>
            <TouchableOpacity style={[styles.tab, tab === 'top20' && styles.tabActive]} onPress={() => setTab('top20')}>
              <Text style={[styles.tabText, tab === 'top20' && styles.tabTextActive]}>{t.ratingScreen.tabs.top20}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tab === 'vote' && styles.tabActive]} onPress={() => setTab('vote')}>
              <Text style={[styles.tabText, tab === 'vote' && styles.tabTextActive]}>{t.ratingScreen.tabs.vote}</Text>
            </TouchableOpacity>
          </View>

          {tab === 'top20' ? (
            <FlatList
              data={buildingList}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              ListHeaderComponent={(
                <>
                  <View style={styles.listHeader}><Text style={styles.listHeaderText}>{t.ratingScreen.listHeader}</Text></View>
                  <View style={styles.explanationCard}>
                    <MaterialCommunityIcons name="information-outline" size={18} color={SCREEN_THEME.enamelBlue} />
                    <View style={styles.explanationCopy}>
                      <Text style={styles.explanationTitle}>{explanation.title}</Text>
                      <Text style={styles.explanationText}>{explanation.body}</Text>
                    </View>
                  </View>
                </>
              )}
              renderItem={({ item, index }) => (
                <View style={[styles.buildingCard, index < 3 && styles.buildingCardTop]}>
                  <Image source={require('../../assets/Dom1.png')} style={styles.buildingCardDom} resizeMode="cover" />
                  <View style={styles.buildingCardInner}>
                    <View style={styles.buildingRank}>
                      <Text style={styles.rankNum}>#{index + 1}</Text>
                    </View>
                    <View style={styles.buildingInfo}>
                      <Text style={styles.buildingAddress}>{item.address}</Text>
                      <View style={styles.buildingStats}>
                        {CATEGORIES.map((cat) => (
                          <View key={cat.key} style={styles.statItem}>
                            <MaterialCommunityIcons name={cat.icon} size={12} color={SCREEN_THEME.textSecondary} />
                            <StarRow value={item[cat.key as keyof typeof item] as number} />
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={styles.buildingScore}>
                      <Text style={styles.scoreNum}>{getBuildingScore(item)}</Text>
                      <Text style={styles.scoreLabel}>{t.ratingScreen.average}</Text>
                      <View style={styles.complaintsBadge}>
                        <Text style={styles.complaintsText}>{item.votes} {t.ratingScreen.votes}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                  style={styles.showOnMapBtn}
                  activeOpacity={0.78}
                  onPress={() => navigation.navigate('MainTabs', { screen: 'MapTab', params: { focusBuildingId: item.id } })}
                >
                  <MaterialCommunityIcons name="map-marker-outline" size={13} color={SCREEN_THEME.enamelBlue} />
                  <Text style={styles.showOnMapText}>{t.ratingScreen.showOnMap}</Text>
                </TouchableOpacity>
                </View>
              )}
            />
          ) : (
            <ScrollView contentContainerStyle={styles.voteScroll}>
              <View style={styles.voteCard}>
                <Text style={styles.voteTitle}>{t.ratingScreen.rateYourHome}</Text>
                <Text style={styles.voteSubtitle}>{t.ratingScreen.rateSubtitle}</Text>
                <TouchableOpacity style={styles.buildingSelect} onPress={() => setBuildingPickerOpen((value) => !value)} activeOpacity={0.84}>
                  <View style={styles.buildingSelectCopy}>
                    <Text style={styles.buildingSelectLabel}>{t.ratingScreen.buildingForRating}</Text>
                    <Text style={styles.buildingSelectText}>{selectedBuilding ? getFullAddress(selectedBuilding) : t.ratingScreen.selectBuilding}</Text>
                  </View>
                  <MaterialCommunityIcons name={buildingPickerOpen ? 'chevron-up' : 'chevron-down'} size={23} color={SCREEN_THEME.textPrimary} />
                </TouchableOpacity>
                {buildingPickerOpen ? (
                  <View style={styles.buildingPicker}>
                    {BUILDINGS.map((building) => (
                      <TouchableOpacity
                        key={building.id}
                        style={[styles.buildingPickerItem, selectedBuildingId === building.id && styles.buildingPickerItemActive]}
                        onPress={() => {
                          setSelectedBuildingId(building.id);
                          setBuildingPickerOpen(false);
                        }}
                        activeOpacity={0.78}
                      >
                        <Text style={styles.buildingPickerText}>{getFullAddress(building)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {voted ? (
                  <View style={styles.votedBanner}>
                    <MaterialCommunityIcons name="check-circle" size={28} color="#4F7A3D" />
                    <Text style={styles.votedText}>{t.ratingScreen.votedTitle}</Text>
                    <Text style={styles.votedSub}>{t.ratingScreen.votedSubtitle}</Text>
                  </View>
                ) : (
                  <>
                    {CATEGORIES.map((cat) => (
                      <View key={cat.key} style={styles.ratingRow}>
                        <View style={styles.ratingLabel}>
                          <MaterialCommunityIcons name={cat.icon} size={20} color={SCREEN_THEME.terracottaDark} />
                          <Text style={styles.ratingLabelText}>{cat.label}</Text>
                        </View>
                        <View style={styles.starsInput}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity key={star} onPress={() => handleVote(cat.key, star)} activeOpacity={0.7}>
                              <MaterialCommunityIcons name={star <= (ratings[cat.key] || 0) ? 'star' : 'star-outline'} size={30} color={star <= (ratings[cat.key] || 0) ? '#FFA000' : '#D6C4A3'} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity style={styles.submitVoteBtn} onPress={handleSubmitVote} activeOpacity={0.85}>
                      <Text style={styles.submitVoteBtnText}>{t.ratingScreen.submitRating}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          )}
        </>
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  backgroundLayer: { ...StyleSheet.absoluteFillObject },
  orb: { position: 'absolute', borderRadius: 999 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1E1BC', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0C89A' },
  headerSpacer: { width: 42 },
  title: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary },
  headerImage: { width: '100%', height: 150, marginTop: 4, marginBottom: 8 },
  gateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  gateTitle: { fontSize: 24, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginTop: 16, marginBottom: 10 },
  gateDesc: { fontSize: 15, color: SCREEN_THEME.textSecondary, textAlign: 'center', lineHeight: 23, marginBottom: 24 },
  gateBtn: { backgroundColor: SCREEN_THEME.terracotta, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 28, borderWidth: 1, borderColor: SCREEN_THEME.terracottaDark },
  gateBtnText: { color: '#FFF9EE', fontWeight: '900', fontSize: 15 },
  tabBar: { flexDirection: 'row', marginHorizontal: 16, marginTop: 6, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 18, padding: 4, borderWidth: 1, borderColor: '#E4D0AB' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14 },
  tabActive: { backgroundColor: '#F1E1BC' },
  tabText: { fontSize: 13, color: SCREEN_THEME.textMuted, fontWeight: '700' },
  tabTextActive: { color: SCREEN_THEME.textPrimary, fontWeight: '900' },
  list: { padding: 16, paddingBottom: 110 },
  listHeader: { backgroundColor: '#FFF7E8', borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E8D5AC' },
  listHeaderText: { fontSize: 13, color: SCREEN_THEME.textSecondary, textAlign: 'center', fontWeight: '700', lineHeight: 19 },
  explanationCard: { flexDirection: 'row', gap: 10, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#D7E5EA' },
  explanationCopy: { flex: 1 },
  explanationTitle: { color: SCREEN_THEME.textPrimary, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  explanationText: { color: SCREEN_THEME.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  buildingCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 20, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E4D0AB', overflow: 'hidden' },
  buildingCardDom: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 72, opacity: 0.13 },
  buildingCardInner: { flexDirection: 'row', alignItems: 'center' },
  showOnMapBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 8, marginLeft: 44, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, backgroundColor: 'rgba(79,131,186,0.1)', borderWidth: 1, borderColor: 'rgba(79,131,186,0.25)' },
  showOnMapText: { fontSize: 11, color: SCREEN_THEME.enamelBlue, fontWeight: '700' },
  buildingCardTop: { borderColor: SCREEN_THEME.terracottaDark },
  buildingRank: { width: 36, alignItems: 'center' },
  rankNum: { fontSize: 16, fontWeight: '900', color: SCREEN_THEME.terracottaDark },
  buildingInfo: { flex: 1, marginLeft: 8 },
  buildingAddress: { fontSize: 13, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 6 },
  buildingStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 6 },
  starRow: { flexDirection: 'row', alignItems: 'center' },
  starValue: { fontSize: 11, color: SCREEN_THEME.textMuted, marginLeft: 2 },
  buildingScore: { alignItems: 'center', marginLeft: 8 },
  scoreNum: { fontSize: 20, fontWeight: '900', color: SCREEN_THEME.enamelBlueDark },
  scoreLabel: { fontSize: 10, color: SCREEN_THEME.textMuted },
  complaintsBadge: { backgroundColor: '#FFF1E7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, marginTop: 4 },
  complaintsText: { fontSize: 10, color: SCREEN_THEME.terracottaDark, fontWeight: '700' },
  voteScroll: { padding: 16, paddingBottom: 110 },
  voteCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#E4D0AB' },
  voteTitle: { fontSize: 18, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 6 },
  voteSubtitle: { fontSize: 13, color: SCREEN_THEME.textSecondary, marginBottom: 20, lineHeight: 18 },
  buildingSelect: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: SCREEN_THEME.cardCream,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  buildingSelectCopy: { flex: 1 },
  buildingSelectLabel: { color: SCREEN_THEME.textSecondary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  buildingSelectText: { color: SCREEN_THEME.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 3 },
  buildingPicker: { gap: 7, marginBottom: 12 },
  buildingPickerItem: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E4D0AB',
    backgroundColor: '#FFF7E8',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buildingPickerItemActive: { borderColor: SCREEN_THEME.woodGreenDark, backgroundColor: 'rgba(111, 141, 87, 0.16)' },
  buildingPickerText: { color: SCREEN_THEME.textPrimary, fontSize: 13, fontWeight: '800' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EFE0C1' },
  ratingLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingLabelText: { fontSize: 14, fontWeight: '700', color: SCREEN_THEME.textPrimary },
  starsInput: { flexDirection: 'row', gap: 2 },
  submitVoteBtn: { backgroundColor: SCREEN_THEME.woodGreen, borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginTop: 20, borderWidth: 1, borderColor: SCREEN_THEME.woodGreenDark },
  submitVoteBtnText: { color: '#FFF9EE', fontWeight: '900', fontSize: 15 },
  votedBanner: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  votedText: { fontSize: 16, fontWeight: '900', color: '#4F7A3D' },
  votedSub: { fontSize: 13, color: SCREEN_THEME.textSecondary },
});


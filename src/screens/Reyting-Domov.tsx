import React, { useMemo, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationProp, RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import MiniTabBar from '../components/MiniTabBar';
import AlertHelper from '../utils/alertHelper';
import ErrorHandler from '../utils/errorHandler';
import { LIGHT_ORBS, SCREEN_THEME } from '../utils/screenTheme';
import { RootState } from '../redux/store';
import { selectIsAuthenticated, selectUser } from '../redux/selectors';
import { BUILDINGS, getFullAddress } from '../data/buildings';
import { useTranslation } from '../i18n/useTranslation';
import { useOperationTrace } from '../hooks/useOperationTrace';
import {
  BuildingRatingValue,
  canSubmitBuildingRatingToday,
  getUserBuildingRating,
  submitBuildingRating,
} from '../services/buildingRatingService';
import { useBuildingRatings } from '../hooks/useBuildingRatings';

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

type RatingValue = BuildingRatingValue;
type RatingCategoryKey = keyof Pick<RatingValue, 'cleaning' | 'elevator' | 'electricity' | 'services'>;
type RatingCategory = {
  key: RatingCategoryKey;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

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

const RATING_AUTH_NOTICE = {
  ua: {
    title: 'Потрібна реєстрація',
    body: 'Оцінки будинків можуть ставити тільки зареєстровані користувачі. Увійдіть або зареєструйтесь, щоб залишити оцінку.',
    action: 'Увійти / Реєстрація',
    cancel: 'Пізніше',
  },
  ru: {
    title: 'Нужна регистрация',
    body: 'Оценки домов могут ставить только зарегистрированные пользователи. Войдите или зарегистрируйтесь, чтобы оставить оценку.',
    action: 'Войти / Регистрация',
    cancel: 'Позже',
  },
  en: {
    title: 'Registration required',
    body: 'Only registered users can rate buildings. Sign in or register to leave a rating.',
    action: 'Sign in / Register',
    cancel: 'Later',
  },
} as const;

const RATING_SYNC_NOTICE = {
  ua: 'Не вдалося оновити спільний рейтинг. Спробуйте ще раз трохи пізніше.',
  ru: 'Не удалось обновить общий рейтинг. Попробуйте ещё раз чуть позже.',
  en: 'Could not update the shared rating. Please try again a little later.',
} as const;

const RATING_UI_TEXT = {
  ua: {
    showMore: 'Більше',
    loading: 'Завантажуємо спільний рейтинг...',
    sharedInfo: 'Рейтинг спільний для всіх користувачів. Один користувач може оновити свою оцінку одного будинку один раз на день.',
    authInline: 'Оцінювати можуть тільки зареєстровані користувачі.',
    changeTomorrow: 'Ваш голос уже враховано. Змінити оцінку можна завтра.',
    changeAvailable: 'Ви вже оцінювали цей будинок. Сьогодні можна оновити свою оцінку.',
    saveFailed: 'Не вдалося зберегти оцінку. Спробуйте ще раз трохи пізніше.',
    updated: 'Оцінку оновлено. Дякуємо!',
  },
  ru: {
    showMore: 'Больше',
    loading: 'Загружаем общий рейтинг...',
    sharedInfo: 'Рейтинг общий для всех пользователей. Один пользователь может обновить свою оценку одного дома один раз в день.',
    authInline: 'Оценивать могут только зарегистрированные пользователи.',
    changeTomorrow: 'Ваш голос уже учтён. Изменить оценку можно завтра.',
    changeAvailable: 'Вы уже оценивали этот дом. Сегодня можно обновить свою оценку.',
    saveFailed: 'Не удалось сохранить оценку. Попробуйте ещё раз чуть позже.',
    updated: 'Оценка обновлена. Спасибо!',
  },
  en: {
    showMore: 'More',
    loading: 'Loading shared rating...',
    sharedInfo: 'The rating is shared for all users. One user can update their building rating once per day.',
    authInline: 'Only registered users can rate buildings.',
    changeTomorrow: 'Your vote has already been counted. You can change it tomorrow.',
    changeAvailable: 'You have rated this building before. You can update your rating today.',
    saveFailed: 'Could not save the rating. Please try again a little later.',
    updated: 'Rating updated. Thank you!',
  },
} as const;

const getEmptyRating = (): RatingValue => ({
  cleaning: 0,
  elevator: 0,
  electricity: 0,
  services: 0,
  votes: 0,
  complaints: 0,
  voterIds: {},
});

const getEmptyRatingInput = () => ({ cleaning: 0, elevator: 0, electricity: 0, services: 0 });

const getBuildingScoreValue = (b: Pick<RatingValue, 'cleaning' | 'elevator' | 'electricity' | 'services'>): number => {
  return (b.cleaning + b.elevator + b.electricity + b.services) / 4;
};

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
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const currentUser = useSelector(selectUser);
  const { t } = useTranslation();
  const { startOperation, trace } = useOperationTrace('Reyting-Domov', 'rating');
  const explanation = RATING_EXPLANATION[language];
  const uiText = RATING_UI_TEXT[language];
  const [tab, setTab] = useState<'top20' | 'vote'>('top20');
  const [showAllBuildings, setShowAllBuildings] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>(getEmptyRatingInput);
  const [selectedBuildingId, setSelectedBuildingId] = useState(BUILDINGS[0]?.id ?? '');
  const [buildingPickerOpen, setBuildingPickerOpen] = useState(false);
  const { ratings: storedRatings, loading: ratingsLoading, error: ratingsError } = useBuildingRatings();
  const [sharedRatingErrorShown, setSharedRatingErrorShown] = useState(false);

  const CATEGORIES: RatingCategory[] = [
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
    if (ratingsError && !sharedRatingErrorShown) {
      setSharedRatingErrorShown(true);
      Alert.alert(t.ratingScreen.title, RATING_SYNC_NOTICE[language]);
    }
  }, [language, ratingsError, sharedRatingErrorShown, t.ratingScreen.title]);

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
  const currentUserId = currentUser?.id ?? '';
  const selectedStoredRating = storedRatings[selectedBuildingId] ?? getEmptyRating();
  const userRating = getUserBuildingRating(selectedStoredRating, currentUserId);
  const hasUserRating = Boolean(userRating?.ratedAt);
  const canRateToday = canSubmitBuildingRatingToday(selectedStoredRating, currentUserId);

  useEffect(() => {
    if (canRateToday && userRating && userRating.cleaning > 0) {
      setRatings({
        cleaning: userRating.cleaning,
        elevator: userRating.elevator,
        electricity: userRating.electricity,
        services: userRating.services,
      });
      return;
    }
    setRatings(getEmptyRatingInput());
  }, [canRateToday, currentUserId, selectedBuildingId, userRating?.ratedAt]);

  const handleVote = (category: RatingCategoryKey, value: number) => {
    if (!isAuthenticated) {
      showRatingAuthNotice();
      return;
    }
    if (!canRateToday) {
      Alert.alert(t.ratingScreen.ratingAlreadySubmitted, uiText.changeTomorrow);
      return;
    }
    setRatings((prev) => ({ ...prev, [category]: value }));
  };

  const showRatingAuthNotice = () => {
    const notice = RATING_AUTH_NOTICE[language];
    Alert.alert(notice.title, notice.body, [
      { text: notice.cancel, style: 'cancel' },
      { text: notice.action, onPress: () => navigation.navigate('LoginScreen') },
    ]);
  };

  const handleSubmitVote = async () => {
    startOperation();
    trace('validate', 'start');
    if (!isAuthenticated) {
      trace('validate', 'fail', { reason: 'auth_required' });
      showRatingAuthNotice();
      return;
    }
    if (!canRateToday) {
      trace('validate', 'fail', { reason: 'already_voted' });
      Alert.alert(t.ratingScreen.ratingAlreadySubmitted, uiText.changeTomorrow);
      return;
    }
    const allFilled = CATEGORIES.every((c) => ratings[c.key] > 0);
    if (!allFilled) {
      trace('validate', 'fail', { reason: 'not_all_categories_rated' });
      AlertHelper.rateAllCategories();
      return;
    }
    trace('validate', 'success');
    try {
      trace('api_call', 'start', { path: 'stats/building_ratings' });
      await submitBuildingRating(selectedBuildingId, ratings as Record<RatingCategoryKey, number>, currentUserId);
      trace('api_call', 'success');
      setRatings(getEmptyRatingInput());
      trace('user_alert', 'success', { type: 'success' });
      AlertHelper.success(hasUserRating ? uiText.updated : t.ratingScreen.thankYou);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      trace('api_call', 'fail', { error: message });
      if (message.includes('already-voted')) {
        Alert.alert(t.ratingScreen.ratingAlreadySubmitted, uiText.changeTomorrow);
        return;
      }
      Alert.alert(t.ratingScreen.title, uiText.saveFailed);
    }
  };

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
      <>
          {tab === 'top20' ? (
            <FlatList
              data={showAllBuildings ? buildingList : buildingList.slice(0, 4)}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              ListHeaderComponent={(
                <>
                  <Image source={require('../../assets/WEBP-version/Reiting_Domov.webp')} style={styles.headerImage} resizeMode="contain" />
                  <View style={styles.tabBar}>
                    <TouchableOpacity style={[styles.tab, (tab as string) === 'top20' && styles.tabActive]} onPress={() => setTab('top20')}>
                      <Text style={[styles.tabText, (tab as string) === 'top20' && styles.tabTextActive]}>{t.ratingScreen.tabs.top20}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tab, (tab as string) === 'vote' && styles.tabActive]} onPress={() => setTab('vote')}>
                      <Text style={[styles.tabText, (tab as string) === 'vote' && styles.tabTextActive]}>{t.ratingScreen.tabs.vote}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.listHeader}><Text style={styles.listHeaderText}>{t.ratingScreen.listHeader}</Text></View>
                  <View style={styles.explanationCard}>
                    <MaterialCommunityIcons name="information-outline" size={18} color={SCREEN_THEME.enamelBlue} />
                    <View style={styles.explanationCopy}>
                      <Text style={styles.explanationTitle}>{explanation.title}</Text>
                      <Text style={styles.explanationText}>{explanation.body}</Text>
                    </View>
                  </View>
                  <View style={styles.infoStrip}>
                    <MaterialCommunityIcons name="account-check-outline" size={17} color={SCREEN_THEME.woodGreenDark} />
                    <Text style={styles.infoStripText}>{uiText.sharedInfo}</Text>
                  </View>
                  {ratingsLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator size="small" color={SCREEN_THEME.terracotta} />
                      <Text style={styles.loadingText}>{uiText.loading}</Text>
                    </View>
                  ) : null}
                </>
              )}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[styles.buildingCard, index < 3 && styles.buildingCardTop]}
                  activeOpacity={0.84}
                  onPress={() => navigation.navigate('BuildingRatingDetailScreen', { buildingId: item.id })}
                >
                  <View style={styles.buildingCardIcon}>
                    <MaterialCommunityIcons name="home-city-outline" size={52} color="rgba(79,131,186,0.38)" />
                  </View>
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
                      <MaterialCommunityIcons name="chevron-right" size={20} color={SCREEN_THEME.textMuted} style={styles.detailsChevron} />
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
                </TouchableOpacity>
              )}
              ListFooterComponent={
                !showAllBuildings && buildingList.length > 4 ? (
                  <TouchableOpacity style={styles.showMoreButton} activeOpacity={0.82} onPress={() => setShowAllBuildings(true)}>
                    <Text style={styles.showMoreText}>{uiText.showMore}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color={SCREEN_THEME.textSecondary} />
                  </TouchableOpacity>
                ) : null
              }
            />
          ) : (
            <ScrollView contentContainerStyle={styles.voteScroll}>
              <Image source={require('../../assets/WEBP-version/Reiting_Domov.webp')} style={styles.headerImage} resizeMode="contain" />
              <View style={styles.tabBar}>
                <TouchableOpacity style={[styles.tab, (tab as string) === 'top20' && styles.tabActive]} onPress={() => setTab('top20')}>
                  <Text style={[styles.tabText, (tab as string) === 'top20' && styles.tabTextActive]}>{t.ratingScreen.tabs.top20}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, (tab as string) === 'vote' && styles.tabActive]} onPress={() => setTab('vote')}>
                  <Text style={[styles.tabText, (tab as string) === 'vote' && styles.tabTextActive]}>{t.ratingScreen.tabs.vote}</Text>
                </TouchableOpacity>
              </View>
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
                {!isAuthenticated ? (
                  <View style={styles.authNoticeInline}>
                    <MaterialCommunityIcons name="lock-outline" size={18} color={SCREEN_THEME.terracottaDark} />
                    <Text style={styles.authNoticeInlineText}>{uiText.authInline}</Text>
                  </View>
                ) : null}
                {hasUserRating && !canRateToday ? (
                  <View style={styles.votedBanner}>
                    <MaterialCommunityIcons name="check-circle" size={28} color="#4F7A3D" />
                    <Text style={styles.votedText}>{t.ratingScreen.votedTitle}</Text>
                    <Text style={styles.votedSub}>{uiText.changeTomorrow}</Text>
                  </View>
                ) : (
                  <>
                    {hasUserRating ? (
                      <View style={styles.updateNotice}>
                        <MaterialCommunityIcons name="calendar-refresh" size={18} color={SCREEN_THEME.enamelBlue} />
                        <Text style={styles.updateNoticeText}>{uiText.changeAvailable}</Text>
                      </View>
                    ) : null}
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

export function BuildingRatingDetailScreen() {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const route = useRoute<RouteProp<{ BuildingRatingDetailScreen: { buildingId: string } }, 'BuildingRatingDetailScreen'>>();
  const language = useSelector((state: RootState) => state.language?.current ?? 'ua') as 'ua' | 'ru' | 'en';
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const currentUser = useSelector(selectUser);
  const { t } = useTranslation();
  const uiText = RATING_UI_TEXT[language];
  const building = BUILDINGS.find((item) => item.id === route.params?.buildingId) ?? BUILDINGS[0];
  const { ratings: storedRatings, loading: ratingsLoading, error: ratingsError } = useBuildingRatings();
  const [ratings, setRatings] = useState<Record<string, number>>(getEmptyRatingInput);
  const [sharedRatingErrorShown, setSharedRatingErrorShown] = useState(false);

  const CATEGORIES: RatingCategory[] = [
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
    if (ratingsError && !sharedRatingErrorShown) {
      setSharedRatingErrorShown(true);
      Alert.alert(t.ratingScreen.title, RATING_SYNC_NOTICE[language]);
    }
  }, [language, ratingsError, sharedRatingErrorShown, t.ratingScreen.title]);

  const currentRating = storedRatings[building.id] ?? getEmptyRating();
  const score = getBuildingScoreValue(currentRating);
  const currentUserId = currentUser?.id ?? '';
  const userRating = getUserBuildingRating(currentRating, currentUserId);
  const hasUserRating = Boolean(userRating?.ratedAt);
  const canRateToday = canSubmitBuildingRatingToday(currentRating, currentUserId);

  useEffect(() => {
    if (canRateToday && userRating && userRating.cleaning > 0) {
      setRatings({
        cleaning: userRating.cleaning,
        elevator: userRating.elevator,
        electricity: userRating.electricity,
        services: userRating.services,
      });
      return;
    }
    setRatings(getEmptyRatingInput());
  }, [building.id, canRateToday, currentUserId, userRating?.ratedAt]);

  const handleVote = (category: RatingCategoryKey, value: number) => {
    if (!isAuthenticated) {
      showRatingAuthNotice();
      return;
    }
    if (!canRateToday) {
      Alert.alert(t.ratingScreen.ratingAlreadySubmitted, uiText.changeTomorrow);
      return;
    }
    setRatings((prev) => ({ ...prev, [category]: value }));
  };

  const showRatingAuthNotice = () => {
    const notice = RATING_AUTH_NOTICE[language];
    Alert.alert(notice.title, notice.body, [
      { text: notice.cancel, style: 'cancel' },
      { text: notice.action, onPress: () => navigation.navigate('LoginScreen') },
    ]);
  };

  const handleSubmitVote = async () => {
    if (!isAuthenticated) {
      showRatingAuthNotice();
      return;
    }
    if (!canRateToday) {
      Alert.alert(t.ratingScreen.ratingAlreadySubmitted, uiText.changeTomorrow);
      return;
    }
    const allFilled = CATEGORIES.every((c) => ratings[c.key] > 0);
    if (!allFilled) {
      AlertHelper.rateAllCategories();
      return;
    }
    try {
      await submitBuildingRating(building.id, ratings as Record<RatingCategoryKey, number>, currentUserId);
      setRatings(getEmptyRatingInput());
      AlertHelper.success(hasUserRating ? uiText.updated : t.ratingScreen.thankYou);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('already-voted')) {
        Alert.alert(t.ratingScreen.ratingAlreadySubmitted, uiText.changeTomorrow);
        return;
      }
      Alert.alert(t.ratingScreen.title, uiText.saveFailed);
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={SCREEN_THEME.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{t.ratingScreen.title}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('MainTabs', { screen: 'MapTab', params: { focusBuildingId: building.id } })}
          style={styles.headerButton}
        >
          <MaterialCommunityIcons name="map-marker-outline" size={20} color={SCREEN_THEME.enamelBlue} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.detailScroll}>
        <View style={styles.detailHeroImage}>
          <MaterialCommunityIcons name="home-city-outline" size={72} color="rgba(79,131,186,0.52)" />
        </View>
        <View style={styles.detailHeroCard}>
          <Text style={styles.detailAddress}>{getFullAddress(building)}</Text>
          <View style={styles.detailScoreRow}>
            <View style={styles.detailScoreBox}>
              <Text style={styles.detailScoreNum}>{score.toFixed(1)}</Text>
              <Text style={styles.detailScoreLabel}>{t.ratingScreen.average}</Text>
            </View>
            <View style={styles.detailVotesBox}>
              <MaterialCommunityIcons name="account-group-outline" size={22} color={SCREEN_THEME.woodGreenDark} />
              <Text style={styles.detailVotesText}>{currentRating.votes} {t.ratingScreen.votes}</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoStrip}>
          <MaterialCommunityIcons name="account-check-outline" size={17} color={SCREEN_THEME.woodGreenDark} />
          <Text style={styles.infoStripText}>{uiText.sharedInfo}</Text>
        </View>

        {ratingsLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={SCREEN_THEME.terracotta} />
            <Text style={styles.loadingText}>{uiText.loading}</Text>
          </View>
        ) : null}

        <View style={styles.detailCard}>
          {CATEGORIES.map((cat) => (
            <View key={cat.key} style={styles.detailStatRow}>
              <View style={styles.ratingLabel}>
                <MaterialCommunityIcons name={cat.icon} size={20} color={SCREEN_THEME.terracottaDark} />
                <Text style={styles.ratingLabelText}>{cat.label}</Text>
              </View>
              <StarRow value={currentRating[cat.key]} />
            </View>
          ))}
        </View>

        <View style={styles.voteCard}>
          <Text style={styles.voteTitle}>{t.ratingScreen.rateYourHome}</Text>
          <Text style={styles.voteSubtitle}>{t.ratingScreen.rateSubtitle}</Text>
          {!isAuthenticated ? (
            <View style={styles.authNoticeInline}>
              <MaterialCommunityIcons name="lock-outline" size={18} color={SCREEN_THEME.terracottaDark} />
              <Text style={styles.authNoticeInlineText}>{uiText.authInline}</Text>
            </View>
          ) : null}
          {hasUserRating && !canRateToday ? (
            <View style={styles.votedBanner}>
              <MaterialCommunityIcons name="check-circle" size={28} color="#4F7A3D" />
              <Text style={styles.votedText}>{t.ratingScreen.votedTitle}</Text>
              <Text style={styles.votedSub}>{uiText.changeTomorrow}</Text>
            </View>
          ) : (
            <>
              {hasUserRating ? (
                <View style={styles.updateNotice}>
                  <MaterialCommunityIcons name="calendar-refresh" size={18} color={SCREEN_THEME.enamelBlue} />
                  <Text style={styles.updateNoticeText}>{uiText.changeAvailable}</Text>
                </View>
              ) : null}
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
  headerImage: { width: '100%', height: 150, marginBottom: 8 },
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
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  listHeader: { backgroundColor: '#FFF7E8', borderRadius: 18, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E8D5AC' },
  listHeaderText: { fontSize: 13, color: SCREEN_THEME.textSecondary, textAlign: 'center', fontWeight: '700', lineHeight: 19 },
  explanationCard: { flexDirection: 'row', gap: 10, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#D7E5EA' },
  explanationCopy: { flex: 1 },
  explanationTitle: { color: SCREEN_THEME.textPrimary, fontSize: 14, fontWeight: '900', marginBottom: 4 },
  explanationText: { color: SCREEN_THEME.textSecondary, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  infoStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3F7E9', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#DCE8C9' },
  infoStripText: { flex: 1, color: SCREEN_THEME.woodGreenDark, fontSize: 12, lineHeight: 17, fontWeight: '800' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  loadingText: { color: SCREEN_THEME.textSecondary, fontSize: 13, fontWeight: '800' },
  buildingCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 20, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E4D0AB', overflow: 'hidden' },
  buildingCardIcon: { position: 'absolute', right: 8, top: 8, bottom: 8, width: 84, borderRadius: 16, backgroundColor: 'rgba(237,247,250,0.72)', alignItems: 'center', justifyContent: 'center' },
  buildingCardDom: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 96, opacity: 0.48 },
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
  detailsChevron: { marginTop: 4 },
  complaintsBadge: { backgroundColor: '#FFF1E7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, marginTop: 4 },
  complaintsText: { fontSize: 10, color: SCREEN_THEME.terracottaDark, fontWeight: '700' },
  voteScroll: { paddingHorizontal: 16, paddingBottom: 110 },
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
  authNoticeInline: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF1E7', borderRadius: 14, borderWidth: 1, borderColor: '#E9C5AA', padding: 12, marginBottom: 10 },
  authNoticeInlineText: { flex: 1, color: SCREEN_THEME.terracottaDark, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  updateNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EDF7FA', borderRadius: 14, borderWidth: 1, borderColor: '#D7E5EA', padding: 12, marginBottom: 8 },
  updateNoticeText: { flex: 1, color: SCREEN_THEME.enamelBlueDark, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  votedBanner: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  votedText: { fontSize: 16, fontWeight: '900', color: '#4F7A3D' },
  votedSub: { fontSize: 13, color: SCREEN_THEME.textSecondary },
  detailScroll: { padding: 16, paddingBottom: 110 },
  detailHeroImage: { width: '100%', height: 180, borderRadius: 22, borderWidth: 1, borderColor: '#E4D0AB', backgroundColor: '#EDF7FA', alignItems: 'center', justifyContent: 'center' },
  detailHeroCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 22, padding: 16, marginTop: -26, marginHorizontal: 10, borderWidth: 1, borderColor: '#E4D0AB' },
  detailAddress: { fontSize: 20, lineHeight: 25, fontWeight: '900', color: SCREEN_THEME.textPrimary, marginBottom: 14 },
  detailScoreRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  detailScoreBox: { minWidth: 94, borderRadius: 16, backgroundColor: '#EDF7FA', borderWidth: 1, borderColor: '#D7E5EA', padding: 12, alignItems: 'center' },
  detailScoreNum: { fontSize: 34, fontWeight: '900', color: SCREEN_THEME.enamelBlueDark },
  detailScoreLabel: { fontSize: 11, fontWeight: '800', color: SCREEN_THEME.textMuted },
  detailVotesBox: { flex: 1, borderRadius: 16, backgroundColor: '#F3F7E9', borderWidth: 1, borderColor: '#DCE8C9', padding: 12, justifyContent: 'center', alignItems: 'center', gap: 6 },
  detailVotesText: { color: SCREEN_THEME.woodGreenDark, fontWeight: '900', fontSize: 14 },
  detailCard: { backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 22, padding: 16, marginTop: 14, marginBottom: 14, borderWidth: 1, borderColor: '#E4D0AB' },
  detailStatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EFE0C1' },
  showMoreButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: SCREEN_THEME.paperStrong, borderRadius: 18, paddingVertical: 13, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E4D0AB' },
  showMoreText: { fontSize: 15, fontWeight: '900', color: SCREEN_THEME.textSecondary },
});

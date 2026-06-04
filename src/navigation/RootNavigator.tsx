import React, { Suspense, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef, getStateFromPath as getNavigationStateFromPath, useNavigation, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { useSelector } from 'react-redux';
import Toast from 'react-native-toast-message';

import { COLORS } from '../utils/constants';

import RequestsScreen from '../screens/Spisok-Zayavok';
import RequestTopicScreen from '../screens/Vibor-Temy-Zayavki';
import RequestFormScreen from '../screens/Forma-Zayavki';
import HelpNeighborsScreen from '../screens/Pomoch-Sosedyam';
import HelpRequestScreen from '../screens/Zapros-Pomoshi';
import TopPlacesScreen from '../screens/Luchshiye-Mesta';
import TopGirlsBoysScreen from '../screens/Lyudi-Chayki';
import ChaikaProblemsScreen from '../screens/Problemy-Chayki';
import InterestingPlacesScreen from '../screens/Interesnye-Mesta';
import ElectricityStatusScreen from '../screens/Status-Sveta';
import ProfileScreen from '../screens/Profil-Polzovatelya';
import EditProfileScreen from '../screens/EditProfileScreen';
import ViewUserProfileScreen from '../screens/ViewUserProfileScreen';
import HelpScreen from '../screens/Spravka';
import JobSearchScreen from '../screens/Poisk-Raboty';
import BuySellScreen from '../screens/Kuplu-Prodam';
import KontaktiChaikyScreen from '../screens/Kontakt-XXX';
import BizznesChaikaScreen from '../screens/Bizznes-Chaika';
import AppInfoScreen from '../screens/Pro-Prilozhenie';
import LoginScreen from '../screens/Vkhod';
import RegisterScreenFull from '../screens/Registraciya-Polnaya';
import HomeScreen from '../screens/Glavny-Ekran';
import OnlineChatScreen from '../screens/Onlayn-Chat';
import RequestDetailScreen from '../screens/Detal-Zayavki';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import DownloadCodeScreen from '../screens/Ekran-Koda-Zagruzki';
import HelpHistoryScreen from '../screens/Istoriya-Zaprosov';
import MyRequestsScreen from '../screens/Moi-Zayavki';
import SectionScreen from '../screens/Razdel';
import TopCafeScreen from '../screens/Top-Kafe';
import TopStoresScreen from '../screens/Top-Magaziny';
import SubscriptionScreen from '../screens/Podpiska-Premium';
import RatingScreen, { BuildingRatingDetailScreen } from '../screens/Reyting-Domov';
import QRCodeScreen from '../screens/QR-Kod';
import ScrollableTabBar from '../components/ScrollableTabBar';
import ErrorBoundary from '../components/ErrorBoundary';
import { useTranslation } from '../i18n/useTranslation';
import PlacesAndPeopleHub from '../screens/Mistsa-i-Lyudi-Hub';
import PoruchitelScreen from '../screens/Poruchitel';
import OsbbHubScreen from '../screens/OSBB-Hub';
import OsbbSborScreen from '../screens/OSBB-Sbor';
import OsbbGolosuvannyaScreen from '../screens/OSBB-Golosovanie';
import OsbbFinansyScreen from '../screens/OSBB-Finansy';
import OsbbNovostyScreen from '../screens/OSBB-Novosti';
import OsbbSetupScreen from '../screens/OSBB-Setup';
import OsbbAddNewsScreen from '../screens/OSBB-AddNews';
import OsbbAdminScreen from '../screens/OSBB-AdminPanel';
import ServicesHubScreen from '../screens/servicesHub';
import LostAndFoundScreen from '../screens/Kto-Poteryal';
import ImportantNewsScreen from '../screens/Vazhnye-Novosti-Chayki';
import NotificationSettingsScreen from '../screens/Nalashtuvannya-Spovishchen';
import VseDlyaDeteyScreen from '../screens/Vse-Dlya-Detey';
import DetalDetskogoMestaScreen from '../screens/Detal-Detskogo-Mesta';
import DetalDetskogoPredlozheniyaScreen from '../screens/Detal-Detskogo-Predlozheniya';
import SalonyKrasotyScreen from '../screens/Salony-Krasoty';
import DetalSalonaScreen from '../screens/Detal-Salona';
import DetalPredlozheniyaSalonaScreen from '../screens/Detal-Predlozheniya-Salona';
import SportNaChaykeScreen from '../screens/Sport-Na-Chayke';
import SportDetailScreen from '../screens/Sport-Detal';
import EdaNaChaykeScreen from '../screens/Eda-Na-Chayke';
import SpisokPokupokScreen from '../screens/Spisok-Pokupok';
import ProfileRequestsScreen from '../screens/ProfileRequestsScreen';
import AppVersionInfoScreen from '../screens/AppVersionInfoScreen';
import SupportScreen from '../screens/SupportScreen';
import CrashDiagnosticsScreen from '../screens/CrashDiagnosticsScreen';
import AppMonitorScreen from '../screens/AppMonitorScreen';
import AccessRestrictedScreen from '../screens/AccessRestrictedScreen';
import type { Request, Place } from '../types/app';
import type { NewsItem as OsbbEditableNewsItem } from '../screens/OSBB-AddNews';
import { selectAuthBootstrapped, selectIsAuthenticated, selectUser } from '../redux/selectors';
import { subscribeCurrentUserSecurityRole, type SecurityRole } from '../services/securityRoles';
import { TrustedAccessContext } from '../contexts/TrustedAccessContext';
import { recordScreenOpenDiagnostic } from '../services/liveDiagnosticsService';
import { addBreadcrumb } from '../services/breadcrumbService';
import { setSnapshotCurrentScreen } from '../services/stateSnapshotService';
import type { DetailItemData } from '../utils/detailViewTypes';

type RegisterScreenFullParams = {
  name?: string;
  phone?: string;
  email?: string;
  redirectTo?: string;
  redirectParams?: object;
  redirectMode?: 'auth' | 'complete';
};

type RedirectRouteParams = {
  redirectTo?: string;
  redirectParams?: object;
  redirectMode?: 'auth' | 'complete';
};

export type RootStackParamList = {
  MainTabs: undefined;
  OnlineChatTab: undefined;
  OnlineChatList: undefined;
  RequestDetail: { request: Request };
  ItemDetailScreen: { item: DetailItemData };
  RequestsTab: undefined;
  ListScreen: undefined;
  PlaceDetailsPanel: { place: Place };
  RequestFormScreen: { group?: string } | undefined;
  HelpNeighborsScreen: undefined;
  HelpRequestScreen: undefined;
  TopPlacesScreen: undefined;
  TopGirlsBoysScreen: undefined;
  ChaikaProblemsScreen: undefined;
  InterestingPlacesScreen: undefined;
  ElectricityStatusScreen: undefined;
  HelpScreen: undefined;
  AnnouncementsScreen: undefined;
  JobSearchScreen: undefined;
  BuySellScreen: undefined;
  KontaktiChaikyScreen: undefined;
  BizznesChaikaScreen: undefined;
  AppInfoScreen: undefined;
  LoginScreen: RedirectRouteParams | undefined;
  RegisterScreenFull: RegisterScreenFullParams;
  DownloadCodeScreen: undefined;
  HelpHistoryScreen: undefined;
  MyRequestsScreen: undefined;
  PhotoModerationScreen: undefined;
  ServiceModerationScreen: undefined;
  AdminRuntimeMonitorScreen: undefined;
  UserErrorModerationMonitorScreen: undefined;
  UserErrorMonitorScreen: undefined;
  AdminUserErrorsScreen: undefined;
  ServiceModerationIssuesScreen: {
    issues?: {
      section: string;
      sectionLabel: string;
      summary: string;
      explanation: string;
      technicalDetails?: string;
    }[];
    updatedAt?: string | null;
  } | undefined;
  ServerStatusScreen: undefined;
  AuthDiagnosticScreen: undefined;
  CrashDiagnosticsScreen: undefined;
  SecurityControlScreen: undefined;
  SectionScreen: undefined;
  TopCafeScreen: undefined;
  TopStoresScreen: undefined;
  PlacesScreen: { tab?: 'cafe' | 'store' | 'other' } | undefined;
  RequestsScreen: undefined;
  RequestTopicScreen: undefined;
  SubscriptionScreen: undefined;
  RatingScreen: undefined;
  BuildingRatingDetailScreen: { buildingId: string };
  QRCodeScreen: undefined;
  EditProfileScreen: undefined;
  PlacesAndPeopleHub: undefined;
  VseDlyaDeteyScreen: undefined;
  DetalDetskogoMestaScreen: { place: Place };
  DetalDetskogoPredlozheniyaScreen: { offer: import('../types/app').ChildOffer };
  SalonyKrasotyScreen: undefined;
  DetalSalonaScreen: { place: Place };
  DetalPredlozheniyaSalonaScreen: { offer: import('../types/app').BeautyOffer };
  PoruchitelScreen: undefined;
  OsbbHubScreen: undefined;
  OsbbSborScreen: undefined;
  OsbbGolosuvannyaScreen: undefined;
  OsbbFinansyScreen: undefined;
  OsbbNovostyScreen: undefined;
  OsbbSetupScreen: undefined;
  OsbbAddNewsScreen: { editItem?: OsbbEditableNewsItem } | undefined;
  OsbbAdminScreen: undefined;
  ServicesHubScreen: undefined;
  SoulPhotosScreen: undefined;
  FotoRayonaScreen: undefined;
  LostAndFoundScreen: undefined;
  ImportantNewsScreen: undefined;
  NotificationSettingsScreen: undefined;
  SportNaChaykeScreen: undefined;
  SportDetailScreen: { sportKey: 'basketball' | 'football' | 'tennis_big' | 'tennis_small'; sportTitle: string };
  EdaNaChaykeScreen: undefined;
  SpisokPokupokScreen: undefined;
  ProfileRequestsScreen: undefined;
  MyPhotosScreen: undefined;
  MyApprovedPhotosScreen: undefined;
  PhotoUploadScreen: undefined;
  StartAvatarPickerScreen: RedirectRouteParams | undefined;
  ProfileSetupScreen: undefined;
  AppVersionInfoScreen: undefined;
  AppMonitorScreen: undefined;
  ViewUserProfile: { userId: string };
  SupportScreen: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const MAX_NAV_ERROR_RETRIES = 2;

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    ExpoLinking.createURL('/'),
    'chaikaua://',
    'chaika://',
  ],
  config: {
    screens: {
      MainTabs: {
        screens: {
          HomeTab: 'screen/home',
          MapTab: 'screen/map',
          HelpTab: 'screen/help',
          ServicesTab: 'screen/services',
          ProfileTab: 'screen/profile',
        },
      },
      OnlineChatTab: {
        screens: {
          OnlineChatList: 'screen/chat',
        },
      },
      RequestFormScreen: 'screen/request-form',
      HelpNeighborsScreen: 'screen/help-neighbors',
      HelpHistoryScreen: 'screen/help-history',
      MyRequestsScreen: 'screen/my-requests',
      PlacesScreen: 'screen/places/:tab?',
      SubscriptionScreen: 'screen/premium',
      RatingScreen: 'screen/rating',
      BuildingRatingDetailScreen: 'screen/rating/building/:buildingId',
      EditProfileScreen: 'screen/profile/edit',
      OsbbHubScreen: 'screen/osbb',
      OsbbSborScreen: 'screen/osbb/collections',
      OsbbGolosuvannyaScreen: 'screen/osbb/voting',
      OsbbFinansyScreen: 'screen/osbb/finance',
       OsbbNovostyScreen: 'screen/osbb/news',
       NotificationSettingsScreen: 'screen/notifications',
       MyPhotosScreen: 'screen/my-photos',
       SoulPhotosScreen: 'screen/foto-dlya-dushi',
       FotoRayonaScreen: 'screen/foto-rayona',
       PhotoUploadScreen: 'screen/photo-upload',
       StartAvatarPickerScreen: 'screen/start-avatar',
       BizznesChaikaScreen: 'screen/business/chaika',
       VseDlyaDeteyScreen: 'screen/kids',
       DetalDetskogoMestaScreen: 'screen/kids/place',
       DetalDetskogoPredlozheniyaScreen: 'screen/kids/offer',
       SalonyKrasotyScreen: 'screen/beauty',
       DetalSalonaScreen: 'screen/beauty/place',
       DetalPredlozheniyaSalonaScreen: 'screen/beauty/offer',
      SportNaChaykeScreen: 'screen/sports',
      SportDetailScreen: 'screen/sports/detail',
      EdaNaChaykeScreen: 'screen/food',
      SpisokPokupokScreen: 'screen/food/shopping',
      CrashDiagnosticsScreen: 'screen/crash-diagnostics',
      AppMonitorScreen: 'screen/app-monitor',
    },
  },
};

const ROUTE_FILE_MAP: Record<string, string> = {
  MainTabs: 'RootNavigator.tsx',
  HomeTab: 'Glavny-Ekran.tsx',
  MapTab: 'Karta-Chayki.tsx',
  HelpTab: 'Vibor-Temy-Zayavki.tsx',
  ServicesTab: 'servicesHub.tsx',
  ProfileTab: 'Profil-Polzovatelya.tsx',
  OnlineChatTab: 'Onlayn-Chat.tsx',
  OnlineChatList: 'Onlayn-Chat.tsx',
  RequestDetail: 'Detal-Zayavki.tsx',
  ItemDetailScreen: 'ItemDetailScreen.tsx',
  RequestsTab: 'Vibor-Temy-Zayavki.tsx',
  ListScreen: 'Spisok-Mest.tsx',
  PlaceDetailsPanel: 'Panel-Detaley-Mesta.tsx',
  RequestFormScreen: 'Forma-Zayavki.tsx',
  HelpNeighborsScreen: 'Pomoch-Sosedyam.tsx',
  HelpRequestScreen: 'Zapros-Pomoshi.tsx',
  TopPlacesScreen: 'Luchshiye-Mesta.tsx',
  TopGirlsBoysScreen: 'Lyudi-Chayki.tsx',
  ChaikaProblemsScreen: 'Problemy-Chayki.tsx',
  InterestingPlacesScreen: 'Interesnye-Mesta.tsx',
  ElectricityStatusScreen: 'Status-Sveta.tsx',
  HelpScreen: 'Spravka.tsx',
  AnnouncementsScreen: 'Obyavleniya.tsx',
  JobSearchScreen: 'Poisk-Raboty.tsx',
  BuySellScreen: 'Kuplu-Prodam.tsx',
  KontaktiChaikyScreen: 'Kontakt-XXX.tsx',
  BizznesChaikaScreen: 'Bizznes-Chaika.tsx',
  AppInfoScreen: 'Pro-Prilozhenie.tsx',
  LoginScreen: 'Vkhod.tsx',
  RegisterScreenFull: 'Registraciya-Polnaya.tsx',
  DownloadCodeScreen: 'Ekran-Koda-Zagruzki.tsx',
  HelpHistoryScreen: 'Istoriya-Zaprosov.tsx',
  MyRequestsScreen: 'Moi-Zayavki.tsx',
  PhotoModerationScreen: 'Moderaciya-Foto.tsx',
  ServiceModerationScreen: 'ServiceModerationScreen.tsx',
  AdminRuntimeMonitorScreen: 'AdminRuntimeMonitorScreen.tsx',
  UserErrorModerationMonitorScreen: 'UserErrorModerationMonitorScreen.tsx',
  UserErrorMonitorScreen: 'UserErrorMonitorScreen.tsx',
  AdminUserErrorsScreen: 'AdminUserErrorsScreen.tsx',
  ServiceModerationIssuesScreen: 'ServiceModerationIssuesScreen.tsx',
  ServerStatusScreen: 'ServerStatusScreen.tsx',
  AuthDiagnosticScreen: 'AuthDiagnosticScreen.tsx',
  CrashDiagnosticsScreen: 'CrashDiagnosticsScreen.tsx',
  SecurityControlScreen: 'SecurityControlScreen.tsx',
  SectionScreen: 'Razdel.tsx',
  TopCafeScreen: 'Top-Kafe.tsx',
  TopStoresScreen: 'Top-Magaziny.tsx',
  PlacesScreen: 'Mesta-Chayki.tsx',
  RequestsScreen: 'Spisok-Zayavok.tsx',
  RequestTopicScreen: 'Vibor-Temy-Zayavki.tsx',
  SubscriptionScreen: 'Podpiska-Premium.tsx',
  RatingScreen: 'Reyting-Domov.tsx',
  BuildingRatingDetailScreen: 'Reyting-Domov.tsx',
  QRCodeScreen: 'QR-Kod.tsx',
  EditProfileScreen: 'EditProfileScreen.tsx',
  PlacesAndPeopleHub: 'Mistsa-i-Lyudi-Hub.tsx',
  VseDlyaDeteyScreen: 'Vse-Dlya-Detey.tsx',
  DetalDetskogoMestaScreen: 'Detal-Detskogo-Mesta.tsx',
  DetalDetskogoPredlozheniyaScreen: 'Detal-Detskogo-Predlozheniya.tsx',
  SalonyKrasotyScreen: 'Salony-Krasoty.tsx',
  DetalSalonaScreen: 'Detal-Salona.tsx',
  DetalPredlozheniyaSalonaScreen: 'Detal-Predlozheniya-Salona.tsx',
  PoruchitelScreen: 'Poruchitel.tsx',
  OsbbHubScreen: 'OSBB-Hub.tsx',
  OsbbSborScreen: 'OSBB-Sbor.tsx',
  OsbbGolosuvannyaScreen: 'OSBB-Golosovanie.tsx',
  OsbbFinansyScreen: 'OSBB-Finansy.tsx',
  OsbbNovostyScreen: 'OSBB-Novosti.tsx',
  OsbbSetupScreen: 'OSBB-Setup.tsx',
  OsbbAddNewsScreen: 'OSBB-AddNews.tsx',
  OsbbAdminScreen: 'OSBB-AdminPanel.tsx',
  ServicesHubScreen: 'servicesHub.tsx',
  SoulPhotosScreen: 'Foto-Dlya-Dushi.tsx',
  FotoRayonaScreen: 'Foto-Rayona.tsx',
  PhotoUploadScreen: 'Zagruzka-Foto.tsx',
  StartAvatarPickerScreen: 'StartAvatarPickerScreen.tsx',
  LostAndFoundScreen: 'Kto-Poteryal.tsx',
  ImportantNewsScreen: 'Vazhnye-Novosti-Chayki.tsx',
  NotificationSettingsScreen: 'Nalashtuvannya-Spovishchen.tsx',
  SportNaChaykeScreen: 'Sport-Na-Chayke.tsx',
  SportDetailScreen: 'Sport-Detal.tsx',
  EdaNaChaykeScreen: 'Eda-Na-Chayke.tsx',
  SpisokPokupokScreen: 'Spisok-Pokupok.tsx',
  ProfileRequestsScreen: 'ProfileRequestsScreen.tsx',
  MyPhotosScreen: 'photo-module/MyPhotosScreen.tsx',
  MyApprovedPhotosScreen: 'MyApprovedPhotosScreen.tsx',
  AppVersionInfoScreen: 'AppVersionInfoScreen.tsx',
  AppMonitorScreen: 'AppMonitorScreen.tsx',
  ViewUserProfile: 'ViewUserProfileScreen.tsx',
  SupportScreen: 'SupportScreen.tsx',
};

function ScreenFileInfoOverlay() {
  const [visibleFile, setVisibleFile] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdmin(false);
      return () => {};
    }

    const unsubscribe = subscribeCurrentUserSecurityRole((snapshot: { role: SecurityRole }) => {
      setIsAdmin(snapshot.role === 'admin');
    });
    return unsubscribe;
  }, [isAuthenticated]);

  if (!isAdmin) {
    return null;
  }

  const handlePress = () => {
    const routeName = navigationRef.getCurrentRoute()?.name ?? null;
    const fileName = routeName ? (ROUTE_FILE_MAP[routeName] ?? `${routeName}.tsx`) : 'UnknownScreen.tsx';

    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    setVisibleFile(fileName);
    hideTimer.current = setTimeout(() => setVisibleFile(null), 10000);
  };

  return (
    <View style={styles.infoOverlayRoot} pointerEvents="box-none">
      {visibleFile ? (
        <View style={styles.infoLabel}>
          <Text style={styles.infoLabelText}>{visibleFile}</Text>
        </View>
      ) : null}
      <TouchableOpacity onPress={handlePress} style={styles.infoButton} activeOpacity={0.85}>
        <Text style={styles.infoButtonText}>Info</Text>
      </TouchableOpacity>
    </View>
  );
}

function GuardedScreen({
  children,
  mode,
}: {
  children: React.ReactElement;
  mode: 'auth' | 'complete' | 'admin' | 'moderator' | 'trusted';
}) {
  const isBootstrapped = useSelector(selectAuthBootstrapped);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const {
    isTrusted,
    isLoading: isTrustedLoading,
    hasPendingInvite,
    openInviteAccess,
  } = useContext(TrustedAccessContext);

  const [roleStatus, setRoleStatus] = useState<'loading' | 'allowed' | 'denied'>(
    mode === 'admin' || mode === 'moderator' || mode === 'trusted' ? 'loading'
    : mode === 'auth' || mode === 'complete' ? 'loading'
    : 'allowed',
  );
  // For trusted mode: null = role subscription hasn't fired yet (still loading)
  const [isPrivilegedRole, setIsPrivilegedRole] = useState<boolean | null>(
    mode === 'trusted' ? null : false,
  );
  const deniedToastShownRef = useRef(false);

  const navigation = useNavigation();

  useEffect(() => {
    if (mode !== 'admin' && mode !== 'moderator' && mode !== 'trusted') {
      return;
    }
    if (!isBootstrapped) return;
    if (!isAuthenticated) {
      setRoleStatus('denied');
      return;
    }
    const unsubscribe = subscribeCurrentUserSecurityRole((snapshot: { role: SecurityRole }) => {
      if (mode === 'admin') {
        setRoleStatus(snapshot.role === 'admin' ? 'allowed' : 'denied');
      } else if (mode === 'moderator') {
        setRoleStatus(snapshot.role === 'admin' || snapshot.role === 'moderator' ? 'allowed' : 'denied');
      } else {
        // trusted mode: track privileged status only; roleStatus derived via TrustedAccessContext effect
        setIsPrivilegedRole(snapshot.role === 'admin' || snapshot.role === 'moderator');
      }
    });
    return unsubscribe;
  }, [mode, isAuthenticated, isBootstrapped]);

  // For auth/complete: check isAuthenticated
  useEffect(() => {
    if (mode !== 'auth' && mode !== 'complete') return;
    if (!isBootstrapped) return;
    setRoleStatus(isAuthenticated ? 'allowed' : 'denied');
  }, [mode, isAuthenticated, isBootstrapped]);

  // For trusted mode: derive roleStatus from role subscription + TrustedAccessContext.
  // isPrivilegedRole === null means the role subscription hasn't fired yet — keep loading
  // to avoid premature denial while Firebase resolves.
  useEffect(() => {
    if (mode !== 'trusted') return;
    if (!isBootstrapped) {
      setRoleStatus('loading');
      return;
    }
    if (!isAuthenticated) {
      setRoleStatus('denied');
      return;
    }
    if (isPrivilegedRole === true) {
      setRoleStatus('allowed');
      return;
    }
    if (isPrivilegedRole === null || isTrustedLoading) {
      setRoleStatus('loading');
      return;
    }
    setRoleStatus(isTrusted ? 'allowed' : 'denied');
  }, [mode, isBootstrapped, isAuthenticated, isPrivilegedRole, isTrusted, isTrustedLoading]);

  useEffect(() => {
    if (mode === 'trusted') {
      deniedToastShownRef.current = false;
      return;
    }
    if (roleStatus === 'denied') {
      if (mode === 'auth' || mode === 'complete') {
        navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' as never }] });
        return;
      }
      if (!deniedToastShownRef.current) {
        const reason = mode === 'admin' || mode === 'moderator'
          ? 'Невірна роль'
          : 'Адміністратор заблокував доступ';
        Toast.show({
          type: 'error',
          text1: 'Доступ закрито',
          text2: reason,
        });
        deniedToastShownRef.current = true;
      }
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' as never }] });
    } else if (roleStatus === 'allowed') {
      deniedToastShownRef.current = false;
    }
  }, [mode, roleStatus, navigation]);

  if (roleStatus === 'loading') {
    return <GuardFallback />;
  }

  if (mode === 'trusted' && roleStatus === 'denied') {
    return (
      <AccessRestrictedScreen
        pendingInvite={hasPendingInvite}
        onOpenInviteAccess={openInviteAccess}
        onGoBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
            return;
          }
          navigation.reset({ index: 0, routes: [{ name: 'MainTabs' as never }] });
        }}
      />
    );
  }

  return children;
}

function GuardFallback() {
  return (
    <View style={styles.guardFallback}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

const createLazyScreen = (
  loader: () => Promise<{ default: React.ComponentType<any> }>,
  displayName: string,
) => {
  const LazyComponent = React.lazy(loader);
  const WrappedLazyScreen = (props: Record<string, unknown>) => (
    <Suspense fallback={<GuardFallback />}>
      <LazyComponent {...props} />
    </Suspense>
  );

  WrappedLazyScreen.displayName = displayName;
  return WrappedLazyScreen;
};

const MapScreen = createLazyScreen(() => import('../screens/Karta-Chayki'), 'LazyMapScreen');
const ListScreen = createLazyScreen(() => import('../screens/Spisok-Mest'), 'LazyListScreen');
const PlaceDetailsPanel = createLazyScreen(() => import('../screens/Panel-Detaley-Mesta'), 'LazyPlaceDetailsPanel');
const AnnouncementsScreen = createLazyScreen(() => import('../screens/Obyavleniya'), 'LazyAnnouncementsScreen');
const PhotoModerationScreen = createLazyScreen(() => import('../screens/Moderaciya-Foto'), 'LazyPhotoModerationScreen');
const ServiceModerationScreen = createLazyScreen(() => import('../screens/ServiceModerationScreen'), 'LazyServiceModerationScreen');
const ServiceModerationIssuesScreen = createLazyScreen(() => import('../screens/ServiceModerationIssuesScreen'), 'LazyServiceModerationIssuesScreen');
const AdminRuntimeMonitorScreen = createLazyScreen(() => import('../screens/AdminRuntimeMonitorScreen'), 'LazyAdminRuntimeMonitorScreen');
const UserErrorModerationMonitorScreen = createLazyScreen(() => import('../screens/UserErrorModerationMonitorScreen'), 'LazyUserErrorModerationMonitorScreen');
const UserErrorMonitorScreen = createLazyScreen(() => import('../screens/UserErrorMonitorScreen'), 'LazyUserErrorMonitorScreen');
const AdminUserErrorsScreen = createLazyScreen(() => import('../screens/AdminUserErrorsScreen'), 'LazyAdminUserErrorsScreen');
const ServerStatusScreen = createLazyScreen(() => import('../screens/ServerStatusScreen'), 'LazyServerStatusScreen');
const AuthDiagnosticScreen = createLazyScreen(() => import('../screens/AuthDiagnosticScreen'), 'LazyAuthDiagnosticScreen');
const SecurityControlScreen = createLazyScreen(() => import('../screens/admin/SecurityControlScreen'), 'LazySecurityControlScreen');
const SoulPhotosScreen = createLazyScreen(() => import('../screens/Foto-Dlya-Dushi'), 'LazySoulPhotosScreen');
const FotoRayonaScreen = createLazyScreen(() => import('../screens/Foto-Rayona'), 'LazyFotoRayonaScreen');
const PlacesScreen = createLazyScreen(() => import('../screens/Mesta-Chayki'), 'LazyPlacesScreen');
const MyPhotosScreen = createLazyScreen(() => import('../photo-module/MyPhotosScreen'), 'LazyMyPhotosScreen');
const MyApprovedPhotosScreen = createLazyScreen(() => import('../screens/MyApprovedPhotosScreen'), 'LazyMyApprovedPhotosScreen');
const PhotoUploadScreen = createLazyScreen(() => import('../screens/Zagruzka-Foto'), 'LazyPhotoUploadScreen');
const StartAvatarPickerScreen = createLazyScreen(() => import('../screens/StartAvatarPickerScreen'), 'LazyStartAvatarPickerScreen');
const ProfileSetupScreen = createLazyScreen(() => import('../screens/ProfileSetupScreen'), 'LazyProfileSetupScreen');

const withGuard = <P extends object>(
  Component: React.ComponentType<P>,
  mode: 'auth' | 'complete' | 'admin' | 'moderator' | 'trusted' = 'complete',
) => {
  const WrappedScreen = (props: P) => (
    <GuardedScreen mode={mode}>
      <Component {...props} />
    </GuardedScreen>
  );

  return WrappedScreen;
};

const withErrorBoundary = <P extends object>(Component: React.ComponentType<P>) => {
  const WrappedScreen = (props: P) => (
    <ErrorBoundary>
      <Component {...props} />
    </ErrorBoundary>
  );

  return WrappedScreen;
};

const HomeScreenWithBoundary = withErrorBoundary(HomeScreen);
const MapScreenWithBoundary = withErrorBoundary(MapScreen);
const RequestTopicScreenWithBoundary = withErrorBoundary(RequestTopicScreen);
const ServicesHubScreenWithBoundary = withErrorBoundary(ServicesHubScreen);
const ProfileScreenWithBoundary = withErrorBoundary(ProfileScreen);
const FotoRayonaScreenWithBoundary = withErrorBoundary(FotoRayonaScreen);

function OnlineChatNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OnlineChatList" component={OnlineChatScreen} />
      <Stack.Screen name="RequestDetail" component={RequestDetailScreen as React.ComponentType<{}>} />
    </Stack.Navigator>
  );
}

function MainTabNavigator() {
  const { t } = useTranslation();

  return (
    <Tab.Navigator
      tabBar={(props) => <ScrollableTabBar {...props} />}
      detachInactiveScreens
      backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#999',
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
            HomeTab: 'home',
            MapTab: 'map',
            HelpTab: 'hand-heart-outline',
            ServicesTab: 'plus-circle-outline',
            ProfileTab: 'account-circle',
          };
          return <MaterialCommunityIcons name={icons[route.name] ?? 'home'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreenWithBoundary} options={{ title: t.menu.home }} />
      <Tab.Screen name="MapTab" component={MapScreenWithBoundary} options={{ title: t.menu.mapChaika }} />
      <Tab.Screen name="HelpTab" component={RequestTopicScreenWithBoundary} options={{ title: t.menu.helpNeighbors }} />
      <Tab.Screen name="ServicesTab" component={ServicesHubScreenWithBoundary} options={{ title: t.mainScreen.services }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreenWithBoundary} options={{ title: t.menu.profile }} />
    </Tab.Navigator>
  );
}

// Protects NavigationContainer from crashes caused by corrupted/incompatible
// persisted navigation state. When NavigationContainer (or its children) throw
// during render, this boundary catches it, clears the stored state, and signals
// the parent to remount with a clean slate.
class NavErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error) {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return <GuardFallback />;
    }
    return this.props.children;
  }
}

function AuthNavigation() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const isBootstrapped = useSelector(selectAuthBootstrapped);
  const currentUser = useSelector(selectUser);
  const [navReady, setNavReady] = useState(false);
  const [navigationContainerReady, setNavigationContainerReady] = useState(false);
  const [navKey, setNavKey] = useState(0);
  const navErrorCountRef = useRef(0);

  useEffect(() => {
    setNavReady(true);
  }, []);

  useEffect(() => {
    if (!navigationContainerReady || !isBootstrapped || !isAuthenticated || !currentUser) {
      console.log('[ProfileSetup] Guard check failed:', {
        containerReady: navigationContainerReady,
        bootstrapped: isBootstrapped,
        authenticated: isAuthenticated,
        hasUser: !!currentUser,
      });
      return;
    }
    const hasProfileAvatar = Boolean(currentUser.startAvatarKey?.trim())
      || Boolean(currentUser.photoURL?.trim())
      || Boolean(currentUser.photoURLs?.some((url) => url.trim()));
    const needsSetup = !currentUser.gender || !currentUser.age || !hasProfileAvatar;
    console.log('[ProfileSetup] User profile check:', {
      gender: currentUser.gender,
      age: currentUser.age,
      hasProfileAvatar,
      needsSetup,
    });
    if (needsSetup && navigationRef.getCurrentRoute()?.name !== 'ProfileSetupScreen') {
      console.log('[ProfileSetup] Navigating to ProfileSetupScreen');
      navigationRef.navigate('ProfileSetupScreen');
    }
  }, [navigationContainerReady, isBootstrapped, isAuthenticated, currentUser]);

  const handleNavError = useCallback(() => {
    navErrorCountRef.current += 1;
    if (navErrorCountRef.current <= MAX_NAV_ERROR_RETRIES) {
      setNavKey((key) => key + 1);
    }
  }, []);

  const onNavStateChange = useCallback((state: object | undefined) => {
    if (!state) return;
    const routeName = navigationRef.getCurrentRoute()?.name;
    if (routeName) {
      recordScreenOpenDiagnostic(routeName);
      addBreadcrumb('navigation', routeName, { screen: routeName });
      setSnapshotCurrentScreen(routeName);
    }
  }, []);

  const guardedLinking = useMemo<LinkingOptions<RootStackParamList>>(() => {
    const authOnlyRoutes = new Set<keyof RootStackParamList>([
      'OsbbAdminScreen',
    ]);
    const completeRoutes = new Set<keyof RootStackParamList>([
      'RequestFormScreen',
      'HelpHistoryScreen',
      'MyRequestsScreen',
      'EditProfileScreen',
    ]);
    // Routes that require trusted resident status. Deep links to these routes
    // from unauthenticated users are redirected to LoginScreen. Authenticated
    // but non-trusted users will be handled inline by GuardedScreen.
    const trustedRoutes = new Set<keyof RootStackParamList>([
      'ViewUserProfile',
      'TopGirlsBoysScreen',
      'KontaktiChaikyScreen',
      'OnlineChatTab',
      'OnlineChatList',
      'PoruchitelScreen',
      'OsbbHubScreen',
      'OsbbSborScreen',
      'OsbbGolosuvannyaScreen',
      'OsbbFinansyScreen',
      'OsbbNovostyScreen',
      'OsbbSetupScreen',
      'OsbbAddNewsScreen',
      'SoulPhotosScreen',
      'FotoRayonaScreen',
      'LostAndFoundScreen',
      'JobSearchScreen',
      'BuySellScreen',
      'SportDetailScreen',
      'ProfileRequestsScreen',
      'MyPhotosScreen',
      'MyApprovedPhotosScreen',
    ]);

    const getDeepestRouteName = (state: ReturnType<typeof getNavigationStateFromPath> | undefined): string | null => {
      if (!state || !state.routes?.length) return null;

      let currentRoute = state.routes[state.index ?? 0];
      while (currentRoute?.state && 'routes' in currentRoute.state) {
        const nestedState = currentRoute.state as ReturnType<typeof getNavigationStateFromPath> | undefined;
        if (!nestedState?.routes?.length) {
          break;
        }
        currentRoute = nestedState.routes[nestedState.index ?? 0];
      }

      return currentRoute?.name ?? null;
    };

    return {
      ...linking,
      getStateFromPath: (path, options) => {
        const resolvedState = getNavigationStateFromPath(path, (options ?? linking.config) as never);
        const targetRouteName = getDeepestRouteName(resolvedState);

        if (!targetRouteName) {
          return resolvedState;
        }

        const routeKey = targetRouteName as keyof RootStackParamList;
        if (!isAuthenticated && (
          authOnlyRoutes.has(routeKey) ||
          completeRoutes.has(routeKey) ||
          trustedRoutes.has(routeKey)
        )) {
          return {
            routes: [{ name: 'LoginScreen' }],
          };
        }

        // Registration-complete redirect disabled during development.

        return resolvedState;
      },
    };
  }, [isAuthenticated]);

  if (!navReady) return <GuardFallback />;

  return (
    <NavErrorBoundary key={`nav-boundary-${navKey}`} onError={handleNavError}>
    <NavigationContainer<RootStackParamList>
      key={`nav-container-${navKey}`}
      ref={navigationRef}
      linking={guardedLinking}
      onReady={() => {
        navErrorCountRef.current = 0;
        setNavigationContainerReady(true);
        const routeName = navigationRef.getCurrentRoute()?.name;
        if (routeName) {
          recordScreenOpenDiagnostic(routeName);
          addBreadcrumb('navigation', routeName, { screen: routeName });
        }
      }}
      onStateChange={onNavStateChange}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="MainTabs">
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
        <Stack.Screen name="OnlineChatTab" component={withGuard(OnlineChatNavigator, 'trusted')} />
        <Stack.Screen name="RequestsTab" component={RequestTopicScreen} />
        <Stack.Screen name="ListScreen" component={ListScreen} />
        <Stack.Screen name="PlaceDetailsPanel" component={PlaceDetailsPanel as React.ComponentType<unknown>} />
        <Stack.Screen name="RequestFormScreen" component={RequestFormScreen} />
        <Stack.Screen name="HelpNeighborsScreen" component={HelpNeighborsScreen} />
        <Stack.Screen name="HelpRequestScreen" component={HelpRequestScreen} />
        <Stack.Screen name="TopPlacesScreen" component={TopPlacesScreen} />
        <Stack.Screen name="TopGirlsBoysScreen" component={withGuard(TopGirlsBoysScreen, 'trusted')} />
        <Stack.Screen name="ChaikaProblemsScreen" component={ChaikaProblemsScreen} />
        <Stack.Screen name="InterestingPlacesScreen" component={InterestingPlacesScreen} />
        <Stack.Screen name="ElectricityStatusScreen" component={ElectricityStatusScreen} />
        <Stack.Screen name="HelpScreen" component={HelpScreen} />
        <Stack.Screen name="AnnouncementsScreen" component={AnnouncementsScreen} />
        <Stack.Screen name="JobSearchScreen" component={JobSearchScreen} />
        <Stack.Screen name="BuySellScreen" component={withGuard(BuySellScreen, 'auth')} />
        <Stack.Screen name="KontaktiChaikyScreen" component={KontaktiChaikyScreen} />
        <Stack.Screen name="BizznesChaikaScreen" component={BizznesChaikaScreen} />
        <Stack.Screen name="ItemDetailScreen" component={ItemDetailScreen} />
        <Stack.Screen name="AppInfoScreen" component={AppInfoScreen} />
        <Stack.Screen name="LoginScreen" component={LoginScreen} />
        <Stack.Screen name="RegisterScreenFull" component={RegisterScreenFull} />
        <Stack.Screen name="DownloadCodeScreen" component={DownloadCodeScreen} />
        <Stack.Screen name="HelpHistoryScreen" component={withGuard(HelpHistoryScreen, 'auth')} />
        <Stack.Screen name="MyRequestsScreen" component={withGuard(MyRequestsScreen, 'auth')} />
        <Stack.Screen name="PhotoModerationScreen" component={withGuard(PhotoModerationScreen, 'moderator')} />
        <Stack.Screen name="ServiceModerationScreen" component={withGuard(ServiceModerationScreen, 'moderator')} />
        <Stack.Screen name="AdminRuntimeMonitorScreen" component={withGuard(AdminRuntimeMonitorScreen, 'admin')} />
        <Stack.Screen name="UserErrorModerationMonitorScreen" component={withGuard(UserErrorModerationMonitorScreen, 'moderator')} />
        <Stack.Screen name="UserErrorMonitorScreen" component={withGuard(UserErrorMonitorScreen, 'auth')} />
        <Stack.Screen name="AdminUserErrorsScreen" component={withGuard(AdminUserErrorsScreen, 'admin')} />
        <Stack.Screen name="ServiceModerationIssuesScreen" component={withGuard(ServiceModerationIssuesScreen, 'moderator')} />
        <Stack.Screen name="ServerStatusScreen" component={withGuard(ServerStatusScreen, 'admin')} />
        <Stack.Screen name="AuthDiagnosticScreen" component={withGuard(AuthDiagnosticScreen, 'auth')} />
        <Stack.Screen name="CrashDiagnosticsScreen" component={CrashDiagnosticsScreen} />
        <Stack.Screen name="SecurityControlScreen" component={withGuard(SecurityControlScreen, 'admin')} />
        <Stack.Screen name="SectionScreen" component={SectionScreen} />
        <Stack.Screen name="TopCafeScreen" component={TopCafeScreen} />
        <Stack.Screen name="TopStoresScreen" component={TopStoresScreen} />
        <Stack.Screen name="PlacesScreen" component={PlacesScreen} />
        <Stack.Screen name="RequestsScreen" component={withGuard(RequestsScreen, 'moderator')} />
        <Stack.Screen name="RequestTopicScreen" component={RequestTopicScreen} />
        <Stack.Screen name="SubscriptionScreen" component={SubscriptionScreen} />
        <Stack.Screen name="RatingScreen" component={RatingScreen} />
        <Stack.Screen name="BuildingRatingDetailScreen" component={BuildingRatingDetailScreen} />
        <Stack.Screen name="QRCodeScreen" component={QRCodeScreen} />
        <Stack.Screen name="EditProfileScreen" component={withGuard(EditProfileScreen, 'auth')} />
        <Stack.Screen name="ViewUserProfile" component={withGuard(ViewUserProfileScreen, 'trusted')} />
        <Stack.Screen name="PlacesAndPeopleHub" component={PlacesAndPeopleHub} />
        <Stack.Screen name="VseDlyaDeteyScreen" component={VseDlyaDeteyScreen} />
        <Stack.Screen name="DetalDetskogoMestaScreen" component={DetalDetskogoMestaScreen} />
        <Stack.Screen name="DetalDetskogoPredlozheniyaScreen" component={DetalDetskogoPredlozheniyaScreen} />
        <Stack.Screen name="SalonyKrasotyScreen" component={SalonyKrasotyScreen} />
        <Stack.Screen name="DetalSalonaScreen" component={DetalSalonaScreen} />
        <Stack.Screen name="DetalPredlozheniyaSalonaScreen" component={DetalPredlozheniyaSalonaScreen} />
        <Stack.Screen name="PoruchitelScreen" component={withGuard(PoruchitelScreen, 'trusted')} />
        <Stack.Screen name="OsbbHubScreen" component={withGuard(OsbbHubScreen, 'trusted')} />
        <Stack.Screen name="OsbbSborScreen" component={withGuard(OsbbSborScreen, 'trusted')} />
        <Stack.Screen name="OsbbGolosuvannyaScreen" component={withGuard(OsbbGolosuvannyaScreen, 'trusted')} />
        <Stack.Screen name="OsbbFinansyScreen" component={withGuard(OsbbFinansyScreen, 'trusted')} />
        <Stack.Screen name="OsbbNovostyScreen" component={withGuard(OsbbNovostyScreen, 'trusted')} />
        <Stack.Screen name="OsbbSetupScreen" component={withGuard(OsbbSetupScreen, 'trusted')} />
        <Stack.Screen name="OsbbAddNewsScreen" component={withGuard(OsbbAddNewsScreen, 'trusted')} />
        <Stack.Screen name="OsbbAdminScreen" component={withGuard(OsbbAdminScreen, 'auth')} />
        <Stack.Screen name="ServicesHubScreen" component={ServicesHubScreen} />
        <Stack.Screen name="SoulPhotosScreen" component={SoulPhotosScreen} />
        <Stack.Screen name="FotoRayonaScreen" component={FotoRayonaScreenWithBoundary} />
        <Stack.Screen name="PhotoUploadScreen" component={PhotoUploadScreen} options={{ headerShown: false }} />
        <Stack.Screen name="StartAvatarPickerScreen" component={StartAvatarPickerScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ProfileSetupScreen" component={ProfileSetupScreen} options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="LostAndFoundScreen" component={LostAndFoundScreen} />
        <Stack.Screen name="ImportantNewsScreen" component={ImportantNewsScreen} />
        <Stack.Screen name="NotificationSettingsScreen" component={withGuard(NotificationSettingsScreen, 'auth')} />
        <Stack.Screen name="SportNaChaykeScreen" component={withGuard(SportNaChaykeScreen, 'auth')} />
        <Stack.Screen name="SportDetailScreen" component={withGuard(SportDetailScreen, 'trusted')} />
        <Stack.Screen name="EdaNaChaykeScreen" component={EdaNaChaykeScreen} />
        <Stack.Screen name="SpisokPokupokScreen" component={SpisokPokupokScreen} />
        <Stack.Screen name="ProfileRequestsScreen" component={withGuard(ProfileRequestsScreen, 'trusted')} />
        <Stack.Screen name="MyPhotosScreen" component={MyPhotosScreen} options={{ headerShown: false }} />
        <Stack.Screen name="MyApprovedPhotosScreen" component={MyApprovedPhotosScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AppVersionInfoScreen" component={AppVersionInfoScreen} />
        <Stack.Screen name="AppMonitorScreen" component={withGuard(AppMonitorScreen, 'auth')} />
        <Stack.Screen name="SupportScreen" component={SupportScreen} />
      </Stack.Navigator>
      <ScreenFileInfoOverlay />
    </NavigationContainer>
    </NavErrorBoundary>
  );
}

export default function RootNavigator() {
  return <AuthNavigation />;
}

const styles = StyleSheet.create({
  guardFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  infoOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingRight: 10,
    paddingBottom: 12,
  },
  infoButton: {
    minWidth: 38,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  infoButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  infoLabel: {
    marginBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 220,
  },
  infoLabelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

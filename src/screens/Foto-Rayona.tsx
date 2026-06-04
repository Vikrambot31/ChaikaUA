import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { onValue, ref } from 'firebase/database';
import { useSelector } from 'react-redux';

import AppPhotoImage from '../components/AppPhotoImage';
import MiniTabBar from '../components/MiniTabBar';
import { database } from '../firebase-core';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { SCREEN_THEME } from '../utils/screenTheme';
import { logClientError } from '../utils/errorLogger';

const SCREEN_ID = 'FotoRayonaScreen';
const PHOTO_UPLOAD_SCREEN_ID = 'PhotoUploadScreen';
const MAX_ITEMS = 60;
const NUM_COLUMNS = 3;
const GRID_GAP = 7;

type Lang = 'ua' | 'ru' | 'en';

const UI_TEXT = {
  ua: {
    title: 'Фото району',
    approvedNote: 'Схвалені модератором фото',
    pending: 'на модерації',
    addPhoto: 'Додати фото',
    login: 'Увійдіть, щоб додати фото',
    empty: 'Поки немає фото району',
    loadError: 'Не вдалося завантажити фото',
  },
  ru: {
    title: 'Фото района',
    approvedNote: 'Одобренные модератором фото',
    pending: 'на модерации',
    addPhoto: 'Добавить фото',
    login: 'Войдите, чтобы добавить фото',
    empty: 'Пока нет фото района',
    loadError: 'Не удалось загрузить фото',
  },
  en: {
    title: 'District Photos',
    approvedNote: 'Photos approved by moderators',
    pending: 'in moderation',
    addPhoto: 'Add photo',
    login: 'Sign in to add a photo',
    empty: 'No district photos yet',
    loadError: 'Could not load photos',
  },
} as const;

type SoulPhoto = {
  id: string;
  uri: string;
  storagePath: string;
  createdAt: number;
  status: 'approved' | 'pending';
};

type RawPhoto = {
  imageUri?: unknown;
  thumbnailUrl?: unknown;
  storagePath?: unknown;
  createdAt?: unknown;
  uploadedAt?: unknown;
  status?: unknown;
  sourceScreen?: unknown;
  uid?: unknown;
  userId?: unknown;
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const timestamp = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

const SoulTile = memo(function SoulTile({
  item,
  size,
  pendingLabel,
}: {
  item: SoulPhoto;
  size: number;
  pendingLabel: string;
}) {
  const pending = item.status === 'pending';

  return (
    <View style={[styles.tile, pending ? styles.pendingTile : styles.approvedTile, { width: size, height: size }]}>
      {item.uri ? (
        <AppPhotoImage
          uri={item.uri}
          storagePath={item.storagePath}
          style={styles.tileImage}
          resizeMode="cover"
          debugLabel={`DistrictPhoto:${item.id}`}
          showDebugInfo={false}
        />
      ) : (
        <View style={styles.grayExample} />
      )}

      {pending ? (
        <View style={styles.pendingLabel}>
          <Text style={styles.pendingText}>{pendingLabel}</Text>
        </View>
      ) : null}
    </View>
  );
});

export default function FotoRayonaScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useSelector((state: RootState) => state.auth.user);
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const text = UI_TEXT[language] ?? UI_TEXT.ua;

  const [remotePhotos, setRemotePhotos] = useState<SoulPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void ensureFirebaseAuth()
      .then(() => {
        if (!active) return;
        const photosRef = ref(database, 'community_photos');
        unsubscribe = onValue(
          photosRef,
          (snapshot) => {
            try {
              const value = snapshot.val() as unknown;
              if (!value || typeof value !== 'object' || Array.isArray(value)) {
                if (active) { setRemotePhotos([]); setLoading(false); }
                return;
              }

              const currentUid = user?.id ?? '';
              const items = Object.entries(value as Record<string, unknown>)
                .map<SoulPhoto | null>(([id, raw]) => {
                  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
                  const photo = raw as RawPhoto;
                  const status = clean(photo.status);
                  const sourceScreen = clean(photo.sourceScreen);
                  const owner = clean(photo.uid) || clean(photo.userId);
                  if (sourceScreen !== SCREEN_ID && sourceScreen !== PHOTO_UPLOAD_SCREEN_ID) return null;
                  const isApproved = status === 'approved';
                  const isOwnPending = status === 'pending' && Boolean(currentUid) && owner === currentUid;
                  if (!isApproved && !isOwnPending) return null;
                  return {
                    id,
                    uri: clean(photo.thumbnailUrl) || clean(photo.imageUri),
                    storagePath: clean(photo.storagePath),
                    createdAt: timestamp(photo.createdAt) || timestamp(photo.uploadedAt),
                    status: isApproved ? 'approved' : 'pending',
                  };
                })
                .filter((item): item is SoulPhoto => item !== null)
                .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
                .slice(0, MAX_ITEMS);

              if (active) { setRemotePhotos(items); setLoading(false); }
            } catch (error) {
              void logClientError('FotoRayonaScreen.load', error);
              if (active) { setRemotePhotos([]); setLoading(false); }
            }
          },
          (error) => {
            void logClientError('FotoRayonaScreen.firebase', error);
            if (active) { setRemotePhotos([]); setLoadError(true); setLoading(false); }
          },
        );
      })
      .catch((error) => {
        void logClientError('FotoRayonaScreen.auth', error);
        if (active) { setRemotePhotos([]); setLoadError(true); setLoading(false); }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [user?.id]);

  const data = useMemo<SoulPhoto[]>(() => {
    return remotePhotos.slice(0, MAX_ITEMS);
  }, [remotePhotos]);

  const gridPadding = 12;
  const tileSize = useMemo(
    () => Math.floor((width - gridPadding * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: SoulPhoto }) => (
      <SoulTile item={item} size={tileSize} pendingLabel={text.pending} />
    ),
    [text.pending, tileSize],
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.78}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={SCREEN_THEME.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.title}>{text.title}</Text>
      <Text style={styles.subtitle}>{text.approvedNote}</Text>
    </View>
  );

  const uploadPanel = (
    <View style={styles.uploadPanel}>
      {user ? (
        <TouchableOpacity
          style={styles.submitButton}
          onPress={() => navigation.navigate('PhotoUploadScreen')}
          activeOpacity={0.86}
        >
          <MaterialCommunityIcons name="camera-plus-outline" size={19} color="#fff" />
          <Text style={styles.submitText}>{text.addPhoto}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => navigation.navigate('LoginScreen', {})}
          activeOpacity={0.82}
        >
          <MaterialCommunityIcons name="login" size={19} color="#fff" />
          <Text style={styles.actionText}>{text.login}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const empty = (
    <View style={styles.empty}>
      {loading ? (
        <ActivityIndicator size="large" color={SCREEN_THEME.terracotta} />
      ) : (
        <>
          <MaterialCommunityIcons
            name={loadError ? 'wifi-alert' : 'image-outline'}
            size={38}
            color="#8D735A"
          />
          <Text style={styles.emptyText}>{loadError ? text.loadError : text.empty}</Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        style={styles.photoList}
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />
      {uploadPanel}
      <MiniTabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6E9C9' },
  photoList: { flex: 1 },
  content: { paddingHorizontal: 12, paddingBottom: 14 },
  header: {
    paddingTop: 10,
    paddingBottom: 12,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 8,
    left: 0,
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8BF8B',
    backgroundColor: '#FFF8E9',
  },
  title: {
    color: '#453321',
    fontSize: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: '#75684F',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  row: { gap: GRID_GAP, marginBottom: GRID_GAP },
  tile: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#858584',
  },
  approvedTile: {
    borderWidth: 1,
    borderColor: '#6F766B',
  },
  pendingTile: {
    borderWidth: 2,
    borderColor: '#22B14C',
  },
  tileImage: { width: '100%', height: '100%' },
  grayExample: { width: '100%', height: '100%', backgroundColor: '#858584' },
  pendingLabel: {
    position: 'absolute',
    left: 5,
    right: 5,
    bottom: 5,
    minHeight: 24,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  pendingText: {
    color: '#77746E',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  uploadPanel: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    borderTopWidth: 2,
    borderTopColor: '#D8BF8B',
    backgroundColor: '#F6E9C9',
  },
  loginButton: {
    minHeight: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C97959',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8FA77A',
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  empty: {
    minHeight: 230,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#75684F',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});

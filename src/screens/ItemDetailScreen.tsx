import React, { useEffect, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { useSelector } from 'react-redux';

import AppPhotoImage from '../components/AppPhotoImage';
import ContactReasonModal from '../components/ContactReasonModal';
import MiniTabBar from '../components/MiniTabBar';
import MiniUserAvatar from '../components/MiniUserAvatar';
import { useContactRequest } from '../hooks/useContactRequest';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { RootState } from '../redux/store';
import { profilePermissionService, type ViewRequestContext } from '../services/profilePermissionService';
import { getRequestTopicLabel } from '../data/categories';
import { safeCallPhone, safeOpenViber } from '../utils/communicationActions';
import type { DetailItemData } from '../utils/detailViewTypes';
import { requireAuthForDetails } from '../utils/authGuard';
import { SCREEN_THEME } from '../utils/screenTheme';

type Lang = 'ua' | 'ru' | 'en';

type ItemDetailParams = {
  ItemDetailScreen: { item: DetailItemData };
};

const UI_TEXT = {
  ua: {
    headerTitle: 'Деталі',
    back: 'Назад',
    description: 'Опис',
    price: 'Ціна',
    address: 'Адреса',
    status: 'Статус',
    votes: 'Голоси',
    phone: 'Контакт',
    call: 'Зателефонувати',
    viber: 'Viber',
    copy: 'Копія',
    copiedTitle: 'Скопійовано',
    copiedBody: 'Номер телефону скопійовано.',
    contact: "Зв'язатися",
  },
  ru: {
    headerTitle: 'Детали',
    back: 'Назад',
    description: 'Описание',
    price: 'Цена',
    address: 'Адрес',
    status: 'Статус',
    votes: 'Голоса',
    phone: 'Контакт',
    call: 'Позвонить',
    viber: 'Viber',
    copy: 'Копия',
    copiedTitle: 'Скопировано',
    copiedBody: 'Номер телефона скопирован.',
    contact: 'Связаться',
  },
  en: {
    headerTitle: 'Details',
    back: 'Back',
    description: 'Description',
    price: 'Price',
    address: 'Address',
    status: 'Status',
    votes: 'Votes',
    phone: 'Contact',
    call: 'Call',
    viber: 'Viber',
    copy: 'Copy',
    copiedTitle: 'Copied',
    copiedBody: 'Phone number copied.',
    contact: 'Contact',
  },
} as const;

const REQUEST_CONTEXTS = new Set<string>(['lyudi', 'help', 'sport', 'buysell', 'job']);

const getContactContext = (sourceType: string): ViewRequestContext => (
  REQUEST_CONTEXTS.has(sourceType) ? sourceType as ViewRequestContext : 'lyudi'
);

export default function ItemDetailScreen({
  navigation,
  route,
}: {
  navigation: NavigationProp<RootStackParamList, 'ItemDetailScreen'>;
  route: RouteProp<ItemDetailParams, 'ItemDetailScreen'>;
}) {
  const language = useSelector((state: RootState) => (state.language?.current ?? 'ua') as Lang);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { modalVisible, pending, currentTarget, openModal, closeModal, sendRequest } = useContactRequest();
  const item = route.params.item;
  const text = UI_TEXT[language];
  const [contactApproved, setContactApproved] = useState(false);
  const isOwnItem = Boolean(item.userId && currentUser?.id && item.userId === currentUser.id);
  const phoneVisible = isOwnItem || contactApproved;
  const hasPhone = phoneVisible && Boolean(item.phone?.trim());
  const canRequestContact = Boolean(item.userId && item.userId !== currentUser?.id);
  const canOpenProfile = Boolean(item.userId && item.userId !== currentUser?.id);
  const canContact = canRequestContact || hasPhone;
  const hasPhoto = Boolean(item.photoUri || item.photoStoragePath);
  const hasOwnerAvatar = Boolean(item.ownerAvatarUri);
  const categoryLabel = item.category ? getRequestTopicLabel({ category: item.category }, language) : '';
  const profileLabel = language === 'ua' ? 'Профіль' : language === 'ru' ? 'Профиль' : 'Profile';

  const isAuthenticated = Boolean(currentUser?.id);

  useEffect(() => {
    if (!isAuthenticated) {
      requireAuthForDetails({ userId: currentUser?.id, navigation, language });
    }
  }, [currentUser?.id, isAuthenticated, language, navigation]);

  useEffect(() => {
    if (!isAuthenticated || !item.userId || !currentUser?.id || isOwnItem) return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await profilePermissionService.checkAccess(item.userId!, currentUser.id);
        if (!cancelled) setContactApproved(status === 'approved');
      } catch {
        if (!cancelled) setContactApproved(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, item.userId, currentUser?.id, isOwnItem]);

  const fields = [
    { label: text.description, value: item.description },
    { label: item.priceLabel ?? text.price, value: item.price },
    { label: text.address, value: item.address },
    { label: text.status, value: item.status },
    { label: text.votes, value: typeof item.votesCount === 'number' ? String(item.votesCount) : undefined },
  ].filter((field) => Boolean(field.value));

  const handleCopyPhone = async () => {
    if (!item.phone) return;
    await Clipboard.setStringAsync(item.phone);
    Alert.alert(text.copiedTitle, text.copiedBody);
  };

  const handleContact = () => {
    if (canRequestContact && item.userId) {
      openModal({
        userId: item.userId,
        name: item.title || text.headerTitle,
        photoURL: item.ownerAvatarUri,
        sourceType: getContactContext(item.sourceType),
        sourceId: item.sourceId,
        sourceTitle: item.title,
      });
      return;
    }

    if (!hasPhone) return;
    Alert.alert(text.contact, item.title || text.headerTitle, [
      { text: text.call, onPress: () => { void safeCallPhone(item.phone, language); } },
      { text: text.viber, onPress: () => { void safeOpenViber(item.phone, language); } },
      { text: language === 'en' ? 'Cancel' : '\u041e\u0442\u043c\u0435\u043d\u0430', style: 'cancel' },
    ]);
  };

  const handleProfile = () => {
    if (!canOpenProfile || !item.userId) return;
    navigation.navigate('ViewUserProfile', { userId: item.userId });
  };

  if (!isAuthenticated) {
    const gateTitle = language === 'en'
      ? 'Registration required'
      : language === 'ru'
        ? '\u041d\u0443\u0436\u043d\u0430 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f'
        : '\u041f\u043e\u0442\u0440\u0456\u0431\u043d\u0430 \u0440\u0435\u0454\u0441\u0442\u0440\u0430\u0446\u0456\u044f';
    const gateText = language === 'en'
      ? 'Sign in to open details, contacts, and profiles.'
      : language === 'ru'
        ? '\u0412\u043e\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u0434\u0435\u0442\u0430\u043b\u0438, \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u044b \u0438 \u043f\u0440\u043e\u0444\u0438\u043b\u044c.'
        : '\u0423\u0432\u0456\u0439\u0434\u0456\u0442\u044c, \u0449\u043e\u0431 \u0432\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u0434\u0435\u0442\u0430\u043b\u0456, \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u0438 \u0442\u0430 \u043f\u0440\u043e\u0444\u0456\u043b\u044c.';
    const gateButton = language === 'en'
      ? 'Sign in / Register'
      : language === 'ru'
        ? '\u0412\u043e\u0439\u0442\u0438 / \u0417\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f'
        : '\u0423\u0432\u0456\u0439\u0442\u0438 / \u0417\u0430\u0440\u0435\u0454\u0441\u0442\u0440\u0443\u0432\u0430\u0442\u0438\u0441\u044c';

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chevron-left" size={22} color="#403933" />
            <Text style={styles.backText}>{text.back}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{text.headerTitle}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.authGate}>
          <MaterialCommunityIcons name="lock-outline" size={42} color={SCREEN_THEME.terracotta} />
          <Text style={styles.authGateTitle}>{gateTitle}</Text>
          <Text style={styles.authGateText}>{gateText}</Text>
          <TouchableOpacity
            style={styles.authGateButton}
            onPress={() => navigation.navigate('LoginScreen', {})}
            activeOpacity={0.86}
          >
            <Text style={styles.authGateButtonText}>{gateButton}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <MaterialCommunityIcons name="chevron-left" size={22} color="#403933" />
          <Text style={styles.backText}>{text.back}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{text.headerTitle}</Text>
        {currentUser?.id ? (
          <TouchableOpacity
            style={styles.headerAvatar}
            onPress={() => navigation.navigate('ViewUserProfile', { userId: currentUser.id })}
            activeOpacity={0.8}
          >
            <MiniUserAvatar uri={currentUser.photoURL} name={currentUser.name} size={34} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {hasPhoto ? (
          <AppPhotoImage
            uri={item.photoUri}
            storagePath={item.photoStoragePath}
            style={styles.photo}
            resizeMode="contain"
            debugLabel={`ItemDetail:${item.sourceType}:${item.sourceId}`}
          />
        ) : hasOwnerAvatar ? (
          <AppPhotoImage
            uri={item.ownerAvatarUri}
            style={styles.photo}
            resizeMode="cover"
            debugLabel={`ItemDetail:ownerAvatar:${item.userId}`}
          />
        ) : null}

        <View style={styles.titleCard}>
          <Text style={styles.title}>{item.title}</Text>
          {categoryLabel ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{categoryLabel}</Text>
            </View>
          ) : null}
        </View>

        {fields.map((field) => (
          <View key={field.label} style={styles.infoCard}>
            <Text style={styles.infoLabel}>{field.label}</Text>
            <Text style={styles.infoValue}>{field.value}</Text>
          </View>
        ))}

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{text.phone}</Text>
          <Text style={styles.phoneValue}>{phoneVisible ? (item.phone || '—') : '***'}</Text>
          <View style={styles.contactActions}>
            <TouchableOpacity
              style={[styles.smallAction, !canOpenProfile && styles.disabledAction]}
              onPress={handleProfile}
              disabled={!canOpenProfile}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons name="account-circle-outline" size={16} color={canOpenProfile ? '#fff' : '#9F958E'} />
              <Text style={[styles.smallActionText, !canOpenProfile && styles.disabledText]}>{profileLabel}</Text>
            </TouchableOpacity>
            {phoneVisible ? (
              <>
                <TouchableOpacity
                  style={[styles.smallAction, !hasPhone && styles.disabledAction]}
                  onPress={() => void safeCallPhone(item.phone, language)}
                  disabled={!hasPhone}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons name="phone-outline" size={16} color={hasPhone ? '#fff' : '#9F958E'} />
                  <Text style={[styles.smallActionText, !hasPhone && styles.disabledText]}>{text.call}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallAction, !hasPhone && styles.disabledAction]}
                  onPress={() => void safeOpenViber(item.phone, language)}
                  disabled={!hasPhone}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons name="message-text-outline" size={16} color={hasPhone ? '#fff' : '#9F958E'} />
                  <Text style={[styles.smallActionText, !hasPhone && styles.disabledText]}>{text.viber}</Text>
                </TouchableOpacity>
                {hasPhone ? (
                  <TouchableOpacity style={styles.smallActionAlt} onPress={() => void handleCopyPhone()} activeOpacity={0.82}>
                    <MaterialCommunityIcons name="content-copy" size={16} color="#403933" />
                    <Text style={styles.smallActionAltText}>{text.copy}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.contactBtn, !canContact && styles.disabledAction]}
          onPress={handleContact}
          disabled={!canContact}
          activeOpacity={0.86}
        >
          <Text style={[styles.contactBtnText, !canContact && styles.disabledText]}>{text.contact}</Text>
        </TouchableOpacity>
      </ScrollView>

      <MiniTabBar />
      <ContactReasonModal
        visible={modalVisible}
        pending={pending}
        target={currentTarget}
        onSelect={(reason) => void sendRequest(reason)}
        onClose={closeModal}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SCREEN_THEME.appBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: SCREEN_THEME.paperStrong,
    borderBottomWidth: 1,
    borderBottomColor: '#E6D6BF',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 78 },
  backText: { color: '#403933', fontSize: 14, fontWeight: '800' },
  headerTitle: { color: '#2D2520', fontSize: 18, fontWeight: '900' },
  headerAvatar: { width: 78, alignItems: 'flex-end' },
  headerSpacer: { width: 78 },
  content: { padding: 16, paddingBottom: 112, gap: 12 },
  authGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  authGateTitle: {
    color: SCREEN_THEME.textPrimary,
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  authGateText: {
    color: SCREEN_THEME.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    textAlign: 'center',
  },
  authGateButton: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_THEME.terracotta,
  },
  authGateButtonText: {
    color: '#FFF9EE',
    fontSize: 15,
    fontWeight: '900',
  },
  photo: { width: '100%', height: 300, borderRadius: 22, backgroundColor: '#F0EDE8' },
  titleCard: {
    backgroundColor: SCREEN_THEME.paperStrong,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  title: { color: '#2D2520', fontSize: 22, fontWeight: '900', marginBottom: 10 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#6A8BA5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  infoCard: {
    backgroundColor: '#FBF7F2',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8DDD3',
  },
  infoLabel: { color: '#7A6D64', fontSize: 12, fontWeight: '900', marginBottom: 6, textTransform: 'uppercase' },
  infoValue: { color: '#2D2520', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  phoneValue: { color: '#2D2520', fontSize: 16, fontWeight: '900', marginBottom: 10 },
  contactActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#403933',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallActionText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  smallActionAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8DDD3',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  smallActionAltText: { color: '#403933', fontSize: 12, fontWeight: '900' },
  contactBtn: { alignItems: 'center', backgroundColor: '#7A1E5C', borderRadius: 16, paddingVertical: 14 },
  contactBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  disabledAction: { backgroundColor: '#E1D7CF' },
  disabledText: { color: '#9F958E' },
});

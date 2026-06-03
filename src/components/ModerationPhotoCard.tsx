import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SCREEN_THEME } from '../utils/screenTheme';
import TactileCard from './TactileCard';
import AppPhotoImage from './AppPhotoImage';

export type ModerationPhoto = {
  id: string;
  uri?: string;
  storagePath?: string;
  title?: string;
  description?: string;
  userName?: string;
  userId?: string;
  phone?: string;
  category?: string;
  price?: string;
  address?: string;
  sourceScreen: string;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected';
};

interface ModerationPhotoCardProps {
  photo: ModerationPhoto;
  onApprove?: () => void;
  onReject?: () => void;
  onDelete?: () => void;
  onPress?: () => void;
  busy?: boolean;
  language?: 'ua' | 'ru' | 'en';
}

const SOURCE_LABELS: Record<string, { ua: string; ru: string; en: string }> = {
  FotoRayonaScreen: { ua: 'Фото району', ru: 'Фото района', en: 'District photos' },
  SoulPhotosScreen: { ua: 'Фото для душі', ru: 'Фото для души', en: 'Soul photos' },
  PhotoUploadScreen: { ua: 'Додати фото', ru: 'Добавить фото', en: 'Add photo' },
  LostFoundScreen: { ua: 'Хто загубив', ru: 'Кто потерял', en: 'Lost and found' },
  BuySellScreen: { ua: 'Куплю/Продам', ru: 'Куплю/Продам', en: 'Buy/Sell' },
  ContactsScreen: { ua: 'Контакти', ru: 'Контакты', en: 'Contacts' },
  LocalBusinessScreen: { ua: 'Бізнес/послуги ЖК', ru: 'Бизнес/услуги ЖК', en: 'Local business' },
  AppSuggestionScreen: { ua: 'Пропозиції додатку', ru: 'Предложения приложения', en: 'App suggestions' },
};

const formatDateShort = (value: number): string => {
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
};

const ModerationPhotoCard: React.FC<ModerationPhotoCardProps> = ({
  photo,
  onApprove,
  onReject,
  onDelete,
  onPress,
  busy,
  language = 'ua',
}) => {
  const L = useMemo(() => ({
    approve: language === 'ru' ? 'Одобрить' : language === 'en' ? 'Approve' : 'Схвалити',
    reject: language === 'ru' ? 'Отклонить' : language === 'en' ? 'Reject' : 'Відхилити',
    delete: language === 'ru' ? 'Удалить' : language === 'en' ? 'Delete' : 'Видалити',
    photoLabel: language === 'ru' ? 'Фото' : language === 'en' ? 'Photo' : 'Фото',
    pending: language === 'ru' ? 'Ожидает' : language === 'en' ? 'Pending' : 'Очікує',
  }), [language]);

  const sourceLabel = SOURCE_LABELS[photo.sourceScreen]?.[language]
    ?? SOURCE_LABELS[photo.sourceScreen]?.ua
    ?? photo.sourceScreen;

  return (
    <TactileCard onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconBadge}>
          <MaterialCommunityIcons name="image-multiple-outline" size={20} color="#FFF9EE" />
        </View>
        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={styles.nameText} numberOfLines={1}>{photo.userName?.trim() || L.photoLabel}</Text>
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>{formatDateShort(photo.createdAt)}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.sourcePill}>
              <MaterialCommunityIcons name="map-marker-radius-outline" size={10} color={SCREEN_THEME.enamelBlueDark} />
              <Text style={styles.sourcePillText} numberOfLines={1}>{sourceLabel}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{L.pending}</Text>
            </View>
            {onPress ? (
              <View style={styles.detailsPill}>
                <MaterialCommunityIcons name="open-in-new" size={10} color="#5F3D12" />
                <Text style={styles.detailsPillText}>
                  {language === 'ru' ? 'Подробнее' : language === 'en' ? 'Details' : 'Деталі'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <AppPhotoImage
        uri={photo.uri}
        storagePath={photo.storagePath}
        style={styles.photo}
        resizeMode="cover"
        isOwner
        debugLabel={`ModerationPhoto:${photo.id}`}
      />

      {photo.description ? (
        <View style={styles.descBox}>
          <Text style={styles.descText} numberOfLines={3}>{photo.description}</Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {onPress ? (
          <TouchableOpacity
            style={[styles.modBtn, styles.modBtnDetails]}
            onPress={onPress}
            disabled={busy}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="open-in-new" size={16} color="#fff" />
            <Text style={styles.modBtnText}>
              {language === 'ru' ? 'Подробнее' : language === 'en' ? 'Details' : 'Деталі'}
            </Text>
          </TouchableOpacity>
        ) : null}
        {onApprove ? (
          <TouchableOpacity
            style={[styles.modBtn, styles.modBtnApprove]}
            onPress={onApprove}
            disabled={busy}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
            <Text style={styles.modBtnText}>{L.approve}</Text>
          </TouchableOpacity>
        ) : null}
        {onReject ? (
          <TouchableOpacity
            style={[styles.modBtn, styles.modBtnReject]}
            onPress={onReject}
            disabled={busy}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="close-circle-outline" size={16} color="#fff" />
            <Text style={styles.modBtnText}>{L.reject}</Text>
          </TouchableOpacity>
        ) : null}
        {onDelete ? (
          <TouchableOpacity
            style={[styles.modBtn, styles.modBtnDelete]}
            onPress={onDelete}
            disabled={busy}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#fff" />
            <Text style={styles.modBtnText}>{L.delete}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TactileCard>
  );
};

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconBadge: {
    width: 50,
    height: 50,
    borderRadius: 13,
    backgroundColor: SCREEN_THEME.enamelBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    gap: 5,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2D2520',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  sourcePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E8F0F3',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    maxWidth: '68%',
  },
  sourcePillText: {
    color: SCREEN_THEME.enamelBlueDark,
    fontSize: 9,
    fontWeight: '800',
    flexShrink: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexShrink: 0,
    backgroundColor: '#fff2cc',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8a5b00',
  },
  detailsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexShrink: 0,
    backgroundColor: '#F3E2C4',
  },
  detailsPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5F3D12',
  },
  datePill: {
    backgroundColor: '#DDEAF0',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  datePillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#3D5D87',
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  descBox: {
    borderWidth: 1,
    borderColor: '#E0D5C8',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: '#FAF7F3',
    marginBottom: 8,
  },
  descText: {
    fontSize: 12,
    color: '#7A6D64',
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
  },
  modBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modBtnApprove: {
    backgroundColor: '#2A7B41',
  },
  modBtnDetails: {
    backgroundColor: '#5F6F52',
  },
  modBtnReject: {
    backgroundColor: '#C77A2B',
  },
  modBtnDelete: {
    backgroundColor: '#C0392B',
  },
  modBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
});

export default React.memo(ModerationPhotoCard);

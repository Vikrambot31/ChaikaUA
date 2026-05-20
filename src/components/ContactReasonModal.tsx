import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';
import type { ContactReason } from '../services/profilePermissionService';
import type { ContactTarget } from '../hooks/useContactRequest';

type Lang = 'ua' | 'ru' | 'en';

interface Props {
  visible: boolean;
  pending: boolean;
  target: ContactTarget | null;
  onSelect: (reason: ContactReason) => void;
  onClose: () => void;
}

const ACCENT = '#7A1E5C';

const UI: Record<Lang, {
  title: string;
  subtitle: string;
  reasons: { key: ContactReason; label: string; icon: string }[];
  cancel: string;
}> = {
  ua: {
    title: "Зв'язатися з користувачем?",
    subtitle: 'Оберіть причину звернення',
    reasons: [
      { key: 'acquaintance', label: 'Просто знайомство', icon: 'account-plus-outline' },
      { key: 'by_listing', label: 'По вашому оголошенню / заявці', icon: 'file-document-outline' },
      { key: 'by_services', label: 'По темі ваших послуг', icon: 'briefcase-outline' },
      { key: 'by_issue', label: 'По проблемі', icon: 'alert-circle-outline' },
    ],
    cancel: 'Скасувати',
  },
  ru: {
    title: 'Связаться с пользователем?',
    subtitle: 'Выберите причину обращения',
    reasons: [
      { key: 'acquaintance', label: 'Просто знакомство', icon: 'account-plus-outline' },
      { key: 'by_listing', label: 'По вашему объявлению / заявке', icon: 'file-document-outline' },
      { key: 'by_services', label: 'По теме ваших услуг', icon: 'briefcase-outline' },
      { key: 'by_issue', label: 'По проблеме', icon: 'alert-circle-outline' },
    ],
    cancel: 'Отмена',
  },
  en: {
    title: 'Contact this user?',
    subtitle: 'Select a reason',
    reasons: [
      { key: 'acquaintance', label: 'Just getting acquainted', icon: 'account-plus-outline' },
      { key: 'by_listing', label: 'About your listing / request', icon: 'file-document-outline' },
      { key: 'by_services', label: 'About your services', icon: 'briefcase-outline' },
      { key: 'by_issue', label: 'About a problem', icon: 'alert-circle-outline' },
    ],
    cancel: 'Cancel',
  },
};

export default function ContactReasonModal({ visible, pending, target, onSelect, onClose }: Props) {
  const language = useSelector(
    (state: RootState) => (state.language?.current ?? 'ua') as Lang,
  );
  const t = UI[language];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />

          <Text style={styles.title}>{t.title}</Text>
          {target?.name ? (
            <Text style={styles.name} numberOfLines={1}>
              {target.name}
            </Text>
          ) : null}
          <Text style={styles.subtitle}>{t.subtitle}</Text>

          <View style={styles.reasons}>
            {t.reasons.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={styles.reasonBtn}
                onPress={() => onSelect(r.key)}
                disabled={pending}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={r.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                  size={20}
                  color={ACCENT}
                  style={styles.reasonIcon}
                />
                <Text style={styles.reasonLabel}>{r.label}</Text>
                {pending ? (
                  <ActivityIndicator size="small" color={ACCENT} style={styles.spinner} />
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#C0A898" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{t.cancel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FBF7F2',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0CEB6',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: '#2D2520',
    textAlign: 'center',
    marginBottom: 4,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#7A6D64',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  reasons: {
    gap: 8,
    marginBottom: 16,
  },
  reasonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7F3EE',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E4D0AB',
  },
  reasonIcon: {
    marginRight: 12,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2520',
  },
  spinner: {
    marginLeft: 8,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7A6D64',
  },
});

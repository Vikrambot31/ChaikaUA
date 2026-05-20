import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type PermissionModalState = 'confirm' | 'sending' | 'sent' | 'pending' | 'open' | 'denied';

interface ProfileViewRequestModalProps {
  visible: boolean;
  state: PermissionModalState;
  targetName: string;
  contactInfo?: string;
  onSend: () => void;
  onClose: () => void;
  language?: 'ua' | 'ru' | 'en';
}

const ACCENT = '#7A1E5C';

const T = {
  ua: {
    requestTitle: 'Запит на контакт',
    requestBody1: ' отримає сповіщення, що ви хочете переглянути їхній профіль. Вони самі вирішать — поділитися контактами чи ні.',
    sendBtn: 'Надіслати запит',
    cancel: 'Скасувати',
    sending: 'Надсилаємо запит...',
    sentTitle: 'Запит надіслано!',
    sentBody1: ' отримає сповіщення і вирішить, чи відкрити вам свої контакти.',
    okBtn: 'Зрозуміло',
    pendingTitle: 'Запит вже надіслано',
    pendingBody1: 'Ви вже надіслали запит до ',
    pendingBody2: '. Очікуйте, поки вони дадуть відповідь.',
    deniedTitle: 'Запит відхилено',
    deniedBody1: ' вирішили не відкривати свій профіль.',
    closeBtn: 'Закрити',
  },
  ru: {
    requestTitle: 'Запрос на контакт',
    requestBody1: ' получит уведомление, что вы хотите просмотреть их профиль. Они сами решат — поделиться контактами или нет.',
    sendBtn: 'Отправить запрос',
    cancel: 'Отмена',
    sending: 'Отправляем запрос...',
    sentTitle: 'Запрос отправлен!',
    sentBody1: ' получит уведомление и решит, открыть ли вам свои контакты.',
    okBtn: 'Понятно',
    pendingTitle: 'Запрос уже отправлен',
    pendingBody1: 'Вы уже отправили запрос к ',
    pendingBody2: '. Ожидайте ответа.',
    deniedTitle: 'Запрос отклонён',
    deniedBody1: ' решили не открывать свой профиль.',
    closeBtn: 'Закрыть',
  },
  en: {
    requestTitle: 'Contact request',
    requestBody1: ' will receive a notification that you want to view their profile. They decide whether to share contacts.',
    sendBtn: 'Send request',
    cancel: 'Cancel',
    sending: 'Sending request...',
    sentTitle: 'Request sent!',
    sentBody1: ' will receive a notification and decide whether to share contacts with you.',
    okBtn: 'Got it',
    pendingTitle: 'Request already sent',
    pendingBody1: 'You already sent a request to ',
    pendingBody2: '. Wait for their response.',
    deniedTitle: 'Request declined',
    deniedBody1: ' decided not to share their profile.',
    closeBtn: 'Close',
  },
};

export function ProfileViewRequestModal({
  visible,
  state,
  targetName,
  contactInfo,
  onSend,
  onClose,
  language = 'ua',
}: ProfileViewRequestModalProps) {
  const t = T[language];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={state === 'confirm' ? onClose : undefined}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          <View style={styles.handle} />

          {state === 'confirm' && (
            <>
              <MaterialCommunityIcons name="lock-outline" size={36} color={ACCENT} style={styles.icon} />
              <Text style={styles.title}>{t.requestTitle}</Text>
              <Text style={styles.body}>
                <Text style={styles.bold}>{targetName}</Text>
                {t.requestBody1}
              </Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={onSend} activeOpacity={0.85}>
                <MaterialCommunityIcons name="send-outline" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>{t.sendBtn}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.btnSecondaryText}>{t.cancel}</Text>
              </TouchableOpacity>
            </>
          )}

          {state === 'sending' && (
            <>
              <ActivityIndicator color={ACCENT} size="large" style={styles.icon} />
              <Text style={styles.title}>{t.sending}</Text>
            </>
          )}

          {state === 'sent' && (
            <>
              <MaterialCommunityIcons name="check-circle-outline" size={36} color="#2E7D32" style={styles.icon} />
              <Text style={styles.title}>{t.sentTitle}</Text>
              <Text style={styles.body}>
                <Text style={styles.bold}>{targetName}</Text>
                {t.sentBody1}
              </Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>{t.okBtn}</Text>
              </TouchableOpacity>
            </>
          )}

          {state === 'pending' && (
            <>
              <MaterialCommunityIcons name="clock-outline" size={36} color="#F57C00" style={styles.icon} />
              <Text style={styles.title}>{t.pendingTitle}</Text>
              <Text style={styles.body}>
                {t.pendingBody1}
                <Text style={styles.bold}>{targetName}</Text>
                {t.pendingBody2}
              </Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>{t.okBtn}</Text>
              </TouchableOpacity>
            </>
          )}

          {state === 'open' && (
            <>
              <MaterialCommunityIcons name="account-check-outline" size={36} color={ACCENT} style={styles.icon} />
              <Text style={styles.title}>{targetName}</Text>
              {contactInfo ? (
                <View style={styles.contactBox}>
                  <MaterialCommunityIcons name="phone-outline" size={16} color={ACCENT} />
                  <Text style={styles.contactText}>{contactInfo}</Text>
                </View>
              ) : null}
              <TouchableOpacity style={styles.btnPrimary} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>{t.closeBtn}</Text>
              </TouchableOpacity>
            </>
          )}

          {state === 'denied' && (
            <>
              <MaterialCommunityIcons name="lock-remove-outline" size={36} color="#C62828" style={styles.icon} />
              <Text style={styles.title}>{t.deniedTitle}</Text>
              <Text style={styles.body}>
                <Text style={styles.bold}>{targetName}</Text>
                {t.deniedBody1}
              </Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>{t.okBtn}</Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFF8F4',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 8,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: '#D9C69E',
    marginBottom: 20,
  },
  icon: { marginBottom: 14 },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#2D2520',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#5B5048',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  bold: { fontWeight: '800', color: '#2D2520' },
  btnPrimary: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnSecondary: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#7A6D64', fontSize: 14, fontWeight: '700' },
  contactBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F3E5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    width: '100%',
  },
  contactText: { fontSize: 16, fontWeight: '800', color: '#4A1942' },
});


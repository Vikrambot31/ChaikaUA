import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { get, ref } from 'firebase/database';
import Toast from 'react-native-toast-message';
import { database } from '../firebase-core';
import {
  ContactReason,
  ViewRequestContext,
  profilePermissionService,
} from '../services/profilePermissionService';
import { ensureFirebaseAuth } from '../firebase-auth-session';
import { selectUser } from '../redux/slices/authSlice';
import type { RootState } from '../redux/store';

type Lang = 'ua' | 'ru' | 'en';

export interface ContactTarget {
  userId: string;
  name: string;
  photoURL?: string;
  sourceType?: ViewRequestContext;
  sourceId?: string;
  sourceTitle?: string;
}

const TOAST_TEXT: Record<string, Record<Lang, string>> = {
  sent: { ua: 'Запит надіслано', ru: 'Запрос отправлен', en: 'Request sent' },
  already_pending: { ua: 'Запит вже надіслано', ru: 'Запрос уже отправлен', en: 'Already sent' },
  already_approved: { ua: 'Вже погоджено', ru: 'Уже одобрено', en: 'Already approved' },
  open_profile: { ua: 'Контакт відкрито', ru: 'Контакт открыт', en: 'Contact available' },
  error: { ua: 'Помилка. Спробуйте ще раз', ru: 'Ошибка. Попробуйте снова', en: 'Error. Try again' },
  no_auth: { ua: 'Потрібна авторизація', ru: 'Требуется авторизация', en: 'Authorization required' },
  no_user: { ua: 'Користувача не знайдено', ru: 'Пользователь не найден', en: 'User not found' },
};

const GUEST_NAME: Record<Lang, string> = {
  ua: '\u0413\u0456\u0441\u0442\u044c',
  ru: '\u0413\u043e\u0441\u0442\u044c',
  en: 'Guest',
};

export function useContactRequest() {
  const user = useSelector(selectUser);
  const language = useSelector(
    (state: RootState) => (state.language?.current ?? 'ua') as Lang,
  );

  const [modalVisible, setModalVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [currentTarget, setCurrentTarget] = useState<ContactTarget | null>(null);

  const openModal = useCallback(
    async (target: ContactTarget) => {
      if (!target.userId) {
        Toast.show({ type: 'error', text1: TOAST_TEXT.no_user[language] });
        return;
      }

      try {
        const firebaseUser = await ensureFirebaseAuth();
        const requesterId = user?.id ?? firebaseUser.uid;
        if (!requesterId || target.userId === requesterId) return;
        setCurrentTarget(target);
        setModalVisible(true);
      } catch {
        Toast.show({ type: 'error', text1: TOAST_TEXT.error[language] });
      }
    },
    [user?.id, language],
  );

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setCurrentTarget(null);
  }, []);

  const sendRequest = useCallback(
    async (reason: ContactReason) => {
      if (!currentTarget) return;
      setPending(true);
      try {
        const firebaseUser = await ensureFirebaseAuth();
        const requesterId = user?.id ?? firebaseUser.uid;
        if (!requesterId || currentTarget.userId === requesterId) return;

        let requesterPhone = '';
        try {
          const snap = await get(ref(database, `users/${requesterId}/phone`));
          const raw = snap.val();
          requesterPhone = typeof raw === 'string' ? raw.trim() : '';
        } catch {
          // phone is optional — proceed without it
        }

        const result = await profilePermissionService.requestView(
          currentTarget.userId,
          { id: requesterId, name: user?.name ?? GUEST_NAME[language], photoURL: user?.photoURL ?? '' },
          currentTarget.sourceType ?? 'lyudi',
          { name: currentTarget.name, photoURL: currentTarget.photoURL },
          {
            reason,
            sourceId: currentTarget.sourceId,
            sourceTitle: currentTarget.sourceTitle,
            sourceType: currentTarget.sourceType,
            requesterPhone,
          },
        );

        closeModal();

        if (result === 'sent') {
          Toast.show({ type: 'success', text1: TOAST_TEXT.sent[language] });
        } else if (result === 'already_pending') {
          Toast.show({ type: 'info', text1: TOAST_TEXT.already_pending[language] });
        } else if (result === 'open_profile') {
          Toast.show({ type: 'success', text1: TOAST_TEXT.open_profile[language] });
        } else if (result === 'already_approved') {
          Toast.show({ type: 'success', text1: TOAST_TEXT.already_approved[language] });
        }
      } catch {
        Toast.show({ type: 'error', text1: TOAST_TEXT.error[language] });
      } finally {
        setPending(false);
      }
    },
    [currentTarget, user, language, closeModal],
  );

  return { modalVisible, pending, currentTarget, openModal, closeModal, sendRequest };
}

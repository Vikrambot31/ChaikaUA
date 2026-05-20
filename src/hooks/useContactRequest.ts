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
  error: { ua: 'Помилка. Спробуйте ще раз', ru: 'Ошибка. Попробуйте снова', en: 'Error. Try again' },
  no_auth: { ua: 'Потрібна авторизація', ru: 'Требуется авторизация', en: 'Authorization required' },
  no_user: { ua: 'Користувача не знайдено', ru: 'Пользователь не найден', en: 'User not found' },
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
    (target: ContactTarget) => {
      if (!user?.id) {
        Toast.show({ type: 'error', text1: TOAST_TEXT.no_auth[language] });
        return;
      }
      if (!target.userId) {
        Toast.show({ type: 'error', text1: TOAST_TEXT.no_user[language] });
        return;
      }
      if (target.userId === user.id) return;
      setCurrentTarget(target);
      setModalVisible(true);
    },
    [user?.id, language],
  );

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setCurrentTarget(null);
  }, []);

  const sendRequest = useCallback(
    async (reason: ContactReason) => {
      if (!currentTarget || !user?.id) return;
      setPending(true);
      try {
        let requesterPhone = '';
        try {
          const snap = await get(ref(database, `users/${user.id}/phone`));
          const raw = snap.val();
          requesterPhone = typeof raw === 'string' ? raw.trim() : '';
        } catch {
          // phone is optional — proceed without it
        }

        const result = await profilePermissionService.requestView(
          currentTarget.userId,
          { id: user.id, name: user.name ?? '', photoURL: user.photoURL ?? '' },
          currentTarget.sourceType ?? 'lyudi',
          undefined,
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

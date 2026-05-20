import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { fcmAPI } from '../firebase-config';
import { setFCMToken } from '../redux/slices/authSlice';
import { loadNotificationPrefs, resolveNotificationCategory } from '../utils/notificationPrefs';
import { logClientError } from '../utils/errorLogger';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function useFCMToken(uid: string | undefined) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!uid || Platform.OS === 'web') return;

    let unsubscribeRefresh: (() => void) | undefined;
    let unsubscribeMessage: (() => void) | undefined;
    const channelId = 'chaika-default';

    const init = async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(channelId, {
            name: 'Chaika notifications',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 200, 120, 200],
            lightColor: '#F7F3EE',
            sound: 'default',
          });
        }

        const token = await fcmAPI.registerToken();
        if (token) {
          dispatch(setFCMToken(token));
          await fcmAPI.saveTokenForUser(uid, token);
        }

        unsubscribeRefresh = fcmAPI.onTokenRefresh(uid, (newToken: string) => {
          dispatch(setFCMToken(newToken));
        });

        unsubscribeMessage = fcmAPI.onForegroundMessage(async (message: any) => {
          if (__DEV__) {
            console.log('[FCM] Foreground message:', message);
          }
          try {
            const prefs = await loadNotificationPrefs();
            const category = resolveNotificationCategory(message);
            if (!prefs[category]) {
              return;
            }

            const title = message?.notification?.title || message?.data?.title || 'Chaika Life';
            const body = message?.notification?.body || message?.data?.body || '';
            await Notifications.scheduleNotificationAsync({
              content: { title, body, sound: true, ...(Platform.OS === 'android' ? { channelId } : {}) },
              trigger: null,
            });
          } catch (error) {
            void logClientError('fcm.foregroundMessageHandler', error, {
              messageId: message?.messageId ?? null,
              category: resolveNotificationCategory(message),
            });
          }
        });
      } catch (error) {
        void logClientError('fcm.init', error, { uid });
      }
    };

    void init();

    return () => {
      unsubscribeRefresh?.();
      unsubscribeMessage?.();
    };
  }, [uid, dispatch]);
}


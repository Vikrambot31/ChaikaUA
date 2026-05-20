import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../utils/constants';
import {
  getMyInviteRequestStatus,
  type InviteRequestSnapshot,
} from '../services/sponsorService';

type PendingApprovalScreenProps = {
  initialStatus: InviteRequestSnapshot;
  onRefreshStatus: (snapshot: InviteRequestSnapshot) => void;
  onCreateNewRequest: () => void;
  onContinue: () => void;
};

const POLL_INTERVAL_MS = 30000;

const getTitle = (status: InviteRequestSnapshot['status']): string => {
  if (status === 'approved') return 'Заявка одобрена';
  if (status === 'denied' || status === 'auto_denied') return 'Заявка отклонена';
  if (status === 'needs_manual_review') return 'Заявка на дополнительной проверке';
  if (status === 'pending_sponsor') return 'Ждём подтверждение поручителя';
  return 'Заявка ожидает проверки';
};

const getBody = (status: InviteRequestSnapshot['status']): string => {
  if (status === 'approved') return 'Доступ через поручителя подтверждён. Можно продолжить пользоваться приложением.';
  if (status === 'denied' || status === 'auto_denied') return 'Пока не получилось подтвердить доступ. Можно отправить новую заявку или продолжить просмотр доступных разделов.';
  if (status === 'needs_manual_review') return 'Нам нужно немного больше времени. Заявка уже в очереди, этот экран обновляет статус автоматически.';
  if (status === 'pending_sponsor') return 'Поручителю отправлено мягкое подтверждение. Обычно это занимает до 48 часов. Если ответа не будет, заявка перейдёт на ручную проверку, а вы сможете продолжить пользоваться доступными разделами.';
  return 'Заявка проверяется. Этот экран обновляет статус автоматически, но приложение не блокируется.';
};

const getStatusLabel = (status: InviteRequestSnapshot['status']): string => {
  if (status === 'approved') return 'Доступ подтверждён';
  if (status === 'denied' || status === 'auto_denied') return 'Нужна новая заявка';
  if (status === 'needs_manual_review') return 'Дополнительная проверка';
  if (status === 'pending_sponsor') return 'Ожидается ответ поручителя';
  if (status === 'pending') return 'Заявка отправлена';
  return 'Статус обновляется';
};

export default function PendingApprovalScreen({
  initialStatus,
  onRefreshStatus,
  onCreateNewRequest,
  onContinue,
}: PendingApprovalScreenProps) {
  const [snapshot, setSnapshot] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getMyInviteRequestStatus();
      setSnapshot(next);
      onRefreshStatus(next);
    } catch {
      setError('Не удалось обновить статус. Проверьте связь и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSnapshot(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (snapshot.status !== 'pending' && snapshot.status !== 'pending_sponsor' && snapshot.status !== 'needs_manual_review') {
      return undefined;
    }

    const timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [snapshot.status]);

  return (
    <View style={styles.root}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>Invite Access</Text>
        <Text style={styles.title}>{getTitle(snapshot.status)}</Text>
        <Text style={styles.subtitle}>{getBody(snapshot.status)}</Text>

        <View style={styles.statusBox}>
          <Text style={styles.statusLabel}>Статус</Text>
          <Text style={[
            styles.statusValue,
            snapshot.status === 'approved' && styles.approved,
            snapshot.status === 'denied' && styles.denied,
          ]}>
            {getStatusLabel(snapshot.status)}
          </Text>
          {snapshot.updatedAt ? <Text style={styles.meta}>Обновлено: {new Date(snapshot.updatedAt).toLocaleString()}</Text> : null}
          {snapshot.moderationReason ? <Text style={styles.meta}>{snapshot.moderationReason}</Text> : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={() => void refresh()}
          style={styles.primaryButton}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Обновить статус</Text>}
        </TouchableOpacity>

        {snapshot.status === 'denied' || snapshot.status === 'auto_denied' || snapshot.status === 'cancelled' ? (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={loading}
            onPress={onCreateNewRequest}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Отправить новую заявку</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={onContinue}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Продолжить в приложение</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#EEF3FB',
  },
  panel: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D8E4F4',
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: '#25324A',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: '#607594',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  statusBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F6FAFF',
    borderWidth: 1,
    borderColor: '#D8E4F4',
    marginBottom: 14,
  },
  statusLabel: {
    color: '#607594',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  statusValue: {
    color: '#25324A',
    fontSize: 22,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  approved: {
    color: '#0F7A3D',
  },
  denied: {
    color: '#B3261E',
  },
  meta: {
    color: '#607594',
    marginTop: 6,
    lineHeight: 19,
  },
  error: {
    color: '#B3261E',
    marginBottom: 12,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C9D9EF',
    marginTop: 10,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#40516A',
    fontSize: 15,
    fontWeight: '800',
  },
});

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
  getModerationAverageHours,
  getMyInviteRequestStatus,
  type InviteRequestSnapshot,
} from '../services/sponsorService';

type PendingApprovalScreenProps = {
  initialStatus: InviteRequestSnapshot;
  onRefreshStatus: (snapshot: InviteRequestSnapshot) => void;
  onCreateNewRequest: () => void;
  onContinue: () => void;
  allowContinue?: boolean;
};

const POLL_INTERVAL_MS = 30000;

const getTitle = (status: InviteRequestSnapshot['status']): string => {
  if (status === 'approved') return 'Заявку схвалено';
  if (status === 'denied' || status === 'auto_denied') return 'Заявку відхилено';
  if (status === 'needs_manual_review') return 'Заявка на додатковій перевірці';
  if (status === 'pending_sponsor') return 'Очікуємо підтвердження поручителя';
  return 'Заявка очікує перевірки';
};

const getBody = (status: InviteRequestSnapshot['status']): string => {
  if (status === 'approved') return 'Доступ через поручителя підтверджено. Можна продовжувати користуватися застосунком.';
  if (status === 'denied' || status === 'auto_denied') return 'Поки не вдалося підтвердити доступ. Ви можете надіслати нову заявку або продовжити перегляд доступних розділів.';
  if (status === 'needs_manual_review') return 'Потрібно трохи більше часу. Заявка вже в черзі, цей екран оновлює статус автоматично.';
  if (status === 'pending_sponsor') return 'Поручителю надіслано мʼяке підтвердження. Зазвичай це займає до 48 годин. Якщо відповіді не буде, заявку переведемо на ручну перевірку, а ви зможете користуватися доступними розділами.';
  return 'Заявка перевіряється. Цей екран оновлює статус автоматично, але застосунок не блокується.';
};

const getStatusLabel = (status: InviteRequestSnapshot['status']): string => {
  if (status === 'approved') return 'Доступ підтверджено';
  if (status === 'denied' || status === 'auto_denied') return 'Потрібна нова заявка';
  if (status === 'needs_manual_review') return 'Додаткова перевірка';
  if (status === 'pending_sponsor') return 'Очікується відповідь поручителя';
  if (status === 'pending') return 'Заявку надіслано';
  return 'Статус оновлюється';
};

export default function PendingApprovalScreen({
  initialStatus,
  onRefreshStatus,
  onCreateNewRequest,
  onContinue,
  allowContinue = true,
}: PendingApprovalScreenProps) {
  const [snapshot, setSnapshot] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avgHours, setAvgHours] = useState<number>(initialStatus.moderationAvgHours || 48);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getMyInviteRequestStatus();
      setSnapshot(next);
      onRefreshStatus(next);
    } catch {
      setError('Не вдалося оновити статус. Перевірте звʼязок і спробуйте ще раз.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSnapshot(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    let active = true;
    void getModerationAverageHours().then((hours) => {
      if (active) setAvgHours(hours);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

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
        <Text style={styles.eyebrow}>Доступ за запрошенням</Text>
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
          {snapshot.createdAt ? <Text style={styles.meta}>Подана: {new Date(snapshot.createdAt).toLocaleDateString('ru-RU')}</Text> : null}
          <Text style={styles.meta}>Среднее время рассмотрения: ~{Math.max(1, Math.ceil(avgHours / 24))} дн.</Text>
          {snapshot.updatedAt ? <Text style={styles.meta}>Оновлено: {new Date(snapshot.updatedAt).toLocaleString('uk-UA')}</Text> : null}
          {snapshot.moderationReason ? <Text style={styles.meta}>{snapshot.moderationReason}</Text> : null}
        </View>

        <View style={styles.allowedBox}>
          <Text style={styles.allowedTitle}>Что доступно сейчас</Text>
          <Text style={styles.allowedItem}>Просматривать объявления</Text>
          <Text style={styles.allowedItem}>Читать новости</Text>
          <Text style={styles.allowedItem}>Настроить профиль</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={() => void refresh()}
          style={styles.primaryButton}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Оновити статус</Text>}
        </TouchableOpacity>

        {snapshot.status === 'denied' || snapshot.status === 'auto_denied' || snapshot.status === 'cancelled' ? (
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={loading}
            onPress={onCreateNewRequest}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Надіслати нову заявку</Text>
          </TouchableOpacity>
        ) : null}

        {allowContinue ? (
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={loading}
          onPress={onContinue}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Продовжити в застосунок</Text>
        </TouchableOpacity>
        ) : null}
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
  allowedBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF8E8',
    borderWidth: 1,
    borderColor: '#F1D48A',
    marginBottom: 14,
  },
  allowedTitle: {
    color: '#40516A',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 8,
  },
  allowedItem: {
    color: '#40516A',
    lineHeight: 21,
    fontWeight: '700',
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

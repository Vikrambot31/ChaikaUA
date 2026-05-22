import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../utils/constants';

type AccessRestrictedScreenProps = {
  onGoBack: () => void;
  onOpenInviteAccess?: () => void;
  pendingInvite?: boolean;
};

/**
 * Shown inline by GuardedScreen when a user without trusted status
 * tries to open a trusted-only route.
 *
 * All navigation actions call onGoBack() — the invite/approval flow
 * is managed by SoftInviteAccessGate above the navigator.
 */
export default function AccessRestrictedScreen({ onGoBack, onOpenInviteAccess, pendingInvite = false }: AccessRestrictedScreenProps) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Chaika Life</Text>
        <Text style={styles.title}>{pendingInvite ? 'Заявка рассматривается' : 'Доступ обмежено'}</Text>
        <Text style={styles.body}>
          {pendingInvite
            ? 'Ваша заявка ещё рассматривается. Спасибо, что вы с нами.'
            : 'Для просмотра этого раздела нужна одобренная заявка.'}
        </Text>
        <Text style={styles.hint}>
          {pendingInvite
            ? 'Пока доступен режим просмотра, как без регистрации. Полный доступ откроется после подтверждения.'
            : 'Щоб отримати повний доступ, подайте заявку через поручителя або дочекайтеся рішення модератора.'}
        </Text>

        <TouchableOpacity style={styles.btnPrimary} onPress={onOpenInviteAccess ?? onGoBack} activeOpacity={0.85}>
          <Text style={styles.btnPrimaryText}>{pendingInvite ? 'Переглянути статус заявки' : 'Подати заявку'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} onPress={onOpenInviteAccess ?? onGoBack} activeOpacity={0.85}>
          <Text style={styles.btnSecondaryText}>{pendingInvite ? 'Оновити шлях перевірки' : 'Перейти до підтвердження'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnBack} onPress={onGoBack} activeOpacity={0.7}>
          <Text style={styles.btnBackText}>Назад</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EEF3FB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 32,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A2E',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: '#666',
    lineHeight: 19,
    marginBottom: 28,
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnSecondaryText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  btnBack: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnBackText: {
    color: '#999',
    fontSize: 14,
  },
});

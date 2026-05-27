import type { InviteRequest, InviteRequestStatus } from './inviteAccessService';

export type AccessTierStats = {
  trusted: number;
  pendingSponsor: number;
  needsReview: number;
  denied: number;
  cancelled: number;
  total: number;
};

export type AccessTierItem = {
  request: InviteRequest;
  tier: 'trusted' | 'pending' | 'review' | 'denied' | 'cancelled';
};

export const computeAccessStats = (requests: InviteRequest[]): AccessTierStats => {
  const stats: AccessTierStats = {
    trusted: 0,
    pendingSponsor: 0,
    needsReview: 0,
    denied: 0,
    cancelled: 0,
    total: requests.length,
  };

  for (const req of requests) {
    if (req.status === 'approved') {
      stats.trusted++;
    } else if (req.status === 'pending' || req.status === 'pending_sponsor') {
      stats.pendingSponsor++;
    } else if (req.status === 'needs_manual_review') {
      stats.needsReview++;
    } else if (req.status === 'denied' || req.status === 'auto_denied') {
      stats.denied++;
    } else if (req.status === 'cancelled') {
      stats.cancelled++;
    }
  }

  return stats;
};

export const getTierFromStatus = (status: InviteRequestStatus): AccessTierItem['tier'] => {
  if (status === 'approved') return 'trusted';
  if (status === 'needs_manual_review') return 'review';
  if (status === 'denied' || status === 'auto_denied') return 'denied';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
};

export const getTierLabel = (tier: AccessTierItem['tier']): string => {
  if (tier === 'trusted') return 'Trusted';
  if (tier === 'review') return 'Ручная проверка';
  if (tier === 'denied') return 'Отклонён';
  if (tier === 'cancelled') return 'Отменён';
  return 'Ожидает';
};

export const getTierClass = (tier: AccessTierItem['tier']): string => {
  if (tier === 'trusted') return 'pill good';
  if (tier === 'review') return 'pill warning';
  if (tier === 'denied') return 'pill danger';
  if (tier === 'cancelled') return 'pill';
  return 'pill';
};

export const getModeDescription = (mode: string): string => {
  if (mode === 'soft') {
    return 'SOFT — пользователь может нажать "Пропустить" и получить Registered доступ без поручителя. Trusted требует подтверждения.';
  }
  if (mode === 'medium') {
    return 'MEDIUM — пользователь должен подать заявку, но может пользоваться приложением пока ждёт ответа.';
  }
  return 'DISABLED — система приглашений отключена. Все пользователи имеют доступ без ограничений.';
};

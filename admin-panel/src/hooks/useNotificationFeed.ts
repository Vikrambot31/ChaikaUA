import { useEffect, useState } from 'react';
import type { AdminPageKey } from '../components/AppShell';
import { useDashboardContext } from '../contexts/DashboardContext';
import { subscribeToTickets, hasUnreadFromUser } from '../services/supportService';
import { subscribeToAdTickets, hasAdUnreadFromUser } from '../services/adService';
import { subscribeToBusinessPlusClaims } from '../services/businessPlusAdminService';
import { LOCAL_MODE } from '../local/LOCAL_MODE';

export type FeedItem = {
  source: AdminPageKey;
  icon: string;
  label: string;
  count: number;
  priority: 'high' | 'medium';
};

const ICONS: Record<string, string> = {
  support: '\u{1F3A7}',
  moderation: '\u{1F50D}',
  photo_approval: '\u2705',
  reports: '\u{1F6A9}',
  business_plus: '\u{1F3EA}',
  invite_access: '\u{1F39F}',
  ad_chat: '\u{1F4E2}',
};

const LABELS: Record<string, { one: string; many: string }> = {
  support: { one: 'Підтримка: 1 непрочитаний тикет', many: 'Підтримка: {n} непрочитаних тикетів' },
  moderation: { one: 'Модерація: 1 заявка очікує', many: 'Модерація: {n} заявок очікують' },
  photo_approval: { one: 'Фото: 1 фото на одобрение', many: 'Фото: {n} фото на одобрение' },
  reports: { one: 'Скарги: 1 потребує реакції', many: 'Скарги: {n} потребують реакції' },
  business_plus: { one: 'Business+: 1 заявка', many: 'Business+: {n} заявок' },
  invite_access: { one: 'Запрошення: 1 запит', many: 'Запрошення: {n} запитів' },
  ad_chat: { one: 'Рекламний чат: 1 нове повідомлення', many: 'Рекламний чат: {n} нових повідомлень' },
};

const HIGH_THRESHOLD = 5;

export const useNotificationFeed = () => {
  const { stats } = useDashboardContext();
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [unreadAdChat, setUnreadAdChat] = useState(0);
  const [pendingBusiness, setPendingBusiness] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (LOCAL_MODE) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToTickets((tickets) => {
      setUnreadSupport(tickets.filter((t) => t.status === 'open' && hasUnreadFromUser(t)).length);
      setLoading(false);
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (LOCAL_MODE) return;
    const unsub = subscribeToAdTickets((tickets) => {
      setUnreadAdChat(tickets.filter((t) => t.status === 'open' && hasAdUnreadFromUser(t)).length);
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (LOCAL_MODE) return;
    const unsub = subscribeToBusinessPlusClaims((claims) => {
      setPendingBusiness(claims.filter((c) => c.status === 'pending').length);
    });
    return () => { unsub(); };
  }, []);

  const items: FeedItem[] = [];
  const addIf = (source: AdminPageKey, count: number) => {
    if (count <= 0) return;
    items.push({
      source,
      icon: ICONS[source] ?? '',
      label: count === 1 ? LABELS[source].one : LABELS[source].many.replace('{n}', String(count)),
      count,
      priority: count >= HIGH_THRESHOLD ? 'high' : 'medium',
    });
  };

  addIf('support', unreadSupport);
  addIf('moderation', stats.pending);
  addIf('photo_approval', stats.pendingPhotos);
  addIf('reports', stats.pendingReports);
  addIf('business_plus', pendingBusiness);
  addIf('invite_access', stats.pendingInviteRequests);
  addIf('ad_chat', unreadAdChat);

  return {
    items,
    totalCount: items.reduce((s, i) => s + i.count, 0),
    loading,
  };
};

import { useEffect, useRef, useState } from 'react';
import { useAuthAccess } from '../hooks/useAuthAccess';
import {
  subscribeToBusinessPlusClaims,
  subscribeToBusinessPlusCards,
  approveBusinessClaim,
  rejectBusinessClaim,
  approveBusinessCard,
  rejectBusinessCard,
  subscribeToBusinessPlusSubscriptions,
  activateBusinessPlusManual,
  cancelBusinessPlusSubscription,
  type BusinessPlusClaim,
  type BusinessPlusCard,
  type BusinessPlusSubscription,
} from '../services/businessPlusAdminService';
import { searchUsers, type UserSearchResult } from '../services/premiumAdminService';

type Tab = 'claims' | 'cards' | 'subscriptions';

const formatDate = (iso: string | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const statusBadge = (status: string) => {
  const colors: Record<string, { bg: string; color: string }> = {
    pending:  { bg: '#2a2000', color: '#ffd54f' },
    approved: { bg: '#0a2010', color: '#69f0ae' },
    rejected: { bg: '#2a0808', color: '#ef9a9a' },
  };
  const labels: Record<string, string> = {
    pending: 'Очікує',
    approved: 'Схвалено',
    rejected: 'Відхилено',
  };
  const s = colors[status] ?? { bg: '#1a1a1a', color: '#aaa' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      borderRadius: 6, padding: '2px 8px',
      fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap',
    }}>
      {labels[status] ?? status}
    </span>
  );
};

// ── Claims Tab ──

function ClaimsTab({ adminUid }: { adminUid: string }) {
  const [claims, setClaims] = useState<BusinessPlusClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToBusinessPlusClaims((data) => {
      setClaims(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = filter === 'all' ? claims : claims.filter((c) => c.status === filter);
  const pendingCount = claims.filter((c) => c.status === 'pending').length;

  const handleApprove = async (placeId: string) => {
    setActionId(placeId);
    try { await approveBusinessClaim(placeId, adminUid); }
    catch (e) { console.error(e); }
    finally { setActionId(null); }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setActionId(rejectId);
    try {
      await rejectBusinessClaim(rejectId, adminUid, rejectReason.trim() || 'Відхилено адміном');
      setRejectId(null);
      setRejectReason('');
    } catch (e) { console.error(e); }
    finally { setActionId(null); }
  };

  if (loading) return <div style={{ color: '#888', padding: 24 }}>Завантаження заявок...</div>;

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button key={f} type="button"
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? '#1565c0' : '#1a1a2a',
              color: filter === f ? '#fff' : '#aaa',
              border: '1px solid #2a2a4a', borderRadius: 6,
              padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}
          >
            {f === 'pending' ? `Очікують (${pendingCount})` : f === 'approved' ? 'Схвалені' : f === 'rejected' ? 'Відхилені' : 'Всі'}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ color: '#666', padding: '24px 0', textAlign: 'center', fontSize: 14 }}>
          Заявок немає
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((claim) => (
          <div key={claim.placeId} style={{
            background: claim.status === 'pending' ? '#151520' : '#111118',
            border: `1px solid ${claim.status === 'pending' ? '#2a2a4a' : '#1a1a28'}`,
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: '#e0e0ff', fontWeight: 800, fontSize: 14, marginBottom: 3 }}>
                  🏪 {claim.placeName}
                </div>
                <div style={{ color: '#aaa', fontSize: 12, marginBottom: 2 }}>
                  {claim.placeAddress}
                </div>
                <div style={{ color: '#ccc', fontSize: 13, fontWeight: 700, marginBottom: 2 }}>
                  👤 {claim.ownerName}
                  {claim.ownerPhone ? <span style={{ color: '#888', fontWeight: 400, marginLeft: 8 }}>{claim.ownerPhone}</span> : null}
                </div>
                {claim.comment ? (
                  <div style={{
                    color: '#b0b0c0', fontSize: 12, lineHeight: 1.5,
                    background: '#1a1a28', borderRadius: 6, padding: '6px 10px', marginTop: 6,
                    maxWidth: 500,
                  }}>
                    {claim.comment}
                  </div>
                ) : null}
                <div style={{ color: '#555', fontSize: 11, marginTop: 6 }}>
                  UID: <span style={{ color: '#666' }}>{claim.ownerUid}</span>
                  &nbsp;·&nbsp;Подано: {formatDate(claim.createdAt)}
                </div>
                {claim.rejectReason ? (
                  <div style={{ color: '#ef9a9a', fontSize: 12, marginTop: 4 }}>
                    Причина відмови: {claim.rejectReason}
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                {statusBadge(claim.status)}
                {claim.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button"
                      onClick={() => void handleApprove(claim.placeId)}
                      disabled={actionId === claim.placeId}
                      style={{
                        background: '#1b5e20', color: '#a5d6a7',
                        border: '1px solid #2e7d32', borderRadius: 6,
                        padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                        opacity: actionId === claim.placeId ? 0.5 : 1,
                      }}
                    >
                      ✓ Схвалити
                    </button>
                    <button type="button"
                      onClick={() => { setRejectId(claim.placeId); setRejectReason(''); }}
                      disabled={actionId === claim.placeId}
                      style={{
                        background: '#4a1010', color: '#ef9a9a',
                        border: '1px solid #7a2020', borderRadius: 6,
                        padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                        opacity: actionId === claim.placeId ? 0.5 : 1,
                      }}
                    >
                      ✕ Відхилити
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reject modal */}
      {rejectId ? (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 12,
            padding: 24, width: 400, maxWidth: '90vw',
          }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
              Причина відмови
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Необов'язково..."
              style={{
                width: '100%', minHeight: 80, background: '#111', color: '#ccc',
                border: '1px solid #333', borderRadius: 8, padding: 10,
                fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button type="button"
                onClick={() => setRejectId(null)}
                style={{ background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
              >
                Скасувати
              </button>
              <button type="button"
                onClick={() => void handleReject()}
                disabled={actionId === rejectId}
                style={{ background: '#7a2020', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Cards Tab ──

function CardsTab({ adminUid }: { adminUid: string }) {
  const [cards, setCards] = useState<BusinessPlusCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToBusinessPlusCards((data) => {
      setCards(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = filter === 'all' ? cards : cards.filter((c) => c.moderationStatus === filter);
  const pendingCount = cards.filter((c) => c.moderationStatus === 'pending').length;

  const handleApprove = async (placeId: string) => {
    setActionId(placeId);
    try { await approveBusinessCard(placeId, adminUid); }
    catch (e) { console.error(e); }
    finally { setActionId(null); }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setActionId(rejectId);
    try {
      await rejectBusinessCard(rejectId, adminUid, rejectReason.trim() || 'Відхилено адміном');
      setRejectId(null);
      setRejectReason('');
    } catch (e) { console.error(e); }
    finally { setActionId(null); }
  };

  if (loading) return <div style={{ color: '#888', padding: 24 }}>Завантаження карток...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button key={f} type="button"
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? '#1565c0' : '#1a1a2a',
              color: filter === f ? '#fff' : '#aaa',
              border: '1px solid #2a2a4a', borderRadius: 6,
              padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}
          >
            {f === 'pending' ? `Очікують (${pendingCount})` : f === 'approved' ? 'Схвалені' : f === 'rejected' ? 'Відхилені' : 'Всі'}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ color: '#666', padding: '24px 0', textAlign: 'center', fontSize: 14 }}>
          Карток немає
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((card) => (
          <div key={card.placeId} style={{
            background: card.moderationStatus === 'pending' ? '#151520' : '#111118',
            border: `1px solid ${card.moderationStatus === 'pending' ? '#2a2a4a' : '#1a1a28'}`,
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ color: '#e0e0ff', fontWeight: 800, fontSize: 14, marginBottom: 3 }}>
                  🏪 {card.placeName}
                </div>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>
                  OwnerUID: {card.ownerId.slice(0, 16)}...
                  &nbsp;·&nbsp;Оновлено: {formatDate(card.updatedAt)}
                </div>

                {/* Content summary */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  {card.menuItems?.length ? (
                    <span style={{ background: '#1a2a1a', color: '#81c784', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      🍽 Меню: {card.menuItems.length} позицій
                    </span>
                  ) : null}
                  {card.promotions?.length ? (
                    <span style={{ background: '#2a2000', color: '#ffd54f', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      🏷 Акцій: {card.promotions.length}
                    </span>
                  ) : null}
                  {card.photoUri || card.photoStoragePath ? (
                    <span style={{ background: '#1a1a2a', color: '#90caf9', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                      📸 Фото
                    </span>
                  ) : null}
                </div>

                {/* Expandable content preview */}
                <button type="button"
                  onClick={() => setExpanded(expanded === card.placeId ? null : card.placeId)}
                  style={{ background: 'none', border: 'none', color: '#5c8ee0', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}
                >
                  {expanded === card.placeId ? '▲ Сховати зміст' : '▼ Переглянути зміст'}
                </button>

                {expanded === card.placeId && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {card.photoUri ? (
                      <img src={card.photoUri} alt="business"
                        style={{ width: 200, height: 120, objectFit: 'cover', borderRadius: 8 }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0.3'; }}
                      />
                    ) : null}

                    {card.menuItems?.length ? (
                      <div>
                        <div style={{ color: '#81c784', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Меню:</div>
                        {card.menuItems.map((item, i) => (
                          <div key={i} style={{ color: '#ccc', fontSize: 12, display: 'flex', justifyContent: 'space-between', maxWidth: 300, padding: '2px 0' }}>
                            <span>{item.name}</span>
                            <span style={{ color: '#a5d6a7', fontWeight: 700 }}>{item.price}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {card.promotions?.length ? (
                      <div>
                        <div style={{ color: '#ffd54f', fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Акції:</div>
                        {card.promotions.map((promo, i) => (
                          <div key={i} style={{ background: '#1a1500', borderRadius: 6, padding: '6px 10px', marginBottom: 4, maxWidth: 380 }}>
                            <div style={{ color: '#ffe082', fontWeight: 700, fontSize: 13 }}>{promo.title}</div>
                            {promo.description ? <div style={{ color: '#bbb', fontSize: 12, marginTop: 2 }}>{promo.description}</div> : null}
                            {promo.dateUntil ? <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>До: {formatDate(promo.dateUntil)}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                {card.rejectReason ? (
                  <div style={{ color: '#ef9a9a', fontSize: 12, marginTop: 6 }}>
                    Причина відмови: {card.rejectReason}
                  </div>
                ) : null}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                {statusBadge(card.moderationStatus)}
                {card.moderationStatus === 'pending' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button"
                      onClick={() => void handleApprove(card.placeId)}
                      disabled={actionId === card.placeId}
                      style={{
                        background: '#1b5e20', color: '#a5d6a7',
                        border: '1px solid #2e7d32', borderRadius: 6,
                        padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                        opacity: actionId === card.placeId ? 0.5 : 1,
                      }}
                    >
                      ✓ Схвалити
                    </button>
                    <button type="button"
                      onClick={() => { setRejectId(card.placeId); setRejectReason(''); }}
                      disabled={actionId === card.placeId}
                      style={{
                        background: '#4a1010', color: '#ef9a9a',
                        border: '1px solid #7a2020', borderRadius: 6,
                        padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                        opacity: actionId === card.placeId ? 0.5 : 1,
                      }}
                    >
                      ✕ Відхилити
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reject modal */}
      {rejectId ? (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 12,
            padding: 24, width: 400, maxWidth: '90vw',
          }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
              Причина відмови контенту
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Вкажіть, що потрібно виправити..."
              style={{
                width: '100%', minHeight: 80, background: '#111', color: '#ccc',
                border: '1px solid #333', borderRadius: 8, padding: 10,
                fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button type="button"
                onClick={() => setRejectId(null)}
                style={{ background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
              >
                Скасувати
              </button>
              <button type="button"
                onClick={() => void handleReject()}
                disabled={actionId === rejectId}
                style={{ background: '#7a2020', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}
              >
                Відхилити
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Subscriptions Tab ──

const MONTHS_OPTIONS: { value: 1 | 3 | 6 | 12; label: string; price: string }[] = [
  { value: 1,  label: '1 місяць',  price: '49 грн' },
  { value: 3,  label: '3 місяці',  price: '147 грн' },
  { value: 6,  label: '6 місяців', price: '294 грн' },
  { value: 12, label: '12 місяців', price: '480 грн' },
];

function SubscriptionsTab() {
  const [subs, setSubs] = useState<BusinessPlusSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  // Grant form state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<1 | 3 | 6 | 12>(1);
  const [notes, setNotes] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState('');
  const [grantSuccess, setGrantSuccess] = useState('');

  // Cancel confirmation
  const [cancelUid, setCancelUid] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToBusinessPlusSubscriptions((data) => {
      setSubs(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Debounced user search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsers(searchQuery);
        setSearchResults(results);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [searchQuery]);

  const handleGrant = async () => {
    if (!selectedUser) return;
    setGranting(true);
    setGrantError('');
    setGrantSuccess('');
    try {
      const result = await activateBusinessPlusManual(selectedUser.uid, selectedMonths, notes.trim());
      const exp = new Date(result.expiresAt).toLocaleDateString('uk-UA');
      setGrantSuccess(`✅ Бізнес+ активовано для ${selectedUser.name || selectedUser.uid}. Дійсно до ${exp}`);
      setSelectedUser(null);
      setSearchQuery('');
      setSearchResults([]);
      setNotes('');
      setSelectedMonths(1);
    } catch (e: unknown) {
      setGrantError(`Помилка: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGranting(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelUid) return;
    setCancelling(true);
    try {
      await cancelBusinessPlusSubscription(cancelUid);
      setCancelUid(null);
    } catch (e: unknown) {
      console.error('cancel error', e);
    } finally {
      setCancelling(false);
    }
  };

  const activeCount = subs.filter((s) => s.status === 'active').length;
  const expiredCount = subs.filter((s) => s.status === 'expired').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[
          { label: 'Активних', value: activeCount, color: '#69f0ae' },
          { label: 'Прострочених', value: expiredCount, color: '#ef9a9a' },
          { label: 'Всього', value: subs.length, color: '#90caf9' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#111', border: '1px solid #2a2a3a', borderRadius: 10, padding: '10px 20px', minWidth: 100 }}>
            <div style={{ color: s.color, fontSize: 24, fontWeight: 900 }}>{s.value}</div>
            <div style={{ color: '#666', fontSize: 12, fontWeight: 700 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Grant form */}
      <div style={{ background: '#0a1520', border: '1px solid #1a3a5a', borderRadius: 12, padding: 20 }}>
        <div style={{ color: '#90caf9', fontWeight: 900, fontSize: 15, marginBottom: 14 }}>
          🏪 Видати Бізнес+ підписку
        </div>

        {/* User search */}
        {!selectedUser ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: '#aaa', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Пошук користувача (ім'я, телефон, UID)</div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Введіть мінімум 2 символи..."
              style={{
                width: '100%', background: '#111', color: '#eee',
                border: '1px solid #333', borderRadius: 8, padding: '8px 12px',
                fontSize: 14, boxSizing: 'border-box',
              }}
            />
            {searching && <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>Пошук...</div>}
            {searchResults.length > 0 && (
              <div style={{ background: '#111', border: '1px solid #2a2a3a', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto' }}>
                {searchResults.map((u) => (
                  <div
                    key={u.uid}
                    onClick={() => { setSelectedUser(u); setSearchQuery(''); setSearchResults([]); }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #1a1a2a',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a2e')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: '#e0e0ff', fontSize: 13, fontWeight: 700 }}>{u.name || '—'}</span>
                    <span style={{ color: '#666', fontSize: 12 }}>{u.phone || u.uid.slice(0, 12) + '...'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: 14, background: '#111', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#90caf9', fontWeight: 700 }}>{selectedUser.name || 'Без імені'}</span>
              <span style={{ color: '#666', fontSize: 12, marginLeft: 8 }}>{selectedUser.phone || selectedUser.uid.slice(0, 16) + '...'}</span>
            </div>
            <button type="button" onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* Month selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#aaa', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Термін підписки</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MONTHS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedMonths(opt.value)}
                style={{
                  background: selectedMonths === opt.value ? '#1a3a5a' : '#111',
                  color: selectedMonths === opt.value ? '#90caf9' : '#666',
                  border: `1px solid ${selectedMonths === opt.value ? '#1a6ab0' : '#333'}`,
                  borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 800,
                }}
              >
                {opt.label} <span style={{ color: '#4CAF50', fontSize: 11 }}>{opt.price}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#aaa', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Нотатка (необов'язково)</div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Оплата Monobank 07.06.26, Serega Bablyak"
            maxLength={200}
            style={{
              width: '100%', background: '#111', color: '#eee',
              border: '1px solid #333', borderRadius: 8, padding: '8px 12px',
              fontSize: 13, boxSizing: 'border-box',
            }}
          />
        </div>

        {grantError && <div style={{ color: '#ef9a9a', fontSize: 13, marginBottom: 10 }}>{grantError}</div>}
        {grantSuccess && <div style={{ color: '#69f0ae', fontSize: 13, marginBottom: 10 }}>{grantSuccess}</div>}

        <button
          type="button"
          onClick={() => void handleGrant()}
          disabled={!selectedUser || granting}
          style={{
            background: selectedUser ? '#1a3a5a' : '#111',
            color: selectedUser ? '#90caf9' : '#444',
            border: `1px solid ${selectedUser ? '#1a6ab0' : '#222'}`,
            borderRadius: 8, padding: '9px 24px', cursor: selectedUser ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 900,
          }}
        >
          {granting ? 'Активується...' : '🚀 Активувати Бізнес+'}
        </button>
      </div>

      {/* Subscribers list */}
      <div>
        <div style={{ color: '#aaa', fontSize: 13, fontWeight: 800, marginBottom: 10 }}>
          Всі Бізнес+ підписники ({subs.length})
        </div>
        {loading && <div style={{ color: '#666' }}>Завантаження...</div>}
        {!loading && subs.length === 0 && (
          <div style={{ color: '#444', fontSize: 13 }}>Поки що немає жодного підписника.</div>
        )}
        {subs.map((sub) => {
          const isActive = sub.status === 'active' && sub.expiresAt && new Date(sub.expiresAt) > new Date();
          const expStr = sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('uk-UA') : '—';
          return (
            <div key={sub.uid} style={{
              background: '#111', border: `1px solid ${isActive ? '#1a3a5a' : '#2a1a1a'}`,
              borderRadius: 10, padding: '12px 16px', marginBottom: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div>
                <div style={{ color: '#e0e0ff', fontSize: 13, fontWeight: 700 }}>{sub.uid}</div>
                <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>
                  До: <span style={{ color: isActive ? '#69f0ae' : '#ef9a9a' }}>{expStr}</span>
                  {sub.notes ? <span style={{ marginLeft: 10, color: '#555' }}>{sub.notes}</span> : null}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  background: isActive ? '#0a2010' : '#2a0808',
                  color: isActive ? '#69f0ae' : '#ef9a9a',
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 800,
                }}>
                  {isActive ? 'Активна' : 'Прострочена'}
                </span>
                {isActive && (
                  <button
                    type="button"
                    onClick={() => setCancelUid(sub.uid)}
                    style={{
                      background: '#2a0808', color: '#ef9a9a',
                      border: '1px solid #7a2020', borderRadius: 6,
                      padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 800,
                    }}
                  >
                    Скасувати
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel confirmation modal */}
      {cancelUid ? (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{ background: '#1a1a2e', border: '1px solid #2a2a4a', borderRadius: 12, padding: 24, width: 380, maxWidth: '90vw' }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Скасувати Бізнес+?</div>
            <div style={{ color: '#aaa', fontSize: 13, marginBottom: 20 }}>
              Підписка буде деактивована негайно. Користувач втратить доступ до функцій Бізнес+.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setCancelUid(null)}
                style={{ background: '#222', color: '#aaa', border: '1px solid #333', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
                Ні, залишити
              </button>
              <button type="button" onClick={() => void handleCancel()} disabled={cancelling}
                style={{ background: '#7a2020', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                {cancelling ? 'Скасовується...' : 'Так, скасувати'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Main Page ──

export function BusinessPlusModerationPage() {
  const access = useAuthAccess();
  const [activeTab, setActiveTab] = useState<Tab>('claims');
  const [claimsCount, setClaimsCount] = useState(0);
  const [cardsCount, setCardsCount] = useState(0);

  // Track pending counts for tab badges
  useEffect(() => {
    const unsub1 = subscribeToBusinessPlusClaims((data) => {
      setClaimsCount(data.filter((c) => c.status === 'pending').length);
    });
    const unsub2 = subscribeToBusinessPlusCards((data) => {
      setCardsCount(data.filter((c) => c.moderationStatus === 'pending').length);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const adminUid = access.status === 'allowed' ? access.user.uid : '';

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#e0e0ff', fontSize: 22, fontWeight: 900, margin: 0 }}>
          🏪 Бізнес+ картки
        </h2>
        <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
          Заявки власників та модерація контенту меню/акцій/фото
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #2a2a3a', paddingBottom: 0 }}>
        {([
          { key: 'claims' as Tab, label: 'Заявки власників', count: claimsCount },
          { key: 'cards' as Tab, label: 'Контент карток', count: cardsCount },
          { key: 'subscriptions' as Tab, label: '💳 Підписки', count: 0 },
        ]).map((tab) => (
          <button key={tab.key} type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: activeTab === tab.key ? '#1a1a3a' : 'transparent',
              color: activeTab === tab.key ? '#90caf9' : '#666',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #90caf9' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              padding: '10px 18px',
              cursor: 'pointer', fontSize: 14, fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                background: '#e53935', color: '#fff',
                borderRadius: 10, padding: '0px 6px',
                fontSize: 11, fontWeight: 900, lineHeight: 1.8,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'claims' && <ClaimsTab adminUid={adminUid} />}
      {activeTab === 'cards' && <CardsTab adminUid={adminUid} />}
      {activeTab === 'subscriptions' && <SubscriptionsTab />}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import {
  subscribeToAllPremiumSubscriptions,
  activatePremiumManual,
  cancelPremiumSubscription,
  searchUsers,
  loadUserProfiles,
  type PremiumSubscription,
  type PremiumStatus,
  type UserSearchResult,
  type UserProfile,
} from '../services/premiumAdminService';

type MonthsOption = 1 | 3 | 6 | 12;

const MONTHS_OPTIONS: MonthsOption[] = [1, 3, 6, 12];

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
};

const getDaysLeft = (expiresAt: string | null): number | null => {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
};

const shortUid = (uid: string): string =>
  uid.length > 14 ? uid.slice(0, 14) + '...' : uid;

const rowBg = (sub: PremiumSubscription): string => {
  const days = getDaysLeft(sub.expiresAt);
  if (sub.status === 'expired') return '#2a1010';
  if (sub.status === 'trial') return '#1a2a1a';
  if (days !== null && days <= 7) return '#2a1e08';
  if (sub.status === 'active') return '#0f1e12';
  return 'transparent';
};

const statusLabel = (status: PremiumStatus): string => {
  if (status === 'active') return 'Активна';
  if (status === 'trial') return 'Пробна';
  if (status === 'expired') return 'Завершена';
  return 'Безкоштовна';
};

const statusColor = (status: PremiumStatus, daysLeft: number | null): string => {
  if (status === 'expired') return '#e53935';
  if (status === 'trial') return '#fb8c00';
  if (daysLeft !== null && daysLeft <= 7) return '#ffa726';
  if (status === 'active') return '#43a047';
  return '#888';
};

// ── User Search Block ──

function UserSearchBlock({ onActivate }: { onActivate: (uid: string, name: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const res = await searchUsers(q.trim());
      setResults(res);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void doSearch(v), 500);
  };

  return (
    <div style={{
      background: '#0f1e12', border: '1px solid #43a04744',
      borderRadius: 12, padding: 20, marginBottom: 24,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#43a047', marginBottom: 12 }}>
        ➕ Знайти користувача та включити Premium
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Ім'я, телефон (+380...) або UID..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            flex: 1, maxWidth: 400, background: '#111', border: '1px solid #444',
            borderRadius: 8, color: '#e0e0e0', padding: '8px 12px', fontSize: 13,
            boxSizing: 'border-box' as const,
          }}
        />
        {loading && <span style={{ color: '#888', fontSize: 12 }}>Пошук...</span>}
      </div>

      {searched && results.length === 0 && !loading && (
        <div style={{ color: '#888', fontSize: 13, padding: '6px 0' }}>
          Користувачів не знайдено. Спробуйте точний номер телефону або UID.
        </div>
      )}

      {results.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333' }}>
              {['Ім\'я', 'Телефон', 'UID', ''].map((h) => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#888', fontWeight: 700, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((u) => (
              <tr key={u.uid} style={{ borderBottom: '1px solid #1a1a1a' }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: '#e0e0e0' }}>{u.name || '—'}</td>
                <td style={{ padding: '8px 10px', color: '#aaa', fontFamily: 'monospace', fontSize: 12 }}>{u.phone || '—'}</td>
                <td style={{ padding: '8px 10px', color: '#666', fontFamily: 'monospace', fontSize: 11 }} title={u.uid}>
                  {u.uid.slice(0, 14)}...
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <button
                    type="button"
                    onClick={() => onActivate(u.uid, u.name)}
                    style={{
                      padding: '5px 14px', borderRadius: 7,
                      background: '#1a2a1a', border: '1px solid #43a04766',
                      color: '#43a047', fontWeight: 800, cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    ⭐ Включити Premium
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface ActivateModalProps {
  uid: string;
  name?: string;
  onClose: () => void;
  onActivated: () => void;
}

function ActivateModal({ uid, name, onClose, onActivated }: ActivateModalProps) {
  const [months, setMonths] = useState<MonthsOption>(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    setLoading(true);
    setError(null);
    try {
      await activatePremiumManual(uid, months, notes);
      onActivated();
      onClose();
    } catch (err: any) {
      const code: string = err?.code ?? '';
      const msg: string = err?.message ?? '';
      if (code.includes('unauthenticated') || msg.includes('unauthenticated')) {
        setError('Помилка авторизації — увійдіть знову');
      } else if (code.includes('permission-denied') || msg.includes('permission-denied')) {
        setError('Немає прав адміністратора');
      } else if (code.includes('not-found') || msg.includes('NOT_FOUND')) {
        setError('Функція не знайдена — потрібно задеплоїти Functions');
      } else if (code.includes('internal') || msg === 'internal') {
        setError('Помилка сервера (internal) — перевірте Firebase Functions logs');
      } else {
        setError(msg || 'Помилка активації');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#1a1a2e', border: '1px solid #333', borderRadius: 12,
        padding: 28, minWidth: 340, maxWidth: 420, color: '#e0e0e0',
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>
          ⭐ Активувати / Продовжити Premium
        </h3>
        {name && <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#e0e0e0' }}>{name}</p>}
        <p style={{ margin: '0 0 14px', fontSize: 11, color: '#666', wordBreak: 'break-all' }}>
          {uid}
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#aaa', display: 'block', marginBottom: 6 }}>
            Термін (місяців):
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {MONTHS_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: `1px solid ${months === m ? '#ffa726' : '#444'}`,
                  background: months === m ? '#2a1e08' : '#111',
                  color: months === m ? '#ffa726' : '#ccc',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#aaa', display: 'block', marginBottom: 6 }}>
            Примітка (необов'язково):
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={300}
            rows={3}
            style={{
              width: '100%', background: '#111', border: '1px solid #444',
              borderRadius: 8, color: '#e0e0e0', padding: 8, fontSize: 13,
              resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
            placeholder="Наприклад: Оплата MonoBank 25.06"
          />
        </div>

        {error && (
          <p style={{ color: '#e53935', fontSize: 12, marginBottom: 10 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid #444',
              background: '#111', color: '#ccc', fontWeight: 700, cursor: 'pointer', fontSize: 13,
            }}
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={loading}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: loading ? '#444' : '#ffa726', color: '#111',
              fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontSize: 13,
            }}
          >
            {loading ? 'Активуємо...' : `Активувати (${months} міс.)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PremiumPage() {
  const [subscriptions, setSubscriptions] = useState<PremiumSubscription[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [search, setSearch] = useState('');
  const [activateUid, setActivateUid] = useState<string | null>(null);
  const [activateName, setActivateName] = useState<string>('');
  const [cancelLoading, setCancelLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openActivate = (uid: string, name = '') => {
    setActivateUid(uid);
    setActivateName(name);
  };

  useEffect(() => {
    const unsub = subscribeToAllPremiumSubscriptions((data) => {
      setSubscriptions(data);
      const toLoad = data.map((s) => s.uid);
      if (toLoad.length > 0) {
        loadUserProfiles(toLoad).then((p) =>
          setProfiles((prev) => ({ ...prev, ...p })),
        );
      }
    });
    return unsub;
  }, []);

  const handleCancel = async (uid: string) => {
    if (!window.confirm(`Скасувати Premium для ${uid}?`)) return;
    setCancelLoading(uid);
    setActionError(null);
    try {
      await cancelPremiumSubscription(uid);
      // onValue listener updates automatically — no need to recreate subscription
    } catch (err: any) {
      setActionError(err?.message ?? 'Помилка скасування');
    } finally {
      setCancelLoading(null);
    }
  };

  const filtered = search.trim()
    ? subscriptions.filter((s) => {
        const q = search.toLowerCase();
        const prof = profiles[s.uid];
        return (
          s.uid.toLowerCase().includes(q) ||
          (s.notes ?? '').toLowerCase().includes(q) ||
          (prof?.name ?? '').toLowerCase().includes(q) ||
          (prof?.phone ?? '').includes(q)
        );
      })
    : subscriptions;

  // Stats
  const totalActive = subscriptions.filter((s) => s.status === 'active').length;
  const totalTrial = subscriptions.filter((s) => s.status === 'trial').length;
  const expiringThisWeek = subscriptions.filter((s) => {
    const d = getDaysLeft(s.expiresAt);
    return d !== null && d <= 7 && d > 0 && (s.status === 'active' || s.status === 'trial');
  }).length;

  return (
    <div style={{ padding: 24, color: '#e0e0e0' }}>
      <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 900 }}>
        Premium Підписки
      </h2>

      <UserSearchBlock onActivate={openActivate} />

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Активних" value={totalActive} color="#43a047" />
        <StatCard label="Пробних" value={totalTrial} color="#fb8c00" />
        <StatCard label="Закінчується 7 днів" value={expiringThisWeek} color="#ffa726" />
        <StatCard label="Всього записів" value={subscriptions.length} color="#5c6bc0" />
      </div>

      {actionError && (
        <div style={{
          background: '#2a0a0a', border: '1px solid #e53935', borderRadius: 8,
          padding: '10px 14px', marginBottom: 14, color: '#ef9a9a', fontSize: 13,
        }}>
          {actionError}
          <button
            type="button"
            onClick={() => setActionError(null)}
            style={{ marginLeft: 10, background: 'none', border: 'none', color: '#ef9a9a', cursor: 'pointer' }}
          >
            x
          </button>
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Пошук за UID або приміткою..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%', maxWidth: 380, background: '#111', border: '1px solid #444',
          borderRadius: 8, color: '#e0e0e0', padding: '8px 12px', fontSize: 13,
          marginBottom: 16, boxSizing: 'border-box',
        }}
      />

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#111', borderBottom: '1px solid #333' }}>
              {['Ім\'я', 'Телефон', 'Статус', 'Дата оплати', 'Діє до', 'Днів', 'Оплата', 'Нотатка', 'Дії'].map((h) => (
                <th key={h} style={{
                  padding: '8px 10px', textAlign: 'left',
                  fontWeight: 800, color: '#aaa', whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 20, textAlign: 'center', color: '#666' }}>
                  Немає записів. Знайдіть користувача вгорі та активуйте Premium.
                </td>
              </tr>
            )}
            {filtered.map((sub) => {
              const days = getDaysLeft(sub.expiresAt);
              const color = statusColor(sub.status, days);
              const prof = profiles[sub.uid];
              const displayName = prof?.name || '—';
              const displayPhone = prof?.phone || '—';
              return (
                <tr
                  key={sub.uid}
                  style={{ background: rowBg(sub), borderBottom: '1px solid #222' }}
                >
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: '#e0e0e0' }} title={sub.uid}>
                    {displayName}
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
                    {displayPhone}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{
                      background: `${color}22`,
                      color,
                      border: `1px solid ${color}44`,
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontWeight: 800,
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                    }}>
                      {statusLabel(sub.status)}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: '#aaa', whiteSpace: 'nowrap' }}>
                    {formatDate(sub.activatedAt)}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#aaa', whiteSpace: 'nowrap' }}>
                    {formatDate(sub.expiresAt)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    {days !== null ? (
                      <span style={{ color: days <= 3 ? '#e53935' : days <= 7 ? '#ffa726' : '#43a047', fontWeight: 700 }}>
                        {days}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#aaa', fontSize: 12 }}>
                    {sub.paymentMethod === 'monobank_manual' ? 'Monobank' : sub.paymentMethod === 'trial' ? 'Пробний' : (sub.paymentMethod ?? '—')}
                  </td>
                  <td style={{ padding: '8px 10px', color: '#aaa', fontSize: 12, maxWidth: 160 }} title={sub.notes ?? ''}>
                    {sub.notes || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      onClick={() => openActivate(sub.uid, displayName)}
                      disabled={cancelLoading === sub.uid}
                      style={{
                        marginRight: 6, padding: '4px 10px', borderRadius: 6,
                        background: '#1a2a1a', border: '1px solid #43a04744',
                        color: '#43a047', fontWeight: 700,
                        cursor: cancelLoading === sub.uid ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        opacity: cancelLoading === sub.uid ? 0.5 : 1,
                      }}
                    >
                      Продовжити
                    </button>
                    {sub.status !== 'expired' && sub.status !== 'free' && (
                      <button
                        type="button"
                        onClick={() => void handleCancel(sub.uid)}
                        disabled={cancelLoading === sub.uid}
                        style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: '#2a1010', border: '1px solid #e5393544',
                          color: '#e53935', fontWeight: 700,
                          cursor: cancelLoading === sub.uid ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                          opacity: cancelLoading === sub.uid ? 0.5 : 1,
                        }}
                      >
                        {cancelLoading === sub.uid ? '...' : 'Відключити'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activateUid && (
        <ActivateModal
          uid={activateUid}
          name={activateName}
          onClose={() => { setActivateUid(null); setActivateName(''); }}
          onActivated={() => { /* onValue updates automatically */ }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: `${color}14`,
      border: `1px solid ${color}33`,
      borderRadius: 10,
      padding: '10px 18px',
      minWidth: 130,
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', marginTop: 2 }}>{label}</div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useViewMode } from '../contexts/ViewModeContext';
import {
  subscribeToAllBonuses,
  subscribeToAllPromoCredits,
  subscribeToPromotions,
  loadTransactions,
  loadFraudFlags,
  loadBonusBlocks,
  grantPromoCredits,
  adjustTrustBonuses,
  blockUser,
  moderatePromotion,
  type UserBonusInfo,
  type UserPromoInfo,
  type BonusTransaction,
  type BonusPromotion,
  type FraudFlag,
  type BonusBlock,
} from '../services/bonusAdminService';
import {
  subscribeToAllPremiumSubscriptions,
  activatePremiumManual,
  cancelPremiumSubscription,
  setAutoRenew,
  loadUserProfiles,
  type PremiumSubscription,
  type UserProfile,
} from '../services/premiumAdminService';

type TabKey = 'users' | 'promotions' | 'fraud' | 'subscriptions' | 'system';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'users', label: 'Користувачі' },
  { key: 'promotions', label: 'Промоції' },
  { key: 'fraud', label: 'Фрод-моніторинг' },
  { key: 'subscriptions', label: '⭐ Підписки' },
  { key: 'system', label: '📚 Система бонусів' },
];

const formatDate = (ts: number): string => {
  if (!ts) return '-';
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} ${hh}:${mi}`;
};

const shortUid = (uid: string): string =>
  uid.length > 12 ? uid.slice(0, 12) + '...' : uid;

// ── Users Tab ──

function UsersTab() {
  const [bonuses, setBonuses] = useState<UserBonusInfo[]>([]);
  const [promoCredits, setPromoCredits] = useState<UserPromoInfo[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>({});
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BonusTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const handleError = (err: Error) => setLoadError(err.message);
    const unsub1 = subscribeToAllBonuses((data) => {
      setBonuses(data);
      const uids = data.map((b) => b.uid);
      if (uids.length > 0) {
        loadUserProfiles(uids).then((profiles) =>
          setUserProfiles((prev) => ({ ...prev, ...profiles })),
        );
      }
    }, handleError);
    const unsub2 = subscribeToAllPromoCredits(setPromoCredits, handleError);
    return () => { unsub1(); unsub2(); };
  }, []);

  const filteredBonuses = search
    ? bonuses.filter((b) => {
        const q = search.toLowerCase();
        const prof = userProfiles[b.uid];
        return b.uid.toLowerCase().includes(q) ||
          (prof?.name ?? '').toLowerCase().includes(q) ||
          (prof?.phone ?? '').includes(q);
      })
    : bonuses;

  const filteredPromo = search
    ? promoCredits.filter((p) => p.uid.toLowerCase().includes(search.toLowerCase()))
    : promoCredits;

  const promoMap = new Map(promoCredits.map((p) => [p.uid, p]));

  const handleExpand = async (uid: string) => {
    if (expandedUid === uid) {
      setExpandedUid(null);
      return;
    }
    setExpandedUid(uid);
    setLoadingTx(true);
    try {
      const txs = await loadTransactions(uid);
      setTransactions(txs);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  };

  const handleGrantCredits = async (uid: string) => {
    const amountStr = window.prompt('Сума кредитів для поповнення (макс 10 000):');
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) { alert('Невірна сума: має бути додатне число'); return; }
    if (amount > 10000) { alert('Максимальна сума: 10 000'); return; }
    const reason = window.prompt('Причина:');
    if (!reason?.trim()) { alert('Причина обов\u0027язкова'); return; }
    if (!window.confirm(`Поповнити ${amount} кредитів для ${uid}?`)) return;
    setActionLoading(true);
    try {
      await grantPromoCredits(uid, amount, reason.trim());
      alert('Кредити поповнено');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdjustBonuses = async (uid: string) => {
    const amountStr = window.prompt('Коригування бонусів (може бути від\'ємним, макс ±50 000):');
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (!Number.isFinite(amount) || amount === 0) { alert('Невірна сума: має бути числом, не нулем'); return; }
    if (Math.abs(amount) > 50000) { alert('Максимальна сума: ±50 000'); return; }
    const reason = window.prompt('Причина:');
    if (!reason?.trim()) { alert('Причина обов\u0027язкова'); return; }
    if (!window.confirm(`Коригувати бонуси на ${amount} для ${uid}?`)) return;
    setActionLoading(true);
    try {
      await adjustTrustBonuses(uid, amount, reason.trim());
      alert('Бонуси скориговано');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async (uid: string) => {
    const reason = window.prompt('Причина блокування:');
    if (reason === null) return;
    if (!reason.trim()) { alert('Причина обов\u0027язкова'); return; }
    if (!window.confirm(`Заблокувати користувача ${uid}?`)) return;
    setActionLoading(true);
    try {
      await blockUser(uid, true, reason.trim());
      alert('Користувача заблоковано');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {loadError && (
        <div style={{ background: '#2a1a1a', color: '#ef9a9a', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          ⚠️ Помилка завантаження: {loadError}
        </div>
      )}
      {/* Search */}
      <div style={s.searchRow}>
        <input
          style={s.searchInput}
          placeholder="Пошук за UID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span style={s.searchCount}>
          Бонуси: {filteredBonuses.length} | Кредити: {filteredPromo.length}
        </span>
      </div>

      {/* Two-column layout */}
      <div style={s.twoCol}>
        {/* Left: Trust Bonuses */}
        <div style={s.tableContainer}>
          <div style={s.tableHeader}>Trust-бонуси</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Ім'я</th>
                <th style={s.th}>Телефон</th>
                <th style={s.th}>UID</th>
                <th style={s.th}>Баланс</th>
                <th style={s.th}>Бейдж</th>
                <th style={s.th}>Зароблено</th>
              </tr>
            </thead>
            <tbody>
              {filteredBonuses.length === 0 && (
                <tr><td colSpan={6} style={s.emptyCell}>Немає даних</td></tr>
              )}
              {filteredBonuses.map((b) => {
                const prof = userProfiles[b.uid];
                return (
                <>
                  <tr
                    key={b.uid}
                    style={{
                      ...s.tr,
                      backgroundColor: expandedUid === b.uid ? '#e8f0fe' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => handleExpand(b.uid)}
                  >
                    <td style={{ ...s.td, fontWeight: 600 }}>{prof?.name || shortUid(b.uid)}</td>
                    <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{prof?.phone || ''}</td>
                    <td style={s.td} title={b.uid}>{shortUid(b.uid)}</td>
                    <td style={s.td}>{b.balance}</td>
                    <td style={s.td}>{b.badge || '-'}</td>
                    <td style={s.td}>{b.totalEarned}</td>
                  </tr>
                  {expandedUid === b.uid && (
                    <tr key={b.uid + '_detail'}>
                      <td colSpan={6} style={s.detailCell}>
                        <UserDetail
                          uid={b.uid}
                          promo={promoMap.get(b.uid)}
                          transactions={transactions}
                          loadingTx={loadingTx}
                          actionLoading={actionLoading}
                          onGrant={handleGrantCredits}
                          onAdjust={handleAdjustBonuses}
                          onBlock={handleBlock}
                        />
                      </td>
                    </tr>
                  )}
                </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Promo Credits */}
        <div style={s.tableContainer}>
          <div style={s.tableHeader}>Промо-кредити</div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>UID</th>
                <th style={s.th}>Баланс</th>
                <th style={s.th}>Видано</th>
                <th style={s.th}>Витрачено</th>
              </tr>
            </thead>
            <tbody>
              {filteredPromo.length === 0 && (
                <tr><td colSpan={4} style={s.emptyCell}>Немає даних</td></tr>
              )}
              {filteredPromo.map((p) => (
                <tr
                  key={p.uid}
                  style={{
                    ...s.tr,
                    backgroundColor: expandedUid === p.uid ? '#e8f0fe' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleExpand(p.uid)}
                >
                  <td style={s.td} title={p.uid}>{shortUid(p.uid)}</td>
                  <td style={s.td}>{p.balance}</td>
                  <td style={s.td}>{p.totalGranted}</td>
                  <td style={s.td}>{p.totalSpent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UserDetail({
  uid,
  promo,
  transactions,
  loadingTx,
  actionLoading,
  onGrant,
  onAdjust,
  onBlock,
}: {
  uid: string;
  promo?: UserPromoInfo;
  transactions: BonusTransaction[];
  loadingTx: boolean;
  actionLoading: boolean;
  onGrant: (uid: string) => void;
  onAdjust: (uid: string) => void;
  onBlock: (uid: string) => void;
}) {
  return (
    <div style={s.detailContent}>
      {promo && (
        <div style={s.detailInfo}>
          Промо-кредити: баланс <strong>{promo.balance}</strong>, видано{' '}
          <strong>{promo.totalGranted}</strong>, витрачено <strong>{promo.totalSpent}</strong>
        </div>
      )}

      {/* Action buttons */}
      <div style={s.detailActions}>
        <button
          style={s.actionBtn}
          onClick={(e) => { e.stopPropagation(); onGrant(uid); }}
          disabled={actionLoading}
        >
          Поповнити кредити
        </button>
        <button
          style={{ ...s.actionBtn, backgroundColor: '#e67e22' }}
          onClick={(e) => { e.stopPropagation(); onAdjust(uid); }}
          disabled={actionLoading}
        >
          Коригувати бонуси
        </button>
        <button
          style={{ ...s.actionBtn, backgroundColor: '#e74c3c' }}
          onClick={(e) => { e.stopPropagation(); onBlock(uid); }}
          disabled={actionLoading}
        >
          Заблокувати
        </button>
      </div>

      {/* Transactions */}
      <div style={s.detailTxTitle}>Останні транзакції:</div>
      {loadingTx && <div style={{ color: '#888', fontSize: 13 }}>Завантаження...</div>}
      {!loadingTx && transactions.length === 0 && (
        <div style={{ color: '#888', fontSize: 13 }}>Транзакцій немає</div>
      )}
      {!loadingTx && transactions.length > 0 && (
        <table style={{ ...s.table, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={s.th}>Дата</th>
              <th style={s.th}>Тип</th>
              <th style={s.th}>Валюта</th>
              <th style={s.th}>Сума</th>
              <th style={s.th}>Категорія</th>
              <th style={s.th}>Причина</th>
            </tr>
          </thead>
          <tbody>
            {transactions.slice(0, 20).map((tx) => (
              <tr key={tx.id} style={s.tr}>
                <td style={s.td}>{formatDate(tx.createdAt)}</td>
                <td style={s.td}>{tx.type}</td>
                <td style={s.td}>{tx.currency}</td>
                <td style={{
                  ...s.td,
                  color: tx.amount >= 0 ? '#27ae60' : '#e74c3c',
                  fontWeight: 600,
                }}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount}
                </td>
                <td style={s.td}>{tx.category || '-'}</td>
                <td style={s.td}>{tx.reason || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Promotions Tab ──

function PromotionsTab() {
  const [promotions, setPromotions] = useState<BonusPromotion[]>([]);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeToPromotions(setPromotions, (err) => setLoadError(err.message));
    return unsub;
  }, []);

  const filtered = statusFilter === 'all'
    ? promotions
    : promotions.filter((p) => p.status === statusFilter);

  const handleModerate = async (promotionId: string, action: 'approve' | 'reject') => {
    const reason = window.prompt(
      action === 'approve' ? 'Причина схвалення (необов\'язково):' : 'Причина відхилення:',
    ) || '';
    setActionLoading(true);
    try {
      await moderatePromotion(promotionId, action, reason);
      alert(action === 'approve' ? 'Промоцію схвалено' : 'Промоцію відхилено');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {loadError && (
        <div style={{ background: '#2a1a1a', color: '#ef9a9a', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          ⚠️ Помилка завантаження: {loadError}
        </div>
      )}
      {/* Filter */}
      <div style={s.searchRow}>
        <select
          style={s.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Всі статуси</option>
          <option value="pending">Очікують</option>
          <option value="active">Активні</option>
          <option value="expired">Закінчились</option>
          <option value="rejected">Відхилені</option>
        </select>
        <span style={s.searchCount}>{filtered.length} промоцій</span>
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>ID</th>
            <th style={s.th}>UID</th>
            <th style={s.th}>Тип</th>
            <th style={s.th}>Статус</th>
            <th style={s.th}>Валюта</th>
            <th style={s.th}>Вартість</th>
            <th style={s.th}>Створено</th>
            <th style={s.th}>Закінчується</th>
            <th style={s.th}>Дії</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={9} style={s.emptyCell}>Немає промоцій</td></tr>
          )}
          {filtered.map((p) => (
            <tr key={p.promotionId} style={s.tr}>
              <td style={s.td} title={p.promotionId}>{shortUid(p.promotionId)}</td>
              <td style={s.td} title={p.uid}>{shortUid(p.uid)}</td>
              <td style={s.td}>{p.promoType}</td>
              <td style={s.td}>
                <span style={{
                  ...s.statusBadge,
                  backgroundColor: statusColors[p.status]?.bg || '#eee',
                  color: statusColors[p.status]?.fg || '#333',
                }}>
                  {statusLabels[p.status] || p.status}
                </span>
              </td>
              <td style={s.td}>{p.currency}</td>
              <td style={s.td}>{p.cost}</td>
              <td style={s.td}>{formatDate(p.createdAt)}</td>
              <td style={s.td}>{p.expiresAt ? formatDate(p.expiresAt) : '-'}</td>
              <td style={s.td}>
                {p.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={s.smallBtn}
                      onClick={() => handleModerate(p.promotionId, 'approve')}
                      disabled={actionLoading}
                    >
                      Схвалити
                    </button>
                    <button
                      style={{ ...s.smallBtn, backgroundColor: '#e74c3c' }}
                      onClick={() => handleModerate(p.promotionId, 'reject')}
                      disabled={actionLoading}
                    >
                      Відхилити
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  pending: 'Очікує',
  active: 'Активна',
  expired: 'Закінчилась',
  rejected: 'Відхилена',
};

const statusColors: Record<string, { bg: string; fg: string }> = {
  pending: { bg: '#fff3cd', fg: '#856404' },
  active: { bg: '#d4edda', fg: '#155724' },
  expired: { bg: '#e2e3e5', fg: '#383d41' },
  rejected: { bg: '#f8d7da', fg: '#721c24' },
};

// ── Fraud Tab ──

function FraudTab() {
  const [fraudFlags, setFraudFlags] = useState<FraudFlag[]>([]);
  const [blocks, setBlocks] = useState<Record<string, BonusBlock>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [flags, bl] = await Promise.all([loadFraudFlags(), loadBonusBlocks()]);
        if (!cancelled) {
          setFraudFlags(flags);
          setBlocks(bl);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Помилка завантаження');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleUnblock = async (uid: string) => {
    const reason = window.prompt('Причина розблокування:');
    if (reason === null) return;
    setActionLoading(true);
    try {
      await blockUser(uid, false, reason);
      // Reload blocks
      const bl = await loadBonusBlocks();
      setBlocks(bl);
      alert('Користувача розблоковано');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 20, color: '#888' }}>Завантаження...</div>;
  }

  if (loadError) {
    return <div style={{ padding: 20, color: '#ef9a9a' }}>⚠️ {loadError}</div>;
  }

  const blockedEntries = Object.entries(blocks);

  return (
    <div>
      {/* Fraud flags */}
      <div style={s.tableHeader}>Фрод-прапорці ({fraudFlags.length})</div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>UID 1</th>
            <th style={s.th}>UID 2</th>
            <th style={s.th}>Тип</th>
            <th style={s.th}>Score</th>
            <th style={s.th}>Причини</th>
            <th style={s.th}>Дата</th>
          </tr>
        </thead>
        <tbody>
          {fraudFlags.length === 0 && (
            <tr><td colSpan={6} style={s.emptyCell}>Фрод-прапорців немає</td></tr>
          )}
          {fraudFlags.map((f, i) => (
            <tr key={i} style={s.tr}>
              <td style={s.td} title={f.uid1}>{shortUid(f.uid1)}</td>
              <td style={s.td} title={f.uid2}>{shortUid(f.uid2)}</td>
              <td style={s.td}>{f.type}</td>
              <td style={{
                ...s.td,
                fontWeight: 600,
                color: f.riskScore >= 0.8 ? '#e74c3c' : f.riskScore >= 0.5 ? '#e67e22' : '#27ae60',
              }}>
                {f.riskScore?.toFixed(2) ?? '-'}
              </td>
              <td style={s.td}>{f.reason || '-'}</td>
              <td style={s.td}>{formatDate(f.at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Blocked users */}
      <div style={{ ...s.tableHeader, marginTop: 24 }}>
        Заблоковані користувачі ({blockedEntries.length})
      </div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>UID</th>
            <th style={s.th}>Причина</th>
            <th style={s.th}>Ким</th>
            <th style={s.th}>Дата</th>
            <th style={s.th}>Дії</th>
          </tr>
        </thead>
        <tbody>
          {blockedEntries.length === 0 && (
            <tr><td colSpan={5} style={s.emptyCell}>Заблокованих немає</td></tr>
          )}
          {blockedEntries.map(([uid, block]) => (
            <tr key={uid} style={s.tr}>
              <td style={s.td} title={uid}>{shortUid(uid)}</td>
              <td style={s.td}>{block.reason || '-'}</td>
              <td style={s.td} title={block.by}>{shortUid(block.by || '-')}</td>
              <td style={s.td}>{formatDate(block.at)}</td>
              <td style={s.td}>
                <button
                  style={s.smallBtn}
                  onClick={() => handleUnblock(uid)}
                  disabled={actionLoading}
                >
                  Розблокувати
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Subscriptions Tab ──

const subStatusLabels: Record<string, string> = {
  active: 'Активна',
  trial: 'Пробний',
  expired: 'Завершена',
  free: 'Безкоштовна',
};

const subStatusColors: Record<string, { bg: string; fg: string }> = {
  active:  { bg: '#d4edda', fg: '#155724' },
  trial:   { bg: '#cce5ff', fg: '#004085' },
  expired: { bg: '#f8d7da', fg: '#721c24' },
  free:    { bg: '#e2e3e5', fg: '#383d41' },
};

const paymentLabels: Record<string, string> = {
  monobank_manual: 'Monobank',
  trial: 'Пробний',
};

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function SubscriptionsTab() {
  const [subs, setSubs] = useState<PremiumSubscription[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [activateModal, setActivateModal] = useState<{ uid: string; name: string } | null>(null);
  const [modalMonths, setModalMonths] = useState<1 | 3 | 6 | 12>(1);
  const [modalNotes, setModalNotes] = useState('');

  useEffect(() => {
    return subscribeToAllPremiumSubscriptions((data) => {
      setSubs(data);
      // Fetch names/phones for all uids we don't know yet
      const unknown = data.map((s) => s.uid).filter((uid) => !profiles[uid]);
      if (unknown.length > 0) {
        loadUserProfiles(unknown).then((p) =>
          setProfiles((prev) => ({ ...prev, ...p })),
        );
      }
    }, (err) => setLoadError(err.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = subs.filter((sub) => {
    const matchStatus = filter === 'all' || sub.status === filter;
    const prof = profiles[sub.uid];
    const q = search.toLowerCase();
    const matchSearch = !search ||
      sub.uid.toLowerCase().includes(q) ||
      (prof?.name ?? '').toLowerCase().includes(q) ||
      (prof?.phone ?? '').includes(q);
    return matchStatus && matchSearch;
  });

  const activeCount = subs.filter((s) => s.status === 'active').length;
  const trialCount  = subs.filter((s) => s.status === 'trial').length;
  const expiringCount = subs.filter((s) => {
    const d = daysLeft(s.expiresAt);
    return d !== null && d <= 7 && d > 0 && (s.status === 'active' || s.status === 'trial');
  }).length;

  const handleActivate = async () => {
    if (!activateModal) return;
    setActionLoading(true);
    try {
      await activatePremiumManual(activateModal.uid, modalMonths, modalNotes);
      alert(`Premium активовано на ${modalMonths} міс.`);
      setActivateModal(null);
      setModalNotes('');
      setModalMonths(1);
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async (uid: string, name: string) => {
    if (!window.confirm(`Відключити Premium для ${name || uid}?`)) return;
    setActionLoading(true);
    try {
      await cancelPremiumSubscription(uid);
      alert('Підписку відключено');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoRenew = async (uid: string, current: boolean, name: string) => {
    const next = !current;
    setActionLoading(true);
    try {
      await setAutoRenew(uid, next);
      alert(`Авторенewал ${next ? 'увімкнено' : 'вимкнено'} для ${name || uid}`);
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {loadError && (
        <div style={{ background: '#2a1a1a', color: '#ef9a9a', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          ⚠️ Помилка завантаження: {loadError}
        </div>
      )}
      {/* Stats */}
      <div style={s.statsRow}>
        <div style={{ ...s.statCard, borderColor: '#27ae60' }}>
          <div style={s.statNum}>{activeCount}</div>
          <div style={s.statLabel}>Активних</div>
        </div>
        <div style={{ ...s.statCard, borderColor: '#2980b9' }}>
          <div style={s.statNum}>{trialCount}</div>
          <div style={s.statLabel}>Пробних</div>
        </div>
        <div style={{ ...s.statCard, borderColor: '#e67e22' }}>
          <div style={s.statNum}>{expiringCount}</div>
          <div style={s.statLabel}>Закінчується ≤7 днів</div>
        </div>
        <div style={{ ...s.statCard, borderColor: '#888' }}>
          <div style={s.statNum}>{subs.length}</div>
          <div style={s.statLabel}>Всього записів</div>
        </div>
      </div>

      {/* Filters */}
      <div style={s.searchRow}>
        <input
          style={s.searchInput}
          placeholder="Пошук за UID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={s.filterSelect}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Всі статуси</option>
          <option value="active">Активні</option>
          <option value="trial">Пробний</option>
          <option value="expired">Завершені</option>
        </select>
        <span style={s.searchCount}>{filtered.length} підписок</span>
      </div>

      {/* Table */}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Ім'я</th>
            <th style={s.th}>Телефон</th>
            <th style={s.th}>UID</th>
            <th style={s.th}>Статус</th>
            <th style={s.th}>Оплата</th>
            <th style={s.th}>Дата оплати</th>
            <th style={s.th}>Діє до</th>
            <th style={s.th}>Залишилось</th>
            <th style={s.th}>Авто</th>
            <th style={s.th}>Нотатки</th>
            <th style={s.th}>Дії</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr><td colSpan={11} style={s.emptyCell}>Підписок немає</td></tr>
          )}
          {filtered.map((sub) => {
            const days = daysLeft(sub.expiresAt);
            const isExpiringSoon = days !== null && days <= 7 && days > 0;
            const rowBg = isExpiringSoon ? '#fff8e1' : undefined;
            const prof = profiles[sub.uid];
            const displayName = prof?.name || '—';
            const displayPhone = prof?.phone || '—';
            return (
              <tr key={sub.uid} style={{ ...s.tr, backgroundColor: rowBg }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{displayName}</td>
                <td style={{ ...s.td, fontFamily: 'monospace', fontSize: 12 }}>{displayPhone}</td>
                <td style={{ ...s.td, fontSize: 11, color: '#999' }} title={sub.uid}>{shortUid(sub.uid)}</td>
                <td style={s.td}>
                  <span style={{
                    ...s.statusBadge,
                    backgroundColor: subStatusColors[sub.status]?.bg || '#eee',
                    color: subStatusColors[sub.status]?.fg || '#333',
                  }}>
                    {subStatusLabels[sub.status] || sub.status}
                  </span>
                </td>
                <td style={s.td}>{paymentLabels[sub.paymentMethod ?? ''] || sub.paymentMethod || '-'}</td>
                <td style={s.td}>{sub.activatedAt ? formatDate(new Date(sub.activatedAt).getTime()) : '-'}</td>
                <td style={s.td}>{sub.expiresAt ? formatDate(new Date(sub.expiresAt).getTime()) : '-'}</td>
                <td style={{
                  ...s.td,
                  fontWeight: 600,
                  color: days === null ? '#999' : days <= 3 ? '#e74c3c' : days <= 7 ? '#e67e22' : '#27ae60',
                }}>
                  {days === null ? '-' : days <= 0 ? 'Завершено' : `${days} дн.`}
                </td>
                <td style={{ ...s.td, textAlign: 'center' as const }}>
                  <button
                    title={sub.autoRenew ? 'Авторенewал увімкнено — натисніть щоб вимкнути' : 'Авторенewал вимкнено — натисніть щоб увімкнути'}
                    style={{
                      ...s.toggleBtn,
                      backgroundColor: sub.autoRenew ? '#27ae60' : '#ccc',
                    }}
                    disabled={actionLoading}
                    onClick={() => handleAutoRenew(sub.uid, sub.autoRenew, displayName)}
                  >
                    {sub.autoRenew ? '✓ Авто' : '✗ Авто'}
                  </button>
                </td>
                <td style={{ ...s.td, maxWidth: 120 }} title={sub.notes ?? ''}>{sub.notes || '-'}</td>
                <td style={s.td}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                    <button
                      style={s.smallBtn}
                      disabled={actionLoading}
                      onClick={() => setActivateModal({ uid: sub.uid, name: displayName })}
                    >
                      Включити
                    </button>
                    {(sub.status === 'active' || sub.status === 'trial') && (
                      <button
                        style={{ ...s.smallBtn, backgroundColor: '#e74c3c' }}
                        disabled={actionLoading}
                        onClick={() => handleCancel(sub.uid, displayName)}
                      >
                        Відключити
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Activate Modal */}
      {activateModal && (
        <div style={s.modalOverlay} onClick={() => setActivateModal(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalTitle}>⭐ Включити Premium</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#333' }}>{activateModal.name}</div>
            <div style={s.modalUid}>UID: {activateModal.uid}</div>
            <div style={s.modalField}>
              <label style={s.modalLabel}>Термін підписки:</label>
              <select
                style={s.filterSelect}
                value={modalMonths}
                onChange={(e) => setModalMonths(Number(e.target.value) as 1 | 3 | 6 | 12)}
              >
                <option value={1}>1 місяць — 39 грн</option>
                <option value={3}>3 місяці — 117 грн</option>
                <option value={6}>6 місяців — 234 грн</option>
                <option value={12}>12 місяців — 468 грн</option>
              </select>
            </div>
            <div style={s.modalField}>
              <label style={s.modalLabel}>Нотатка (скрін, дата платежу):</label>
              <textarea
                style={s.modalTextarea}
                value={modalNotes}
                onChange={(e) => setModalNotes(e.target.value)}
                placeholder="напр. Скрін otrimano 07.06, сума 39 грн"
                rows={3}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                style={{ ...s.actionBtn, backgroundColor: '#888' }}
                onClick={() => setActivateModal(null)}
              >
                Скасувати
              </button>
              <button
                style={s.actionBtn}
                disabled={actionLoading}
                onClick={handleActivate}
              >
                {actionLoading ? 'Зачекайте...' : 'Активувати'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── System Documentation Tab ──

function BonusSystemDocsTab() {
  return (
    <div style={s.docsContainer}>
      <div style={s.docsSection}>
        <h2 style={s.docsTitle}>🏆 Система бонусов доверия</h2>
        <p style={s.docsText}>
          Бонусы доверия (Trust-бонусы) — это основная валюта Чайки, которая отражает уровень активности и надежности пользователя в сообществе.
        </p>
      </div>

      {/* Types of Bonuses */}
      <div style={s.docsSection}>
        <h3 style={s.docsSubtitle}>💰 Типы бонусов</h3>

        <div style={s.bonusCard}>
          <div style={s.bonusAmount}>+10</div>
          <div style={s.bonusTitle}>Первая заявка</div>
          <div style={s.bonusDesc}>Один раз за регистрацию, когда вы впервые создали заявку о помощи</div>
        </div>

        <div style={s.bonusCard}>
          <div style={s.bonusAmount}>+30</div>
          <div style={s.bonusTitle}>Профиль заполнен</div>
          <div style={s.bonusDesc}>Один раз, когда вы полностью заполнили профиль (имя, телефон, город, фото, и прочее)</div>
        </div>

        <div style={s.bonusCard}>
          <div style={s.bonusAmount}>+10</div>
          <div style={s.bonusTitle}>Первый ответ</div>
          <div style={s.bonusDesc}>Один раз за первый раз, когда вы помогли кому-то, ответив на их заявку</div>
        </div>

        <div style={s.bonusCard}>
          <div style={s.bonusAmount}>+5</div>
          <div style={s.bonusTitle}>Ответ на помощь</div>
          <div style={s.bonusDesc}>Каждый раз, когда вы помогаете кому-то, отвечая на их заявку (ограничение: 5 в неделю)</div>
        </div>

        <div style={s.bonusCard}>
          <div style={s.bonusAmount}>+20</div>
          <div style={s.bonusTitle}>Подтверждение помощи</div>
          <div style={s.bonusDesc}>Когда автор заявки подтвердил, что вы действительно помогли (ограничение: 20 в неделю)</div>
        </div>

        <div style={s.bonusCard}>
          <div style={s.bonusAmount}>+10</div>
          <div style={s.bonusTitle}>Благодарность</div>
          <div style={s.bonusDesc}>Когда автор заявки благодарит вас за помощь (ограничение: 10 в неделю)</div>
        </div>

        <div style={s.bonusCard}>
          <div style={s.bonusAmount}>+5</div>
          <div style={s.bonusTitle}>Закрытие заявки</div>
          <div style={s.bonusDesc}>Когда автор закрывает заявку как решённую</div>
        </div>
      </div>

      {/* How it works */}
      <div style={s.docsSection}>
        <h3 style={s.docsSubtitle}>🔄 Как это работает</h3>

        <div style={s.flowBox}>
          <div style={s.flowStep}>
            <div style={s.stepNum}>1</div>
            <div style={s.stepTitle}>Вы создаёте заявку</div>
            <div style={s.stepText}>Опубликуйте запрос о помощи → +10 бонусов (один раз)</div>
          </div>

          <div style={s.flowArrow}>↓</div>

          <div style={s.flowStep}>
            <div style={s.stepNum}>2</div>
            <div style={s.stepTitle}>Кто-то вам отвечает</div>
            <div style={s.stepText}>Пользователь предлагает помощь → Им +5 бонусов</div>
          </div>

          <div style={s.flowArrow}>↓</div>

          <div style={s.flowStep}>
            <div style={s.stepNum}>3</div>
            <div style={s.stepTitle}>Вы подтверждаете помощь</div>
            <div style={s.stepText}>Нажимаете "Помощь получена" → Помощнику +20 бонусов, вам +5</div>
          </div>

          <div style={s.flowArrow}>↓</div>

          <div style={s.flowStep}>
            <div style={s.stepNum}>4</div>
            <div style={s.stepTitle}>Вы закрываете заявку</div>
            <div style={s.stepText}>Нажимаете "Закрыть как решённую" → Вам +5 бонусов</div>
          </div>
        </div>
      </div>

      {/* Weekly limits */}
      <div style={s.docsSection}>
        <h3 style={s.docsSubtitle}>📅 Еженедельные ограничения</h3>
        <p style={s.docsText}>
          Система отслеживает ваши действия по неделям (понедельник-воскресенье, UTC+2) чтобы предотвратить злоупотребления.
        </p>

        <div style={s.limitBox}>
          <div style={s.limitRow}>
            <div style={s.limitLabel}>Ответов на помощь</div>
            <div style={s.limitValue}>5 в неделю × 5 бонусов = макс. 25 в неделю</div>
          </div>
          <div style={s.limitRow}>
            <div style={s.limitLabel}>Подтверждений помощи</div>
            <div style={s.limitValue}>20 в неделю × 20 бонусов = макс. 400 в неделю</div>
          </div>
          <div style={s.limitRow}>
            <div style={s.limitLabel}>Благодарностей</div>
            <div style={s.limitValue}>10 в неделю × 10 бонусов = макс. 100 в неделю</div>
          </div>
        </div>
      </div>

      {/* Spending */}
      <div style={s.docsSection}>
        <h3 style={s.docsSubtitle}>💸 На что потратить бонусы</h3>

        <div style={s.spendingCard}>
          <div style={s.spendingAmount}>50 бонусов</div>
          <div style={s.spendingTitle}>Поднять в топ (24 часа)</div>
          <div style={s.spendingDesc}>Ваша заявка будет видна всем в начале списка</div>
        </div>

        <div style={s.spendingCard}>
          <div style={s.spendingAmount}>100 бонусов</div>
          <div style={s.spendingTitle}>Выделить профиль</div>
          <div style={s.spendingDesc}>Ваш профиль будет выделен в поиске помощников</div>
        </div>

        <div style={s.spendingCard}>
          <div style={s.spendingAmount}>30 бонусов</div>
          <div style={s.spendingTitle}>Отправить сообщение</div>
          <div style={s.spendingDesc}>Напрямую написать человеку, которому нужна помощь</div>
        </div>
      </div>

      {/* Safety & Fraud Prevention */}
      <div style={s.docsSection}>
        <h3 style={s.docsSubtitle}>🛡️ Защита от мошенничества</h3>
        <p style={s.docsText}>
          Система автоматически отслеживает подозрительную активность:
        </p>

        <div style={s.safetyBox}>
          <div style={s.safetyItem}>
            <strong>Кольцевые схемы:</strong> Если один и тот же человек много раз помогает вам и вы ему, система отметит это как потенциальное мошенничество
          </div>
          <div style={s.safetyItem}>
            <strong>Частые повторения:</strong> Часто один и тот же пользователь отвечает на все ваши заявки — система это видит
          </div>
          <div style={s.safetyItem}>
            <strong>Блокировка:</strong> Если система обнаружит мошенничество, доступ к бонусам может быть заблокирован
          </div>
          <div style={s.safetyItem}>
            <strong>Ручная модерация:</strong> Админ может вручную заблокировать или разблокировать пользователя
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={s.docsSection}>
        <h3 style={s.docsSubtitle}>❓ Часто задаваемые вопросы</h3>

        <div style={s.faqItem}>
          <div style={s.faqQuestion}>Что случится, если я потрачу все бонусы?</div>
          <div style={s.faqAnswer}>Вы можете продолжать зарабатывать бонусы и снова тратить их. Баланс не может быть отрицательным — система просто не позволит потратить больше, чем есть.</div>
        </div>

        <div style={s.faqItem}>
          <div style={s.faqQuestion}>Сколько бонусов я могу заработать за неделю?</div>
          <div style={s.faqAnswer}>Теоретический максимум: 10 (первый запрос) + 30 (профиль) + 10 (первый ответ) + 25 (5 ответов) + 400 (20 подтверждений) + 100 (10 благодарностей) + 5 (закрытие) = 580 бонусов в неделю, но это при активной работе.</div>
        </div>

        <div style={s.faqItem}>
          <div style={s.faqQuestion}>Почему я не получил ожидаемые бонусы?</div>
          <div style={s.faqAnswer}>
            Возможные причины:<br/>
            • Вы уже получили одноразовый бонус (первая заявка, профиль)<br/>
            • Вы достигли еженедельного лимита<br/>
            • Система обнаружила подозрительную активность<br/>
            • Ошибка в сети (попробуйте позже)
          </div>
        </div>

        <div style={s.faqItem}>
          <div style={s.faqQuestion}>Может ли админ изменить мои бонусы?</div>
          <div style={s.faqAnswer}>Да, админ может вручную добавить или отнять бонусы за некорректное поведение или в качестве бонуса за активность. Все изменения логируются.</div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──

export function BonusCreditsPage() {
  const { viewMode } = useViewMode();
  const [activeTab, setActiveTab] = useState<TabKey>('users');
  const visibleTabs = viewMode === 'simple' ? TABS.filter((tab) => tab.key !== 'system') : TABS;

  useEffect(() => {
    if (viewMode === 'simple' && activeTab === 'system') setActiveTab('users');
  }, [activeTab, viewMode]);

  return (
    <div style={s.container}>
      <h2 style={s.title}>💰 Бонуси та кредити</h2>

      {/* Tabs */}
      <div style={s.tabs}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...s.tab,
              backgroundColor: activeTab === tab.key ? '#3a5a9a' : '#f0f0f0',
              color: activeTab === tab.key ? '#fff' : '#333',
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={s.tabContent}>
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'promotions' && <PromotionsTab />}
        {activeTab === 'fraud' && <FraudTab />}
        {activeTab === 'subscriptions' && <SubscriptionsTab />}
        {activeTab === 'system' && <BonusSystemDocsTab />}
      </div>
    </div>
  );
}

// ── Styles ──

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px 20px',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a2e',
  },
  tabs: {
    display: 'flex',
    gap: 4,
  },
  tab: {
    padding: '8px 20px',
    border: 'none',
    borderRadius: '8px 8px 0 0',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    transition: 'background 0.15s',
  },
  tabContent: {
    flex: 1,
    overflow: 'auto',
    border: '1px solid #ddd',
    borderRadius: '0 10px 10px 10px',
    padding: 16,
    backgroundColor: '#fff',
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  searchInput: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 14,
    width: 280,
  },
  searchCount: {
    fontSize: 13,
    color: '#888',
  },
  filterSelect: {
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 13,
    backgroundColor: '#fff',
  },
  twoCol: {
    display: 'flex',
    gap: 16,
    alignItems: 'flex-start',
  },
  tableContainer: {
    flex: 1,
    minWidth: 0,
  },
  tableHeader: {
    fontSize: 15,
    fontWeight: 700,
    color: '#fff',
    backgroundColor: '#3a5a9a',
    padding: '8px 12px',
    borderRadius: '8px 8px 0 0',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  th: {
    textAlign: 'left' as const,
    padding: '8px 10px',
    backgroundColor: '#f5f6fa',
    borderBottom: '2px solid #ddd',
    fontWeight: 600,
    fontSize: 12,
    color: '#555',
  },
  tr: {
    borderBottom: '1px solid #f0f0f0',
    transition: 'background 0.1s',
  },
  td: {
    padding: '7px 10px',
    fontSize: 13,
    color: '#333',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  emptyCell: {
    padding: 20,
    textAlign: 'center' as const,
    color: '#999',
    fontSize: 13,
  },
  detailCell: {
    padding: 0,
    backgroundColor: '#f9fafb',
  },
  detailContent: {
    padding: '12px 16px',
  },
  detailInfo: {
    fontSize: 13,
    marginBottom: 8,
    color: '#444',
  },
  detailActions: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: 'none',
    backgroundColor: '#3a5a9a',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  },
  smallBtn: {
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    backgroundColor: '#27ae60',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
  },
  toggleBtn: {
    padding: '3px 8px',
    borderRadius: 4,
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 11,
  },
  detailTxTitle: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 6,
    color: '#555',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 4,
    display: 'inline-block',
  },
  statsRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  statCard: {
    flex: '1 1 100px',
    minWidth: 100,
    padding: '10px 14px',
    borderRadius: 8,
    border: '2px solid #ccc',
    backgroundColor: '#fff',
    textAlign: 'center' as const,
  },
  statNum: {
    fontSize: 26,
    fontWeight: 700,
    color: '#1a1a2e',
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  modalOverlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: 380,
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a1a2e',
  },
  modalUid: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    wordBreak: 'break-all' as const,
  },
  modalField: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
  },
  modalTextarea: {
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 13,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  },

  // ── Bonus System Docs ──
  docsContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 24,
    padding: '0',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: '#e0e0e0',
  },

  docsSection: {
    padding: '24px',
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(10px)',
  },

  docsTitle: {
    fontSize: 28,
    fontWeight: 700,
    color: '#fff',
    margin: '0 0 12px 0',
    background: 'linear-gradient(135deg, #4da6ff, #66d9ff)',
    WebkitBackgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent',
  },

  docsSubtitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#4da6ff',
    margin: '0 0 16px 0',
  },

  docsText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: '#b0b0b0',
    margin: '0',
  },

  bonusCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '16px 20px',
    marginBottom: 12,
    background: 'linear-gradient(135deg, rgba(77, 166, 255, 0.08), rgba(102, 217, 255, 0.05))',
    border: '1px solid rgba(77, 166, 255, 0.2)',
    borderRadius: 8,
    transition: 'all 0.2s',
  },

  bonusAmount: {
    fontSize: 24,
    fontWeight: 700,
    color: '#66d9ff',
    textShadow: '0 0 20px rgba(102, 217, 255, 0.4)',
  },

  bonusTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
  },

  bonusDesc: {
    fontSize: 13,
    color: '#a0a0a0',
    lineHeight: 1.5,
  },

  flowBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    padding: '20px',
    background: 'rgba(102, 217, 255, 0.05)',
    border: '1px solid rgba(102, 217, 255, 0.15)',
    borderRadius: 8,
  },

  flowStep: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '16px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    borderLeft: '4px solid #66d9ff',
  },

  flowArrow: {
    textAlign: 'center' as const,
    color: '#66d9ff',
    fontSize: 20,
    fontWeight: 700,
  },

  stepNum: {
    display: 'inline-flex',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #4da6ff, #66d9ff)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 18,
    borderRadius: '50%',
  },

  stepTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
  },

  stepText: {
    fontSize: 13,
    color: '#a0a0a0',
    lineHeight: 1.5,
  },

  limitBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    padding: '16px',
    background: 'rgba(255, 165, 0, 0.08)',
    border: '1px solid rgba(255, 165, 0, 0.2)',
    borderRadius: 8,
  },

  limitRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 4,
  },

  limitLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#ffa500',
  },

  limitValue: {
    fontSize: 13,
    color: '#b0b0b0',
    textAlign: 'right' as const,
  },

  spendingCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '16px 20px',
    marginBottom: 12,
    background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.08), rgba(102, 217, 255, 0.05))',
    border: '1px solid rgba(76, 175, 80, 0.2)',
    borderRadius: 8,
  },

  spendingAmount: {
    fontSize: 18,
    fontWeight: 700,
    color: '#4caf50',
  },

  spendingTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
  },

  spendingDesc: {
    fontSize: 13,
    color: '#a0a0a0',
    lineHeight: 1.5,
  },

  safetyBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    padding: '16px',
    background: 'rgba(244, 67, 54, 0.08)',
    border: '1px solid rgba(244, 67, 54, 0.2)',
    borderRadius: 8,
  },

  safetyItem: {
    fontSize: 13,
    color: '#b0b0b0',
    lineHeight: 1.6,
    paddingLeft: 12,
    borderLeft: '3px solid #f44336',
  },

  faqItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    padding: '16px',
    marginBottom: 12,
    background: 'rgba(156, 39, 176, 0.08)',
    border: '1px solid rgba(156, 39, 176, 0.2)',
    borderRadius: 8,
  },

  faqQuestion: {
    fontSize: 14,
    fontWeight: 700,
    color: '#9c27b0',
  },

  faqAnswer: {
    fontSize: 13,
    color: '#a0a0a0',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
  },
};

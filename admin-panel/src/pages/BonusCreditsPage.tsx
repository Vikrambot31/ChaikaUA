import { useEffect, useState } from 'react';
import {
  subscribeToAllBonuses,
  subscribeToAllPromoCredits,
  subscribeToPromotions,
  loadTransactions,
  loadFraudFlags,
  loadBonusBlocks,
  grantPromoCredits,
  adjustPromoCredits,
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

type TabKey = 'users' | 'promotions' | 'fraud';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'users', label: 'Користувачі' },
  { key: 'promotions', label: 'Промоції' },
  { key: 'fraud', label: 'Фрод-моніторинг' },
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
  const [search, setSearch] = useState('');
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<BonusTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsub1 = subscribeToAllBonuses(setBonuses);
    const unsub2 = subscribeToAllPromoCredits(setPromoCredits);
    return () => { unsub1(); unsub2(); };
  }, []);

  const filteredBonuses = search
    ? bonuses.filter((b) => b.uid.toLowerCase().includes(search.toLowerCase()))
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
    const amountStr = window.prompt('Сума кредитів для поповнення:');
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (isNaN(amount) || amount <= 0) { alert('Невірна сума'); return; }
    const reason = window.prompt('Причина:') || '';
    setActionLoading(true);
    try {
      await grantPromoCredits(uid, amount, reason);
      alert('Кредити поповнено');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdjustBonuses = async (uid: string) => {
    const amountStr = window.prompt('Коригування бонусів (може бути від\'ємним):');
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (isNaN(amount)) { alert('Невірна сума'); return; }
    const reason = window.prompt('Причина:') || '';
    setActionLoading(true);
    try {
      await adjustTrustBonuses(uid, amount, reason);
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
    setActionLoading(true);
    try {
      await blockUser(uid, true, reason);
      alert('Користувача заблоковано');
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
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
                <th style={s.th}>UID</th>
                <th style={s.th}>Баланс</th>
                <th style={s.th}>Бейдж</th>
                <th style={s.th}>Зароблено</th>
              </tr>
            </thead>
            <tbody>
              {filteredBonuses.length === 0 && (
                <tr><td colSpan={4} style={s.emptyCell}>Немає даних</td></tr>
              )}
              {filteredBonuses.map((b) => (
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
                    <td style={s.td} title={b.uid}>{shortUid(b.uid)}</td>
                    <td style={s.td}>{b.balance}</td>
                    <td style={s.td}>{b.badge || '-'}</td>
                    <td style={s.td}>{b.totalEarned}</td>
                  </tr>
                  {expandedUid === b.uid && (
                    <tr key={b.uid + '_detail'}>
                      <td colSpan={4} style={s.detailCell}>
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
              ))}
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
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeToPromotions(setPromotions);
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
                color: f.score >= 0.8 ? '#e74c3c' : f.score >= 0.5 ? '#e67e22' : '#27ae60',
              }}>
                {f.score.toFixed(2)}
              </td>
              <td style={s.td}>{f.reasons?.join(', ') || '-'}</td>
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

// ── Main Page ──

export function BonusCreditsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('users');

  return (
    <div style={s.container}>
      <h2 style={s.title}>💰 Бонуси та кредити</h2>

      {/* Tabs */}
      <div style={s.tabs}>
        {TABS.map((tab) => (
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
};

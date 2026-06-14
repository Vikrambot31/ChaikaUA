import { useEffect, useState, useCallback } from 'react';
import { useAuthAccess } from '../hooks/useAuthAccess';
import {
  loadReports,
  dismissReport,
  deleteReportedListing,
  banReportedUser,
  loadBlockStats,
  fetchUserDisplayName,
  type ReportRecord,
  type ReportStatus,
  type ReportReason,
  type BlockStatsEntry,
} from '../services/reportsModerationService';
import { addToYellowList, removeFromYellowList } from '../services/yellowListService';

type Tab = 'reports' | 'blocks';

const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Спам',
  inappropriate: 'Неприемлемый контент',
  fake: 'Фейк',
  other: 'Другое',
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Ожидает',
  reviewed: 'Рассмотрено',
  action_taken: 'Принято действие',
};

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: '#e53935',
  reviewed: '#ffa726',
  action_taken: '#66bb6a',
};

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

export const ReportsModerationPage = () => {
  const access = useAuthAccess();
  const adminUid = access.status === 'allowed' ? access.user.uid : '';

  const [tab, setTab] = useState<Tab>('reports');

  // ─── Reports state ──────────────────────────────────────────
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('pending');
  const [reasonFilter, setReasonFilter] = useState<ReportReason | ''>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // ─── Block stats state ─────────────────────────────────────
  const [blockStats, setBlockStats] = useState<BlockStatsEntry[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);

  // ─── Load reports ──────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadReports(statusFilter || undefined);
      setReports(reasonFilter ? data.filter((r) => r.reason === reasonFilter) : data);
    } catch (err) {
      console.error('[ReportsModerationPage] loadReports error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, reasonFilter]);

  useEffect(() => { if (tab === 'reports') void fetchReports(); }, [tab, fetchReports]);

  // ─── Load block stats ─────────────────────────────────────
  const fetchBlocks = useCallback(async () => {
    setBlocksLoading(true);
    try {
      setBlockStats(await loadBlockStats());
    } catch (err) {
      console.error('[ReportsModerationPage] loadBlockStats error:', err);
    } finally {
      setBlocksLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === 'blocks') void fetchBlocks(); }, [tab, fetchBlocks]);

  // ─── Actions ──────────────────────────────────────────────
  const handleDismiss = async (report: ReportRecord) => {
    if (!adminUid || actionInProgress) return;
    setActionInProgress(report.id);
    try {
      await dismissReport(report.id, adminUid);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      console.error('[ReportsModerationPage] dismiss error:', err);
      alert('Ошибка при снятии отчёта');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteListing = async (report: ReportRecord) => {
    if (!adminUid || actionInProgress) return;
    if (!confirm(`Удалить анкету ${report.reportedListingId}?`)) return;
    setActionInProgress(report.id);
    try {
      await deleteReportedListing(report.id, report.reportedListingId, adminUid);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      console.error('[ReportsModerationPage] deleteListing error:', err);
      alert('Ошибка при удалении анкеты');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleBanUser = async (report: ReportRecord) => {
    if (!adminUid || actionInProgress) return;
    if (!confirm(`Забанить пользователя ${report.reportedUserId} на 14 дней и удалить все анкеты?`)) return;
    setActionInProgress(report.id);
    try {
      const name = await fetchUserDisplayName(report.reportedUserId);
      await banReportedUser(report.id, report.reportedUserId, adminUid, name);
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      console.error('[ReportsModerationPage] banUser error:', err);
      alert('Ошибка при бане пользователя');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleBanFromBlockStats = async (entry: BlockStatsEntry) => {
    if (!adminUid) return;
    if (!confirm(`Забанить пользователя ${entry.userId} (заблокирован ${entry.blockCount} раз)?`)) return;
    try {
      const name = await fetchUserDisplayName(entry.userId);
      await addToYellowList({
        uid: entry.userId,
        displayName: name,
        reason: `Blocked by ${entry.blockCount} users`,
        bannedBy: adminUid,
        itemPath: 'user_block_list',
        section: 'kontakt-xxx',
      });
      alert('Пользователь забанен на 14 дней');
      void fetchBlocks();
    } catch (err) {
      console.error('[ReportsModerationPage] banFromBlocks error:', err);
      alert('Ошибка при бане');
    }
  };

  const handleUnban = async (userId: string) => {
    if (!confirm(`Разбанить пользователя ${userId}?`)) return;
    try {
      await removeFromYellowList(userId);
      alert('Пользователь разбанен');
    } catch (err) {
      console.error('[ReportsModerationPage] unban error:', err);
      alert('Ошибка при разбане');
    }
  };

  // ─── Render ───────────────────────────────────────────────
  const pendingCount = reports.filter((r) => r.status === 'pending').length;

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h2 style={{ color: '#e0e0e0', marginBottom: 4 }}>Скарги та безпека</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Жалобы пользователей Kontakt-XXX и паттерны блокировок
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setTab('reports')}
          style={{
            padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: tab === 'reports' ? '#c9a84c' : '#2a2a3a',
            color: tab === 'reports' ? '#1a1a2e' : '#aaa',
            fontWeight: 700, fontSize: 14,
          }}
        >
          Жалобы {pendingCount > 0 && <span style={{ background: '#e53935', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{pendingCount}</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab('blocks')}
          style={{
            padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: tab === 'blocks' ? '#c9a84c' : '#2a2a3a',
            color: tab === 'blocks' ? '#1a1a2e' : '#aaa',
            fontWeight: 700, fontSize: 14,
          }}
        >
          Паттерны блокировок
        </button>
      </div>

      {/* ─── REPORTS TAB ─────────────────────────────────────── */}
      {tab === 'reports' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ color: '#aaa', fontSize: 13 }}>
              Статус:
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ReportStatus | '')}
                style={{ marginLeft: 6, background: '#1e1e2e', color: '#ddd', border: '1px solid #444', borderRadius: 4, padding: '4px 8px' }}
              >
                <option value="">Все</option>
                <option value="pending">Ожидает</option>
                <option value="reviewed">Рассмотрено</option>
                <option value="action_taken">Принято действие</option>
              </select>
            </label>
            <label style={{ color: '#aaa', fontSize: 13 }}>
              Причина:
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value as ReportReason | '')}
                style={{ marginLeft: 6, background: '#1e1e2e', color: '#ddd', border: '1px solid #444', borderRadius: 4, padding: '4px 8px' }}
              >
                <option value="">Все</option>
                <option value="spam">Спам</option>
                <option value="inappropriate">Неприемлемый</option>
                <option value="fake">Фейк</option>
                <option value="other">Другое</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void fetchReports()}
              style={{ background: '#2a3a5a', color: '#a0c4ff', border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              Обновить
            </button>
          </div>

          {loading && <p style={{ color: '#888' }}>Загрузка...</p>}

          {!loading && reports.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              <p style={{ fontSize: 24 }}>&#x2705;</p>
              <p>Нет жалоб{statusFilter ? ` со статусом "${STATUS_LABELS[statusFilter]}"` : ''}</p>
            </div>
          )}

          {!loading && reports.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>Дата</th>
                  <th style={{ padding: '8px 6px' }}>Причина</th>
                  <th style={{ padding: '8px 6px' }}>Кто жалуется</th>
                  <th style={{ padding: '8px 6px' }}>На кого</th>
                  <th style={{ padding: '8px 6px' }}>Статус</th>
                  <th style={{ padding: '8px 6px' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    expanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    onDismiss={() => void handleDismiss(r)}
                    onDeleteListing={() => void handleDeleteListing(r)}
                    onBanUser={() => void handleBanUser(r)}
                    busy={actionInProgress === r.id}
                  />
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ─── BLOCKS TAB ──────────────────────────────────────── */}
      {tab === 'blocks' && (
        <>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
            Пользователи, заблокированные 3+ раз другими пользователями. Возможные спамеры или нарушители.
          </p>

          {blocksLoading && <p style={{ color: '#888' }}>Загрузка статистики блокировок...</p>}

          {!blocksLoading && blockStats.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              <p style={{ fontSize: 24 }}>&#x1F6E1;</p>
              <p>Нет пользователей с 3+ блокировками</p>
            </div>
          )}

          {!blocksLoading && blockStats.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px' }}>User ID</th>
                  <th style={{ padding: '8px 6px' }}>Кол-во блокировок</th>
                  <th style={{ padding: '8px 6px' }}>Заблокирован кем</th>
                  <th style={{ padding: '8px 6px' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {blockStats.map((entry) => (
                  <tr key={entry.userId} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '8px 6px', color: '#ddd', fontFamily: 'monospace', fontSize: 11 }}>
                      {entry.userId.slice(0, 12)}...
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{
                        background: entry.blockCount >= 10 ? '#e53935' : entry.blockCount >= 5 ? '#ffa726' : '#666',
                        color: '#fff', borderRadius: 10, padding: '2px 10px', fontSize: 12, fontWeight: 700,
                      }}>
                        {entry.blockCount}
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px', color: '#888', fontSize: 11 }}>
                      {entry.blockedBy.slice(0, 5).map((uid) => uid.slice(0, 8)).join(', ')}
                      {entry.blockedBy.length > 5 && ` (+${entry.blockedBy.length - 5})`}
                    </td>
                    <td style={{ padding: '8px 6px', display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => void handleBanFromBlockStats(entry)}
                        style={{ background: '#b71c1c', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >
                        Бан 14д
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleUnban(entry.userId)}
                        style={{ background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >
                        Разбан
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};

// ─── Report Row Component ────────────────────────────────────────────────────

type ReportRowProps = {
  report: ReportRecord;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onDeleteListing: () => void;
  onBanUser: () => void;
  busy: boolean;
};

const ReportRow = ({ report, expanded, onToggle, onDismiss, onDeleteListing, onBanUser, busy }: ReportRowProps) => {
  const isPending = report.status === 'pending';

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid #222', cursor: 'pointer', background: expanded ? '#1a1a2e' : 'transparent' }}
        onClick={onToggle}
      >
        <td style={{ padding: '8px 6px', color: '#bbb' }}>{formatDate(report.createdAt)}</td>
        <td style={{ padding: '8px 6px' }}>
          <span style={{ background: '#2a2a4a', color: '#ddd', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
            {REASON_LABELS[report.reason]}
          </span>
        </td>
        <td style={{ padding: '8px 6px', color: '#888', fontFamily: 'monospace', fontSize: 11 }}>
          {report.reporterId.slice(0, 12)}...
        </td>
        <td style={{ padding: '8px 6px', color: '#ddd', fontFamily: 'monospace', fontSize: 11 }}>
          {report.reportedUserId.slice(0, 12)}...
        </td>
        <td style={{ padding: '8px 6px' }}>
          <span style={{
            background: STATUS_COLORS[report.status],
            color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
          }}>
            {STATUS_LABELS[report.status]}
          </span>
        </td>
        <td style={{ padding: '8px 6px' }}>
          {isPending && !busy && (
            <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={onDismiss}
                style={{ background: '#333', color: '#aaa', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
                title="Отклонить (нет нарушения)"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={onDeleteListing}
                style={{ background: '#e65100', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
                title="Удалить анкету"
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={onBanUser}
                style={{ background: '#b71c1c', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
                title="Бан 14 дней + удалить все анкеты"
              >
                Бан
              </button>
            </div>
          )}
          {busy && <span style={{ color: '#888', fontSize: 11 }}>...</span>}
          {!isPending && report.actionType && (
            <span style={{ color: '#666', fontSize: 11 }}>
              {report.actionType === 'dismissed' ? 'Отклонено' : report.actionType === 'listing_deleted' ? 'Анкета удалена' : 'Пользователь забанен'}
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: '#12121e' }}>
          <td colSpan={6} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
              <div>
                <p style={{ color: '#888', marginBottom: 4 }}>Report ID</p>
                <p style={{ color: '#ddd', fontFamily: 'monospace', fontSize: 11 }}>{report.id}</p>
              </div>
              <div>
                <p style={{ color: '#888', marginBottom: 4 }}>Listing ID</p>
                <p style={{ color: '#ddd', fontFamily: 'monospace', fontSize: 11 }}>{report.reportedListingId}</p>
              </div>
              <div>
                <p style={{ color: '#888', marginBottom: 4 }}>Источник</p>
                <p style={{ color: '#ddd' }}>{report.source}</p>
              </div>
              <div>
                <p style={{ color: '#888', marginBottom: 4 }}>Описание</p>
                <p style={{ color: '#ddd' }}>{report.description || '—'}</p>
              </div>
              {report.actionAt && (
                <div>
                  <p style={{ color: '#888', marginBottom: 4 }}>Действие принято</p>
                  <p style={{ color: '#ddd' }}>{formatDate(report.actionAt)} by {report.actionBy?.slice(0, 12)}...</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

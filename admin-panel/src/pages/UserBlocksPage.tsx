import { useEffect, useState, useCallback } from 'react';
import {
  loadBlockReports,
  fetchUserDisplayName,
  type BlockReport,
} from '../services/userBlockReportsService';
import { AiAnalysisButton } from '../components/AiAnalysisButton';
import type { ModerationItem } from '../services/moderationService';
import { useAuthAccess } from '../hooks/useAuthAccess';
import { get, ref, update } from 'firebase/database';
import { database } from '../firebase/firebase';

const formatDate = (iso: string): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  reviewed: 'Переглянуто',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#e53935',
  reviewed: '#66bb6a',
};

const toModerationItem = (report: BlockReport): ModerationItem => ({
  id: report.id,
  section: 'requests' as ModerationItem['section'],
  path: `reports/${report.id}`,
  status: 'pending',
  title: '',
  subtitle: report.reason,
  userName: '',
  userId: report.blockedUserId,
  email: '',
  deviceId: '',
  timestamp: new Date(report.createdAt).getTime(),
  timestampLabel: report.createdAt,
  photoUrl: '',
  mediaUrl: '',
  photoUrls: [],
  mediaUrls: [],
  priority: 'standard',
  priorityRank: 0,
  statusPriority: '0',
  raw: { description: report.reason, source: 'profile_block' },
});

export const UserBlocksPage = () => {
  const access = useAuthAccess();
  const adminUid = access.status === 'allowed' ? access.user.uid : '';

  const [reports, setReports] = useState<BlockReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [nameCache, setNameCache] = useState<Record<string, string>>({});
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadBlockReports();
      setReports(data);

      const uids = new Set<string>();
      data.forEach((r) => { uids.add(r.reporterId); uids.add(r.blockedUserId); });
      const newNames: Record<string, string> = {};
      await Promise.all(
        Array.from(uids).map(async (uid) => {
          if (nameCache[uid]) { newNames[uid] = nameCache[uid]; return; }
          newNames[uid] = await fetchUserDisplayName(uid);
        }),
      );
      setNameCache((prev) => ({ ...prev, ...newNames }));
    } catch (err) {
      console.error('[UserBlocksPage] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchReports(); }, [fetchReports]);

  const handleMarkReviewed = async (reportId: string) => {
    if (!adminUid || actionInProgress) return;
    setActionInProgress(reportId);
    try {
      await update(ref(database, `reports/${reportId}`), {
        status: 'reviewed',
        actionAt: new Date().toISOString(),
        actionBy: adminUid,
      });
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'reviewed' } : r)),
      );
    } catch (err) {
      console.error('[UserBlocksPage] markReviewed error:', err);
      alert('Помилка при оновленні статусу');
    } finally {
      setActionInProgress(null);
    }
  };

  const pendingCount = reports.filter((r) => r.status === 'pending').length;

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <h2 style={{ color: '#e0e0e0', marginBottom: 4 }}>Блокування користувачів</h2>
      <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
        Причини блокувань від користувачів з профілю
        {pendingCount > 0 && (
          <span style={{ background: '#e53935', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 8 }}>
            {pendingCount} нових
          </span>
        )}
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => void fetchReports()}
          style={{ background: '#2a3a5a', color: '#a0c4ff', border: 'none', borderRadius: 4, padding: '5px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Оновити
        </button>
      </div>

      {loading && <p style={{ color: '#888' }}>Завантаження...</p>}

      {!loading && reports.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
          <p style={{ fontSize: 24 }}>&#x2705;</p>
          <p>Немає блокувань від користувачів</p>
        </div>
      )}

      {!loading && reports.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>Дата</th>
              <th style={{ padding: '8px 6px' }}>Хто заблокував</th>
              <th style={{ padding: '8px 6px' }}>Кого заблокували</th>
              <th style={{ padding: '8px 6px' }}>Причина</th>
              <th style={{ padding: '8px 6px' }}>Статус</th>
              <th style={{ padding: '8px 6px' }}>AI</th>
              <th style={{ padding: '8px 6px' }}>Дії</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => {
              const item = toModerationItem(r);
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #2a2a3a', verticalAlign: 'top' }}>
                  <td style={{ padding: '8px 6px', color: '#aaa', whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</td>
                  <td style={{ padding: '8px 6px', color: '#ddd' }}>
                    {nameCache[r.reporterId] || r.reporterId}
                  </td>
                  <td style={{ padding: '8px 6px', color: '#ddd' }}>
                    {nameCache[r.blockedUserId] || r.blockedUserId}
                  </td>
                  <td style={{ padding: '8px 6px', color: '#ccc', maxWidth: 300, wordBreak: 'break-word' }}>
                    {r.reason}
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    <span style={{
                      background: STATUS_COLORS[r.status] || '#888',
                      color: '#fff',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    <AiAnalysisButton
                      item={item}
                      onResult={(path, result) => {
                        void (async () => {
                          try {
                            await update(ref(database, `${path}/aiResult`), {
                              verdict: result.verdict,
                              confidence: result.confidence,
                              explanation: result.explanation,
                              flags: result.flags,
                              provider: result.provider,
                              model: result.model,
                              analyzedAt: new Date().toISOString(),
                            });
                          } catch (err) {
                            console.error('[UserBlocksPage] AI result save error:', err);
                            alert('Помилка збереження результату AI');
                          }
                        })();
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    {r.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkReviewed(r.id)}
                        disabled={actionInProgress === r.id}
                        style={{
                          background: '#2a5a3a',
                          color: '#a0ffa0',
                          border: 'none',
                          borderRadius: 4,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {actionInProgress === r.id ? '...' : 'Переглянуто'}
                      </button>
                    ) : (
                      <span style={{ color: '#666', fontSize: 12 }}>Опрацьовано</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

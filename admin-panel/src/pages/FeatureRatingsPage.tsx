import { useCallback, useEffect, useState } from 'react';
import {
  fetchAllSummaries,
  fetchComments,
  type FeatureRatingSummary,
  type FeatureRatingEntry,
} from '../services/featureRatingsService';

// ── Screen Map (duplicated from mobile for admin isolation) ──

const SCREEN_LABELS: Record<string, { ua: string; ru: string }> = {
  eda:          { ua: 'Їжа на Чайці',  ru: 'Еда на Чайке' },
  obyavleniya:  { ua: 'Оголошення',     ru: 'Объявления' },
  deti:         { ua: 'Все для дітей',   ru: 'Всё для детей' },
  biznes:       { ua: 'Бізнес на Чайці', ru: 'Бизнес на Чайке' },
  chat:         { ua: 'Онлайн чат',      ru: 'Онлайн чат' },
  novosti:      { ua: 'Новини Чайки',    ru: 'Новости Чайки' },
  salony:       { ua: 'Салони краси',     ru: 'Салоны красоты' },
  sport:        { ua: 'Спорт на Чайці',  ru: 'Спорт на Чайке' },
  foto:         { ua: 'Фото району',     ru: 'Фото района' },
  kuplu_prodam: { ua: 'Куплю-Продам',    ru: 'Куплю-Продам' },
  karta:        { ua: 'Карта Чайки',     ru: 'Карта Чайки' },
  osbb:         { ua: 'ОСББ',            ru: 'ОСМД' },
};

const getLabel = (id: string): string => SCREEN_LABELS[id]?.ru ?? id;

// ── Helpers ──

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const ratingColor = (avg: number): string => {
  if (avg >= 4.0) return '#388E3C';
  if (avg >= 3.5) return '#FBC02D';
  return '#D32F2F';
};

const ratingDot = (avg: number): string => {
  if (avg >= 4.0) return '\u{1F7E2}'; // green
  if (avg >= 3.5) return '\u{1F7E1}'; // yellow
  return '\u{1F534}';                  // red
};

const renderStars = (rating: number): string => {
  return '\u2B50'.repeat(Math.round(rating)) + '\u2606'.repeat(5 - Math.round(rating));
};

// ── Component ──

type SummaryRow = {
  screenId: string;
  label: string;
  summary: FeatureRatingSummary;
};

export const FeatureRatingsPage = () => {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedScreen, setSelectedScreen] = useState<string | null>(null);
  const [comments, setComments] = useState<FeatureRatingEntry[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Total stats
  const totalVotes = rows.reduce((sum, r) => sum + r.summary.totalVotes, 0);
  const overallAvg = totalVotes > 0
    ? rows.reduce((sum, r) => sum + r.summary.avgRating * r.summary.totalVotes, 0) / totalVotes
    : 0;
  const monthlyTotal = rows.reduce((sum, r) => sum + r.summary.monthlyVotes, 0);

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllSummaries();
      const mapped: SummaryRow[] = Object.entries(data)
        .map(([screenId, summary]) => ({
          screenId,
          label: getLabel(screenId),
          summary,
        }))
        .sort((a, b) => b.summary.totalVotes - a.summary.totalVotes);
      setRows(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSummaries(); }, [loadSummaries]);

  const handleRowClick = useCallback(async (screenId: string) => {
    if (selectedScreen === screenId) {
      setSelectedScreen(null);
      setComments([]);
      return;
    }
    setSelectedScreen(screenId);
    setCommentsLoading(true);
    try {
      const data = await fetchComments(screenId, 30);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [selectedScreen]);

  if (loading) {
    return <div style={S.loading}>Завантаження оцінок...</div>;
  }

  if (error) {
    return (
      <div style={S.error}>
        <p>Помилка: {error}</p>
        <button type="button" onClick={() => void loadSummaries()} style={S.retryBtn}>Повторити</button>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <h2 style={S.title}>{'\u2B50'} Оцінка функцій додатку</h2>

      {/* Stats bar */}
      <div style={S.statsBar}>
        <div style={S.statCard}>
          <span style={S.statValue}>{totalVotes}</span>
          <span style={S.statLabel}>Всього оцінок</span>
        </div>
        <div style={S.statCard}>
          <span style={{ ...S.statValue, color: ratingColor(overallAvg) }}>
            {overallAvg > 0 ? overallAvg.toFixed(1) : '—'}
          </span>
          <span style={S.statLabel}>Середня оцінка</span>
        </div>
        <div style={S.statCard}>
          <span style={S.statValue}>{monthlyTotal}</span>
          <span style={S.statLabel}>За цей місяць</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={S.empty}>Оцінок поки немає. Вони з'являться коли користувачі почнуть оцінювати розділи додатку.</div>
      ) : (
        <>
          {/* Table */}
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Функція</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Оцінка</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Голоси</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Місяць</th>
                <th style={{ ...S.th, textAlign: 'center' }}>{' '}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.screenId}
                  style={{
                    ...S.tr,
                    background: selectedScreen === row.screenId ? '#f0e6d0' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => void handleRowClick(row.screenId)}
                >
                  <td style={S.td}>
                    <strong>{row.label}</strong>
                    <span style={S.screenId}>{row.screenId}</span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: ratingColor(row.summary.avgRating) }}>
                    {row.summary.avgRating.toFixed(1)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{row.summary.totalVotes}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    {row.summary.monthlyVotes > 0
                      ? `${row.summary.monthlyAvg.toFixed(1)} (${row.summary.monthlyVotes})`
                      : '—'
                    }
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', fontSize: 18 }}>{ratingDot(row.summary.avgRating)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Comments panel */}
          {selectedScreen && (
            <div style={S.commentsPanel}>
              <h3 style={S.commentsTitle}>
                Коментарі: {getLabel(selectedScreen)}
              </h3>
              {commentsLoading ? (
                <div style={S.loading}>Завантаження...</div>
              ) : comments.length === 0 ? (
                <div style={S.empty}>Коментарів немає</div>
              ) : (
                <div style={S.commentsList}>
                  {comments.map((c, i) => (
                    <div key={`${c.createdAt}-${i}`} style={S.commentCard}>
                      <div style={S.commentHeader}>
                        <span style={{ color: ratingColor(c.rating), fontWeight: 700 }}>
                          {renderStars(c.rating)}
                        </span>
                        <span style={S.commentDate}>{formatDate(c.createdAt)}</span>
                        <span style={S.commentPlatform}>{c.platform} {c.appVersion}</span>
                      </div>
                      {c.comment ? (
                        <p style={S.commentText}>{c.comment}</p>
                      ) : (
                        <p style={S.commentEmpty}>Без коментаря</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Inline Styles ──

const S: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    maxWidth: 960,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    marginBottom: 16,
    color: '#2c2c2c',
  },
  statsBar: {
    display: 'flex',
    gap: 16,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  statCard: {
    background: '#fff',
    border: '1px solid #e0d6c8',
    borderRadius: 12,
    padding: '14px 22px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 120,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontWeight: 600,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    background: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  th: {
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 700,
    color: '#777',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    borderBottom: '2px solid #e8e0d4',
    textAlign: 'left' as const,
  },
  tr: {
    borderBottom: '1px solid #f0ebe3',
    transition: 'background 0.15s',
  },
  td: {
    padding: '12px 14px',
    fontSize: 14,
    color: '#333',
  },
  screenId: {
    marginLeft: 8,
    fontSize: 11,
    color: '#aaa',
    fontFamily: 'monospace',
  },
  commentsPanel: {
    marginTop: 20,
    background: '#fff',
    border: '1px solid #e0d6c8',
    borderRadius: 12,
    padding: 20,
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 14,
    color: '#333',
  },
  commentsList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  commentCard: {
    border: '1px solid #f0ebe3',
    borderRadius: 8,
    padding: '10px 14px',
    background: '#faf6ee',
  },
  commentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
    flexWrap: 'wrap' as const,
  },
  commentDate: {
    fontSize: 12,
    color: '#888',
    fontWeight: 600,
  },
  commentPlatform: {
    fontSize: 11,
    color: '#aaa',
    fontFamily: 'monospace',
  },
  commentText: {
    fontSize: 14,
    color: '#444',
    margin: 0,
    lineHeight: 1.5,
  },
  commentEmpty: {
    fontSize: 13,
    color: '#bbb',
    margin: 0,
    fontStyle: 'italic' as const,
  },
  loading: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#888',
    fontSize: 15,
  },
  error: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#d32f2f',
  },
  retryBtn: {
    marginTop: 12,
    padding: '8px 20px',
    border: '1px solid #d32f2f',
    borderRadius: 8,
    background: 'transparent',
    color: '#d32f2f',
    cursor: 'pointer',
    fontWeight: 700,
  },
  empty: {
    padding: 24,
    textAlign: 'center' as const,
    color: '#aaa',
    fontSize: 14,
  },
};

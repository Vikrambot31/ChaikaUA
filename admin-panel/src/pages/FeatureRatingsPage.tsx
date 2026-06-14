import { useCallback, useEffect, useState } from 'react';
import {
  fetchAllSummaries,
  fetchScreenAnalytics,
  type FeatureRatingSummary,
  type FeatureRatingEntry,
  type StarDistribution,
  type MonthlyPoint,
  type ScreenAnalytics,
} from '../services/featureRatingsService';

// ── Screen labels ──────────────────────────────────────────────────────────────

const SCREEN_LABELS: Record<string, string> = {
  eda:          'Їжа на Чайці',
  obyavleniya:  'Оголошення',
  deti:         'Все для дітей',
  biznes:       'Бізнес на Чайці',
  chat:         'Онлайн чат',
  novosti:      'Новини Чайки',
  salony:       'Салони краси',
  sport:        'Спорт на Чайці',
  foto:         'Фото району',
  kuplu_prodam: 'Куплю-Продам',
  karta:        'Карта Чайки',
  osbb:         'ОСББ',
};

const label = (id: string) => SCREEN_LABELS[id] ?? id;

// ── Utils ──────────────────────────────────────────────────────────────────────

const formatDate = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const months = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
};

const ratingColor = (avg: number) => {
  if (avg >= 4.0) return '#388E3C';
  if (avg >= 3.5) return '#FBC02D';
  return '#D32F2F';
};

const starColor = (star: number) => {
  if (star >= 4) return '#388E3C';
  if (star === 3) return '#FBC02D';
  return '#D32F2F';
};

const renderStarsText = (n: number) =>
  '★'.repeat(Math.max(0, Math.round(n))) + '☆'.repeat(Math.max(0, 5 - Math.round(n)));

// ── Sub-components ─────────────────────────────────────────────────────────────

/** 5-star breakdown with percentage bars */
function StarBreakdown({ dist, total }: { dist: StarDistribution; total: number }) {
  return (
    <div style={S.starBreakdown}>
      {([5, 4, 3, 2, 1] as const).map((star) => {
        const count = dist[star] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={star} style={S.starRow}>
            <span style={{ ...S.starLabel, color: starColor(star) }}>{'★'.repeat(star)}</span>
            <div style={S.barBg}>
              <div style={{ ...S.barFill, width: `${pct}%`, background: starColor(star) }} />
            </div>
            <span style={S.starCount}>{count}</span>
            <span style={S.starPct}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** SVG bar chart for monthly trend */
function MonthlyChart({ points }: { points: MonthlyPoint[] }) {
  if (points.length === 0) return <div style={S.chartEmpty}>Недостатньо даних для графіку</div>;

  const W = 600;
  const H = 160;
  const PAD = { top: 16, right: 16, bottom: 40, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxVotes = Math.max(...points.map(p => p.votes), 1);
  const barW = Math.min(40, chartW / points.length - 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto', overflow: 'visible' }}>
      {/* Y-axis labels for rating 1-5 */}
      {[1, 2, 3, 4, 5].map(v => {
        const y = PAD.top + chartH - ((v - 1) / 4) * chartH;
        return (
          <g key={v}>
            <line x1={PAD.left - 4} y1={y} x2={PAD.left + chartW} y2={y} stroke="#e8e0d4" strokeWidth={0.8} />
            <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="#aaa">{v}</text>
          </g>
        );
      })}

      {/* Bars + line */}
      {points.map((p, i) => {
        const x = PAD.left + (i / points.length) * chartW + chartW / points.length / 2 - barW / 2;
        const barHeight = (p.votes / maxVotes) * (chartH * 0.4);
        const barY = PAD.top + chartH - barHeight;
        const dotY = PAD.top + chartH - ((p.avgRating - 1) / 4) * chartH;
        const fill = ratingColor(p.avgRating);

        return (
          <g key={p.month}>
            {/* Vote volume bar (subtle) */}
            <rect x={x} y={barY} width={barW} height={barHeight}
              fill={fill} opacity={0.18} rx={3} />

            {/* Rating dot */}
            <circle cx={x + barW / 2} cy={dotY} r={5} fill={fill} />

            {/* Rating label above dot */}
            <text x={x + barW / 2} y={dotY - 9} textAnchor="middle" fontSize={10} fontWeight={700} fill={fill}>
              {p.avgRating.toFixed(1)}
            </text>

            {/* Votes below bar */}
            <text x={x + barW / 2} y={PAD.top + chartH + 14} textAnchor="middle" fontSize={9} fill="#aaa">
              {p.votes}
            </text>

            {/* Month label */}
            <text x={x + barW / 2} y={PAD.top + chartH + 26} textAnchor="middle" fontSize={9} fill="#888">
              {monthLabel(p.month)}
            </text>
          </g>
        );
      })}

      {/* Connect dots with line */}
      {points.length > 1 && (
        <polyline
          fill="none"
          stroke="#888"
          strokeWidth={1.5}
          strokeDasharray="4 2"
          points={points.map((p, i) => {
            const x = PAD.left + (i / points.length) * chartW + chartW / points.length / 2;
            const y = PAD.top + chartH - ((p.avgRating - 1) / 4) * chartH;
            return `${x},${y}`;
          }).join(' ')}
        />
      )}
    </svg>
  );
}

/** Compact metric pill */
function MetricPill({ icon, value, label, color }: { icon: string; value: string | number; label: string; color?: string }) {
  return (
    <div style={S.pill}>
      <span style={S.pillIcon}>{icon}</span>
      <span style={{ ...S.pillValue, color: color ?? '#333' }}>{value}</span>
      <span style={S.pillLabel}>{label}</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type SummaryRow = {
  screenId: string;
  summary: FeatureRatingSummary;
};

export const FeatureRatingsPage = () => {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<ScreenAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const totalVotes = rows.reduce((s, r) => s + r.summary.totalVotes, 0);
  const overallAvg = totalVotes > 0
    ? rows.reduce((s, r) => s + r.summary.avgRating * r.summary.totalVotes, 0) / totalVotes
    : 0;
  const monthlyTotal = rows.reduce((s, r) => s + r.summary.monthlyVotes, 0);
  const screensWithRatings = rows.filter(r => r.summary.totalVotes > 0).length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllSummaries();
      const mapped = Object.entries(data)
        .map(([screenId, summary]) => ({ screenId, summary }))
        .sort((a, b) => b.summary.totalVotes - a.summary.totalVotes);
      setRows(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSelect = useCallback(async (screenId: string) => {
    if (selected === screenId) { setSelected(null); setAnalytics(null); return; }
    setSelected(screenId);
    setAnalytics(null);
    setAnalyticsLoading(true);
    try {
      const data = await fetchScreenAnalytics(screenId);
      setAnalytics(data);
    } catch { setAnalytics(null); }
    finally { setAnalyticsLoading(false); }
  }, [selected]);

  if (loading) return <div style={S.loading}>Завантаження оцінок...</div>;
  if (error) return (
    <div style={S.errorBox}>
      <div>⚠ Помилка: {error}</div>
      <button type="button" onClick={() => void load()} style={S.btn}>Повторити</button>
    </div>
  );

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <h2 style={S.h2}>⭐ Оцінка функцій додатку</h2>
      <p style={S.subtitle}>Зворотний зв'язок користувачів по розділах. Оцінки з'являться після 3-го відвідування розділу.</p>

      {/* ── Global metrics ── */}
      <div style={S.metricsRow}>
        <MetricPill icon="🗳" value={totalVotes} label="Всього оцінок" />
        <MetricPill icon="⭐" value={overallAvg > 0 ? overallAvg.toFixed(2) : '—'} label="Загальна середня" color={overallAvg > 0 ? ratingColor(overallAvg) : undefined} />
        <MetricPill icon="📅" value={monthlyTotal} label="Цього місяця" />
        <MetricPill icon="📱" value={screensWithRatings} label={`з ${rows.length} розділів оцінено`} />
      </div>

      {rows.length === 0 ? (
        <div style={S.empty}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div>Оцінок поки немає.</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>Баннер появляється після 3-го відвідування розділу.</div>
        </div>
      ) : (
        <>
          {/* ── Summary table ── */}
          <div style={S.card}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Розділ</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>Загальний</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>🎯 Зручно</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>💡 Корисно</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>Голоси</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>Місяць</th>
                  <th style={{ ...S.th, textAlign: 'center' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const isSelected = selected === r.screenId;
                  const avg = r.summary.avgRating;
                  const aU  = r.summary.avgUsability  ?? 0;
                  const aUf = r.summary.avgUsefulness ?? 0;
                  return (
                    <tr
                      key={r.screenId}
                      style={{ ...S.tr, background: isSelected ? '#fdf5e4' : 'transparent', cursor: 'pointer' }}
                      onClick={() => void handleSelect(r.screenId)}
                    >
                      <td style={S.td}>
                        <strong>{label(r.screenId)}</strong>
                        <span style={S.code}>{r.screenId}</span>
                      </td>
                      {/* Overall */}
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: ratingColor(avg) }}>{avg.toFixed(1)}</span>
                        <div style={{ color: '#FFA000', fontSize: 12, letterSpacing: 1 }}>{renderStarsText(avg)}</div>
                      </td>
                      {/* Usability */}
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: ratingColor(aU) }}>
                          {aU > 0 ? aU.toFixed(1) : '—'}
                        </span>
                        {aU > 0 && <div style={{ color: '#FFA000', fontSize: 11 }}>{renderStarsText(aU)}</div>}
                      </td>
                      {/* Usefulness */}
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: ratingColor(aUf) }}>
                          {aUf > 0 ? aUf.toFixed(1) : '—'}
                        </span>
                        {aUf > 0 && <div style={{ color: '#FFA000', fontSize: 11 }}>{renderStarsText(aUf)}</div>}
                      </td>
                      <td style={{ ...S.td, textAlign: 'center', fontWeight: 700 }}>{r.summary.totalVotes}</td>
                      <td style={{ ...S.td, textAlign: 'center' }}>
                        <div style={{ fontWeight: 700 }}>{r.summary.monthlyVotes}</div>
                        {r.summary.monthlyVotes > 0 && (
                          <div style={{ fontSize: 12, color: ratingColor(r.summary.monthlyAvg) }}>
                            avg {r.summary.monthlyAvg.toFixed(1)}
                          </div>
                        )}
                      </td>
                      <td style={{ ...S.td, textAlign: 'center', fontSize: 18 }}>
                        {avg >= 4.0 ? '🟢' : avg >= 3.5 ? '🟡' : avg > 0 ? '🔴' : '⚪'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Detail panel ── */}
          {selected && (
            <div style={S.detail}>
              <h3 style={S.h3}>
                📊 Детальна аналітика: {label(selected)}
                <span style={S.code}>{selected}</span>
              </h3>

              {analyticsLoading ? (
                <div style={S.loading}>Завантаження аналітики...</div>
              ) : analytics ? (
                <>
                  {/* ── Detail metrics ── */}
                  <div style={S.metricsRow}>
                    <MetricPill icon="🗳" value={analytics.entries.length} label="Всього голосів" />
                    {(() => {
                      const usabArr = analytics.entries.map(e => e.ratingUsability).filter(v => v >= 1);
                      const usefArr = analytics.entries.map(e => e.ratingUsefulness).filter(v => v >= 1);
                      const avgUsab = usabArr.length > 0 ? (usabArr.reduce((s, v) => s + v, 0) / usabArr.length) : 0;
                      const avgUsef = usefArr.length > 0 ? (usefArr.reduce((s, v) => s + v, 0) / usefArr.length) : 0;
                      return (
                        <>
                          <MetricPill icon="🎯" value={avgUsab > 0 ? avgUsab.toFixed(2) : '—'} label="Зручно (avg)" color={avgUsab > 0 ? ratingColor(avgUsab) : undefined} />
                          <MetricPill icon="💡" value={avgUsef > 0 ? avgUsef.toFixed(2) : '—'} label="Корисно (avg)" color={avgUsef > 0 ? ratingColor(avgUsef) : undefined} />
                        </>
                      );
                    })()}
                    <MetricPill icon="💬" value={`${analytics.withCommentCount} (${analytics.entries.length > 0 ? Math.round(analytics.withCommentCount / analytics.entries.length * 100) : 0}%)`} label="З коментарями" />
                    <MetricPill icon="🤖" value={analytics.androidCount} label="Android" />
                    <MetricPill icon="🍎" value={analytics.iosCount} label="iOS" />
                  </div>

                  {/* ── Two columns: star breakdown + monthly chart ── */}
                  <div style={S.twoCol}>

                    {/* Left: star distribution */}
                    <div style={S.colCard}>
                      <div style={S.colTitle}>Розподіл оцінок</div>
                      <StarBreakdown
                        dist={analytics.starDistribution}
                        total={analytics.entries.length}
                      />
                      <div style={S.starSummaryRow}>
                        {([5, 4, 3, 2, 1] as const).map(star => {
                          const count = analytics.starDistribution[star] ?? 0;
                          const pct = analytics.entries.length > 0
                            ? Math.round(count / analytics.entries.length * 100)
                            : 0;
                          return (
                            <div key={star} style={S.starSummaryItem}>
                              <span style={{ color: starColor(star), fontWeight: 800 }}>{'★'.repeat(star)}</span>
                              <span style={{ fontSize: 18, fontWeight: 800, color: starColor(star) }}>{pct}%</span>
                              <span style={{ fontSize: 11, color: '#aaa' }}>{count} ос.</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right: monthly trend */}
                    <div style={S.colCard}>
                      <div style={S.colTitle}>Динаміка по місяцях</div>
                      <MonthlyChart points={analytics.monthlyTrend} />
                      {analytics.monthlyTrend.length > 1 && (() => {
                        const last = analytics.monthlyTrend[analytics.monthlyTrend.length - 1];
                        const prev = analytics.monthlyTrend[analytics.monthlyTrend.length - 2];
                        const delta = last.avgRating - prev.avgRating;
                        return (
                          <div style={{ fontSize: 13, color: delta >= 0 ? '#388E3C' : '#D32F2F', marginTop: 8, fontWeight: 700 }}>
                            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(2)} порівняно з минулим місяцем
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* ── Comments ── */}
                  <div style={{ marginTop: 20 }}>
                    <div style={S.colTitle}>Останні коментарі ({analytics.entries.filter(e => e.comment?.trim()).length})</div>
                    {analytics.entries.filter(e => e.comment?.trim()).length === 0 ? (
                      <div style={S.empty}>Коментарів немає</div>
                    ) : (
                      <div style={S.commentGrid}>
                        {analytics.entries
                          .filter((e): e is FeatureRatingEntry & { comment: string } => Boolean(e.comment?.trim()))
                          .slice(0, 20)
                          .map((e, i) => (
                            <div key={i} style={S.commentCard}>
                              <div style={S.commentHeader}>
                                <span style={{ color: ratingColor(e.rating), fontWeight: 800, fontSize: 14 }}>
                                  {'★'.repeat(e.rating)}{'☆'.repeat(5 - e.rating)}
                                </span>
                                <span style={{ fontSize: 11, color: '#888' }}>{formatDate(e.createdAt)}</span>
                                <span style={{ fontSize: 10, color: '#bbb', fontFamily: 'monospace' }}>
                                  {e.platform} {e.appVersion}
                                </span>
                              </div>
                              <p style={S.commentText}>"{e.comment}"</p>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* ── All ratings list ── */}
                  <div style={{ marginTop: 20 }}>
                    <div style={S.colTitle}>Всі оцінки (без коментаря)</div>
                    <div style={S.allRatingsRow}>
                      {analytics.entries
                        .filter(e => !e.comment?.trim())
                        .slice(0, 40)
                        .map((e, i) => (
                          <div key={i} style={{ ...S.ratingChip, borderColor: ratingColor(e.rating), color: ratingColor(e.rating) }}>
                            {'★'.repeat(e.rating)} · {formatDate(e.createdAt)}
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              ) : (
                <div style={S.empty}>Немає даних</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:        { padding: '24px 28px', maxWidth: 1100 },
  h2:          { fontSize: 22, fontWeight: 800, marginBottom: 4, color: '#2c2c2c' },
  h3:          { fontSize: 17, fontWeight: 800, marginBottom: 16, color: '#333', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  subtitle:    { fontSize: 13, color: '#999', marginBottom: 20 },
  card:        { background: '#fff', borderRadius: 14, border: '1px solid #e8e0d4', overflow: 'hidden', marginBottom: 20 },
  table:       { width: '100%', borderCollapse: 'collapse' },
  th:          { padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #f0e8db', textAlign: 'left', whiteSpace: 'nowrap' },
  tr:          { borderBottom: '1px solid #f6f0e8', transition: 'background 0.12s' },
  td:          { padding: '11px 14px', fontSize: 14, color: '#333', verticalAlign: 'middle' },
  code:        { marginLeft: 8, fontSize: 10, color: '#ccc', fontFamily: 'monospace' },

  metricsRow:  { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  pill:        { background: '#fff', border: '1px solid #e8e0d4', borderRadius: 12, padding: '12px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 110, gap: 2 },
  pillIcon:    { fontSize: 18 },
  pillValue:   { fontSize: 24, fontWeight: 800, lineHeight: 1.2 },
  pillLabel:   { fontSize: 11, color: '#999', fontWeight: 600, textAlign: 'center' },

  detail:      { background: '#fff', borderRadius: 14, border: '1px solid #e8e0d4', padding: '20px 24px', marginBottom: 20 },

  twoCol:      { display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 16 },
  colCard:     { flex: 1, minWidth: 260, background: '#faf6ee', border: '1px solid #f0e8db', borderRadius: 12, padding: '16px 18px' },
  colTitle:    { fontSize: 13, fontWeight: 800, color: '#888', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 },

  starBreakdown: { display: 'flex', flexDirection: 'column', gap: 8 },
  starRow:       { display: 'flex', alignItems: 'center', gap: 8 },
  starLabel:     { width: 60, fontSize: 14, fontWeight: 700, textAlign: 'right', letterSpacing: 1 },
  barBg:         { flex: 1, height: 10, background: '#e8e0d4', borderRadius: 5, overflow: 'hidden' },
  barFill:       { height: '100%', borderRadius: 5, transition: 'width 0.4s' },
  starCount:     { width: 28, fontSize: 13, fontWeight: 700, color: '#555', textAlign: 'right' },
  starPct:       { width: 36, fontSize: 12, color: '#aaa', textAlign: 'right' },

  starSummaryRow:  { display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  starSummaryItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fff', borderRadius: 10, padding: '8px 12px', border: '1px solid #f0e8db', minWidth: 60 },

  chartEmpty: { padding: 24, textAlign: 'center', color: '#ccc', fontSize: 13 },

  commentGrid:   { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginTop: 8 },
  commentCard:   { background: '#faf6ee', border: '1px solid #f0e8db', borderRadius: 10, padding: '12px 14px' },
  commentHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  commentText:   { fontSize: 13, color: '#555', margin: 0, lineHeight: 1.55, fontStyle: 'italic' },

  allRatingsRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  ratingChip:    { fontSize: 11, border: '1px solid', borderRadius: 20, padding: '3px 10px', fontWeight: 600 },

  loading: { padding: 40, textAlign: 'center', color: '#aaa', fontSize: 15 },
  empty:   { padding: 32, textAlign: 'center', color: '#ccc', fontSize: 14 },
  errorBox: { padding: 32, textAlign: 'center', color: '#d32f2f' },
  btn:     { marginTop: 12, padding: '8px 20px', border: '1px solid #d32f2f', borderRadius: 8, background: 'transparent', color: '#d32f2f', cursor: 'pointer', fontWeight: 700 },
};

import type { AuditStatusData, AuditHistoryEntry } from '../services/aiDiagnosticsService';

type Props = {
  current: AuditStatusData;
  history: AuditHistoryEntry[];
};

const formatDate = (ts: number) => {
  try { return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return '?'; }
};

const scoreColor = (score: number) => {
  if (score >= 80) return '#0f6a36';
  if (score >= 60) return '#b47f16';
  if (score >= 40) return '#e65100';
  return '#c62828';
};

type SevRow = { key: 'critical' | 'high' | 'medium' | 'low'; label: string; sevClass: string };

const ROWS: SevRow[] = [
  { key: 'critical', label: 'CRITICAL', sevClass: 'CRITICAL' },
  { key: 'high',     label: 'HIGH',     sevClass: 'HIGH'     },
  { key: 'medium',   label: 'MEDIUM',   sevClass: 'MEDIUM'   },
  { key: 'low',      label: 'LOW',      sevClass: 'LOW'      },
];

const Delta = ({ prev, curr }: { prev: number; curr: number }) => {
  const diff = curr - prev;
  if (diff === 0) return <span style={{ color: '#8a9ab0', fontSize: 12 }}>= 0</span>;
  const better = diff < 0;
  return (
    <span style={{ color: better ? '#0f6a36' : '#c62828', fontWeight: 700, fontSize: 12 }}>
      {better ? '▼' : '▲'} {better ? '' : '+'}{diff}
    </span>
  );
};

export const TrendSection = ({ current, history }: Props) => {
  const prev    = history.length >= 2 ? history[1] : history.length === 1 ? history[0] : null;
  const hasPrev = prev != null && current.severityCounts != null;

  if (!current.severityCounts) return null;

  return (
    <div className="diagTrendCard">
      <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: '#25324a' }}>
        Тренд аудитов
      </h3>

      {/* Header */}
      <div className="diagTrendHeader">
        <span>Severity</span>
        <span>{hasPrev ? `Пред. (${formatDate(prev!.completedAt)})` : 'Предыдущий'}</span>
        <span>Текущий{current.completedAt ? ` (${formatDate(current.completedAt)})` : ''}</span>
        <span>Δ</span>
      </div>

      {/* Rows */}
      {ROWS.map(({ key, label, sevClass }) => {
        const curr    = current.severityCounts![key] ?? 0;
        const prevVal = hasPrev ? (prev!.severityCounts[key] ?? 0) : null;
        return (
          <div key={key} className="diagTrendGrid">
            <span>
              <span className={`sevBadge ${sevClass}`}>{label}</span>
            </span>
            <span style={{ textAlign: 'right', fontSize: 14, color: '#8a9ab0' }}>
              {prevVal !== null ? prevVal : '—'}
            </span>
            <span style={{ textAlign: 'right', fontSize: 15, fontWeight: 800, color: scoreColor(100 - curr * 5) }}>
              {curr}
            </span>
            <div style={{ textAlign: 'right' }}>
              {prevVal !== null
                ? <Delta prev={prevVal} curr={curr} />
                : <span style={{ color: '#8a9ab0', fontSize: 12 }}>—</span>}
            </div>
          </div>
        );
      })}

      {/* Health Score row */}
      {current.healthScore != null && (
        <div className="diagTrendGrid" style={{ borderTop: '2px solid #d6e2f4', marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#25324a' }}>Health Score</span>
          <span style={{ textAlign: 'right', fontSize: 14, color: '#8a9ab0' }}>
            {hasPrev ? `${prev!.healthScore}/100` : '—'}
          </span>
          <span style={{ textAlign: 'right', fontSize: 16, fontWeight: 900, color: scoreColor(current.healthScore) }}>
            {current.healthScore}/100
          </span>
          <div style={{ textAlign: 'right' }}>
            {hasPrev
              ? <Delta prev={prev!.healthScore} curr={current.healthScore} />
              : <span style={{ color: '#8a9ab0', fontSize: 12 }}>—</span>}
          </div>
        </div>
      )}

      {!hasPrev && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#8a9ab0', fontStyle: 'italic' }}>
          Данные предыдущего аудита появятся после второго запуска.
        </p>
      )}
    </div>
  );
};

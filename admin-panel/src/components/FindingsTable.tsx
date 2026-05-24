import { useState, useMemo } from 'react';
import type { FindingRecord } from '../services/aiDiagnosticsService';

type Props = { findings: FindingRecord[] };

const SEV_CONFIG: Record<string, { bg: string; color: string; order: number }> = {
  CRITICAL: { bg: '#fce4ec', color: '#c62828', order: 0 },
  HIGH:     { bg: '#fff3e0', color: '#e65100', order: 1 },
  MEDIUM:   { bg: '#fff8e1', color: '#f57f17', order: 2 },
  LOW:      { bg: '#e3f2fd', color: '#1565c0', order: 3 },
  INFO:     { bg: '#f5f5f5', color: '#757575', order: 4 },
};

const VERIFIED_BADGE = { bg: '#e8f5e9', color: '#2e7d32', label: 'VERIFIED' };
const HEURISTIC_BADGE = { bg: '#fff8e1', color: '#e65100', label: 'HEURISTIC' };

const shortenFile = (file: string) => file.replace(/^.*?(src\/|admin-panel\/src\/|functions\/|scripts\/)/, '$1');

export const FindingsTable = ({ findings }: Props) => {
  const [viewMode, setViewMode] = useState<'bugs' | 'all'>('bugs');
  const [filterSev, setFilterSev] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterRule, setFilterRule] = useState('');
  const [filterFile, setFilterFile] = useState('');
  const [filterContext, setFilterContext] = useState<'production' | 'all'>('production');
  const [groupBy, setGroupBy] = useState<'severity' | 'file' | 'rule'>('severity');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const allRules = useMemo(() => {
    const s = new Set(findings.map(f => f.rule));
    return Array.from(s).sort();
  }, [findings]);

  const bugsCount = useMemo(
    () => findings.filter(f => f.verified === true && f.context === 'production').length,
    [findings]
  );

  const prodCount = useMemo(() => findings.filter(f => f.context === 'production').length, [findings]);
  const nonProdCount = findings.length - prodCount;

  const filtered = useMemo(() => {
    const baseFilter = (f: FindingRecord) => {
      if (filterSev && f.severity !== filterSev) return false;
      if (filterRule && f.rule !== filterRule) return false;
      if (filterFile && !f.file.toLowerCase().includes(filterFile.toLowerCase())) return false;
      return true;
    };
    if (viewMode === 'bugs') {
      return findings.filter(f => f.verified === true && f.context === 'production' && baseFilter(f));
    }
    return findings.filter(f => {
      if (filterContext === 'production' && f.context !== 'production') return false;
      if (filterClass === 'VERIFIED' && !f.verified) return false;
      if (filterClass === 'HEURISTIC' && f.verified) return false;
      return baseFilter(f);
    });
  }, [findings, viewMode, filterContext, filterSev, filterClass, filterRule, filterFile]);

  const grouped = useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    for (const f of filtered) {
      const key = groupBy === 'severity' ? f.severity
        : groupBy === 'file' ? shortenFile(f.file)
        : f.rule;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    const entries = Array.from(map.entries());
    if (groupBy === 'severity') {
      entries.sort((a, b) => (SEV_CONFIG[a[0]]?.order ?? 9) - (SEV_CONFIG[b[0]]?.order ?? 9));
    } else {
      entries.sort((a, b) => b[1].length - a[1].length);
    }
    return entries;
  }, [filtered, groupBy]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (findings.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: '#9e9e9e', fontSize: 14 }}>
        Нет данных. Запустите аудит, чтобы получить список findings.
      </div>
    );
  }

  return (
    <div>
      {/* Bugs / All toggle */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 6, border: '1px solid #e0e0e0', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
        <button onClick={() => setViewMode('bugs')}
          style={{
            padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: viewMode === 'bugs' ? '#2e7d32' : '#fff',
            color: viewMode === 'bugs' ? '#fff' : '#5d6f8b',
          }}>
          Реальные баги ({bugsCount})
        </button>
        <button onClick={() => setViewMode('all')}
          style={{
            padding: '7px 16px', border: 'none', borderLeft: '1px solid #e0e0e0', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: viewMode === 'all' ? '#24618e' : '#fff',
            color: viewMode === 'all' ? '#fff' : '#5d6f8b',
          }}>
          Все findings ({findings.length})
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#5d6f8b', marginBottom: 14, fontStyle: 'italic' }}>
        Реальные баги = VERIFIED (structurally confirmed, low false-positive rate) + Production context only
      </div>

      {/* Filters (hidden in bugs mode for filterClass, production/all toggle hidden in bugs mode) */}
      {viewMode === 'all' && (
        <>
          <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '1px solid #e0e0e0', borderRadius: 6, overflow: 'hidden', width: 'fit-content' }}>
            <button onClick={() => setFilterContext('production')}
              style={{
                padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: filterContext === 'production' ? '#24618e' : '#fff',
                color: filterContext === 'production' ? '#fff' : '#5d6f8b',
              }}>
              Production ({prodCount})
            </button>
            <button onClick={() => setFilterContext('all')}
              style={{
                padding: '7px 16px', border: 'none', borderLeft: '1px solid #e0e0e0', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: filterContext === 'all' ? '#24618e' : '#fff',
                color: filterContext === 'all' ? '#fff' : '#5d6f8b',
              }}>
              Все ({findings.length})
              {nonProdCount > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>+{nonProdCount} тесты/тулинг</span>
              )}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12 }}>
              <option value="">Все severity</option>
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12 }}>
              <option value="">Все типы</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="HEURISTIC">HEURISTIC</option>
            </select>
            <select value={filterRule} onChange={e => setFilterRule(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, maxWidth: 200 }}>
              <option value="">Все правила</option>
              {allRules.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <input type="text" placeholder="Фильтр по файлу..." value={filterFile}
              onChange={e => setFilterFile(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, width: 180 }} />

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(['severity', 'file', 'rule'] as const).map(g => (
                <button key={g} onClick={() => setGroupBy(g)}
                  style={{
                    padding: '4px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12,
                    background: groupBy === g ? '#24618e' : '#fff',
                    color: groupBy === g ? '#fff' : '#333', cursor: 'pointer',
                  }}>
                  По {g === 'severity' ? 'типу' : g === 'file' ? 'файлу' : 'правилу'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === 'bugs' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
          <select value={filterSev} onChange={e => setFilterSev(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12 }}>
            <option value="">Все severity</option>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={filterRule} onChange={e => setFilterRule(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, maxWidth: 200 }}>
            <option value="">Все правила</option>
            {allRules.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="text" placeholder="Фильтр по файлу..." value={filterFile}
            onChange={e => setFilterFile(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12, width: 180 }} />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {(['severity', 'file', 'rule'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                style={{
                  padding: '4px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 12,
                  background: groupBy === g ? '#2e7d32' : '#fff',
                  color: groupBy === g ? '#fff' : '#333', cursor: 'pointer',
                }}>
                По {g === 'severity' ? 'типу' : g === 'file' ? 'файлу' : 'правилу'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#5d6f8b', marginBottom: 10 }}>
        Показано: {filtered.length} из {findings.length} findings
      </div>

      {/* Grouped list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {grouped.map(([groupKey, items]) => {
          const isExpanded = expandedGroups.has(groupKey);
          const sevCfg = SEV_CONFIG[groupKey];
          const headerBg = viewMode === 'bugs'
            ? (sevCfg ? sevCfg.bg : '#e8f5e9')
            : (sevCfg ? sevCfg.bg : '#f5f5f5');
          return (
            <div key={groupKey} style={{ border: `1px solid ${viewMode === 'bugs' ? '#a5d6a7' : '#e0e0e0'}`, borderRadius: 6, overflow: 'hidden' }}>
              {/* Group header */}
              <button onClick={() => toggleGroup(groupKey)}
                style={{
                  width: '100%', padding: '8px 12px', background: headerBg,
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: sevCfg ? sevCfg.color : '#333' }}>
                    {groupBy === 'file' ? `📁 ${groupKey}` : groupKey}
                  </span>
                  {viewMode === 'bugs' && (
                    <span style={{
                      padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 800,
                      background: '#2e7d32', color: '#fff',
                    }}>VERIFIED</span>
                  )}
                </span>
                <span style={{ fontSize: 12, color: '#5d6f8b' }}>
                  {items.length} findings {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {/* Finding rows */}
              {isExpanded && (
                <div>
                  {items.map((f, idx) => {
                    const sev = SEV_CONFIG[f.severity] || SEV_CONFIG.INFO;
                    const cls = f.verified ? VERIFIED_BADGE : HEURISTIC_BADGE;
                    return (
                      <div key={idx} style={{
                        padding: '8px 12px', borderTop: '1px solid #f0f0f0',
                        display: 'grid', gap: 4,
                        gridTemplateColumns: 'auto 1fr',
                        background: idx % 2 === 0 ? '#fff' : '#fafafa',
                      }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap', gridColumn: '1 / -1' }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: 3, fontSize: 11, fontWeight: 800,
                            background: sev.bg, color: sev.color,
                          }}>{f.severity}</span>
                          <span style={{
                            padding: '2px 7px', borderRadius: 3, fontSize: 11, fontWeight: 700,
                            background: cls.bg, color: cls.color,
                          }}>{cls.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>{f.rule}</span>
                          <span style={{ fontSize: 11, color: '#9e9e9e', marginLeft: 'auto' }}>
                            [{f.scanner}]
                          </span>
                        </div>
                        <div style={{ gridColumn: '1 / -1', fontFamily: 'monospace', fontSize: 12, color: '#24618e' }}>
                          {shortenFile(f.file)}{f.line ? `:${f.line}` : ''}
                        </div>
                        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#555', lineHeight: 1.4 }}>
                          {f.why}
                        </div>
                        {f.suggestion && (
                          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#2e7d32', fontStyle: 'italic' }}>
                            Совет: {f.suggestion}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

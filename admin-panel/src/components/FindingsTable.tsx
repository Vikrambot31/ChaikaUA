import { useState, useMemo } from 'react';
import type { FindingRecord } from '../services/aiDiagnosticsService';

type Props = { findings: FindingRecord[] };

const SEV_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4,
};

const shortenFile = (file: string) =>
  file.replace(/^.*?(src\/|admin-panel\/src\/|functions\/|scripts\/)/, '$1');

export const FindingsTable = ({ findings }: Props) => {
  const [viewMode,      setViewMode]      = useState<'bugs' | 'all'>('bugs');
  const [filterSev,     setFilterSev]     = useState('');
  const [filterClass,   setFilterClass]   = useState('');
  const [filterRule,    setFilterRule]    = useState('');
  const [filterFile,    setFilterFile]    = useState('');
  const [filterContext, setFilterContext] = useState<'production' | 'all'>('production');
  const [groupBy,       setGroupBy]       = useState<'severity' | 'file' | 'rule'>('severity');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const allRules = useMemo(() => {
    const s = new Set(findings.map(f => f.rule));
    return Array.from(s).sort();
  }, [findings]);

  const bugsCount  = useMemo(
    () => findings.filter(f => f.verified && f.context === 'production').length,
    [findings],
  );
  const prodCount    = useMemo(() => findings.filter(f => f.context === 'production').length, [findings]);
  const nonProdCount = findings.length - prodCount;

  const filtered = useMemo(() => {
    const base = (f: FindingRecord) => {
      if (filterSev  && f.severity !== filterSev)                                return false;
      if (filterRule && f.rule     !== filterRule)                               return false;
      if (filterFile && !f.file.toLowerCase().includes(filterFile.toLowerCase())) return false;
      return true;
    };
    if (viewMode === 'bugs') {
      return findings.filter(f => f.verified && f.context === 'production' && base(f));
    }
    return findings.filter(f => {
      if (filterContext === 'production' && f.context !== 'production') return false;
      if (filterClass   === 'VERIFIED'   && !f.verified)                return false;
      if (filterClass   === 'HEURISTIC'  &&  f.verified)                return false;
      return base(f);
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
      entries.sort((a, b) => (SEV_ORDER[a[0]] ?? 9) - (SEV_ORDER[b[0]] ?? 9));
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
      <div className="diagEmpty">
        Нет данных. Запустите аудит, чтобы получить список findings.
      </div>
    );
  }

  const isBugs = viewMode === 'bugs';

  return (
    <div>
      {/* ── View toggle ── */}
      <div className="diagFindingsHeader">
        <div className="diagFindingsTabs">
          <button
            className={`diagFindingsTab ${isBugs ? 'active bugs' : ''}`}
            onClick={() => setViewMode('bugs')}
          >
            Реальные баги ({bugsCount})
          </button>
          <button
            className={`diagFindingsTab ${!isBugs ? 'active all' : ''}`}
            onClick={() => setViewMode('all')}
          >
            Все findings ({findings.length})
          </button>
        </div>
        <p className="diagFindingsMeta">
          Реальные баги = VERIFIED · structurally confirmed · production only
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="diagFilters" style={{ marginTop: 14 }}>
        {/* Context toggle (only in "all" mode) */}
        {!isBugs && (
          <div className="diagFindingsTabs">
            <button
              className={`diagFindingsTab ${filterContext === 'production' ? 'active all' : ''}`}
              onClick={() => setFilterContext('production')}
            >
              Production ({prodCount})
            </button>
            <button
              className={`diagFindingsTab ${filterContext === 'all' ? 'active all' : ''}`}
              onClick={() => setFilterContext('all')}
            >
              Все ({findings.length})
              {nonProdCount > 0 && (
                <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.65 }}>+{nonProdCount}</span>
              )}
            </button>
          </div>
        )}

        <select
          className="diagFilterSelect"
          value={filterSev}
          onChange={e => setFilterSev(e.target.value)}
        >
          <option value="">Все severity</option>
          {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {!isBugs && (
          <select
            className="diagFilterSelect"
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
          >
            <option value="">Все типы</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="HEURISTIC">HEURISTIC</option>
          </select>
        )}

        <select
          className="diagFilterSelect"
          value={filterRule}
          onChange={e => setFilterRule(e.target.value)}
          style={{ maxWidth: 190 }}
        >
          <option value="">Все правила</option>
          {allRules.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <input
          className="diagFilterInput"
          type="text"
          placeholder="Фильтр по файлу…"
          value={filterFile}
          onChange={e => setFilterFile(e.target.value)}
          style={{ width: 180 }}
        />

        <div className="diagGroupBy">
          {(['severity', 'file', 'rule'] as const).map(g => (
            <button
              key={g}
              className={`diagGroupByBtn ${groupBy === g ? (isBugs ? 'active bugs' : 'active') : ''}`}
              onClick={() => setGroupBy(g)}
            >
              По {g === 'severity' ? 'типу' : g === 'file' ? 'файлу' : 'правилу'}
            </button>
          ))}
        </div>
      </div>

      <p className="diagFindingsCount">
        Показано: {filtered.length} из {findings.length} findings
      </p>

      {/* ── Grouped list ── */}
      <div>
        {grouped.map(([groupKey, items]) => {
          const isExpanded = expandedGroups.has(groupKey);
          return (
            <div key={groupKey} className="diagFindingGroup">
              <button
                className={`diagFindingGroupHeader ${isBugs ? 'bugs' : ''}`}
                onClick={() => toggleGroup(groupKey)}
              >
                <span className="diagFindingGroupKey">
                  {groupBy === 'file'
                    ? <><span>📁</span> <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{groupKey}</span></>
                    : <><span className={`sevBadge ${groupKey}`}>{groupKey}</span></>
                  }
                  {isBugs && (
                    <span className="classTag verified">VERIFIED</span>
                  )}
                </span>
                <span className="diagFindingGroupCount">
                  {items.length} findings {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div>
                  {items.map((f, idx) => (
                    <div key={idx} className="diagFindingRow">
                      <div className="diagFindingMeta">
                        <span className={`sevBadge ${f.severity}`}>{f.severity}</span>
                        <span className={`classTag ${f.verified ? 'verified' : 'heuristic'}`}>
                          {f.verified ? 'VERIFIED' : 'HEURISTIC'}
                        </span>
                        <span className="diagFindingRule">{f.rule}</span>
                        <span className="diagFindingScanner">[{f.scanner}]</span>
                      </div>
                      <div className="diagFindingFile">
                        {shortenFile(f.file)}{f.line ? `:${f.line}` : ''}
                      </div>
                      <div className="diagFindingWhy">{f.why}</div>
                      {f.suggestion && (
                        <div className="diagFindingHint">Совет: {f.suggestion}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {grouped.length === 0 && (
          <div className="diagEmpty">Нет findings, соответствующих фильтрам</div>
        )}
      </div>
    </div>
  );
};

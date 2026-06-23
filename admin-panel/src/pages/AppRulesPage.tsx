import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppRulesZonePanel } from '../components/app-rules/AppRulesZonePanel';
import { AppRulesToolbar, type AppRulesViewMode } from '../components/app-rules/AppRulesToolbar';
import {
  buildZoneGroups,
  generateAppRulesSnapshot,
  loadCachedAppRulesSnapshot,
  sanitizeSnapshotForExport,
  snapshotToMarkdown,
} from '../services/appRules/appRulesService';
import type { AppRuleRisk, AppRuleStatus, AppRulesSnapshot, AppRulesZoneGroup } from '../types/appRules';
import type { SecurityRole } from '../services/authService';
import { useViewMode } from '../contexts/ViewModeContext';

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

const downloadText = (fileName: string, text: string, type: string): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const filterZoneGroup = (
  group: AppRulesZoneGroup,
  search: string,
  statusFilter: AppRuleStatus | 'all',
  riskFilter: AppRuleRisk | 'all',
  viewMode: AppRulesViewMode,
): AppRulesZoneGroup => {
  const query = search.trim().toLowerCase();
  const items = group.items.filter((item) => {
    const matchesSearch = !query || [
      item.category,
      item.name,
      item.status,
      item.risk,
      item.actualValue,
      item.explanation,
      item.evidence,
      item.source?.path,
      (item.tags ?? []).join(' '),
      item.designLabel ?? '',
    ].join(' ').toLowerCase().includes(query);

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesRisk = riskFilter === 'all' || item.risk === riskFilter;

    // In "problems" mode, reference zone only shows non-info/non-active items
    // Action and monitor zones always show their items (they ARE the problems)
    const matchesMode =
      viewMode === 'all' ||
      group.zone === 'action' ||
      group.zone === 'monitor' ||
      (item.status !== 'active' && item.status !== 'info');

    return matchesSearch && matchesStatus && matchesRisk && matchesMode;
  });

  const actionCount =
    group.zone === 'action'
      ? items.length
      : items.filter((item) => item.status === 'warning' || item.status === 'missing').length;

  return { ...group, items, actionCount };
};

type AppRulesPageProps = {
  role: SecurityRole;
};

const AppRulesContent = () => {
  const { viewMode: adminViewMode } = useViewMode();
  const isSimpleMode = adminViewMode === 'simple';
  const [snapshot, setSnapshot] = useState<AppRulesSnapshot | null>(() => loadCachedAppRulesSnapshot());
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppRuleStatus | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<AppRuleRisk | 'all'>('all');
  const [rulesViewMode, setRulesViewMode] = useState<AppRulesViewMode>('problems');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setMessage(null);
    try {
      const next = await generateAppRulesSnapshot();
      setSnapshot(next);
      setMessage(next.syncStatus === 'ready'
        ? 'Серверні правила оновлено з актуальних джерел.'
        : 'Серверні правила оновлено, але частина runtime-конфігів недоступна.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не вдалося оновити серверні правила.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  // Use zones from snapshot, or build them on the fly if cache is pre-v2
  const rawZones = useMemo(
    () => snapshot?.zones ?? buildZoneGroups(snapshot?.sections.flatMap((s) => s.items) ?? []),
    [snapshot],
  );

  const filteredZones = useMemo(
    () => rawZones.map((group) => filterZoneGroup(group, search, statusFilter, riskFilter, rulesViewMode)),
    [rawZones, search, statusFilter, riskFilter, rulesViewMode],
  );

  const actionZone = useMemo(() => filteredZones.find((g) => g.zone === 'action'), [filteredZones]);
  const monitorZone = useMemo(() => filteredZones.find((g) => g.zone === 'monitor'), [filteredZones]);
  const referenceZone = useMemo(() => filteredZones.find((g) => g.zone === 'reference'), [filteredZones]);

  const totalItems = useMemo(
    () => rawZones.reduce((sum, g) => sum + g.items.length, 0),
    [rawZones],
  );
  const filteredCount = useMemo(
    () => filteredZones.reduce((sum, g) => sum + g.items.length, 0),
    [filteredZones],
  );

  useEffect(() => {
    if (!isSimpleMode) return;
    setStatusFilter('all');
    setRiskFilter('all');
    setRulesViewMode('problems');
  }, [isSimpleMode]);

  const exportJson = () => {
    if (!snapshot) return;
    downloadText(
      `chaika-app-rules-${new Date(snapshot.generatedAt).toISOString().slice(0, 10)}.json`,
      JSON.stringify(sanitizeSnapshotForExport(snapshot), null, 2),
      'application/json;charset=utf-8',
    );
  };

  const exportMarkdown = () => {
    if (!snapshot) return;
    downloadText(
      `chaika-app-rules-${new Date(snapshot.generatedAt).toISOString().slice(0, 10)}.md`,
      snapshotToMarkdown(snapshot),
      'text/markdown;charset=utf-8',
    );
  };

  return (
    <section className="appRulesPage">
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Жива документація</p>
          <h2>Серверні правила та діагностика</h2>
          {!isSimpleMode && (
          <p className="appRulesLead">
            Правила розділені на 3 зони: що потребує дії прямо зараз, що потрібно моніторити,
            і що працює за задумом архітектури (не потребує уваги).
          </p>
          )}
        </div>
        <span className={snapshot?.syncStatus === 'ready' ? 'status active' : 'status warning'}>
          {snapshot?.syncStatus === 'ready' ? 'СИНХРОНІЗОВАНО' : refreshing ? 'ОНОВЛЕННЯ' : 'ЧАСТКОВІ ДАНІ'}
        </span>
      </div>

      {message ? <p className="infoMessage">{message}</p> : null}
      {snapshot?.runtime?.errors?.length ? (
        <div className="appRulesWarning">
          <strong>Runtime-конфіги прочитані не повністю</strong>
          <span>{snapshot.runtime.errors.join('; ')}</span>
        </div>
      ) : null}

      {/* Zone stats — 3 clear numbers */}
      <div className="statsGrid appRulesStats">
        <article className={`metric ${(actionZone?.actionCount ?? 0) > 0 ? 'metric-danger' : 'metric-primary'}`}>
          <span>🔴 Потрібна дія</span>
          <strong>{actionZone?.items.length ?? 0}</strong>
        </article>
        <article className={`metric ${(monitorZone?.actionCount ?? 0) > 0 ? 'metric-warning' : 'metric-primary'}`}>
          <span>🟡 Моніторинг</span>
          <strong>{monitorZone?.items.length ?? 0}</strong>
        </article>
        {!isSimpleMode && (
        <article className="metric metric-primary">
          <span>📋 Архітектура</span>
          <strong>{referenceZone?.items.length ?? 0}</strong>
        </article>
        )}
        {!isSimpleMode && (
        <article className="metric metric-primary">
          <span>Всього правил</span>
          <strong>{totalItems}</strong>
        </article>
        )}
      </div>

      <AppRulesToolbar
        snapshot={snapshot}
        search={search}
        statusFilter={statusFilter}
        riskFilter={riskFilter}
        viewMode={rulesViewMode}
        refreshing={refreshing}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
        onRiskFilterChange={setRiskFilter}
        onViewModeChange={setRulesViewMode}
        compact={isSimpleMode}
        onRefresh={() => void refresh()}
        onExportJson={exportJson}
        onExportMarkdown={exportMarkdown}
      />

      {!isSimpleMode && (
      <div className="appRulesSyncMeta">
        <span>Оновлено: {snapshot ? new Date(snapshot.generatedAt).toLocaleString() : 'завантаження...'}</span>
        <span>Авто-оновлення: кожні {Math.round(REFRESH_INTERVAL_MS / 60000)} хв.</span>
        <span>Показано: {filteredCount} з {totalItems}</span>
        <span>Джерел: {snapshot?.sources?.length ?? 0}</span>
      </div>
      )}

      {/* 3 Zone panels */}
      <div className="appRulesZones">
        {actionZone ? (
          <AppRulesZonePanel group={actionZone} updatedAt={snapshot?.generatedAt ?? null} search={search} />
        ) : null}
        {monitorZone ? (
          <AppRulesZonePanel group={monitorZone} updatedAt={snapshot?.generatedAt ?? null} search={search} />
        ) : null}
        {!isSimpleMode && referenceZone ? (
          <AppRulesZonePanel group={referenceZone} updatedAt={snapshot?.generatedAt ?? null} search={search} />
        ) : null}
      </div>
    </section>
  );
};

export const AppRulesPage = ({ role }: AppRulesPageProps) => {
  if (role !== 'admin' && role !== 'moderator') {
    return (
      <section className="appRulesPage">
        <div className="appRulesWarning">
          <strong>Доступ заборонено</strong>
          <span>Карта серверних правил доступна лише адміністраторам і модераторам.</span>
        </div>
      </section>
    );
  }

  return <AppRulesContent />;
};

export default AppRulesPage;

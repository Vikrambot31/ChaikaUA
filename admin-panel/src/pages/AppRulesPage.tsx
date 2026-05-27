import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppRulesSectionTable } from '../components/app-rules/AppRulesSectionTable';
import { AppRulesToolbar, type AppRulesViewMode } from '../components/app-rules/AppRulesToolbar';
import {
  generateAppRulesSnapshot,
  loadCachedAppRulesSnapshot,
  sanitizeSnapshotForExport,
  snapshotToMarkdown,
} from '../services/appRules/appRulesService';
import type { AppRuleRisk, AppRuleStatus, AppRulesSection, AppRulesSnapshot } from '../types/appRules';
import type { SecurityRole } from '../services/authService';

const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

const riskLabel: Record<AppRuleRisk, string> = {
  critical: 'Критический риск',
  high: 'Высокий риск',
  medium: 'Средний риск',
  low: 'Низкий риск',
};

const downloadText = (fileName: string, text: string, type: string): void => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

const isRealProblem = (item: { status: AppRuleStatus; risk: AppRuleRisk }): boolean =>
  item.status === 'critical' ||
  item.status === 'warning' ||
  item.risk === 'critical' ||
  item.risk === 'high' ||
  (item.status === 'missing' && item.risk !== 'low');

const filterSection = (
  section: AppRulesSection,
  search: string,
  statusFilter: AppRuleStatus | 'all',
  riskFilter: AppRuleRisk | 'all',
  viewMode: AppRulesViewMode,
): AppRulesSection => {
  const query = search.trim().toLowerCase();
  const items = (section.items ?? []).filter((item) => {
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
    ].join(' ').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesRisk = riskFilter === 'all' || item.risk === riskFilter;
    const matchesMode = viewMode === 'all' || isRealProblem(item);
    return matchesSearch && matchesStatus && matchesRisk && matchesMode;
  });

  return { ...section, items };
};

type AppRulesPageProps = {
  role: SecurityRole;
};

const AppRulesContent = () => {
  const [snapshot, setSnapshot] = useState<AppRulesSnapshot | null>(() => loadCachedAppRulesSnapshot());
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppRuleStatus | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<AppRuleRisk | 'all'>('all');
  const [viewMode, setViewMode] = useState<AppRulesViewMode>('problems');

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

  const filteredSections = useMemo(
    () => snapshot?.sections.map((section) => filterSection(section, search, statusFilter, riskFilter, viewMode)) ?? [],
    [riskFilter, search, snapshot, statusFilter, viewMode],
  );

  const allItems = useMemo(
    () => snapshot?.sections.flatMap((section) => section.items) ?? [],
    [snapshot],
  );

  const filteredItems = useMemo(
    () => filteredSections.flatMap((section) => section.items),
    [filteredSections],
  );

  const visibleSections = useMemo(
    () => filteredSections.filter((section) => section.items.length > 0 || (section.id === 'photos' && Boolean(section.pipeline?.length))),
    [filteredSections],
  );

  const topRiskItems = useMemo(
    () => filteredItems.filter((item) => item.risk === 'critical' || item.risk === 'high' || item.status === 'warning').slice(0, 6),
    [filteredItems],
  );

  const problemItems = useMemo(
    () => allItems.filter(isRealProblem),
    [allItems],
  );

  const stats = useMemo(() => ({
    total: allItems.length,
    problems: problemItems.length,
    critical: problemItems.filter((item) => item.status === 'critical' || item.risk === 'critical').length,
    high: problemItems.filter((item) => item.risk === 'high').length,
    warnings: problemItems.filter((item) => item.status === 'warning').length,
  }), [allItems.length, problemItems]);

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
    const visibleSnapshot: AppRulesSnapshot = {
      ...snapshot,
      sections: filteredSections,
      warnings: filteredItems.filter(isRealProblem),
    };
    downloadText(
      `chaika-app-rules-${new Date(snapshot.generatedAt).toISOString().slice(0, 10)}.md`,
      snapshotToMarkdown(visibleSnapshot),
      'text/markdown;charset=utf-8',
    );
  };

  return (
    <section className="appRulesPage">
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Жива документація</p>
          <h2>Діагностика серверних правил</h2>
          <p className="appRulesLead">
            За замовчуванням показані лише реальні проблеми. Повний список правил доступний через перемикач режиму.
          </p>
        </div>
        <span className={snapshot?.syncStatus === 'ready' ? 'status active' : 'status warning'}>
          {snapshot?.syncStatus === 'ready' ? 'СИНХРОНИЗИРОВАНО' : refreshing ? 'ОБНОВЛЕНИЕ' : 'ЕСТЬ ПРЕДУПРЕЖДЕНИЯ'}
        </span>
      </div>

      {message ? <p className="infoMessage">{message}</p> : null}
      {snapshot?.runtime?.errors?.length ? (
        <div className="appRulesWarning">
          <strong>Runtime-конфіги прочитані не повністю</strong>
          <span>{snapshot.runtime.errors.join('; ')}</span>
        </div>
      ) : null}

      <div className="statsGrid appRulesStats">
        <article className="metric metric-primary"><span>Реальних проблем</span><strong>{stats.problems}</strong></article>
        <article className="metric metric-danger"><span>Критично</span><strong>{stats.critical}</strong></article>
        <article className="metric metric-warning"><span>High risk</span><strong>{stats.high}</strong></article>
        <article className="metric metric-violet"><span>Warnings</span><strong>{stats.warnings}</strong></article>
      </div>

      <section className="appRulesRiskBoard" aria-label="Самые критические риски">
        <div className="appRulesRiskBoardHeader">
          <span>Приоритет проверки</span>
          <strong>{problemItems.length ? 'Спочатку реальні проблеми' : 'Реальних проблем не знайдено'}</strong>
        </div>
        <div className="appRulesRiskList">
          {topRiskItems.map((item) => (
            <article key={item.id} className={`appRulesRiskCard risk-${item.risk}`}>
              <span>{riskLabel[item.risk]}</span>
              <strong>{item.name}</strong>
              <small>{item.category} · {item.source.path}</small>
            </article>
          ))}
          {!topRiskItems.length ? (
            <article className="appRulesRiskCard risk-low">
              <span>Диагностика чистая</span>
              <strong>За поточними фільтрами реальних проблем не знайдено</strong>
              <small>Перемкніть режим на “Всі правила”, щоб побачити довідкові записи.</small>
            </article>
          ) : null}
        </div>
      </section>

      <AppRulesToolbar
        snapshot={snapshot}
        search={search}
        statusFilter={statusFilter}
        riskFilter={riskFilter}
        viewMode={viewMode}
        refreshing={refreshing}
        onSearchChange={setSearch}
        onStatusFilterChange={setStatusFilter}
        onRiskFilterChange={setRiskFilter}
        onViewModeChange={setViewMode}
        onRefresh={() => void refresh()}
        onExportJson={exportJson}
        onExportMarkdown={exportMarkdown}
      />

      <div className="appRulesSyncMeta">
        <span>Last sync: {snapshot ? new Date(snapshot.generatedAt).toLocaleString() : 'завантаження...'}</span>
        <span>Auto refresh: кожні {Math.round(REFRESH_INTERVAL_MS / 60000)} хв.</span>
        <span>Показано: {filteredItems.length} з {stats.total}</span>
        <span>Джерел: {snapshot?.sources?.length ?? 0}</span>
      </div>

      <div className="appRulesSections">
        {visibleSections.map((section) => (
          <AppRulesSectionTable key={section.id} section={section} updatedAt={snapshot?.generatedAt ?? null} />
        ))}
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

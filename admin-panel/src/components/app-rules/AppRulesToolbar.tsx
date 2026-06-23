import type { AppRuleRisk, AppRuleStatus, AppRulesSnapshot } from '../../types/appRules';

export type AppRulesViewMode = 'problems' | 'all';

type AppRulesToolbarProps = {
  snapshot: AppRulesSnapshot | null;
  search: string;
  statusFilter: AppRuleStatus | 'all';
  riskFilter: AppRuleRisk | 'all';
  viewMode: AppRulesViewMode;
  refreshing: boolean;
  compact?: boolean;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: AppRuleStatus | 'all') => void;
  onRiskFilterChange: (value: AppRuleRisk | 'all') => void;
  onViewModeChange: (value: AppRulesViewMode) => void;
  onRefresh: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
};

export const AppRulesToolbar = ({
  snapshot,
  search,
  statusFilter,
  riskFilter,
  viewMode,
  refreshing,
  compact = false,
  onSearchChange,
  onStatusFilterChange,
  onRiskFilterChange,
  onViewModeChange,
  onRefresh,
  onExportJson,
  onExportMarkdown,
}: AppRulesToolbarProps) => (
  <article className="panel appRulesToolbar">
    <label className="field appRulesSearch">
      <span>Пошук по правилах</span>
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Фото, auth, storage, moderationStatus, app_control..."
      />
    </label>

    {!compact && (
      <label className="field">
        <span>Режим</span>
        <select value={viewMode} onChange={(event) => onViewModeChange(event.target.value as AppRulesViewMode)}>
          <option value="problems">Тільки проблеми</option>
          <option value="all">Всі правила</option>
        </select>
      </label>
    )}

    {!compact && (
      <label className="field">
        <span>Статус</span>
        <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as AppRuleStatus | 'all')}>
          <option value="all">Всі</option>
          <option value="critical">Критично</option>
          <option value="warning">Попередження</option>
          <option value="missing">Правило не знайдено</option>
          <option value="active">Активно</option>
          <option value="info">Інфо</option>
        </select>
      </label>
    )}

    {!compact && (
      <label className="field">
        <span>Риск</span>
        <select value={riskFilter} onChange={(event) => onRiskFilterChange(event.target.value as AppRuleRisk | 'all')}>
          <option value="all">Всі</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
    )}

    <div className="appRulesActions">
      <button type="button" className="smallButton" disabled={refreshing} onClick={onRefresh}>
        {refreshing ? 'Оновлення...' : 'Оновити'}
      </button>
      {!compact && <button type="button" className="smallButton" disabled={!snapshot} onClick={onExportJson}>JSON</button>}
      {!compact && <button type="button" className="smallButton" disabled={!snapshot} onClick={onExportMarkdown}>Markdown</button>}
    </div>
  </article>
);

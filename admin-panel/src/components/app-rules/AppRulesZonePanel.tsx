import type { AppRuleItem, AppRulePipelineStep, AppRulesZoneGroup } from '../../types/appRules';

const statusLabel: Record<AppRuleItem['status'], string> = {
  active: 'Активно',
  warning: 'Увага',
  critical: 'Критично',
  missing: 'Не знайдено',
  info: 'Інфо',
};

const riskLabel: Record<AppRuleItem['risk'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const sourceLabel = (item: AppRuleItem | AppRulePipelineStep): string => {
  const line = item.source?.line ? `:${item.source.line}` : '';
  return `${item.source?.path ?? 'unknown'}${line}`;
};

const zoneIconMap: Record<AppRulesZoneGroup['zone'], string> = {
  action: '🔴',
  monitor: '🟡',
  reference: '📋',
};

type AppRulesZonePanelProps = {
  group: AppRulesZoneGroup;
  updatedAt: number | null;
  search: string;
};

export const AppRulesZonePanel = ({ group, updatedAt, search }: AppRulesZonePanelProps) => {
  const { zone, label, description, items, defaultOpen, actionCount } = group;

  const highlightMatch = (text: string): string => text; // just return as-is, highlighting is CSS-only

  return (
    <details
      className={`appRulesZonePanel zone-${zone}`}
      open={defaultOpen}
    >
      <summary>
        <div className="appRulesZoneSummaryLeft">
          <span className="appRulesZoneIcon">{zoneIconMap[zone]}</span>
          <div>
            <span className={`appRulesZoneLabel zone-${zone}-label`}>{label}</span>
            <small className="appRulesZoneDescription">{description}</small>
          </div>
        </div>
        <div className="appRulesZoneSummaryRight">
          {zone === 'action' && actionCount > 0 ? (
            <span className="appRulesZoneActionBadge zone-action-badge">{actionCount} потребує уваги</span>
          ) : zone === 'monitor' && actionCount > 0 ? (
            <span className="appRulesZoneActionBadge zone-monitor-badge">{actionCount} попереджень</span>
          ) : zone === 'action' && actionCount === 0 ? (
            <span className="appRulesZoneCleanBadge">✓ Все чисто</span>
          ) : null}
          <span className="appRulesZoneCount">{items.length} правил</span>
        </div>
      </summary>

      {items.length === 0 ? (
        <div className="appRulesZoneEmpty">
          {zone === 'action'
            ? 'Реальних проблем не знайдено. Система працює коректно.'
            : 'Правила не знайдені за поточними фільтрами.'}
        </div>
      ) : (
        <div className="tableWrap">
          <table className="appRulesTable">
            <thead>
              <tr>
                <th>Категорія</th>
                <th>Правило</th>
                <th>Статус</th>
                <th>Ризик</th>
                <th>Значення зараз</th>
                <th>Пояснення</th>
                <th>Джерело</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={[
                    'appRuleRow',
                    `status-${item.status}`,
                    `risk-${item.risk}`,
                    item.designLabel ? 'design-by-design' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <td>{item.category}</td>
                  <td>
                    <strong>{item.name}</strong>
                    {item.designLabel ? (
                      <span className="appRulesDesignLabel">{item.designLabel}</span>
                    ) : null}
                    <small>{(item.tags ?? []).join(', ')}</small>
                  </td>
                  <td>
                    <span className={`ruleBadge status-${item.status}`}>{statusLabel[item.status]}</span>
                  </td>
                  <td>
                    <span className={`riskBadge risk-${item.risk}`}>{riskLabel[item.risk]}</span>
                  </td>
                  <td>{item.actualValue}</td>
                  <td>
                    {item.explanation}
                    <small>{item.evidence}</small>
                  </td>
                  <td>
                    <strong>{item.source?.name ?? 'unknown'}</strong>
                    <small>{sourceLabel(item)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="appRulesZoneFooter">
        <span>Оновлено: {updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</span>
      </div>
    </details>
  );
};

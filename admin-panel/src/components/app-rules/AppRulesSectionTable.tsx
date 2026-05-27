import type { AppRuleItem, AppRulePipelineStep, AppRulesSection } from '../../types/appRules';

const statusLabel: Record<AppRuleItem['status'], string> = {
  active: 'Активно',
  warning: 'Увага',
  critical: 'Критично',
  missing: 'Правило не знайдено',
  info: 'Інфо',
};

const riskPriority: Record<AppRuleItem['risk'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const riskLabel: Record<AppRuleItem['risk'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const copyText = async (value: string): Promise<void> => {
  await navigator.clipboard.writeText(value);
};

const sourceLabel = (item: AppRuleItem | AppRulePipelineStep): string => {
  const line = item.source?.line ? `:${item.source.line}` : '';
  return `${item.source?.path ?? 'unknown'}${line}`;
};

const isProblem = (item: AppRuleItem | AppRulePipelineStep): boolean =>
  item.status === 'critical' ||
  item.status === 'warning' ||
  item.risk === 'critical' ||
  item.risk === 'high' ||
  (item.status === 'missing' && item.risk !== 'low');

const isObservation = (item: AppRuleItem | AppRulePipelineStep): boolean =>
  !isProblem(item) && (item.risk === 'medium' || item.status === 'info');

const sectionToText = (section: AppRulesSection): string => [
  section.title,
  section.description,
  '',
  ...(section.items ?? []).map((item) =>
    `${item.category} | ${item.name} | ${item.status} | ${item.risk} | ${item.actualValue} | ${sourceLabel(item)}`,
  ),
].join('\n');

type AppRulesSectionTableProps = {
  section: AppRulesSection;
  updatedAt: number | null;
};

const highestRisk = (items: Array<AppRuleItem | AppRulePipelineStep>): AppRuleItem['risk'] | null =>
  items.reduce<AppRuleItem['risk'] | null>((current, item) => {
    if (!current) return item.risk;
    return riskPriority[item.risk] < riskPriority[current] ? item.risk : current;
  }, null);

export const AppRulesSectionTable = ({ section, updatedAt }: AppRulesSectionTableProps) => {
  const items = section.items ?? [];
  const pipeline = section.pipeline ?? [];
  const allDiagnostics = [...items, ...pipeline];
  const risk = highestRisk(allDiagnostics);
  const problemCount = allDiagnostics.filter(isProblem).length;
  const observationCount = allDiagnostics.filter(isObservation).length;
  const health = problemCount > 0 ? 'problem' : observationCount > 0 ? 'watch' : 'clean';
  const healthTitle = problemCount > 0
    ? `Знайдено проблем: ${problemCount}`
    : observationCount > 0
      ? `Критичних проблем немає, спостережень: ${observationCount}`
      : 'Реальних проблем не знайдено';
  const healthText = problemCount > 0
    ? 'Перевірте рядки зі статусом warning/critical або risk high/critical.'
    : observationCount > 0
      ? 'Є інформаційні або medium-записи: вони не блокують роботу, але корисні для аудиту.'
      : 'Upload, правила, metadata, pipeline і відображення не показують помилок за поточною діагностикою.';

  return (
    <details className={`appRulesSection ${section.id === 'photos' ? `appRulesSectionPhotos health-${health}` : ''}`} open>
      <summary>
        <span>
          <strong>{section.title}</strong>
          <small>{section.description}</small>
        </span>
        <span className="appRulesSectionMetaGroup">
          {risk ? <span className={`riskBadge risk-${risk}`}>{riskLabel[risk]}</span> : null}
          <span className={`ruleBadge status-${problemCount ? 'warning' : 'active'}`}>{healthTitle}</span>
          <span className="appRulesSectionMeta">{items.length} записей</span>
        </span>
      </summary>

      {section.id === 'photos' ? (
        <div className={`appRulesSectionHealth health-${health}`}>
          <strong>{healthTitle}</strong>
          <span>{healthText}</span>
          <small>Перевірено: правил {items.length}, етапів pipeline {pipeline.length}, спостережень {observationCount}.</small>
        </div>
      ) : null}

      {pipeline.length ? (
        <div className="appRulesPipeline" aria-label="Фото pipeline">
          {pipeline.map((step, index) => (
            <div key={step.id} className={`appRulesPipelineStep status-${step.status} risk-${step.risk}`}>
              <span>{index + 1}</span>
              <strong>{step.title}</strong>
              <div className="appRulesPipelineBadges">
                <span className={`ruleBadge status-${step.status}`}>{statusLabel[step.status]}</span>
                <span className={`riskBadge risk-${step.risk}`}>{riskLabel[step.risk]}</span>
              </div>
              <small>{step.evidence}</small>
            </div>
          ))}
        </div>
      ) : null}

      <div className="tableHeader appRulesTableHeader">
        <span>Джерело оновлено: {updatedAt ? new Date(updatedAt).toLocaleString() : '-'}</span>
        <button
          type="button"
          className="smallButton"
          onClick={() => void copyText(sectionToText(section))}
        >
          Копіювати розділ
        </button>
      </div>

      <div className="tableWrap">
        <table className="appRulesTable">
          <thead>
            <tr>
              <th>Категорія</th>
              <th>Правило</th>
              <th>Статус</th>
              <th>Ризик</th>
              <th>Реально працює зараз</th>
              <th>Пояснення</th>
              <th>Джерело</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={`appRuleRow status-${item.status} risk-${item.risk}`}>
                <td>{item.category}</td>
                <td>
                  <strong>{item.name}</strong>
                  <small>{(item.tags ?? []).join(', ')}</small>
                </td>
                <td><span className={`ruleBadge status-${item.status}`}>{statusLabel[item.status]}</span></td>
                <td><span className={`riskBadge risk-${item.risk}`}>{riskLabel[item.risk]}</span></td>
                <td>{item.actualValue}</td>
                <td>{item.explanation}<small>{item.evidence}</small></td>
                <td>
                  <strong>{item.source?.name ?? 'unknown'}</strong>
                  <small>{sourceLabel(item)}</small>
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={7}>Правила не знайдені за поточними фільтрами.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </details>
  );
};

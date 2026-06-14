import type { AppRuleItem, AppRuleSource, AppRuleZone } from '../../types/appRules';
import { FIREBASE_RULES_SOURCE } from './rulesRegistry';

// These top-level RTDB paths have `.read: true` intentionally —
// they are community data that must be accessible to unauthenticated guests
// (public listings, community photos, etc.). They are NOT security issues.
const PUBLIC_BY_DESIGN_PATHS = new Set([
  'requests',
  'community_photos_public',
  'biznes_chaika_listings',
  'lost_found',
  'buy_sell_listings',
  'food_top_listings',
  'beauty_top_listings',
  'children_top_listings',
  'job_listings',
  'local_business',
  'sports_listings',
  'security_config', // app_control/current is public by design for client reads
]);

type FirebaseRuleNode = {
  '.read'?: unknown;
  '.write'?: unknown;
  '.validate'?: unknown;
  '.indexOn'?: unknown;
  [key: string]: unknown;
};

type FlatFirebaseRule = {
  path: string;
  type: 'read' | 'write' | 'validate' | 'index';
  expression: string;
  inheritedExpression?: string;
};

type InheritedAccessRules = {
  read?: string;
  write?: string;
};

const stringifyExpression = (value: unknown): string => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (value == null) return 'Правило не найдено';
  return JSON.stringify(value);
};

const flattenRules = (
  node: FirebaseRuleNode,
  path: string[] = [],
  inherited: InheritedAccessRules = {},
): FlatFirebaseRule[] => {
  const currentPath = path.length ? path.join('/') : '/';
  const ownRules: FlatFirebaseRule[] = [];
  const ownRead = Object.prototype.hasOwnProperty.call(node, '.read')
    ? stringifyExpression(node['.read'])
    : undefined;
  const ownWrite = Object.prototype.hasOwnProperty.call(node, '.write')
    ? stringifyExpression(node['.write'])
    : undefined;

  if (ownRead !== undefined) {
    ownRules.push({ path: currentPath, type: 'read', expression: ownRead, inheritedExpression: inherited.read });
  }
  if (ownWrite !== undefined) {
    ownRules.push({ path: currentPath, type: 'write', expression: ownWrite, inheritedExpression: inherited.write });
  }
  if (Object.prototype.hasOwnProperty.call(node, '.validate')) {
    ownRules.push({ path: currentPath, type: 'validate', expression: stringifyExpression(node['.validate']) });
  }
  if (Object.prototype.hasOwnProperty.call(node, '.indexOn')) {
    ownRules.push({ path: currentPath, type: 'index', expression: stringifyExpression(node['.indexOn']) });
  }

  const childRules = Object.entries(node)
    .filter(([key, value]) => !key.startsWith('.') && value && typeof value === 'object')
    .flatMap(([key, value]) => flattenRules(value as FirebaseRuleNode, [...path, key], {
      read: ownRead ?? inherited.read,
      write: ownWrite ?? inherited.write,
    }));

  return [...ownRules, ...childRules];
};

const sourceFor = (rule: FlatFirebaseRule): AppRuleSource => ({
  ...FIREBASE_RULES_SOURCE,
  name: `${FIREBASE_RULES_SOURCE.name}: ${rule.path}`,
});

const isPublicByDesign = (rule: FlatFirebaseRule): boolean =>
  rule.type === 'read' &&
  rule.expression === 'true' &&
  PUBLIC_BY_DESIGN_PATHS.has(rule.path.split('/')[0]);

const getRisk = (rule: FlatFirebaseRule): AppRuleItem['risk'] => {
  // Public reads on known community paths are by design — not a risk
  if (isPublicByDesign(rule)) return 'low';
  const expression = rule.expression.toLowerCase();
  const inheritedExpression = rule.inheritedExpression?.toLowerCase() ?? '';
  if ((rule.type === 'read' || rule.type === 'write') && expression === 'false') return 'low';
  if (
    (rule.type === 'read' || rule.type === 'write') &&
    expression === 'true' &&
    inheritedExpression &&
    inheritedExpression !== 'true' &&
    inheritedExpression !== 'false'
  ) {
    return inheritedExpression.includes('auth') ? 'medium' : 'high';
  }
  if ((rule.type === 'read' || rule.type === 'write') && expression === 'true') return 'critical';
  if (rule.type === 'write' && !expression.includes('auth')) return 'high';
  if (rule.type === 'index') return 'low';
  if (rule.type === 'read' && expression.includes('auth != null')) return 'medium';
  if (rule.type === 'validate') return 'low';
  return 'medium';
};

const getStatus = (rule: FlatFirebaseRule): AppRuleItem['status'] => {
  if (isPublicByDesign(rule)) return 'info';
  const risk = getRisk(rule);
  if (risk === 'critical') return 'critical';
  if (risk === 'high') return 'warning';
  if (rule.expression === 'Правило не найдено') return 'missing';
  return 'active';
};

const getZone = (rule: FlatFirebaseRule): AppRuleZone => {
  if (isPublicByDesign(rule)) return 'reference';
  const risk = getRisk(rule);
  // Only real parse errors or dangerously-open write rules go to action
  if (risk === 'critical' || risk === 'high') return 'action';
  return 'reference';
};

const explainRule = (rule: FlatFirebaseRule): string => {
  if (rule.type === 'read') return 'Фактическое правило чтения для ветки RTDB.';
  if (rule.type === 'write') return 'Фактическое правило записи для ветки RTDB.';
  if (rule.type === 'validate') return 'Проверка структуры и значений перед сохранением данных.';
  return 'Индекс, который реально объявлен для запросов Firebase.';
};

export const parseFirebaseRules = (rawText: string, generatedAt: number): AppRuleItem[] => {
  try {
    const parsed = JSON.parse(rawText) as { rules?: FirebaseRuleNode };
    const rules = parsed.rules ? flattenRules(parsed.rules) : [];

    return rules.map((rule, index) => {
      const byDesign = isPublicByDesign(rule);
      return {
        id: `firebase:${rule.path}:${rule.type}:${index}`,
        sectionId: 'firebase',
        category: rule.type === 'index' ? 'indexes' : rule.type,
        name: `${rule.path} / .${rule.type === 'index' ? 'indexOn' : rule.type}`,
        status: getStatus(rule),
        risk: getRisk(rule),
        actualValue: rule.expression,
        explanation: byDesign
          ? 'Публічний доступ за задумом дизайну — громадські дані (оголошення, фото, бізнес). Це не проблема безпеки.'
          : explainRule(rule),
        evidence: rule.expression,
        source: sourceFor(rule),
        tags: ['firebase', rule.type, rule.path],
        updatedAt: generatedAt,
        zone: getZone(rule),
        designLabel: byDesign ? 'BY DESIGN' : undefined,
      };
    });
  } catch (error) {
    return [{
      id: 'firebase:parse_error',
      sectionId: 'firebase',
      category: 'parser',
      name: 'Firebase Rules',
      status: 'critical',
      risk: 'critical',
      actualValue: 'Правило не найдено',
      explanation: 'Файл firebase.rules.json не удалось разобрать как JSON.',
      evidence: error instanceof Error ? error.message : String(error),
      source: FIREBASE_RULES_SOURCE,
      tags: ['firebase', 'parse_error'],
      updatedAt: generatedAt,
    }];
  }
};

export const findFirebaseRule = (
  items: AppRuleItem[],
  pathPart: string,
  type: 'read' | 'write' | 'validate' | 'indexes',
): AppRuleItem | undefined =>
  items.find((item) => item.name.includes(pathPart) && item.category === type);

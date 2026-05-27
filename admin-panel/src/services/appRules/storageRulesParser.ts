import type { AppRuleItem } from '../../types/appRules';
import { STORAGE_RULES_SOURCE } from './rulesRegistry';

type StorageAllowRule = {
  path: string;
  action: string;
  condition: string;
};

type MatchFrame = {
  path: string;
  depth: number;
};

const countChar = (value: string, char: string): number =>
  Array.from(value).filter((current) => current === char).length;

const parseAllowRules = (rawText: string): StorageAllowRule[] => {
  const matchStack: MatchFrame[] = [];
  const rules: StorageAllowRule[] = [];
  let braceDepth = 0;

  rawText.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    const depthBeforeLine = braceDepth;
    const match = trimmed.match(/^match\s+(.+?)\s+\{/);
    if (match) {
      matchStack.push({ path: match[1], depth: depthBeforeLine + 1 });
    }

    const allowMatch = trimmed.match(/^allow\s+(.+?):\s+if\s+(.+?);$/);
    if (allowMatch) {
      rules.push({
        path: matchStack.map((item) => item.path).join(' '),
        action: allowMatch[1],
        condition: allowMatch[2],
      });
    }

    braceDepth += countChar(line, '{') - countChar(line, '}');

    while (matchStack.length > 0 && braceDepth < matchStack[matchStack.length - 1].depth) {
      matchStack.pop();
    }
  });

  return rules;
};

const riskFor = (rule: StorageAllowRule): AppRuleItem['risk'] => {
  const condition = rule.condition.toLowerCase();
  if (rule.action.includes('read') && condition === 'true') return 'high';
  if (rule.action.includes('write') && condition === 'true') return 'critical';
  if (rule.action.includes('write') && condition.includes('request.auth')) return 'medium';
  return 'low';
};

export const parseStorageRules = (rawText: string, generatedAt: number): AppRuleItem[] => {
  const rules = parseAllowRules(rawText);
  if (!rules.length) {
    return [{
      id: 'storage:missing',
      sectionId: 'firebase',
      category: 'storage',
      name: 'Firebase Storage Rules',
      status: 'missing',
      risk: 'high',
      actualValue: 'Правило не найдено',
      explanation: 'В storage.rules не найдено ни одного allow-правила.',
      evidence: rawText.slice(0, 260) || 'Файл пуст',
      source: STORAGE_RULES_SOURCE,
      tags: ['storage', 'missing'],
      updatedAt: generatedAt,
    }];
  }

  return rules.map((rule, index) => {
    const risk = riskFor(rule);
    return {
      id: `storage:${rule.action}:${index}`,
      sectionId: 'firebase' as const,
      category: 'storage',
      name: `Storage ${rule.action}`,
      status: risk === 'critical' ? 'critical' as const : risk === 'high' ? 'warning' as const : 'active' as const,
      risk,
      actualValue: `allow ${rule.action}: if ${rule.condition}`,
      explanation: 'Фактическое правило Firebase Storage для файлов приложения.',
      evidence: `match ${rule.path} allow ${rule.action}: if ${rule.condition}`,
      source: STORAGE_RULES_SOURCE,
      tags: ['storage', rule.action],
      updatedAt: generatedAt,
    };
  });
};

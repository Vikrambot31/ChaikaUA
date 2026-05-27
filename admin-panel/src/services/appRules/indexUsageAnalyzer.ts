import type { AppRuleItem, SourceFileSnapshot } from '../../types/appRules';
import { createSource, FIREBASE_RULES_SOURCE } from './rulesRegistry';

type IndexDeclaration = {
  path: string;
  fields: string[];
};

type QueryUsage = {
  path: string;
  field: string;
  fileName: string;
  filePath: string;
  line?: number;
  evidence: string;
};

const QUERY_WITH_INLINE_REF_REGEX = /query\s*\(\s*ref\s*\(\s*database\s*,\s*['"]([^'"]+)['"]\s*\)[\s\S]{0,500}?orderByChild\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const QUERY_WITH_DB_REF_REGEX = /query\s*\(\s*dbRef\s*\(\s*database\s*,\s*['"]([^'"]+)['"]\s*\)[\s\S]{0,500}?orderByChild\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const normalizePath = (path: string): string | null => {
  if (!path || path.includes('${')) return null;
  return path.replace(/^\/+|\/+$/g, '');
};

const lineForIndex = (content: string, index: number): number =>
  content.slice(0, index).split(/\r?\n/).length;

const evidenceForIndex = (content: string, index: number): string =>
  content.slice(index, index + 260).replace(/\s+/g, ' ').trim();

const parseIndexDeclarations = (rawText: string): IndexDeclaration[] => {
  try {
    const parsed = JSON.parse(rawText) as { rules?: Record<string, unknown> };
    const declarations: IndexDeclaration[] = [];

    Object.entries(parsed.rules ?? {}).forEach(([path, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const indexOn = (value as { '.indexOn'?: unknown })['.indexOn'];
      if (!Array.isArray(indexOn)) return;
      declarations.push({
        path,
        fields: indexOn.filter((field): field is string => typeof field === 'string'),
      });
    });

    return declarations;
  } catch {
    return [];
  }
};

const collectQueryUsages = (files: SourceFileSnapshot[]): QueryUsage[] => {
  const usages: QueryUsage[] = [];
  const patterns = [QUERY_WITH_INLINE_REF_REGEX, QUERY_WITH_DB_REF_REGEX];

  files.forEach((file) => {
    patterns.forEach((pattern) => {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(file.content)) !== null) {
        const path = normalizePath(match[1]);
        const field = match[2];
        if (!path || !field) continue;
        usages.push({
          path,
          field,
          fileName: file.name,
          filePath: file.path,
          line: lineForIndex(file.content, match.index),
          evidence: evidenceForIndex(file.content, match.index),
        });
      }
    });
  });

  return usages;
};

const keyFor = (path: string, field: string): string => `${path}\u0000${field}`;

export const buildMissingIndexRuleItems = (
  rawFirebaseRulesText: string,
  files: SourceFileSnapshot[],
  generatedAt: number,
): AppRuleItem[] => {
  const declarations = parseIndexDeclarations(rawFirebaseRulesText);
  const declared = new Set(
    declarations.flatMap((declaration) => declaration.fields.map((field) => keyFor(declaration.path, field))),
  );
  const usages = collectQueryUsages(files);
  const emitted = new Set<string>();

  return usages.flatMap((usage) => {
    const key = keyFor(usage.path, usage.field);
    if (declared.has(key) || emitted.has(key)) return [];
    emitted.add(key);

    return [{
      id: `firebase:missing_index:${usage.path}:${usage.field}`,
      sectionId: 'firebase' as const,
      category: 'indexes',
      name: `${usage.path} / missing .indexOn(${usage.field})`,
      status: 'warning' as const,
      risk: 'high' as const,
      actualValue: 'Индекс не найден',
      explanation: `В коде есть RTDB query по ${usage.field}, но в firebase.rules.json для ${usage.path} нет соответствующего .indexOn.`,
      evidence: usage.evidence,
      source: createSource('source_code', usage.fileName, usage.filePath, usage.line),
      tags: ['firebase', 'index', 'missing_index', usage.path, usage.field],
      updatedAt: generatedAt,
    }];
  });
};

export const describeDeclaredIndexUsage = (
  rawFirebaseRulesText: string,
  files: SourceFileSnapshot[],
): Map<string, { matched: string[]; redundant: string[] }> => {
  const declarations = parseIndexDeclarations(rawFirebaseRulesText);
  const used = new Set(collectQueryUsages(files).map((usage) => keyFor(usage.path, usage.field)));
  const result = new Map<string, { matched: string[]; redundant: string[] }>();

  declarations.forEach((declaration) => {
    result.set(declaration.path, {
      matched: declaration.fields.filter((field) => used.has(keyFor(declaration.path, field))),
      redundant: declaration.fields.filter((field) => !used.has(keyFor(declaration.path, field))),
    });
  });

  return result;
};

export const annotateDeclaredIndexItems = (
  items: AppRuleItem[],
  rawFirebaseRulesText: string,
  files: SourceFileSnapshot[],
): AppRuleItem[] => {
  const usageByPath = describeDeclaredIndexUsage(rawFirebaseRulesText, files);

  return items.map((item) => {
    if (item.category !== 'indexes') return item;
    const path = item.name.split(' / ')[0];
    const usage = usageByPath.get(path);
    if (!usage) return item;

    const details = [
      usage.matched.length ? `используется: ${usage.matched.join(', ')}` : '',
      usage.redundant.length ? `не используется в известных orderByChild: ${usage.redundant.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    const hasOnlyRedundant = usage.redundant.length > 0 && usage.matched.length === 0;

    return {
      ...item,
      status: hasOnlyRedundant ? 'info' : item.status,
      risk: 'low',
      explanation: details || item.explanation,
      evidence: details || item.evidence,
      source: item.source ?? FIREBASE_RULES_SOURCE,
    };
  });
};

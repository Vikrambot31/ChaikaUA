import type { AppRuleItem, AppRulesRuntimeState, AppRulesSection, AppRulesSnapshot, AppRulesZoneGroup, AppRuleZone } from '../../types/appRules';
import { parseFirebaseRules } from './firebaseRulesParser';
import { analyzePhotoPipeline } from './photoPipelineAnalyzer';
import {
  FIREBASE_RULES_SOURCE,
  STORAGE_RULES_SOURCE,
  firebaseRulesText,
  sourceFiles,
  storageRulesText,
} from './rulesRegistry';
import { buildRuntimeRuleItems, collectRuntimeRules } from './runtimeRulesCollector';
import { analyzeSecurityAndRuntimeCode } from './securityRulesAnalyzer';
import { parseStorageRules } from './storageRulesParser';
import { annotateDeclaredIndexItems, buildMissingIndexRuleItems } from './indexUsageAnalyzer';

const CACHE_KEY = 'chaika:app_rules_snapshot:v2';
const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const RUNTIME_TIMEOUT_MS = 2500;

const createRuntimeFallback = (generatedAt: number, reason: string): AppRulesRuntimeState => ({
  appControl: null,
  featureFlags: null,
  securityConfig: null,
  appControlPath: 'security_config/app_control/current',
  featureFlagsPath: 'feature_flags',
  loadedAt: generatedAt,
  errors: [reason],
});

const SECTION_META: Array<Pick<AppRulesSection, 'id' | 'title' | 'description'>> = [
  {
    id: 'photos',
    title: 'Фото: полный контур правил',
    description: 'Все правила, влияющие на фото: upload, Storage, RTDB community_photos/photo_uploads/profile_photos, metadata, модерация и отображение.',
  },
  {
    id: 'access',
    title: 'Авторизация и доступ',
    description: 'Guest/approved access, owner/admin bypass, invite tree, device authorization и временный доступ.',
  },
  {
    id: 'firebase',
    title: 'Правила доступа к данным',
    description: 'Статический снимок правил доступа (database rules, storage rules): read/write/validate/indexOn, публичные и опасные ветки. Источник — локальные файлы firebase.rules.json и storage.rules.',
  },
  {
    id: 'moderation',
    title: 'Модерация',
    description: 'Статусы, ручная модерация, архивирование, видимость и политики удаления.',
  },
  {
    id: 'limits',
    title: 'Ограничения приложения',
    description: 'Лимиты upload, timeout, retry, cache, text validation и API-поведения.',
  },
  {
    id: 'security',
    title: 'Безопасность',
    description: 'Runtime toggles, force update, app control, dangerous configs и защитные проверки.',
  },
];

const createSections = (
  items: AppRuleItem[],
  photoPipeline: ReturnType<typeof analyzePhotoPipeline>['pipeline'],
): AppRulesSection[] =>
  SECTION_META.map((section) => ({
    ...section,
    items: items.filter((item) => item.sectionId === section.id),
    ...(section.id === 'photos' ? { pipeline: photoPipeline } : {}),
  }));

const isPhotoRelatedRule = (item: AppRuleItem): boolean => {
  if (item.sectionId === 'photos') return true;

  const haystack = [
    item.id,
    item.category,
    item.name,
    item.actualValue,
    item.explanation,
    item.evidence,
    item.source.name,
    item.source.path,
    ...item.tags,
  ].join(' ').toLowerCase();

  return [
    'photo',
    'photos',
    'community_photos',
    'photo_uploads',
    'profile_photos',
    'imageuri',
    'storagepath',
    'thumbnail',
    'firebase storage rules',
  ].some((token) => haystack.includes(token));
};

const movePhotoRulesToPhotoSection = (items: AppRuleItem[]): AppRuleItem[] =>
  items.map((item) => isPhotoRelatedRule(item) ? { ...item, sectionId: 'photos' } : item);

const collectRuntimeRulesWithTimeout = async (generatedAt: number): Promise<AppRulesRuntimeState> => {
  let timer: number | undefined;
  try {
    return await Promise.race([
      collectRuntimeRules(),
      new Promise<AppRulesRuntimeState>((resolve) => {
        timer = window.setTimeout(() => {
          resolve(createRuntimeFallback(generatedAt, `Runtime-конфиги не ответили за ${RUNTIME_TIMEOUT_MS} мс; показаны статические правила.`));
        }, RUNTIME_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    return createRuntimeFallback(generatedAt, error instanceof Error ? error.message : String(error));
  } finally {
    if (timer) window.clearTimeout(timer);
  }
};

const buildKnownMissingRuleItems = (generatedAt: number): AppRuleItem[] => [
  {
    id: 'firebase:firestore_rules_missing',
    sectionId: 'firebase',
    category: 'firestore',
    name: 'firestore.rules',
    status: 'info',
    risk: 'low',
    actualValue: 'Firestore rules не используются',
    explanation: 'Firestore rules не используются; диагностика опирается на database rules (firebase.rules.json) и storage rules (storage.rules) как статические документы.',
    evidence: 'rg --files не показал firestore.rules',
    source: {
      kind: 'generated',
      name: 'Project file registry',
      path: 'firestore.rules',
    },
    tags: ['firebase', 'firestore', 'info'],
    updatedAt: generatedAt,
  },
];

// Fallback zone resolver for items where parsers didn't assign a zone
const resolveZone = (item: AppRuleItem): AppRuleZone => {
  if (item.zone) return item.zone;
  if (item.source.kind === 'runtime_config') return 'monitor';
  if (
    (item.status === 'critical' || item.status === 'missing') &&
    (item.risk === 'critical' || item.risk === 'high')
  ) return 'action';
  return 'reference';
};

export const buildZoneGroups = (items: AppRuleItem[]): AppRulesZoneGroup[] => {
  const withZone = items.map((item) => ({ ...item, zone: resolveZone(item) }));
  const actionItems = withZone.filter((item) => item.zone === 'action');
  const monitorItems = withZone.filter((item) => item.zone === 'monitor');
  const referenceItems = withZone.filter((item) => item.zone === 'reference');
  const monitorWarnings = monitorItems.filter((item) => item.status === 'warning' || item.status === 'missing').length;

  return [
    {
      zone: 'action',
      label: 'ПОТРІБНА ДІЯ',
      description: 'Реальні проблеми, які потребують уваги адміністратора. Зламане або відсутнє — тут.',
      items: actionItems,
      defaultOpen: true,
      actionCount: actionItems.length,
    },
    {
      zone: 'monitor',
      label: 'МОНІТОРИНГ',
      description: 'Живі runtime-перемикачі. Зараз в нормі, але зміна будь-якого може вплинути на всіх користувачів.',
      items: monitorItems,
      defaultOpen: monitorWarnings > 0,
      actionCount: monitorWarnings,
    },
    {
      zone: 'reference',
      label: 'АРХІТЕКТУРА СИСТЕМИ',
      description: 'Довідкові правила — завжди увімкнені за задумом дизайну. Розгорніть для аудиту структури.',
      items: referenceItems,
      defaultOpen: false,
      actionCount: 0,
    },
  ];
};

const sortItems = (items: AppRuleItem[]): AppRuleItem[] => {
  const riskWeight: Record<AppRuleItem['risk'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const statusWeight: Record<AppRuleItem['status'], number> = {
    critical: 0,
    warning: 1,
    missing: 2,
    active: 3,
    info: 4,
  };

  return [...items].sort((left, right) =>
    riskWeight[left.risk] - riskWeight[right.risk] ||
    statusWeight[left.status] - statusWeight[right.status] ||
    left.category.localeCompare(right.category, 'ru') ||
    left.name.localeCompare(right.name, 'ru'),
  );
};

export const loadCachedAppRulesSnapshot = (): AppRulesSnapshot | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as AppRulesSnapshot;
    if (!cached || typeof cached !== 'object') return null;
    if (typeof cached.generatedAt !== 'number') return null;
    if (!Array.isArray(cached.sections)) return null;
    if (!Array.isArray(cached.sources)) return null;
    if (!cached.runtime || !Array.isArray(cached.runtime.errors)) return null;
    const itemCount = cached.sections.reduce((total, section) => total + (Array.isArray(section.items) ? section.items.length : 0), 0);
    if (itemCount === 0) return null;
    if (Date.now() - cached.generatedAt > CACHE_MAX_AGE_MS) return null;
    return cached;
  } catch {
    return null;
  }
};

const cacheSnapshot = (snapshot: AppRulesSnapshot): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(sanitizeSnapshotForExport(snapshot)));
  } catch {
    // Snapshot is a convenience cache; failure must not block the page.
  }
};

export const sanitizeSnapshotForExport = (snapshot: AppRulesSnapshot): AppRulesSnapshot => ({
  ...snapshot,
  runtime: { ...snapshot.runtime, securityConfig: null },
});

export const generateAppRulesSnapshot = async (): Promise<AppRulesSnapshot> => {
  const generatedAt = Date.now();
  const firebaseItems = annotateDeclaredIndexItems(
    parseFirebaseRules(firebaseRulesText, generatedAt),
    firebaseRulesText,
    sourceFiles,
  );
  const missingIndexItems = buildMissingIndexRuleItems(firebaseRulesText, sourceFiles, generatedAt);
  const storageItems = parseStorageRules(storageRulesText, generatedAt);
  const photo = analyzePhotoPipeline(sourceFiles, generatedAt);
  const codeItems = analyzeSecurityAndRuntimeCode(sourceFiles, generatedAt);
  const runtime = await collectRuntimeRulesWithTimeout(generatedAt);
  const runtimeItems = buildRuntimeRuleItems(runtime, generatedAt);
  const allItems = sortItems(movePhotoRulesToPhotoSection([
    ...firebaseItems,
    ...missingIndexItems,
    ...storageItems,
    ...buildKnownMissingRuleItems(generatedAt),
    ...photo.items,
    ...codeItems,
    ...runtimeItems,
  ]));
  const warnings = allItems.filter((item) =>
    item.status === 'critical' ||
    item.status === 'warning' ||
    item.status === 'missing',
  );

  const snapshot: AppRulesSnapshot = {
    generatedAt,
    syncStatus: runtime.errors.length ? 'error' : 'ready',
    sources: [
      FIREBASE_RULES_SOURCE,
      STORAGE_RULES_SOURCE,
      ...sourceFiles.map((file) => ({
        kind: 'source_code' as const,
        name: file.name,
        path: file.path,
      })),
    ],
    sections: createSections(allItems, photo.pipeline),
    warnings,
    runtime,
    zones: buildZoneGroups(allItems),
  };

  cacheSnapshot(snapshot);
  return snapshot;
};

export const snapshotToMarkdown = (snapshot: AppRulesSnapshot): string => {
  const lines: string[] = [
    '# Серверні правила Chaika Life',
    '',
    `Сгенерировано: ${new Date(snapshot.generatedAt).toLocaleString()}`,
    `Статус синхронизации: ${snapshot.syncStatus}`,
    '',
  ];

  snapshot.sections.forEach((section) => {
    lines.push(`## ${section.title}`, section.description, '');
    if (section.pipeline?.length) {
      lines.push('### Pipeline');
      section.pipeline.forEach((step, index) => {
        lines.push(`${index + 1}. ${step.title} — ${step.status} — ${step.evidence}`);
      });
      lines.push('');
    }
    lines.push('| Категория | Правило | Статус | Риск | Реальное значение | Источник |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    section.items.forEach((item) => {
      lines.push('| ' + [
        item.category,
        item.name,
        item.status,
        item.risk,
        item.actualValue.replace(/\|/g, '\\|'),
        item.source.path,
      ].join(' | ') + ' |');
    });
    lines.push('');
  });

  return lines.join('\n');
};

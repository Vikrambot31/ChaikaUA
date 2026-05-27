import type { AppRuleItem, AppRuleSectionId, SourceFileSnapshot } from '../../types/appRules';
import { createSource, findEvidence, findLine, hasPattern } from './rulesRegistry';

type CodeRule = {
  id: string;
  sectionId: AppRuleSectionId;
  category: string;
  name: string;
  fileName: string;
  pattern: string | RegExp;
  explanation: string;
  actualValue?: string;
  risk?: AppRuleItem['risk'];
  missingRisk?: AppRuleItem['risk'];
  tags: string[];
};

const buildCodeRule = (
  rule: CodeRule,
  files: SourceFileSnapshot[],
  generatedAt: number,
): AppRuleItem => {
  const file = files.find((item) => item.name === rule.fileName);
  const found = file ? hasPattern(file.content, rule.pattern) : false;
  return {
    id: `code:${rule.id}`,
    sectionId: rule.sectionId,
    category: rule.category,
    name: rule.name,
    status: found ? 'active' : 'missing',
    risk: found ? rule.risk ?? 'low' : rule.missingRisk ?? 'medium',
    actualValue: found ? rule.actualValue ?? 'Найдено в коде' : 'Правило не найдено',
    explanation: rule.explanation,
    evidence: found && file ? findEvidence(file.content, rule.pattern) : 'Фрагмент не найден в актуальных исходниках',
    source: found && file
      ? createSource('source_code', file.name, file.path, findLine(file.content, rule.pattern))
      : createSource('generated', rule.fileName, rule.fileName),
    tags: rule.tags,
    updatedAt: generatedAt,
  };
};

export const analyzeSecurityAndRuntimeCode = (
  files: SourceFileSnapshot[],
  generatedAt: number,
): AppRuleItem[] => {
  const rules: CodeRule[] = [
    {
      id: 'guest_access_guard',
      sectionId: 'access',
      category: 'guest access',
      name: 'Guest access в App startup',
      fileName: 'App.tsx',
      pattern: /accessControl|guest|no_auth|anonymous/i,
      explanation: 'Старт приложения проверяет состояние авторизации и access-control перед входом в основные экраны.',
      risk: 'medium',
      tags: ['auth', 'guest'],
    },
    {
      id: 'admin_bypass',
      sectionId: 'access',
      category: 'admin bypass',
      name: 'Bypass для owner/admin/moderator',
      fileName: 'AppAccessGuard',
      pattern: /snapshot\.role === 'admin' \|\| snapshot\.role === 'moderator'/,
      explanation: 'Админ и модератор обходят пользовательские runtime-блокировки приложения.',
      actualValue: 'admin/moderator bypass активен',
      risk: 'medium',
      tags: ['auth', 'admin', 'moderator'],
    },
    {
      id: 'primary_owner_bypass',
      sectionId: 'access',
      category: 'owner',
      name: 'Primary service email bypass',
      fileName: 'AppAccessGuard',
      pattern: 'isPrimaryServiceEmail',
      explanation: 'Owner email проверяется отдельно и не должен блокироваться обычными runtime-ограничениями.',
      actualValue: 'isPrimaryServiceEmail используется',
      risk: 'low',
      tags: ['owner', 'admin'],
    },
    {
      id: 'device_id_secure_store',
      sectionId: 'access',
      category: 'device authorization',
      name: 'Device ID через secure storage',
      fileName: 'deviceAuth',
      pattern: 'expo-secure-store',
      explanation: 'Идентификатор устройства хранится через SecureStore при наличии модуля с fallback-хранилищем.',
      actualValue: 'SecureStore + fallback',
      tags: ['device', 'secure_store'],
    },
    {
      id: 'device_throttle',
      sectionId: 'limits',
      category: 'device authorization',
      name: 'Throttle last_seen устройств',
      fileName: 'deviceAuth',
      pattern: /LAST_SEEN_THROTTLE_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/,
      explanation: 'Запись last_seen_at ограничена по частоте, чтобы не спамить Firebase.',
      actualValue: '5 минут',
      tags: ['device', 'throttle'],
    },
    {
      id: 'device_sync_failures',
      sectionId: 'limits',
      category: 'device authorization',
      name: 'Лимит ошибок device sync',
      fileName: 'deviceAuth',
      pattern: /MAX_DEVICE_SYNC_FAILURES_PER_SESSION\s*=\s*5/,
      explanation: 'После серии ошибок синхронизация устройства уходит в cooldown.',
      actualValue: '5 ошибок за сессию',
      tags: ['device', 'retry', 'cooldown'],
    },
    {
      id: 'remote_config_cache',
      sectionId: 'security',
      category: 'remote config',
      name: 'Cache runtime-конфига',
      fileName: 'remoteConfig',
      pattern: /APP_CONTROL_CACHE_MAX_AGE_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/,
      explanation: 'Если Firebase недоступен, приложение использует кэшированный app_control.',
      actualValue: '24 часа',
      tags: ['remote_config', 'cache'],
    },
    {
      id: 'remote_config_timeout',
      sectionId: 'limits',
      category: 'remote config',
      name: 'Timeout чтения remote config',
      fileName: 'remoteConfig',
      pattern: /REMOTE_CONFIG_LOAD_TIMEOUT_MS\s*=\s*4500/,
      explanation: 'Загрузка runtime-конфига ограничена таймаутом при старте приложения.',
      actualValue: '4500 мс',
      tags: ['remote_config', 'timeout'],
    },
    {
      id: 'security_config_validation',
      sectionId: 'security',
      category: 'validators',
      name: 'Валидация security_config',
      fileName: 'securityConfigValidator',
      pattern: 'validateRemoteAppControlConfig',
      explanation: 'Runtime config нормализуется и валидируется перед использованием.',
      tags: ['validator', 'security_config'],
    },
    {
      id: 'moderation_pending',
      sectionId: 'moderation',
      category: 'statuses',
      name: 'Pending moderation',
      fileName: 'moderation',
      pattern: 'pending',
      explanation: 'В проекте есть технический статус ожидания модерации.',
      actualValue: 'pending',
      tags: ['moderation', 'status'],
    },
    {
      id: 'admin_moderation_service',
      sectionId: 'moderation',
      category: 'admin panel',
      name: 'Admin moderation service',
      fileName: 'Admin moderationService',
      pattern: /approved|rejected|pending/,
      explanation: 'Админ-панель читает и меняет реальные статусы модерации.',
      tags: ['moderation', 'admin_panel'],
    },
    {
      id: 'archive_expire',
      sectionId: 'moderation',
      category: 'archive',
      name: 'Archive / expire logic',
      fileName: 'Admin moderationService',
      pattern: /archive|expired|expires|ttl/i,
      explanation: 'Проверка наличия логики архивации или истечения срока записей.',
      missingRisk: 'medium',
      tags: ['moderation', 'archive'],
    },
    {
      id: 'buy_sell_moderation',
      sectionId: 'moderation',
      category: 'buy sell',
      name: 'Buy/Sell moderation status',
      fileName: 'buySellService',
      pattern: 'moderationStatus',
      explanation: 'Объявления buy/sell проходят через moderationStatus.',
      tags: ['moderation', 'buy_sell'],
    },
    {
      id: 'text_validators',
      sectionId: 'limits',
      category: 'validators',
      name: 'Text validators',
      fileName: 'validators',
      pattern: /min|max|length|sanitize/i,
      explanation: 'Проект содержит централизованные проверки текстовых полей.',
      tags: ['validators', 'text'],
    },
    {
      id: 'runtime_traces',
      sectionId: 'security',
      category: 'observability',
      name: 'Runtime trace protections',
      fileName: 'runtimeMonitorService',
      pattern: 'recordRuntimeTrace',
      explanation: 'Критические runtime-операции могут писать диагностические события.',
      tags: ['runtime', 'diagnostics'],
    },
    {
      id: 'invite_access_gate',
      sectionId: 'access',
      category: 'sponsor system',
      name: 'Invite / sponsor gate',
      fileName: 'SoftInviteAccessGate',
      pattern: /featureEnabled|sponsor|invite/i,
      explanation: 'В приложении есть мягкий gate для системы приглашений и поручителей.',
      tags: ['invite', 'sponsor'],
    },
    {
      id: 'upload_namespaces',
      sectionId: 'limits',
      category: 'upload',
      name: 'Native upload namespace flags',
      fileName: 'featureFlags',
      pattern: 'NATIVE_UPLOAD_NAMESPACES',
      explanation: 'Список namespace управляет включением native upload engine.',
      tags: ['upload', 'feature_flags'],
    },
  ];

  return rules.map((rule) => buildCodeRule(rule, files, generatedAt));
};

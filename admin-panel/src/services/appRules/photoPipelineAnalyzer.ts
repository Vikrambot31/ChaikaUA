import type { AppRuleItem, AppRulePipelineStep, SourceFileSnapshot } from '../../types/appRules';
import { createSource, findEvidence, findLine, hasPattern } from './rulesRegistry';

type PatternRule = {
  id: string;
  category: string;
  name: string;
  fileName: string;
  pattern: string | RegExp;
  explanation: string;
  missingRisk?: AppRuleItem['risk'];
  risk?: AppRuleItem['risk'];
  actualValue?: (file: SourceFileSnapshot) => string;
  tags: string[];
};

const ruleSource = (file: SourceFileSnapshot, pattern: string | RegExp) =>
  createSource('source_code', file.name, file.path, findLine(file.content, pattern));

const missingSource = (fileName: string) =>
  createSource('generated', fileName, fileName);

const DOWNLOAD_URL_MARKER = 'storageUrlResolver';
const RESUMABLE_UPLOAD_MARKER = 'startResumableUpload';

const buildRule = (
  config: PatternRule,
  files: SourceFileSnapshot[],
  generatedAt: number,
): AppRuleItem => {
  const file = files.find((item) => item.name === config.fileName);
  const found = file ? hasPattern(file.content, config.pattern) : false;
  return {
    id: `photo:${config.id}`,
    sectionId: 'photos',
    category: config.category,
    name: config.name,
    status: found ? 'active' : 'missing',
    risk: found ? config.risk ?? 'low' : config.missingRisk ?? 'medium',
    actualValue: found && file ? config.actualValue?.(file) ?? 'Найдено в коде' : 'Правило не найдено',
    explanation: config.explanation,
    evidence: found && file ? findEvidence(file.content, config.pattern) : 'Фрагмент не найден в актуальных исходниках',
    source: found && file ? ruleSource(file, config.pattern) : missingSource(config.fileName),
    tags: ['photo', ...config.tags],
    updatedAt: generatedAt,
  };
};

export const analyzePhotoPipeline = (
  files: SourceFileSnapshot[],
  generatedAt: number,
): { items: AppRuleItem[]; pipeline: AppRulePipelineStep[] } => {
  const rules: PatternRule[] = [
    {
      id: 'max_photos',
      category: 'limits',
      name: 'Лимит количества фото',
      fileName: 'PhotoUploadField',
      pattern: /maxPhotos\s*=\s*5/,
      explanation: 'Компонент загрузки по умолчанию ограничивает количество выбранных фото.',
      actualValue: () => 'maxPhotos = 5 по умолчанию',
      tags: ['maxPhotos'],
    },
    {
      id: 'picker_permissions',
      category: 'permissions',
      name: 'Проверка разрешения галереи',
      fileName: 'PhotoUploadField',
      pattern: 'requestMediaLibraryPermissionsAsync',
      explanation: 'Перед выбором фото запрашивается доступ к медиатеке, кроме Android 13+ ветки.',
      tags: ['permission', 'picker'],
    },
    {
      id: 'copy_to_cache',
      category: 'pipeline',
      name: 'Копирование в cache',
      fileName: 'PhotoUploadField',
      pattern: 'FileSystem.copyAsync',
      explanation: 'Выбранный файл копируется во временный cache перед подготовкой.',
      tags: ['cache'],
    },
    {
      id: 'thumbnail',
      category: 'pipeline',
      name: 'Thumbnail generation',
      fileName: 'PhotoUploadField',
      pattern: /resize:\s*\{\s*width:\s*360\s*\}/,
      explanation: 'Для превью создаётся отдельное JPEG-изображение шириной 360px.',
      actualValue: () => 'width 360, compress 0.72, JPEG',
      tags: ['thumbnail'],
    },
    {
      id: 'compression_component',
      category: 'compression',
      name: 'Compression в PhotoUploadField',
      fileName: 'PhotoUploadField',
      pattern: /maxWidth:\s*1600,\s*maxHeight:\s*1600,\s*quality:\s*0\.82/s,
      explanation: 'Перед resumable upload фото сжимается до безопасного размера.',
      actualValue: () => '1600x1600, quality 0.82',
      tags: ['compression'],
    },
    {
      id: 'compression_service',
      category: 'compression',
      name: 'Compression в photoUploadService',
      fileName: 'photoUploadService',
      pattern: /maxWidth:\s*1920,\s*maxHeight:\s*1920,\s*quality:\s*0\.82/s,
      explanation: 'Сервисный upload pipeline использует общий компрессор с лимитом 1920x1920.',
      actualValue: () => '1920x1920, quality 0.82',
      tags: ['compression', 'service'],
    },
    {
      id: 'upload_retry',
      category: 'retry',
      name: 'Повторы upload',
      fileName: 'photoUploadService',
      pattern: /PHOTO_UPLOAD_MAX_ATTEMPTS\s*=\s*4/,
      explanation: 'Общий сервис загрузки делает несколько попыток с backoff.',
      actualValue: () => '4 попытки',
      tags: ['retry'],
    },
    {
      id: 'upload_timeout',
      category: 'limits',
      name: 'Upload timeout',
      fileName: 'photoUploadService',
      pattern: /PHOTO_UPLOAD_TIMEOUT_MS\s*=\s*35_000/,
      explanation: 'Каждая попытка upload ограничена таймаутом.',
      actualValue: () => '35 секунд',
      tags: ['timeout'],
    },
    {
      id: 'storage_path',
      category: 'storage',
      name: 'Storage path',
      fileName: 'PhotoUploadField',
      pattern: /\$\{storageFolder\}\/\$\{uid\}\/\$\{Date\.now\(\)\}_\$\{makeId\(\)\}\.jpg/,
      explanation: 'Путь файла строится из namespace, uid и уникального имени.',
      actualValue: () => '${storageFolder}/${uid}/{timestamp}_{id}.jpg',
      tags: ['storage_path'],
    },
    {
      id: 'moderation_metadata',
      category: 'moderation',
      name: 'Metadata в photo_uploads',
      fileName: 'PhotoUploadField',
      pattern: /push\(dbRef\(database,\s*'photo_uploads'\)/,
      explanation: 'После загрузки создаётся запись photo_uploads со статусом approved (фото публикуется без ручной модерации).',
      actualValue: () => 'photo_uploads.status = approved',
      tags: ['photo_uploads', 'moderation'],
    },
    {
      id: 'resolve_url',
      category: 'display',
      name: 'Resolve URL',
      fileName: 'AppPhotoImage',
      pattern: DOWNLOAD_URL_MARKER,
      explanation: 'Компонент отображения умеет получать download URL из storagePath.',
      tags: ['display', 'download_url'],
    },
    {
      id: 'preview_fallback',
      category: 'display',
      name: 'Fallback при ошибке preview',
      fileName: 'PhotoUploadField',
      pattern: 'failedPreviewIds',
      explanation: 'Ошибки превью фиксируются в state и показывают fallback вместо битой картинки.',
      tags: ['preview', 'fallback'],
    },
  ];

  const items = rules.map((rule) => buildRule(rule, files, generatedAt));
  const stepRules = [
    ['select', 'Выбор фото', 'launchImageLibraryAsync'],
    ['permission', 'Проверка разрешений', 'requestMediaLibraryPermissionsAsync'],
    ['cache', 'Копирование в cache', 'FileSystem.copyAsync'],
    ['thumbnail', 'Создание thumbnail', 'manipulateAsync'],
    ['compression', 'Compression', 'compressImage'],
    ['upload', 'Upload', RESUMABLE_UPLOAD_MARKER],
    ['storagePath', 'Получение storagePath', 'storagePath'],
    ['moderation', 'Moderation', 'photo_uploads'],
    ['resolve', 'Resolve URL', DOWNLOAD_URL_MARKER],
    ['display', 'Отображение в приложении', 'Image'],
  ] as const;
  const photoField = files.find((file) => file.name === 'PhotoUploadField');
  const appPhotoImage = files.find((file) => file.name === 'AppPhotoImage');

  const pipeline: AppRulePipelineStep[] = stepRules.map(([id, title, pattern]) => {
    const file = pattern === DOWNLOAD_URL_MARKER || title === 'Отображение в приложении'
      ? appPhotoImage ?? photoField
      : photoField;
    const found = file ? hasPattern(file.content, pattern) : false;
    return {
      id,
      title,
      status: found ? 'active' : 'missing',
      risk: found ? 'low' : 'medium',
      source: found && file ? ruleSource(file, pattern) : missingSource('PhotoUploadField'),
      evidence: found && file ? findEvidence(file.content, pattern) : 'Этап не найден в коде',
    };
  });

  return { items, pipeline };
};


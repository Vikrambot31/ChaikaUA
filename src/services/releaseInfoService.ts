import { get, orderByChild, query, ref, limitToLast } from 'firebase/database';
import { database } from '../firebase-config';

export interface ReleaseFileEntry {
  commits: string[];
}

export interface ReleaseInfo {
  versionKey: string;
  version: string;
  versionCode: number;
  buildStamp: string;
  commitHash: string;
  buildMode: string;
  otaMode: string;
  timestamp: string;
  machineId: string;
  apkSha256: string;
  apkSizeMB: number;
  bundleFingerprint: string;
  files: Record<string, ReleaseFileEntry>;
  summary: string;
  createdAt: number;
}

const PATH = 'app_releases';

// Map of file path substrings to Russian screen names
// Used to display "what screen" next to file names
const SCREEN_NAME_MAP: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /Karta-Chayki/, name: 'Карта Чайки' },
  { pattern: /Spisok-Mest/, name: 'Список мест' },
  { pattern: /Panel-Detaley-Mesta/, name: 'Детали места' },
  { pattern: /Spisok-Zayavok/, name: 'Список заявок' },
  { pattern: /Vibor-Temy-Zayavki/, name: 'Выбор темы заявки' },
  { pattern: /Forma-Zayavki/, name: 'Форма заявки' },
  { pattern: /Pomoch-Sosedyam/, name: 'Помочь соседям' },
  { pattern: /Zapros-Pomoshi/, name: 'Запрос помощи' },
  { pattern: /Luchshiye-Mesta/, name: 'Лучшие места' },
  { pattern: /Lyudi-Chayki/, name: 'Люди Чайки' },
  { pattern: /Problemy-Chayki/, name: 'Проблемы Чайки' },
  { pattern: /Interesnye-Mesta/, name: 'Интересные места' },
  { pattern: /Status-Sveta/, name: 'Статус света' },
  { pattern: /Profil-Polzovatelya/, name: 'Профиль пользователя' },
  { pattern: /EditProfileScreen/, name: 'Редактирование профиля' },
  { pattern: /Spravka/, name: 'Справка' },
  { pattern: /Obyavleniya/, name: 'Объявления' },
  { pattern: /Poisk-Raboty/, name: 'Поиск работы' },
  { pattern: /Kuplu-Prodam/, name: 'Куплю-Продам' },
  { pattern: /Pro-Prilozhenie/, name: 'О приложении' },
  { pattern: /Vkhod/, name: 'Вход' },
  { pattern: /Registraciya-Polnaya/, name: 'Регистрация' },
  { pattern: /Glavny-Ekran/, name: 'Главный экран' },
  { pattern: /Onlayn-Chat/, name: 'Онлайн чат' },
  { pattern: /Detal-Zayavki/, name: 'Детали заявки' },
  { pattern: /Ekran-Koda-Zagruzki/, name: 'Экран кода загрузки' },
  { pattern: /Istoriya-Zaprosov/, name: 'История запросов' },
  { pattern: /Moi-Zayavki/, name: 'Мои заявки' },
  { pattern: /Moderaciya-Foto/, name: 'Модерация фото' },
  { pattern: /ServiceModerationScreen/, name: 'Сервисная модерация' },
  { pattern: /ServiceModerationIssuesScreen/, name: 'Проблемы модерации' },
  { pattern: /AdminRuntimeMonitorScreen/, name: 'Монитор ошибок' },
  { pattern: /UserErrorModerationMonitorScreen/, name: 'Мониторинг ошибок пользователей' },
  { pattern: /UserErrorMonitorScreen/, name: 'Ошибки пользователя' },
  { pattern: /AdminUserErrorsScreen/, name: 'Ошибки пользователей (Admin)' },
  { pattern: /ServerStatusScreen/, name: 'Статус сервера' },
  { pattern: /AuthDiagnosticScreen/, name: 'Диагностика авторизации' },
  { pattern: /SecurityControlScreen/, name: 'Контроль безопасности' },
  { pattern: /Razdel/, name: 'Раздел' },
  { pattern: /Top-Kafe/, name: 'Топ кафе' },
  { pattern: /Top-Magaziny/, name: 'Топ магазины' },
  { pattern: /Podpiska-Premium/, name: 'Подписка Premium' },
  { pattern: /Reyting-Domov/, name: 'Рейтинг домов' },
  { pattern: /QR-Kod/, name: 'QR-код' },
  { pattern: /Mistsa-i-Lyudi-Hub/, name: 'Места и люди (хаб)' },
  { pattern: /Poruchitel/, name: 'Поручитель' },
  { pattern: /OSBB-Hub/, name: 'ОСББ хаб' },
  { pattern: /OSBB-Sbor/, name: 'ОСББ сборы' },
  { pattern: /OSBB-Golosovanie/, name: 'ОСББ голосование' },
  { pattern: /OSBB-Finansy/, name: 'ОСББ финансы' },
  { pattern: /OSBB-Novosti/, name: 'ОСББ новости' },
  { pattern: /OSBB-Setup/, name: 'ОСББ настройка' },
  { pattern: /OSBB-AddNews/, name: 'ОСББ добавить новость' },
  { pattern: /OSBB-AdminPanel/, name: 'ОСББ администрирование' },
  { pattern: /Chaika-Bonus-Plus/, name: 'Чайка Бонус Плюс' },
  { pattern: /Foto-Rayona/, name: 'Фото района' },
  { pattern: /Mesta-Chayki/, name: 'Места Чайки' },
  { pattern: /Kto-Poteryal/, name: 'Кто потерял' },
  { pattern: /Vazhnye-Novosti-Chayki/, name: 'Важные новости' },
  { pattern: /Nalashtuvannya-Spovishchen/, name: 'Настройки уведомлений' },
  { pattern: /Sport-Na-Chayke/, name: 'Спорт на Чайке' },
  { pattern: /Sport-Detal/, name: 'Детали спорта' },
  { pattern: /ProfileRequestsScreen/, name: 'Заявки профиля' },
  { pattern: /MyPhotosScreen/, name: 'Мои фото' },
  { pattern: /MyApprovedPhotosScreen/, name: 'Одобренные фото' },
  { pattern: /AppVersionInfoScreen/, name: 'Версия APP и обновления' },
  { pattern: /RootNavigator/, name: 'Навигатор (корень)' },
];

export function getScreenNameForFile(filePath: string): string | null {
  for (const { pattern, name } of SCREEN_NAME_MAP) {
    if (pattern.test(filePath)) return name;
  }
  return null;
}

function mapRelease(key: string, val: Record<string, unknown>): ReleaseInfo {
  const rawFiles = (val.files && typeof val.files === 'object') ? val.files as Record<string, unknown> : {};
  const files: Record<string, ReleaseFileEntry> = {};

  for (const [filePath, fileData] of Object.entries(rawFiles)) {
    const data = fileData && typeof fileData === 'object' ? fileData as Record<string, unknown> : {};
    const commits = Array.isArray(data.commits)
      ? data.commits.filter((c): c is string => typeof c === 'string')
      : [];
    files[filePath] = { commits };
  }

  return {
    versionKey: key,
    version: typeof val.version === 'string' ? val.version : key,
    versionCode: typeof val.versionCode === 'number' ? val.versionCode : 0,
    buildStamp: typeof val.buildStamp === 'string' ? val.buildStamp : '',
    commitHash: typeof val.commitHash === 'string' ? val.commitHash : '',
    buildMode: typeof val.buildMode === 'string' ? val.buildMode : '',
    otaMode: typeof val.otaMode === 'string' ? val.otaMode : '',
    timestamp: typeof val.timestamp === 'string' ? val.timestamp : '',
    machineId: typeof val.machineId === 'string' ? val.machineId : '',
    apkSha256: typeof val.apkSha256 === 'string' ? val.apkSha256 : '',
    apkSizeMB: typeof val.apkSizeMB === 'number' ? val.apkSizeMB : 0,
    bundleFingerprint: typeof val.bundleFingerprint === 'string' ? val.bundleFingerprint : '',
    files,
    summary: typeof val.summary === 'string' ? val.summary : '',
    createdAt: typeof val.createdAt === 'number' ? val.createdAt : 0,
  };
}

export async function getReleases(limit: number = 10): Promise<ReleaseInfo[]> {
  const snapshot = await get(query(ref(database, PATH), orderByChild('createdAt'), limitToLast(limit)));
  if (!snapshot.exists()) return [];

  const val = snapshot.val() as Record<string, Record<string, unknown>>;
  const releases = Object.entries(val).map(([key, data]) => mapRelease(key, data));
  return releases.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCurrentRelease(): Promise<ReleaseInfo | null> {
  const releases = await getReleases(1);
  return releases[0] ?? null;
}

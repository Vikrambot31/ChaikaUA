import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { SecurityRole } from '../services/authService';
import { signOutAdmin, switchLocalUser } from '../services/authService';
import { useFirebaseConnection } from '../hooks/useFirebaseConnection';
import { InfoHint } from './InfoHint';
import { LOCAL_MODE, type LocalUserRole } from '../local/LOCAL_MODE';
import { LocalServerControl } from './LocalServerControl';
import { useViewMode, type ViewMode } from '../contexts/ViewModeContext';
import { useDashboardContext } from '../contexts/DashboardContext';
import type { DashboardStats } from '../services/dashboardService';

export type AdminPageKey = 'dashboard' | 'moderation' | 'archive' | 'invite_access' | 'guarantor_tree' | 'access_control' | 'security' | 'errors' | 'photo_approval' | 'releases' | 'ai_diagnostics' | 'app_rules' | 'support' | 'bonus_credits' | 'ad_chat';

type AppShellProps = {
  children: ReactNode;
  user: User;
  role: SecurityRole;
  activePage: AdminPageKey;
  onNavigate: (page: AdminPageKey) => void;
  photoPendingCount?: number;
};

const navItems: Array<{ key: AdminPageKey; label: string; hint: string }> = [
  {
    key: 'dashboard',
    label: 'Панель',
    hint: 'Сводный экран: статистика, состояние системы, активность и быстрые действия.',
  },
  {
    key: 'moderation',
    label: 'Модерация',
    hint: 'Проверка заявок и контента: одобрение, отклонение и удаление.',
  },
  {
    key: 'archive',
    label: 'Архив',
    hint: 'Просроченные записи: просмотр, восстановление в активные или окончательное удаление.',
  },
  {
    key: 'invite_access',
    label: 'Приглашения',
    hint: 'Доверенные поручители, заявки на доступ и флаг включения системы приглашений.',
  },
  {
    key: 'guarantor_tree',
    label: 'Дерево доверия',
    hint: 'Визуализация цепочек приглашений и связей доверия.',
  },
  {
    key: 'access_control',
    label: 'Контроль доступа',
    hint: 'Управление уровнями Public / Registered / Trusted. Статистика, режим системы, быстрая выдача временного доступа.',
  },
  {
    key: 'security',
    label: 'Безопасность',
    hint: 'Управление режимами приложения, устройствами и журналом событий безопасности.',
  },
  {
    key: 'errors',
    label: 'Монитор ошибок',
    hint: 'Ошибки runtime и пользовательские отчеты из diagnostics/runtime_moderation и diagnostics/user_reports.',
  },
  {
    key: 'photo_approval',
    label: 'Одобрение фото',
    hint: 'Фото пользователей ожидающие одобрения. Одобрите или отклоните каждое фото. Пути: community_photos и photo_uploads.',
  },
  {
    key: 'releases',
    label: 'Релизы',
    hint: 'История релизов APK: версии, изменённые файлы, коммит-сообщения.',
  },
  {
    key: 'ai_diagnostics',
    label: 'AI Diagnostics',
    hint: 'Глубокий AI-аудит проекта: Upload, Firebase, Runtime, Performance, Observability, Crash Safety. Запуск, live-прогресс, отчёты.',
  },
  {
    key: 'app_rules',
    label: 'Серверні правила',
    hint: 'Живая карта текущих правил: Firebase Rules, Storage Rules, runtime-конфиги, upload pipeline, доступ, модерация и риски.',
  },
  {
    key: 'support',
    label: 'Служба Підтримки',
    hint: 'Звернення користувачів: перегляд, відповідь, закриття тикетів.',
  },
  {
    key: 'bonus_credits',
    label: 'Бонуси та кредити',
    hint: 'Управління бонусами довіри та промо-кредитами: баланси, транзакції, промоції, фрод-моніторинг.',
  },
  {
    key: 'ad_chat',
    label: 'Рекламний чат',
    hint: 'Звернення з питань реклами та промо-кредитів: перегляд, відповідь, закриття.',
  },
];

const navItemIcons: Record<AdminPageKey, string> = {
  dashboard: '\u{1F4CA}',
  moderation: '\u{1F50D}',
  archive: '\u{1F5C2}',
  invite_access: '\u{1F39F}',
  guarantor_tree: '🌳',
  access_control: '\u{1F510}',
  security: '\u{1F6E1}',
  errors: '\u{1F6A8}',
  photo_approval: '\u{2705}',
  releases: '\u{1F4E6}',
  ai_diagnostics: '\u{1F9E0}',
  app_rules: '\u{1F4CB}',
  support: '\u{1F3A7}',
  bonus_credits: '\u{1F4B0}',
  ad_chat: '\u{1F4E2}',
};

type AttentionLevel = 'low' | 'medium' | 'high';

type AttentionMeter = {
  level: AttentionLevel;
  red: number;
  yellow: number;
  green: number;
  label: string;
};

const attentionMeter = (level: AttentionLevel, red: number, yellow: number, green: number, label: string): AttentionMeter => ({
  level,
  red,
  yellow,
  green,
  label,
});

const getAttentionMeter = (page: AdminPageKey, stats: DashboardStats): AttentionMeter => {
  if (page === 'moderation') {
    if (stats.pending > 20) return attentionMeter('high', 3, 1, 0, `${stats.pending} ожидают модерации`);
    if (stats.pending > 0) return attentionMeter('medium', 1, 2, 1, `${stats.pending} ожидают модерации`);
    return attentionMeter('low', 0, 0, 4, 'Очередь модерации чистая');
  }

  if (page === 'archive') {
    const archiveRisk = stats.expired + stats.rejected;
    if (archiveRisk > 30) return attentionMeter('high', 3, 1, 0, `${archiveRisk} записей требуют проверки`);
    if (archiveRisk > 0) return attentionMeter('medium', 1, 2, 1, `${archiveRisk} записей в архиве`);
    return attentionMeter('low', 0, 0, 4, 'Архив без срочных факторов');
  }

  if (page === 'invite_access' || page === 'guarantor_tree' || page === 'access_control') {
    if (stats.pendingInviteRequests > 10) return attentionMeter('high', 3, 1, 0, `${stats.pendingInviteRequests} заявок доступа`);
    if (stats.pendingInviteRequests > 0) return attentionMeter('medium', 1, 2, 1, `${stats.pendingInviteRequests} заявок доступа`);
    return attentionMeter('low', 0, 0, 4, 'Нет срочных заявок доступа');
  }

  if (page === 'security' || page === 'app_rules') {
    const critical = stats.blockedDevices + (stats.rulesEnforcementLevel === 'OPEN' ? 5 : 0);
    const warning = stats.permissionDenied24h + (stats.rulesEnforcementLevel === 'PARTIAL' ? 2 : 0);
    if (critical > 0) return attentionMeter('high', 3, warning > 0 ? 1 : 0, 0, `${critical} критических факторов безопасности`);
    if (warning > 0) return attentionMeter('medium', 0, 3, 1, `${warning} предупреждений безопасности`);
    return attentionMeter('low', 0, 0, 4, 'Безопасность без срочных факторов');
  }

  if (page === 'errors' || page === 'ai_diagnostics') {
    if (stats.permissionDenied24h > 10) return attentionMeter('high', 3, 1, 0, `${stats.permissionDenied24h} permission_denied за 24ч`);
    if (stats.permissionDenied24h > 0) return attentionMeter('medium', 1, 2, 1, `${stats.permissionDenied24h} permission_denied за 24ч`);
    return attentionMeter('low', 0, 0, 4, 'Ошибки без срочного риска');
  }

  if (page === 'photo_approval') {
    if (stats.pendingPhotos > 20) return attentionMeter('high', 3, 1, 0, `${stats.pendingPhotos} фото ждут проверки`);
    if (stats.pendingPhotos > 0) return attentionMeter('medium', 1, 2, 1, `${stats.pendingPhotos} фото ждут проверки`);
    return attentionMeter('low', 0, 0, 4, 'Фото без очереди');
  }

  if (page === 'dashboard') {
    const critical = stats.blockedDevices + (stats.rulesEnforcementLevel === 'OPEN' ? 1 : 0);
    const warning = stats.pending + stats.pendingInviteRequests + stats.pendingPhotos + stats.permissionDenied24h;
    if (critical > 0) return attentionMeter('high', 3, 1, 0, `${critical} критических факторов`);
    if (warning > 0) return attentionMeter('medium', 1, 2, 1, `${warning} факторов внимания`);
    return attentionMeter('low', 0, 0, 4, 'Сводка без срочных факторов');
  }

  return attentionMeter('low', 0, 0, 4, 'Нет срочных факторов');
};

const renderAttentionDots = (meter: AttentionMeter) => [
  ...Array.from({ length: meter.red }, (_, index) => <span key={`r-${index}`} className="attentionDot attentionRed" />),
  ...Array.from({ length: meter.yellow }, (_, index) => <span key={`y-${index}`} className="attentionDot attentionYellow" />),
  ...Array.from({ length: meter.green }, (_, index) => <span key={`g-${index}`} className="attentionDot attentionGreen" />),
];

const roleLabel = (role: SecurityRole): string => {
  if (role === 'admin') return 'администратор';
  if (role === 'moderator') return 'модератор';
  return 'пользователь';
};

const DEV_USERS: Array<{ role: LocalUserRole; label: string; emoji: string }> = [
  { role: 'admin',     label: 'Admin',    emoji: '👑' },
  { role: 'resident',  label: 'User',     emoji: '🏠' },
  { role: 'moderator', label: 'Mod',      emoji: '🛡' },
  { role: 'guest',     label: 'Guest',    emoji: '👤' },
  { role: 'pending',   label: 'Pending',  emoji: '⏳' },
];

export const AppShell = ({ children, user, role, activePage, onNavigate, photoPendingCount }: AppShellProps) => {
  const connected = useFirebaseConnection();
  const { viewMode, setViewMode } = useViewMode();
  const { stats, error: dashboardError } = useDashboardContext();
  if (dashboardError && !dashboardError.toLowerCase().includes('permission_denied') && !dashboardError.toLowerCase().includes('permission denied')) {
    console.error('[AppShell] dashboard error:', dashboardError);
  }

  const renderModeButton = (mode: ViewMode, label: string) => (
    <button
      type="button"
      className={viewMode === mode ? 'viewModeButton active' : 'viewModeButton'}
      onClick={() => setViewMode(mode)}
    >
      {label}
    </button>
  );

  return (
  <div className="shell">
    <aside className="sidebar">
      <div>
        <p className="eyebrow">Chaika Life</p>
        <h1>Админ Бета</h1>
        <p className="accountEmail">{user.email}</p>
        <p className="roleBadge">{roleLabel(role)}</p>
        <div className="viewModeToggle" aria-label="Режим отображения админ-панели">
          {renderModeButton('simple', 'Обычный')}
          {renderModeButton('full', 'Расширенный')}
        </div>
      </div>
      <nav className="nav">
        {navItems.map((item) => {
          const meter = getAttentionMeter(item.key, stats);
          return (
            <div key={item.key} className="navItemRow">
              <div className="navItemStack">
                <button
                  type="button"
                  className={item.key === activePage ? 'navItem active' : 'navItem'}
                  onClick={() => onNavigate(item.key)}
                >
                  <span className="navItemLabel">
                    <span className="iconBadge" aria-hidden="true">{navItemIcons[item.key]}</span>
                    <span>{item.label}</span>
                    {item.key === 'photo_approval' && photoPendingCount != null && photoPendingCount > 0 && (
                      <span style={{
                        marginLeft: 6,
                        background: '#e53935',
                        color: '#fff',
                        borderRadius: 10,
                        padding: '1px 7px',
                        fontSize: 11,
                        fontWeight: 800,
                        lineHeight: 1.6,
                      }}>{photoPendingCount}</span>
                    )}
                  </span>
                </button>
                <div className={`attentionMeter attention-${meter.level}`} title={meter.label} aria-label={meter.label}>
                  <div className="attentionDots">{renderAttentionDots(meter)}</div>
                  <div className="attentionTrack" aria-hidden="true">
                    <span className="attentionTrackRed" />
                    <span className="attentionTrackYellow" />
                    <span className="attentionTrackGreen" />
                  </div>
                </div>
              </div>
              <InfoHint text={item.hint} />
            </div>
          );
        })}
      </nav>
      <div className="navItemRow">
        <button type="button" className="logoutButton" onClick={() => void signOutAdmin()}>
          <span className="navItemLabel">
            <span className="iconBadge" aria-hidden="true">{'\u{1F6AA}'}</span>
            <span>Выйти</span>
          </span>
        </button>
        <InfoHint text="Завершает текущую админ-сессию." />
      </div>
    </aside>
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {LOCAL_MODE && (
        <div style={{
          background: '#1a1a2e', color: '#a0c4ff', fontSize: 12, fontWeight: 700,
          padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid #2a2a4a', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ opacity: 0.6, marginRight: 4 }}>🛠 DEV</span>

          {/* Переключатель ролей */}
          {DEV_USERS.map(u => (
            <button
              key={u.role}
              type="button"
              onClick={() => void switchLocalUser(u.role)}
              style={{
                background: role === (u.role === 'resident' ? 'user' : u.role) ? '#3a5a9a' : '#2a2a4a',
                color: '#e0eaff',
                border: '1px solid #3a3a6a',
                borderRadius: 4,
                padding: '2px 8px',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {u.emoji} {u.label}
            </button>
          ))}

          {/* Разделитель */}
          <span style={{ opacity: 0.2, fontSize: 16, margin: '0 4px' }}>|</span>

          {/* Управление локальным сервером */}
          <LocalServerControl />
        </div>
      )}
      {connected === false && !LOCAL_MODE && (
        <div style={{
          background: '#7a3a00', color: '#ffe0b2', fontSize: 13, fontWeight: 700,
          padding: '8px 20px', textAlign: 'center', letterSpacing: 0.3,
        }}>
          {'⚠ Firebase офлайн — данные могут быть устаревшими. Проверьте интернет-соединение.'}
        </div>
      )}
      <main className={`main page-${activePage} view-mode-${viewMode}`}>{children}</main>
    </div>
  </div>
  );
};

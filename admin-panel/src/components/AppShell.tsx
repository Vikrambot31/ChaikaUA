import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { SecurityRole } from '../services/authService';
import { signOutAdmin } from '../services/authService';
import { useFirebaseConnection } from '../hooks/useFirebaseConnection';
import { InfoHint } from './InfoHint';

export type AdminPageKey = 'dashboard' | 'moderation' | 'archive' | 'invite_access' | 'guarantor_tree' | 'access_control' | 'security' | 'errors' | 'photo_approval' | 'releases' | 'ai_diagnostics';

type AppShellProps = {
  children: ReactNode;
  user: User;
  role: SecurityRole;
  activePage: AdminPageKey;
  onNavigate: (page: AdminPageKey) => void;
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
    label: 'Дерево поручителей',
    hint: 'Визуализация цепочек приглашений и связей между поручителями.',
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
];

const navItemIcons: Record<AdminPageKey, string> = {
  dashboard: '\u{1F4CA}',
  moderation: '\u{1F50D}',
  archive: 'AR',
  invite_access: 'IA',
  guarantor_tree: '🌳',
  access_control: '\u{1F510}',
  security: '\u{1F6E1}',
  errors: '\u{1F6A8}',
  photo_approval: '\u{2705}',
  releases: '\u{1F4E6}',
  ai_diagnostics: '\u{1F9E0}',
};

const roleLabel = (role: SecurityRole): string => {
  if (role === 'admin') return 'администратор';
  if (role === 'moderator') return 'модератор';
  if (role === 'tester') return 'тестер';
  return 'пользователь';
};

export const AppShell = ({ children, user, role, activePage, onNavigate }: AppShellProps) => {
  const connected = useFirebaseConnection();
  return (
  <div className="shell">
    <aside className="sidebar">
      <div>
        <p className="eyebrow">Chaika Life</p>
        <h1>Админ Бета</h1>
        <p className="accountEmail">{user.email}</p>
        <p className="roleBadge">{roleLabel(role)}</p>
      </div>
      <nav className="nav">
        {navItems.map((item) => (
          <div key={item.key} className="navItemRow">
            <button
              type="button"
              className={item.key === activePage ? 'navItem active' : 'navItem'}
              onClick={() => onNavigate(item.key)}
            >
              <span className="navItemLabel">
                <span className="iconBadge" aria-hidden="true">{navItemIcons[item.key]}</span>
                <span>{item.label}</span>
              </span>
            </button>
            <InfoHint text={item.hint} />
          </div>
        ))}
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
      {connected === false && (
        <div style={{
          background: '#7a3a00', color: '#ffe0b2', fontSize: 13, fontWeight: 700,
          padding: '8px 20px', textAlign: 'center', letterSpacing: 0.3,
        }}>
          {'⚠ Firebase офлайн — данные могут быть устаревшими. Проверьте интернет-соединение.'}
        </div>
      )}
      <main className={`main page-${activePage}`}>{children}</main>
    </div>
  </div>
  );
};

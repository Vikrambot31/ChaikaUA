import { useEffect, useState } from 'react';
import { AppShell, type AdminPageKey } from './components/AppShell';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { useAuthAccess } from './hooks/useAuthAccess';
import { DashboardPage } from './pages/DashboardPage';
import { ErrorMonitorPage } from './pages/ErrorMonitorPage';
import { InviteAccessPage } from './pages/InviteAccessPage';
import { LoginPage } from './pages/LoginPage';
import { ModerationPage } from './pages/ModerationPage';
import { PhotoApprovalPage } from './pages/PhotoApprovalPage';
import { PhotoTestMonitorPage } from './pages/PhotoTestMonitorPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { SecurityPage } from './pages/SecurityPage';

const VALID_PAGES = new Set<AdminPageKey>([
  'dashboard', 'moderation', 'invite_access', 'security', 'errors', 'photo_approval', 'releases', 'photo_test',
]);

const getPageFromHash = (): AdminPageKey => {
  const hash = window.location.hash.slice(1);
  return VALID_PAGES.has(hash as AdminPageKey) ? (hash as AdminPageKey) : 'dashboard';
};

export const App = () => {
  const access = useAuthAccess();
  const [activePage, setActivePage] = useState<AdminPageKey>(getPageFromHash);

  useEffect(() => {
    const onHashChange = () => setActivePage(getPageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (page: AdminPageKey) => {
    window.location.hash = page;
    setActivePage(page);
  };

  if (access.status === 'loading') {
    return <div className="loadingScreen">Проверка админ-сессии...</div>;
  }

  if (access.status === 'signedOut') {
    return <LoginPage />;
  }

  if (access.status === 'denied') {
    return <LoginPage deniedError={access.error} />;
  }

  const PAGE_NAMES: Record<AdminPageKey, string> = {
    dashboard: 'Панель',
    moderation: 'Модерация',
    invite_access: 'Доступ по приглашениям',
    security: 'Безопасность',
    errors: 'Монитор ошибок',
    photo_approval: 'Одобрение фото',
    releases: 'Релизы',
    photo_test: 'Тест фото',
  };

  const renderPage = () => {
    if (activePage === 'security') return <SecurityPage user={access.user} />;
    if (activePage === 'moderation') return <ModerationPage user={access.user} />;
    if (activePage === 'invite_access') return <InviteAccessPage role={access.role} />;
    if (activePage === 'errors') return <ErrorMonitorPage />;
    if (activePage === 'photo_approval') return <PhotoApprovalPage />;
    if (activePage === 'photo_test') return <PhotoTestMonitorPage />;
    if (activePage === 'releases') return <ReleasesPage />;
    return <DashboardPage user={access.user} onNavigate={navigate} />;
  };

  return (
    <AppShell
      user={access.user}
      role={access.role}
      activePage={activePage}
      onNavigate={navigate}
    >
      <PageErrorBoundary key={activePage} pageName={PAGE_NAMES[activePage]}>
        {renderPage()}
      </PageErrorBoundary>
    </AppShell>
  );
};

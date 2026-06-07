import { Suspense, lazy, useEffect, useState } from 'react';
import { AppShell, type AdminPageKey } from './components/AppShell';
import { PageErrorBoundary } from './components/PageErrorBoundary';
import { useAuthAccess } from './hooks/useAuthAccess';
import { usePhotoPendingCount } from './hooks/usePhotoPendingCount';
import { DashboardPage } from './pages/DashboardPage';
import { ArchivePage } from './pages/ArchivePage';
import { ErrorMonitorPage } from './pages/ErrorMonitorPage';
import { InviteAccessPage } from './pages/InviteAccessPage';
import { GuarantorTreePage } from './pages/GuarantorTreePage';
import { AccessControlPage } from './pages/AccessControlPage';
import { LoginPage } from './pages/LoginPage';
import { ModerationPage } from './pages/ModerationPage';
import { PhotoApprovalPage } from './pages/PhotoApprovalPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { SecurityPage } from './pages/SecurityPage';
import { AIDiagnosticsPage } from './pages/AIDiagnosticsPage';
import { SupportPage } from './pages/SupportPage';
import { BonusCreditsPage } from './pages/BonusCreditsPage';
import { AdChatPage } from './pages/AdChatPage';
import { PremiumPage } from './pages/PremiumPage';
import { BusinessPlusModerationPage } from './pages/BusinessPlusModerationPage';
import { ViewModeProvider } from './contexts/ViewModeContext';
import { DashboardProvider } from './contexts/DashboardContext';

const AppRulesPage = lazy(() => import('./pages/AppRulesPage'));

const VALID_PAGES = new Set<AdminPageKey>([
  'dashboard', 'moderation', 'archive', 'invite_access', 'guarantor_tree', 'access_control', 'security', 'errors', 'photo_approval', 'releases', 'ai_diagnostics', 'app_rules', 'support', 'bonus_credits', 'ad_chat', 'premium', 'business_plus',
]);

const getPageFromHash = (): AdminPageKey => {
  const hash = window.location.hash.slice(1);
  return VALID_PAGES.has(hash as AdminPageKey) ? (hash as AdminPageKey) : 'dashboard';
};

export const App = () => {
  const access = useAuthAccess();
  const photoPendingCount = usePhotoPendingCount();
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
    archive: 'Архив',
    invite_access: 'Доступ по приглашениям',
    guarantor_tree: 'Дерево доверия',
    access_control: 'Контроль доступа',
    security: 'Безопасность',
    errors: 'Монитор ошибок',
    photo_approval: 'Одобрение фото',
    releases: 'Релизы',
    ai_diagnostics: 'AI Diagnostics',
    app_rules: 'Серверні правила',
    support: 'Служба Підтримки',
    bonus_credits: 'Бонуси та кредити',
    ad_chat: 'Рекламний чат',
    premium: 'Premium підписки',
    business_plus: 'Бізнес+ картки',
  };

  const renderPage = () => {
    if (activePage === 'security') return <SecurityPage user={access.user} />;
    if (activePage === 'moderation') return <ModerationPage user={access.user} />;
    if (activePage === 'archive') return <ArchivePage user={access.user} />;
    if (activePage === 'invite_access') return <InviteAccessPage role={access.role} />;
    if (activePage === 'guarantor_tree') return <GuarantorTreePage user={access.user} role={access.role} onNavigate={navigate} />;
    if (activePage === 'access_control') return <AccessControlPage role={access.role} onNavigateToInvites={() => navigate('invite_access')} />;
    if (activePage === 'errors') return <ErrorMonitorPage />;
    if (activePage === 'photo_approval') return <PhotoApprovalPage />;
    if (activePage === 'releases') return <ReleasesPage />;
    if (activePage === 'ai_diagnostics') return <AIDiagnosticsPage role={access.role} userEmail={access.user.email || ''} />;
    if (activePage === 'support') return <SupportPage />;
    if (activePage === 'bonus_credits') return <BonusCreditsPage />;
    if (activePage === 'ad_chat') return <AdChatPage />;
    if (activePage === 'premium') return <PremiumPage />;
    if (activePage === 'business_plus') return <BusinessPlusModerationPage />;
    if (activePage === 'app_rules') {
      return (
        <Suspense fallback={<div className="loadingScreen">Завантаження серверних правил...</div>}>
          <AppRulesPage role={access.role} />
        </Suspense>
      );
    }
    return <DashboardPage user={access.user} onNavigate={navigate} />;
  };

  return (
    <ViewModeProvider>
    <DashboardProvider>
      <AppShell
        user={access.user}
        role={access.role}
        activePage={activePage}
        onNavigate={navigate}
        photoPendingCount={photoPendingCount}
      >
        <PageErrorBoundary key={activePage} pageName={PAGE_NAMES[activePage]}>
          {renderPage()}
        </PageErrorBoundary>
      </AppShell>
    </DashboardProvider>
    </ViewModeProvider>
  );
};

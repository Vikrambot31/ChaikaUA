import { useMemo } from 'react';
import { useGuarantorTree } from './useGuarantorTree';
import { ChainVisualization } from './ChainVisualization';
import { ChainAccordion } from './ChainAccordion';
import { UserSearchDropdown } from './UserSearchDropdown';
import { StatusCard } from './StatusCard';
import type { GuarantorTreePageProps, UserAccessRecord } from './types';

const UI_TEXT = {
  title: 'Дерево поручителей',
  hint: 'Выберите пользователя чтобы увидеть его цепочку приглашений',
  back: '← Назад',
  refresh: 'Обновить',
  error: 'Ошибка загрузки',
};

export const GuarantorTreePage = ({ user, role, onNavigate }: GuarantorTreePageProps) => {
  const {
    selectedUser,
    chain,
    chainUsers,
    childrenNodes,
    childrenUsers,
    userAccess,
    inviteRequest,
    loading,
    error,
    searchUsers,
    selectUser,
    clearSelection,
    refresh,
  } = useGuarantorTree(user?.uid);

  const userAccessMap = useMemo((): Record<string, UserAccessRecord> => {
    if (userAccess) return { [userAccess.uid]: userAccess };
    return {};
  }, [userAccess]);

  const handleBack = () => {
    clearSelection();
    onNavigate?.('dashboard');
  };

  const handleSelectUser = (uid: string) => {
    selectUser(uid);
  };

  const handleNavigateToFullList = () => {
    onNavigate?.('invite_access');
  };

  return (
    <div className="guarantor-tree-page">
      <div className="page-header">
        <button type="button" className="back-button" onClick={handleBack}>
          {UI_TEXT.back}
        </button>
        <h2>{UI_TEXT.title}</h2>
        <button
          type="button"
          className="refresh-button"
          onClick={refresh}
          disabled={loading || !selectedUser}
        >
          {UI_TEXT.refresh}
        </button>
      </div>

      <div className="search-block">
        <UserSearchDropdown
          onSelect={handleSelectUser}
          searchFn={searchUsers}
          loading={loading}
        />
      </div>

      {error && (
        <div className="error-banner">
          {UI_TEXT.error}: {error}
        </div>
      )}

      {loading && (
        <div className="loading-skeleton">
          <div className="skeleton-chain" />
          <div className="skeleton-card" />
          <div className="skeleton-accordion" />
        </div>
      )}

      {!loading && selectedUser && (
        <>
          <ChainVisualization
            chain={chain}
            users={chainUsers}
            currentUserUid={selectedUser.uid}
          />

          {userAccess && (
            <StatusCard
              status={userAccess.status}
              trusted={userAccess.trusted}
              onNavigate={role === 'admin' ? (() => onNavigate?.('access_control')) : undefined}
            />
          )}

          <ChainAccordion
            chain={chain}
            chainUsers={chainUsers}
            childrenNodes={childrenNodes}
            childrenUsers={childrenUsers}
            userAccessMap={userAccessMap}
            currentUserUid={selectedUser.uid}
            onUserSelect={handleSelectUser}
          />
        </>
      )}

      {!loading && !selectedUser && (
        <div className="empty-state">
          <p>Выберите пользователя для просмотра цепочки поручителей</p>
        </div>
      )}
    </div>
  );
};

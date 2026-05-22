import { useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { ChainAccordion } from '../components/ChainAccordion';
import { ChainVisualization } from '../components/ChainVisualization';
import { StatusCard } from '../components/StatusCard';
import { UserSearchDropdown } from '../components/UserSearchDropdown';
import { useGuarantorTree } from '../hooks/useGuarantorTree';
import { ROOT_GUARANTOR_PHONE } from '../services/guarantorTreeService';
import type { GuarantorTreePageProps, ManualRootGrantResult } from '../types/guarantorTree';

const UI_TEXT = {
  title: 'Дерево поручителей',
  hint: 'Выберите пользователя чтобы увидеть его цепочку приглашений',
};

export const GuarantorTreePage = ({ user, role, onNavigate }: GuarantorTreePageProps) => {
  const canView = role === 'admin' || role === 'moderator';
  const canOpenAccessControl = role === 'admin';
  const tree = useGuarantorTree(user?.uid, role === 'admin');
  const [manualPhones, setManualPhones] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualResults, setManualResults] = useState<ManualRootGrantResult[]>([]);

  const runManualGrant = async () => {
    const phones = manualPhones.split(/[\n,;]+/).map((phone) => phone.trim()).filter(Boolean);
    if (!phones.length) {
      setManualResults([{ phone: '', uid: '', status: 'error', message: 'Введите хотя бы один телефон.' }]);
      return;
    }
    const confirmed = window.confirm(`Привязать ${phones.length} телефон(а) к ${ROOT_GUARANTOR_PHONE} и выдать полный доступ к мобильному приложению?`);
    if (!confirmed) return;

    setManualBusy(true);
    setManualResults([]);
    try {
      const results = await tree.grantRootAccess(phones);
      setManualResults(results);
      if (results.some((result) => result.status === 'granted')) setManualPhones('');
    } catch (error) {
      setManualResults([{ phone: '', uid: '', status: 'error', message: error instanceof Error ? error.message : 'Не удалось выполнить привязку.' }]);
    } finally {
      setManualBusy(false);
    }
  };

  if (!canView) {
    return (
      <section className="guarantor-tree-page">
        <div className="pageHeader"><h2>{UI_TEXT.title}</h2></div>
        <p className="formError">Доступ запрещён.</p>
      </section>
    );
  }

  return (
    <section className="guarantor-tree-page">
      <div className="pageHeader guarantorHeader">
        <div>
          <button type="button" className="back-button" onClick={() => { tree.clearSelection(); onNavigate?.('dashboard'); }}>← Назад</button>
          <div className="headingWithHint">
            <h2>{UI_TEXT.title}</h2>
            <InfoHint text={UI_TEXT.hint} />
          </div>
        </div>
        <button type="button" className="smallButton" disabled={tree.loading || !tree.selectedUser} onClick={() => void tree.refresh()}>
          {tree.loading ? 'Загрузка...' : 'Обновить данные'}
        </button>
      </div>

      <div className="panel search-block">
        <UserSearchDropdown onSelect={(uid) => void tree.selectUser(uid)} searchFn={tree.searchUsers} loading={tree.loading} />
      </div>

      {role === 'admin' ? (
        <div className="panel manual-root-grant">
          <div className="headingWithHint">
            <h3>Ручная привязка к главному поручителю</h3>
            <InfoHint text={`Телефоны будут привязаны к корню ${ROOT_GUARANTOR_PHONE}. Пользователи сразу получат active/trusted доступ ко всем разделам мобильного приложения.`} />
          </div>
          <p className="mutedText">Один телефон или список через новую строку, запятую или точку с запятой.</p>
          <div className="manual-root-form">
            <textarea
              value={manualPhones}
              onChange={(event) => setManualPhones(event.target.value)}
              placeholder="+380501234567&#10;0951234567"
              disabled={manualBusy}
            />
            <button type="button" className="smallButton" disabled={manualBusy} onClick={() => void runManualGrant()}>
              {manualBusy ? 'Привязка...' : 'Привязать к корню и выдать доступ'}
            </button>
          </div>
          {manualResults.length > 0 ? (
            <div className="manual-root-results">
              {manualResults.map((result, index) => (
                <div key={`${result.phone}:${result.uid}:${index}`} className={`manual-root-result ${result.status}`}>
                  <strong>{result.phone || 'Запрос'}</strong>
                  <span>{result.message}</span>
                  {result.uid ? <small>UID: {result.uid}</small> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {tree.error ? <div className="error-toast">{tree.error}</div> : null}

      {tree.loading ? (
        <div className="loading-skeleton">
          <div className="skeleton-chain" />
          <div className="skeleton-card" />
          <div className="skeleton-accordion" />
        </div>
      ) : null}

      {!tree.loading && tree.selectedUser ? (
        <>
          <ChainVisualization chain={tree.chain} selectedUserUid={tree.selectedUser.uid} onUserClick={(uid) => void tree.selectUser(uid)} />
          {tree.userAccess ? (
            <StatusCard
              status={tree.userAccess.status}
              trusted={tree.userAccess.trusted}
              onNavigate={canOpenAccessControl ? () => onNavigate?.('access_control') : undefined}
            />
          ) : null}
          <ChainAccordion
            chain={tree.chain}
            selectedUserUid={tree.selectedUser.uid}
            userAccess={tree.userAccess}
            inviteRequest={tree.inviteRequest}
            childrenNodes={tree.childrenNodes}
            childrenUsers={tree.childrenUsers}
            totalUsers={tree.totalUsers}
            onUserSelect={(uid) => void tree.selectUser(uid)}
            onNavigateToFullList={() => onNavigate?.('invite_access')}
          />
        </>
      ) : null}

      {!tree.loading && !tree.selectedUser ? (
        <div className="panel empty-state">
          <h3>Выберите пользователя</h3>
          <p>Поиск работает по телефону, UID или имени. Телефоны в результатах маскируются.</p>
        </div>
      ) : null}
    </section>
  );
};

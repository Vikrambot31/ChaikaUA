import { useState } from 'react';
import { InfoHint } from '../components/InfoHint';
import { ChainAccordion } from '../components/ChainAccordion';
import { ChainVisualization } from '../components/ChainVisualization';
import { FullTreeView } from '../components/FullTreeView';
import { StatusCard } from '../components/StatusCard';
import { AddChildModal, DeleteNodeModal, ReparentModal } from '../components/TreeActionModals';
import { UserSearchDropdown } from '../components/UserSearchDropdown';
import { useGuarantorTree } from '../hooks/useGuarantorTree';
import { ROOT_GUARANTOR_PHONE } from '../services/guarantorTreeService';
import type { FullTreeNode, GuarantorTreePageProps, ManualRootGrantResult } from '../types/guarantorTree';

const UI_TEXT = {
  title: 'Дерево доверия',
  hint: 'Полное дерево приглашений от главного поручителя',
};

export const GuarantorTreePage = ({ user, role, onNavigate }: GuarantorTreePageProps) => {
  const canView = role === 'admin' || role === 'moderator';
  const canOpenAccessControl = role === 'admin';
  const isAdmin = role === 'admin';
  const tree = useGuarantorTree(user?.uid, role === 'admin');

  const [manualPhones, setManualPhones] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualResults, setManualResults] = useState<ManualRootGrantResult[]>([]);

  // Modal state
  const [addChildTarget, setAddChildTarget] = useState<FullTreeNode | null>(null);
  const [reparentTarget, setReparentTarget] = useState<FullTreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FullTreeNode | null>(null);

  // Selected node in full tree
  const [selectedTreeUid, setSelectedTreeUid] = useState<string | null>(null);

  const findNodeInTree = (uid: string): FullTreeNode | null => {
    if (!tree.fullTree) return null;
    const search = (node: FullTreeNode): FullTreeNode | null => {
      if (node.uid === uid) return node;
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    const found = search(tree.fullTree);
    if (found) return found;
    return tree.orphans.find((o) => o.uid === uid) || null;
  };

  const handleSelectNode = (uid: string) => {
    setSelectedTreeUid(uid);
    void tree.selectUser(uid);
    // Scroll to node
    const el = document.getElementById(`tree-node-${uid}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleAddChild = (parentUid: string) => {
    const node = findNodeInTree(parentUid);
    if (node) setAddChildTarget(node);
  };

  const handleReparent = (uid: string) => {
    const node = findNodeInTree(uid);
    if (node) setReparentTarget(node);
  };

  const handleDelete = (uid: string) => {
    const node = findNodeInTree(uid);
    if (node) setDeleteTarget(node);
  };

  const handleConfirmAddChild = (childUid: string, parentUid: string) => {
    setAddChildTarget(null);
    void tree.handleAttachToParent(childUid, parentUid);
  };

  const handleConfirmReparent = (childUid: string, newParentUid: string) => {
    setReparentTarget(null);
    void tree.handleReparent(childUid, newParentUid);
  };

  const handleConfirmDelete = (uid: string, strategy: 'promote' | 'orphan') => {
    setDeleteTarget(null);
    void tree.handleDelete(uid, strategy);
  };

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
          <button type="button" className="back-button" onClick={() => { tree.clearSelection(); onNavigate?.('dashboard'); }}>&#8592; Назад</button>
          <div className="headingWithHint">
            <h2>{UI_TEXT.title}</h2>
            <InfoHint text={UI_TEXT.hint} />
          </div>
        </div>
        <button type="button" className="smallButton" disabled={tree.treeLoading} onClick={() => void tree.loadTree()}>
          {tree.treeLoading ? 'Загрузка...' : 'Обновить дерево'}
        </button>
      </div>

      {/* Filter bar */}
      <div className="tree-filter-bar">
        <select value={tree.filterLevel} onChange={(e) => tree.setFilterLevel(e.target.value)}>
          <option value="all">Все уровни</option>
          <option value="1">Уровень 1</option>
          <option value="2">Уровень 2</option>
          <option value="3+">Уровень 3+</option>
        </select>
        <select value={tree.filterStatus} onChange={(e) => tree.setFilterStatus(e.target.value)}>
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="risk">Риск</option>
          <option value="blocked">Заблокир.</option>
        </select>
        <input
          type="search"
          placeholder="Поиск по имени, телефону или UID..."
          value={tree.searchQuery}
          onChange={(e) => tree.setSearchQuery(e.target.value)}
        />
        <button type="button" className="tree-export-btn" onClick={tree.exportCsv} disabled={!tree.fullTree}>
          Экспорт CSV
        </button>
        <button type="button" className="tree-expand-btn" onClick={() => void tree.loadTree()} disabled={tree.treeLoading}>
          &#8635;
        </button>
      </div>

      {/* Search for focusing on a specific user */}
      <div className="panel search-block" style={{ marginTop: '12px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '13px', color: '#475569' }}>
          Найти и выделить пользователя в дереве:
        </label>
        <UserSearchDropdown onSelect={(uid) => handleSelectNode(uid)} searchFn={tree.searchUsers} loading={tree.loading} />
      </div>

      {/* Tree error */}
      {tree.treeError ? (
        <div className="panel" style={{ background: '#fff0f0', border: '1px solid #f1aaaa', borderRadius: '14px', padding: '16px' }}>
          <strong style={{ color: '#991b1b' }}>Ошибка загрузки дерева:</strong>
          <p style={{ color: '#991b1b', margin: '6px 0 0' }}>{tree.treeError}</p>
          <button type="button" className="smallButton" style={{ marginTop: '10px' }} onClick={() => void tree.loadTree()}>Повторить загрузку</button>
        </div>
      ) : null}

      {/* Loading */}
      {tree.treeLoading ? (
        <div className="panel" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="search-spinner" style={{ width: '32px', height: '32px', margin: '0 auto 12px' }} />
          <p style={{ color: '#475569', fontWeight: 800 }}>Загрузка дерева доверия...</p>
        </div>
      ) : null}

      {/* Full tree */}
      {!tree.treeLoading && tree.fullTree && tree.treeStats ? (
        <FullTreeView
          root={tree.fullTree}
          orphans={tree.orphans}
          unlinked={tree.unlinked}
          stats={tree.treeStats}
          selectedUid={selectedTreeUid}
          filterLevel={tree.filterLevel}
          filterStatus={tree.filterStatus}
          searchQuery={tree.searchQuery}
          onSelectNode={handleSelectNode}
          onAddChild={handleAddChild}
          onReparent={handleReparent}
          onDelete={handleDelete}
          onDeleteUser={(uid) => { if (window.confirm('Удалить пользователя из базы? Это действие нельзя отменить.')) void tree.handleDeleteUser(uid); }}
          isAdmin={isAdmin}
        />
      ) : null}

      {/* No data state */}
      {!tree.treeLoading && !tree.treeError && !tree.fullTree ? (
        <div className="panel" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#475569', fontWeight: 800 }}>Дерево пустое. Нажмите «Обновить дерево» чтобы загрузить.</p>
        </div>
      ) : null}

      {/* Focused user detail (chain visualization) */}
      {!tree.loading && tree.selectedUser ? (
        <div style={{ marginTop: '24px', borderTop: '1px solid rgba(148, 163, 184, 0.3)', paddingTop: '24px' }}>
          <h3 style={{ marginBottom: '12px', color: '#1f2a44' }}>Детали: {tree.selectedUser.name}</h3>
          <ChainVisualization
            chain={tree.chain}
            selectedUserUid={tree.selectedUser.uid}
            userAccess={tree.userAccess}
            childrenNodes={tree.childrenNodes}
            childrenUsers={tree.childrenUsers}
            totalUsers={tree.totalUsers}
            onUserClick={(uid) => handleSelectNode(uid)}
          />
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
            onUserSelect={(uid) => handleSelectNode(uid)}
            onNavigateToFullList={() => onNavigate?.('invite_access')}
          />
        </div>
      ) : null}

      {/* Manual root grant (admin only) */}
      {isAdmin ? (
        <div className="panel manual-root-grant" style={{ marginTop: '24px' }}>
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

      {/* Modals */}
      {addChildTarget ? (
        <AddChildModal
          parentNode={addChildTarget}
          searchFn={tree.searchUsers}
          onConfirm={handleConfirmAddChild}
          onClose={() => setAddChildTarget(null)}
        />
      ) : null}
      {reparentTarget ? (
        <ReparentModal
          node={reparentTarget}
          searchFn={tree.searchUsers}
          onConfirm={handleConfirmReparent}
          onClose={() => setReparentTarget(null)}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteNodeModal
          node={deleteTarget}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      ) : null}
    </section>
  );
};

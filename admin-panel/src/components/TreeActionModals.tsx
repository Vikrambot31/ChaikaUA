import { useState } from 'react';
import type { FullTreeNode, SearchResultItem } from '../types/guarantorTree';
import { UserSearchDropdown } from './UserSearchDropdown';

type AddChildModalProps = {
  parentNode: FullTreeNode;
  searchFn: (query: string) => Promise<SearchResultItem[]>;
  onConfirm: (childUid: string, parentUid: string) => void;
  onClose: () => void;
};

export const AddChildModal = ({ parentNode, searchFn, onConfirm, onClose }: AddChildModalProps) => {
  const [selectedChild, setSelectedChild] = useState<SearchResultItem | null>(null);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!selectedChild) return;
    setBusy(true);
    try {
      onConfirm(selectedChild.uid, parentNode.uid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tree-modal-overlay" onClick={onClose}>
      <div className="tree-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Добавить ребёнка</h3>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px' }}>
          Родитель: <strong>{parentNode.user.name}</strong> ({parentNode.user.phone || parentNode.uid.slice(0, 10)})
        </p>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '13px', color: '#475569' }}>
            Найти пользователя для привязки:
          </label>
          <UserSearchDropdown
            onSelect={(_uid, user) => setSelectedChild(user)}
            searchFn={searchFn}
          />
        </div>
        {selectedChild ? (
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)', marginBottom: '12px' }}>
            <strong>{selectedChild.name}</strong> | {selectedChild.phone} | {selectedChild.uid.slice(0, 12)}...
          </div>
        ) : null}
        <div className="tree-modal-actions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="button" className="primary" disabled={!selectedChild || busy} onClick={() => void handleConfirm()}>
            {busy ? 'Привязка...' : 'Привязать'}
          </button>
        </div>
      </div>
    </div>
  );
};

type ReparentModalProps = {
  node: FullTreeNode;
  searchFn: (query: string) => Promise<SearchResultItem[]>;
  onConfirm: (childUid: string, newParentUid: string) => void;
  onClose: () => void;
};

export const ReparentModal = ({ node, searchFn, onConfirm, onClose }: ReparentModalProps) => {
  const [newParent, setNewParent] = useState<SearchResultItem | null>(null);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!newParent) return;
    setBusy(true);
    try {
      onConfirm(node.uid, newParent.uid);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tree-modal-overlay" onClick={onClose}>
      <div className="tree-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Переместить узел</h3>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 8px' }}>
          Узел: <strong>{node.user.name}</strong> ({node.user.phone || node.uid.slice(0, 10)})
        </p>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 16px' }}>
          Текущий родитель: {node.node?.parentUid?.slice(0, 12) || 'Нет'}
        </p>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 800, fontSize: '13px', color: '#475569' }}>
            Новый родитель:
          </label>
          <UserSearchDropdown
            onSelect={(_uid, user) => setNewParent(user)}
            searchFn={searchFn}
          />
        </div>
        {newParent ? (
          <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '12px' }}>
            <strong>{newParent.name}</strong> | {newParent.phone} | {newParent.uid.slice(0, 12)}...
          </div>
        ) : null}
        <div className="tree-modal-actions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="button" className="primary" disabled={!newParent || busy} onClick={() => void handleConfirm()}>
            {busy ? 'Перемещение...' : 'Переместить'}
          </button>
        </div>
      </div>
    </div>
  );
};

type DeleteNodeModalProps = {
  node: FullTreeNode;
  onConfirm: (uid: string, strategy: 'promote' | 'orphan') => void;
  onClose: () => void;
};

export const DeleteNodeModal = ({ node, onConfirm, onClose }: DeleteNodeModalProps) => {
  const [strategy, setStrategy] = useState<'promote' | 'orphan'>('promote');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      onConfirm(node.uid, strategy);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tree-modal-overlay" onClick={onClose}>
      <div className="tree-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Удалить узел из дерева</h3>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '0 0 16px' }}>
          Узел: <strong>{node.user.name}</strong> ({node.user.phone || node.uid.slice(0, 10)})
          {node.children.length > 0 ? ` | ${node.children.length} потомков` : ''}
        </p>

        {node.children.length > 0 ? (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 800, fontSize: '13px', color: '#475569' }}>
              Что делать с потомками?
            </label>
            <div style={{ display: 'grid', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.4)', cursor: 'pointer', background: strategy === 'promote' ? 'rgba(34, 197, 94, 0.06)' : 'transparent' }}>
                <input type="radio" name="strategy" value="promote" checked={strategy === 'promote'} onChange={() => setStrategy('promote')} />
                <span><strong>Поднять детей к деду</strong> — потомки станут детьми родителя удаляемого узла</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.4)', cursor: 'pointer', background: strategy === 'orphan' ? 'rgba(239, 68, 68, 0.06)' : 'transparent' }}>
                <input type="radio" name="strategy" value="orphan" checked={strategy === 'orphan'} onChange={() => setStrategy('orphan')} />
                <span><strong>Пометить сиротами</strong> — потомки останутся без родителя (попадут в раздел Сироты)</span>
              </label>
            </div>
          </div>
        ) : null}

        <div className="tree-modal-actions">
          <button type="button" onClick={onClose}>Отмена</button>
          <button type="button" className="danger" disabled={busy} onClick={() => void handleConfirm()}>
            {busy ? 'Удаление...' : 'Удалить из дерева'}
          </button>
        </div>
      </div>
    </div>
  );
};

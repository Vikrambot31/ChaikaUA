import { useCallback, useState } from 'react';
import type { FullTreeNode, FullTreeStats } from '../types/guarantorTree';

type FullTreeViewProps = {
  root: FullTreeNode;
  orphans: FullTreeNode[];
  stats: FullTreeStats;
  selectedUid: string | null;
  filterLevel: string;
  filterStatus: string;
  searchQuery: string;
  onSelectNode: (uid: string) => void;
  onAddChild: (parentUid: string) => void;
  onReparent: (uid: string) => void;
  onDelete: (uid: string) => void;
  isAdmin: boolean;
};

const getStatusClass = (node: FullTreeNode): string => {
  const status = node.access?.status;
  if (status === 'blocked' || status === 'denied') return 'blocked';
  if (status === 'pending' || status === 'pending_sponsor' || status === 'needs_review' || status === 'needs_manual_review') return 'risk';
  return '';
};

const getStatusLabel = (node: FullTreeNode): string => {
  const status = node.access?.status;
  if (!status || status === 'unknown') return '';
  if (status === 'active' || status === 'approved' || status === 'whitelist_access') return 'active';
  if (status === 'temporary_access') return 'temp';
  if (status === 'blocked') return 'blocked';
  if (status === 'denied') return 'denied';
  if (status === 'pending' || status === 'pending_sponsor') return 'pending';
  if (status === 'needs_review' || status === 'needs_manual_review') return 'review';
  return status;
};

const matchesFilter = (node: FullTreeNode, filterLevel: string, filterStatus: string, searchQuery: string): boolean => {
  if (filterLevel !== 'all') {
    if (filterLevel === '3+') {
      if (node.depth < 3) return false;
    } else {
      if (node.depth !== Number(filterLevel)) return false;
    }
  }
  if (filterStatus !== 'all') {
    const statusClass = getStatusClass(node);
    const isActive = statusClass === '';
    if (filterStatus === 'active' && !isActive) return false;
    if (filterStatus === 'risk' && statusClass !== 'risk') return false;
    if (filterStatus === 'blocked' && statusClass !== 'blocked') return false;
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    const name = node.user.name.toLowerCase();
    const phone = node.user.phone.replace(/\D/g, '');
    const uid = node.uid.toLowerCase();
    if (!name.includes(q) && !phone.includes(q.replace(/\D/g, '')) && !uid.includes(q)) return false;
  }
  return true;
};

const hasVisibleDescendant = (node: FullTreeNode, filterLevel: string, filterStatus: string, searchQuery: string): boolean => {
  if (matchesFilter(node, filterLevel, filterStatus, searchQuery)) return true;
  return node.children.some((child) => hasVisibleDescendant(child, filterLevel, filterStatus, searchQuery));
};

type TreeNodeProps = {
  node: FullTreeNode;
  selectedUid: string | null;
  filterLevel: string;
  filterStatus: string;
  searchQuery: string;
  onSelectNode: (uid: string) => void;
  onAddChild: (parentUid: string) => void;
  onReparent: (uid: string) => void;
  onDelete: (uid: string) => void;
  isAdmin: boolean;
  expandedSet: Set<string>;
  toggleExpanded: (uid: string) => void;
};

const TreeNodeRow = ({
  node,
  selectedUid,
  filterLevel,
  filterStatus,
  searchQuery,
  onSelectNode,
  onAddChild,
  onReparent,
  onDelete,
  isAdmin,
  expandedSet,
  toggleExpanded,
}: TreeNodeProps) => {
  const statusClass = getStatusClass(node);
  const statusLabel = getStatusLabel(node);
  const isSelected = selectedUid === node.uid;
  const isExpanded = expandedSet.has(node.uid);
  const hasChildren = node.children.length > 0;
  const isRoot = node.depth === 0 && node.user.system;

  const visibleChildren = node.children.filter((child) =>
    hasVisibleDescendant(child, filterLevel, filterStatus, searchQuery)
  );

  const depthClass = node.depth === 1 ? 'depth-1' : node.depth === 2 ? 'depth-2' : 'depth-3';

  return (
    <div>
      <div
        className={`tree-node-row ${statusClass} ${isSelected ? 'selected' : ''}`}
        onClick={() => onSelectNode(node.uid)}
        id={`tree-node-${node.uid}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasChildren ? (
            <button
              type="button"
              className={`tree-toggle ${isExpanded ? 'expanded' : ''}`}
              onClick={(e) => { e.stopPropagation(); toggleExpanded(node.uid); }}
            >
              &#9654;
            </button>
          ) : (
            <span style={{ width: '20px', display: 'inline-block' }} />
          )}
          <div className={`tree-node-avatar ${statusClass}`}>
            {node.user.name ? node.user.name.charAt(0).toUpperCase() : '?'}
          </div>
        </div>

        <div className="tree-node-info">
          <span className="tree-node-name">
            {isRoot ? (
              <span className="tree-root-badge">&#9733; {node.user.name}</span>
            ) : (
              node.user.name || node.uid.slice(0, 12)
            )}
            {statusLabel ? (
              <span style={{
                marginLeft: '8px',
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: statusClass === 'blocked' ? 'rgba(239, 68, 68, 0.12)' : statusClass === 'risk' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(34, 197, 94, 0.12)',
                color: statusClass === 'blocked' ? '#dc2626' : statusClass === 'risk' ? '#d97706' : '#047857',
                fontWeight: 800,
              }}>
                {statusLabel}
              </span>
            ) : null}
          </span>
          <span className="tree-node-details">
            {node.user.phone || '-'} {node.user.address ? ` | ${node.user.address}` : ''} {node.depth > 0 ? ` | Уровень ${node.depth}` : ''}
            {hasChildren ? ` | ${node.children.length} потомков` : ''}
          </span>
        </div>

        {isAdmin && !isRoot ? (
          <div className="tree-node-actions">
            <button type="button" className="tree-action-btn" onClick={(e) => { e.stopPropagation(); onAddChild(node.uid); }}>+ Ребёнок</button>
            <button type="button" className="tree-action-btn" onClick={(e) => { e.stopPropagation(); onReparent(node.uid); }}>Переместить</button>
            <button type="button" className="tree-action-btn danger" onClick={(e) => { e.stopPropagation(); onDelete(node.uid); }}>Удалить</button>
          </div>
        ) : isAdmin && isRoot ? (
          <div className="tree-node-actions">
            <button type="button" className="tree-action-btn" onClick={(e) => { e.stopPropagation(); onAddChild(node.uid); }}>+ Ребёнок</button>
          </div>
        ) : null}
      </div>

      {isExpanded && visibleChildren.length > 0 ? (
        <div className={`tree-children ${depthClass}`}>
          {visibleChildren.map((child) => (
            <TreeNodeRow
              key={child.uid}
              node={child}
              selectedUid={selectedUid}
              filterLevel={filterLevel}
              filterStatus={filterStatus}
              searchQuery={searchQuery}
              onSelectNode={onSelectNode}
              onAddChild={onAddChild}
              onReparent={onReparent}
              onDelete={onDelete}
              isAdmin={isAdmin}
              expandedSet={expandedSet}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const FullTreeView = ({
  root,
  orphans,
  stats,
  selectedUid,
  filterLevel,
  filterStatus,
  searchQuery,
  onSelectNode,
  onAddChild,
  onReparent,
  onDelete,
  isAdmin,
}: FullTreeViewProps) => {
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => new Set([root.uid]));

  const toggleExpanded = useCallback((uid: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const all = new Set<string>();
    const collect = (node: FullTreeNode) => {
      all.add(node.uid);
      node.children.forEach(collect);
    };
    collect(root);
    setExpandedSet(all);
  }, [root]);

  const collapseAll = useCallback(() => {
    setExpandedSet(new Set([root.uid]));
  }, [root.uid]);

  return (
    <div className="full-tree-container">
      <div className="tree-stats-bar">
        <div className="tree-stat-item">
          <strong>{stats.total}</strong>
          <span>Всего</span>
        </div>
        <div className="tree-stat-item">
          <strong>{stats.active}</strong>
          <span>Активных</span>
        </div>
        <div className="tree-stat-item">
          <strong>{stats.blocked}</strong>
          <span>Заблокир.</span>
        </div>
        <div className="tree-stat-item">
          <strong>{stats.orphaned}</strong>
          <span>Сироты</span>
        </div>
        <div className="tree-stat-item">
          <strong>{stats.maxDepth}</strong>
          <span>Макс. глубина</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
        <button type="button" className="tree-expand-btn" onClick={expandAll}>Развернуть все</button>
        <button type="button" className="tree-expand-btn" onClick={collapseAll}>Свернуть все</button>
      </div>

      <TreeNodeRow
        node={root}
        selectedUid={selectedUid}
        filterLevel={filterLevel}
        filterStatus={filterStatus}
        searchQuery={searchQuery}
        onSelectNode={onSelectNode}
        onAddChild={onAddChild}
        onReparent={onReparent}
        onDelete={onDelete}
        isAdmin={isAdmin}
        expandedSet={expandedSet}
        toggleExpanded={toggleExpanded}
      />

      {orphans.length > 0 ? (
        <div className="tree-orphans-section">
          <h4>Сироты ({orphans.length})</h4>
          {orphans.map((orphan) => (
            <div
              key={orphan.uid}
              className={`tree-node-row ${getStatusClass(orphan)} ${selectedUid === orphan.uid ? 'selected' : ''}`}
              onClick={() => onSelectNode(orphan.uid)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', display: 'inline-block' }} />
                <div className={`tree-node-avatar ${getStatusClass(orphan)}`}>
                  {orphan.user.name ? orphan.user.name.charAt(0).toUpperCase() : '?'}
                </div>
              </div>
              <div className="tree-node-info">
                <span className="tree-node-name">{orphan.user.name || orphan.uid.slice(0, 12)}</span>
                <span className="tree-node-details">{orphan.user.phone || '-'} | Родитель: {orphan.node?.parentUid?.slice(0, 10) || '?'}...</span>
              </div>
              {isAdmin ? (
                <div className="tree-node-actions" style={{ opacity: 1 }}>
                  <button type="button" className="tree-action-btn" onClick={(e) => { e.stopPropagation(); onReparent(orphan.uid); }}>Переместить</button>
                  <button type="button" className="tree-action-btn danger" onClick={(e) => { e.stopPropagation(); onDelete(orphan.uid); }}>Удалить</button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

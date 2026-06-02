import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FullTreeNode, FullTreeStats } from '../types/guarantorTree';

type FullTreeViewProps = {
  root: FullTreeNode;
  orphans: FullTreeNode[];
  unlinked: FullTreeNode[];
  stats: FullTreeStats;
  selectedUid: string | null;
  filterLevel: string;
  filterStatus: string;
  searchQuery: string;
  onSelectNode: (uid: string) => void;
  onAddChild: (parentUid: string) => void;
  onReparent: (uid: string) => void;
  onDelete: (uid: string) => void;
  onDeleteUser: (uid: string) => void;
  isAdmin: boolean;
};

/* ── Layout constants ── */
const CARD_W = 220;
const CARD_H = 90;
const GAP_X = 40;
const GAP_Y = 120;
const PAD = 60;

/* ── Helpers ── */
const getStatusClass = (node: FullTreeNode): string => {
  const s = node.access?.status;
  if (s === 'blocked' || s === 'denied') return 'blocked';
  if (s === 'pending' || s === 'pending_sponsor' || s === 'needs_review' || s === 'needs_manual_review') return 'risk';
  return '';
};

const matchesFilter = (node: FullTreeNode, fl: string, fs: string, sq: string): boolean => {
  if (fl !== 'all') {
    if (fl === '3+') { if (node.depth < 3) return false; }
    else if (node.depth !== Number(fl)) return false;
  }
  if (fs !== 'all') {
    const sc = getStatusClass(node);
    if (fs === 'active' && sc !== '') return false;
    if (fs === 'risk' && sc !== 'risk') return false;
    if (fs === 'blocked' && sc !== 'blocked') return false;
  }
  if (sq.trim()) {
    const q = sq.trim().toLowerCase();
    if (!node.user.name.toLowerCase().includes(q) && !node.user.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')) && !node.uid.toLowerCase().includes(q)) return false;
  }
  return true;
};

const hasVisible = (n: FullTreeNode, fl: string, fs: string, sq: string): boolean =>
  matchesFilter(n, fl, fs, sq) || n.children.some((c) => hasVisible(c, fl, fs, sq));

/* ── Position calculation ── */
type PositionedNode = { node: FullTreeNode; x: number; y: number; children: PositionedNode[] };

const subtreeWidth = (node: FullTreeNode, fl: string, fs: string, sq: string, collapsed: Set<string>): number => {
  const vis = node.children.filter((c) => hasVisible(c, fl, fs, sq));
  if (vis.length === 0 || collapsed.has(node.uid)) return CARD_W + GAP_X;
  const childrenW = vis.reduce((sum, c) => sum + subtreeWidth(c, fl, fs, sq, collapsed), 0);
  return Math.max(CARD_W + GAP_X, childrenW);
};

const layoutTree = (node: FullTreeNode, x: number, y: number, fl: string, fs: string, sq: string, collapsed: Set<string>): PositionedNode => {
  const vis = node.children.filter((c) => hasVisible(c, fl, fs, sq));
  if (vis.length === 0 || collapsed.has(node.uid)) {
    return { node, x, y, children: [] };
  }
  const widths = vis.map((c) => subtreeWidth(c, fl, fs, sq, collapsed));
  const totalW = widths.reduce((s, w) => s + w, 0);
  let cx = x - totalW / 2;
  const posChildren: PositionedNode[] = vis.map((child, i) => {
    const w = widths[i];
    const childX = cx + w / 2;
    cx += w;
    return layoutTree(child, childX, y + CARD_H + GAP_Y, fl, fs, sq, collapsed);
  });
  return { node, x, y, children: posChildren };
};

const collectAll = (p: PositionedNode): { positions: Array<{ node: FullTreeNode; x: number; y: number }>; edges: Array<{ x1: number; y1: number; x2: number; y2: number }> } => {
  const positions: Array<{ node: FullTreeNode; x: number; y: number }> = [{ node: p.node, x: p.x, y: p.y }];
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const c of p.children) {
    edges.push({ x1: p.x, y1: p.y + CARD_H, x2: c.x, y2: c.y });
    const sub = collectAll(c);
    positions.push(...sub.positions);
    edges.push(...sub.edges);
  }
  return { positions, edges };
};

/* ── Component ── */
export const FullTreeView = ({
  root,
  orphans,
  unlinked,
  stats,
  selectedUid,
  filterLevel,
  filterStatus,
  searchQuery,
  onSelectNode,
  onAddChild,
  onReparent,
  onDelete,
  onDeleteUser,
  isAdmin,
}: FullTreeViewProps) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuUid, setMenuUid] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuUid) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.graph-card-dropdown') && !target.closest('.graph-card-menu-btn')) {
        setMenuUid(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuUid]);

  const toggleCollapse = useCallback((uid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    const all = new Set<string>();
    const collect = (n: FullTreeNode) => { all.add(n.uid); n.children.forEach(collect); };
    collect(root);
    all.delete(root.uid);
    setCollapsed(all);
  }, [root]);

  /* Layout */
  const tree = useMemo(() => layoutTree(root, 0, 0, filterLevel, filterStatus, searchQuery, collapsed), [root, filterLevel, filterStatus, searchQuery, collapsed]);
  const { positions, edges } = useMemo(() => collectAll(tree), [tree]);

  /* Bounds */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x - CARD_W / 2 < minX) minX = p.x - CARD_W / 2;
    if (p.x + CARD_W / 2 > maxX) maxX = p.x + CARD_W / 2;
    if (p.y < minY) minY = p.y;
    if (p.y + CARD_H > maxY) maxY = p.y + CARD_H;
  }
  const offsetX = -minX + PAD;
  const offsetY = -minY + PAD;
  const canvasW = maxX - minX + PAD * 2;
  const canvasH = maxY - minY + PAD * 2 + 60; // extra for menus

  const renderCard = (n: FullTreeNode, x: number, y: number, inTree: boolean) => {
    const sc = getStatusClass(n);
    const isSelected = selectedUid === n.uid;
    const isRoot = n.depth === 0 && n.user.system;
    const hasKids = n.children.length > 0;
    const isCollapsed = collapsed.has(n.uid);
    const visKids = n.children.filter((c) => hasVisible(c, filterLevel, filterStatus, searchQuery)).length;
    const matched = searchQuery.trim() && matchesFilter(n, 'all', 'all', searchQuery);
    const showMenu = menuUid === n.uid;

    return (
      <div
        key={n.uid}
        id={`tree-node-${n.uid}`}
        className={`graph-card ${sc} ${isSelected ? 'selected' : ''} ${isRoot ? 'root' : ''} ${matched ? 'highlighted' : ''}`}
        style={{
          left: x - CARD_W / 2,
          top: y,
          width: CARD_W,
          minHeight: CARD_H,
        }}
        onClick={() => onSelectNode(n.uid)}
      >
        <div className="graph-card-name">
          {isRoot ? '★ ' : ''}{n.user.name || `ID: ${n.uid.slice(0, 12)}`}
        </div>
        <div className="graph-card-phone">
          {n.user.phone || 'Нет телефона'}
        </div>
        {n.user.address ? (
          <div className="graph-card-address">{n.user.address}{n.user.apartment ? `, кв.${n.user.apartment}` : ''}</div>
        ) : null}

        {/* Collapse toggle */}
        {hasKids && inTree ? (
          <button
            type="button"
            className={`graph-card-toggle ${isCollapsed ? '' : 'open'}`}
            onClick={(e) => { e.stopPropagation(); toggleCollapse(n.uid); }}
          >
            {isCollapsed ? `▶ ${visKids}` : '▼'}
          </button>
        ) : null}

        {/* Menu button ⋮ */}
        {isAdmin ? (
          <button
            type="button"
            className="graph-card-menu-btn"
            onClick={(e) => { e.stopPropagation(); setMenuUid(showMenu ? null : n.uid); }}
          >
            ⋮
          </button>
        ) : null}

        {/* Dropdown menu */}
        {showMenu && isAdmin ? (
          <div className="graph-card-dropdown">
            {inTree ? (
              <>
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuUid(null); onAddChild(n.uid); }}>
                  + Добавить приглашённого
                </button>
                {!isRoot ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setMenuUid(null); onReparent(n.uid); }}>
                    ↔ Переместить к другому
                  </button>
                ) : null}
                {!isRoot ? (
                  <button type="button" className="danger" onClick={(e) => { e.stopPropagation(); setMenuUid(null); onDelete(n.uid); }}>
                    ✕ Убрать из дерева
                  </button>
                ) : null}
              </>
            ) : null}
            <button type="button" className="danger" onClick={(e) => { e.stopPropagation(); setMenuUid(null); onDeleteUser(n.uid); }}>
              🗑 Удалить пользователя из базы
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="full-tree-container">
      {/* Stats */}
      <div className="tree-stats-bar">
        <div className="tree-stat-item"><strong>{stats.total}</strong><span>Всего</span></div>
        <div className="tree-stat-item"><strong>{stats.active}</strong><span>Активных</span></div>
        <div className="tree-stat-item"><strong>{stats.blocked}</strong><span>Заблокир.</span></div>
        <div className="tree-stat-item"><strong>{stats.orphaned}</strong><span>Сироты</span></div>
        <div className="tree-stat-item"><strong>{stats.unlinked}</strong><span>Без поручителя</span></div>
        <div className="tree-stat-item"><strong>{stats.maxDepth}</strong><span>Макс. глубина</span></div>
      </div>

      {/* Toolbar */}
      <div className="graph-toolbar">
        <button type="button" onClick={expandAll}>Развернуть все</button>
        <button type="button" onClick={collapseAll}>Свернуть все</button>
        <span className="graph-toolbar-hint">Прокручивайте для перемещения по дереву</span>
      </div>

      {/* Scrollable canvas */}
      <div ref={canvasRef} className="graph-canvas">
        <div className="graph-canvas-inner" style={{ width: canvasW, height: canvasH }}>
          {/* SVG edges */}
          <svg className="graph-edges" width={canvasW} height={canvasH}>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6" fill="#94a3b8" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const x1 = e.x1 + offsetX;
              const y1 = e.y1 + offsetY;
              const x2 = e.x2 + offsetX;
              const y2 = e.y2 + offsetY;
              const midY = (y1 + y2) / 2;
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                  className="graph-edge"
                  markerEnd="url(#arrow)"
                />
              );
            })}
          </svg>

          {/* Node cards */}
          {positions.map(({ node: n, x, y }) => renderCard(n, x + offsetX, y + offsetY, true))}
        </div>
      </div>

      {/* Unlinked users — без поручителя */}
      {unlinked.length > 0 ? (
        <div className="tree-unlinked-section">
          <h4>Без поручителя — {unlinked.length} чел.</h4>
          <p className="tree-section-hint">Пользователи, которые зарегистрировались без приглашения или пробовали войти. Не связаны с деревом доверия.</p>
          <div className="unlinked-grid">
            {unlinked.map((o) => (
              <div
                key={o.uid}
                className={`unlinked-card ${selectedUid === o.uid ? 'selected' : ''}`}
                onClick={() => onSelectNode(o.uid)}
              >
                <div className="unlinked-card-info">
                  <strong>{o.user.name || o.uid.slice(0, 12)}</strong>
                  <span>{o.user.phone || 'Нет телефона'}</span>
                  {o.user.address ? <small>{o.user.address}</small> : null}
                </div>
                {isAdmin ? (
                  <div className="unlinked-card-actions">
                    <button type="button" className="unlinked-btn" onClick={(e) => { e.stopPropagation(); onReparent(o.uid); }} title="Привязать к поручителю">
                      Привязать
                    </button>
                    <button type="button" className="unlinked-btn danger" onClick={(e) => { e.stopPropagation(); onDeleteUser(o.uid); }} title="Удалить из базы">
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Orphans */}
      {orphans.length > 0 ? (
        <div className="tree-orphans-section">
          <h4>Потерянные связи ({orphans.length})</h4>
          <p className="tree-section-hint">Есть запись в дереве, но поручитель не найден.</p>
          <div className="unlinked-grid">
            {orphans.map((o) => (
              <div
                key={o.uid}
                className={`unlinked-card orphan ${selectedUid === o.uid ? 'selected' : ''}`}
                onClick={() => onSelectNode(o.uid)}
              >
                <div className="unlinked-card-info">
                  <strong>{o.user.name || o.uid.slice(0, 12)}</strong>
                  <span>{o.user.phone || '-'}</span>
                </div>
                {isAdmin ? (
                  <div className="unlinked-card-actions">
                    <button type="button" className="unlinked-btn" onClick={(e) => { e.stopPropagation(); onReparent(o.uid); }}>
                      Привязать
                    </button>
                    <button type="button" className="unlinked-btn danger" onClick={(e) => { e.stopPropagation(); onDeleteUser(o.uid); }}>
                      Удалить
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

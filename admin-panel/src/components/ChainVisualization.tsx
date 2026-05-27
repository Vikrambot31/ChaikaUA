import type { ChainEntry, TrustChainNode, UserAccessRecord, UserProfile } from '../types/guarantorTree';
import { ROOT_GUARANTOR_PHONE, ROOT_GUARANTOR_UID, maskPhone, shortUid } from '../services/guarantorTreeService';

type ChainVisualizationProps = {
  chain: ChainEntry[];
  selectedUserUid: string;
  userAccess?: UserAccessRecord | null;
  childrenNodes?: TrustChainNode[];
  childrenUsers?: UserProfile[];
  totalUsers?: number;
  onUserClick?: (uid: string) => void;
};

const statusLabel = (status?: UserAccessRecord['status'] | TrustChainNode['status'] | null): string => {
  if (status === 'blocked') return 'Заблокирован';
  if (status === 'inactive' || status === 'denied') return 'Неактивен';
  if (status === 'needs_review' || status === 'needs_manual_review' || status === 'pending' || status === 'pending_sponsor') return 'Риск';
  return 'Активен';
};

const statusTone = (status?: UserAccessRecord['status'] | TrustChainNode['status'] | null): string => {
  if (status === 'blocked' || status === 'needs_review' || status === 'needs_manual_review') return 'risk';
  if (status === 'inactive' || status === 'denied') return 'muted';
  return 'active';
};

const trustLevelLabel = (level: number): string => (level === 0 ? 'Основатель' : `Уровень ${level}`);

const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'нет данных';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp));
};

export const ChainVisualization = ({
  chain,
  selectedUserUid,
  userAccess,
  childrenNodes = [],
  childrenUsers = [],
  totalUsers = 0,
  onUserClick,
}: ChainVisualizationProps) => {
  if (!chain.length) {
    return (
      <section className="panel chain-empty">
        <h3>Цепочка не найдена</h3>
        <p>Пользователь не имеет поручителя или данные недоступны.</p>
      </section>
    );
  }

  const rootEntry = chain[0];
  const selectedEntry = chain.find((entry) => entry.uid === selectedUserUid) ?? chain[chain.length - 1];
  const upperChain = chain.slice(1).slice(-4);
  const childCards = childrenUsers.slice(0, 6).map((user) => ({
    user,
    node: childrenNodes.find((node) => node.childUid === user.uid) ?? null,
  }));
  const generations = [
    childCards.slice(3, 6),
    childCards.slice(0, 3),
    upperChain.slice(-3).map((entry) => ({ user: entry.user, node: entry.node })),
  ].filter((row) => row.length > 0);
  const activeBranches = childrenNodes.filter((node) => node.status === 'active').length;
  const riskBranches = childrenNodes.filter((node) => node.status === 'blocked' || node.status === 'inactive').length;
  const invitedCount = Math.max(childrenNodes.length, childCards.length);
  const networkTrust = Math.min(99, 72 + Math.min(18, activeBranches * 3) + (userAccess?.trusted ? 8 : 0));

  return (
    <section className="trust-console" aria-label="Дерево доверия">
      <div className="trust-toolbar">
        <select aria-label="Уровни доверия" defaultValue="all"><option value="all">Все уровни</option><option>Основатель</option><option>Уровень 1</option><option>Уровень 2+</option></select>
        <select aria-label="Статусы" defaultValue="all"><option value="all">Все статусы</option><option>Активен</option><option>Риск</option><option>Заблокирован</option></select>
        <div className="trust-search"><span>⌕</span><input value={selectedEntry.user.name || selectedEntry.user.phone || selectedUserUid} readOnly aria-label="Выбранный пользователь" /></div>
        <button type="button">Экспорт</button>
      </div>

      <div className="trust-layout">
        <div className="trust-stage">
          <div className="trust-stage-header">
            <div>
              <strong>Живое дерево приглашений</strong>
              <span>Линии показывают, кто кого пригласил. Корень сети закреплен снизу.</span>
            </div>
            <div className="trust-health"><span /> Безопасная сеть</div>
          </div>

          <div className="trust-tree-canvas">
            <div className="trust-grid-glow" />
            {generations.map((row, rowIndex) => (
              <div className={`trust-generation generation-${rowIndex}`} key={`generation-${rowIndex}`}>
                {row.map(({ user, node }, index) => {
                  const tone = statusTone(node?.status);
                  return (
                    <button
                      key={`${user.uid}:${rowIndex}:${index}`}
                      type="button"
                      className={`trust-person ${tone} ${user.uid === selectedUserUid ? 'selected' : ''}`}
                      onClick={() => onUserClick?.(user.uid)}
                      disabled={!onUserClick}
                    >
                      <span className="person-avatar">{(user.name || user.phone || 'U').slice(0, 1).toUpperCase()}</span>
                      <span className="person-main"><strong>{user.name || `User_${shortUid(user.uid)}`}</strong><small>{maskPhone(user.phone) || shortUid(user.uid)}</small></span>
                      <span className="person-meta"><b>{trustLevelLabel((node?.depth ?? rowIndex) + 1)}</b><i>{statusLabel(node?.status)}</i></span>
                    </button>
                  );
                })}
              </div>
            ))}

            <div className="trust-spine" aria-hidden="true" />
            <button
              type="button"
              className="trust-root-node"
              onClick={() => rootEntry.uid ? onUserClick?.(rootEntry.uid) : undefined}
              disabled={!onUserClick}
            >
              <span className="root-orbit" />
              <span className="root-avatar">1</span>
              <span className="root-copy"><strong>Абонент №1</strong><small>{ROOT_GUARANTOR_PHONE}</small><em>Основатель · источник дерева</em></span>
            </button>
          </div>

          <div className="trust-controls">
            <button type="button">−</button><strong>100%</strong><button type="button">+</button>
            <button type="button" className="expand-all">Развернуть все</button>
            <span>Корень закреплен: {ROOT_GUARANTOR_PHONE}</span>
          </div>
        </div>

        <aside className="trust-inspector" aria-label="Информация о выбранном пользователе">
          <div className="inspector-card selected-user-card">
            <span className={`inspector-avatar ${statusTone(userAccess?.status)}`}>{(selectedEntry.user.name || selectedEntry.user.phone || 'U').slice(0, 1).toUpperCase()}</span>
            <h3>{selectedEntry.user.name || `User_${shortUid(selectedEntry.uid)}`}</h3>
            <p>{selectedEntry.uid === ROOT_GUARANTOR_UID ? ROOT_GUARANTOR_PHONE : maskPhone(selectedEntry.user.phone)}</p>
            <div className="status-row"><span className={statusTone(userAccess?.status)} />{statusLabel(userAccess?.status)}</div>
            <dl>
              <div><dt>ID</dt><dd>{shortUid(selectedEntry.uid)}</dd></div>
              <div><dt>Уровень доверия</dt><dd>{trustLevelLabel(selectedEntry.level)}</dd></div>
              <div><dt>Пригласил</dt><dd>{invitedCount}</dd></div>
              <div><dt>Регистрация</dt><dd>{formatDate(selectedEntry.user.registeredAt)}</dd></div>
            </dl>
          </div>

          <div className="inspector-card stats-card">
            <h3>Статистика сети</h3>
            <div><strong>{totalUsers || chain.length}</strong><span>всего пользователей</span></div>
            <div><strong>{activeBranches}</strong><span>активные ветки</span></div>
            <div><strong>{networkTrust}%</strong><span>уровень доверия сети</span></div>
            <div><strong>{invitedCount}</strong><span>приглашений в ветке</span></div>
          </div>

          <div className="inspector-card legend-card">
            <h3>Легенда</h3>
            <span><i className="active" /> Активный пользователь</span>
            <span><i className="muted" /> Неактивная ветка</span>
            <span><i className="risk" /> Риск / блокировка</span>
            <small>Серые ветки не участвуют в росте доверия. Красные узлы требуют проверки модератора.</small>
            {riskBranches > 0 ? <b>{riskBranches} ветки требуют внимания</b> : null}
          </div>
        </aside>
      </div>
    </section>
  );
};

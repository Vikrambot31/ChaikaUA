import type { TrustChainNode, UserProfile } from './types';

const LEVEL_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F97316', '#F97316'];

type ChainVisualizationProps = {
  chain: TrustChainNode[];
  users: UserProfile[];
  currentUserUid: string;
  maxVisible?: number;
};

const getColor = (depth: number): string => LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)];

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) return `+${digits.slice(0, 2)} ${digits.slice(2, 5)}***`;
  return phone;
};

export const ChainVisualization = ({ chain, users, currentUserUid, maxVisible = 5 }: ChainVisualizationProps) => {
  if (!chain.length) {
    return (
      <div className="chain-empty">
        <p>Цепочка не найдена</p>
        <p className="chain-empty-hint">Пользователь не имеет поручителя или данные недоступны.</p>
      </div>
    );
  }

  const visibleNodes = chain.slice(0, maxVisible);
  const hasMore = chain.length > maxVisible;

  return (
    <div className="chain-visualization">
      <div className="chain-horizontal">
        {visibleNodes.map((node, index) => {
          const user = users.find((u) => u.uid === node.childUid || (index === 0 && u.uid === currentUserUid));
          const color = getColor(node.depth);

          return (
            <div key={node.childUid + node.depth} className="chain-node">
              <div className="chain-circle" style={{ backgroundColor: color, borderColor: color }}>
                <span className="chain-circle-number">{node.depth + 1}</span>
              </div>
              <div className="chain-label">
                <span className="chain-name">{user?.name || 'Неизвестный'}</span>
                {user && <span className="chain-phone">{maskPhone(user.phone)}</span>}
                <span className="chain-level">{node.depth === 0 ? 'Вы' : `${node.depth + 1} уровень`}</span>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="chain-more">
            <span>...</span>
            <span className="chain-more-text">ещё {chain.length - maxVisible} уровней</span>
          </div>
        )}
      </div>
    </div>
  );
};

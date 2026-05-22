import type { ChainEntry } from '../types/guarantorTree';
import { maskPhone } from '../services/guarantorTreeService';

const LEVEL_COLORS = ['#7C3AED', '#3B82F6', '#10B981', '#F97316'];

type ChainVisualizationProps = {
  chain: ChainEntry[];
  selectedUserUid: string;
  onUserClick?: (uid: string) => void;
  maxVisible?: number;
};

const getColor = (level: number): string => LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];

export const ChainVisualization = ({ chain, selectedUserUid, onUserClick, maxVisible = 5 }: ChainVisualizationProps) => {
  if (!chain.length) {
    return (
      <section className="panel chain-empty">
        <h3>Цепочка не найдена</h3>
        <p>Пользователь не имеет поручителя или данные недоступны.</p>
      </section>
    );
  }

  const visible = chain.slice(0, maxVisible);
  const hidden = Math.max(0, chain.length - visible.length);

  return (
    <section className="panel chain-visualization" aria-label="Цепочка поручителей">
      <div className="chain-horizontal">
        {visible.map((entry, index) => (
          <button
            key={`${entry.uid}:${entry.level}`}
            type="button"
            className="chain-node"
            onClick={() => onUserClick?.(entry.uid)}
            disabled={!onUserClick}
          >
            <span className="chain-circle" style={{ backgroundColor: getColor(entry.level) }}>
              {entry.level + 1}
            </span>
            <span className="chain-label">
              <strong>{entry.uid === selectedUserUid ? 'Вы' : (entry.user.name || 'Без имени')}</strong>
              <small>{maskPhone(entry.user.phone)}</small>
              <small>{entry.level === 0 ? '1 уровень' : `${entry.level + 1} уровень`}{index === chain.length - 1 ? ' · последний' : ''}</small>
            </span>
          </button>
        ))}
        {hidden > 0 ? <div className="chain-more">...и ещё {hidden} уровней</div> : null}
      </div>
    </section>
  );
};

import type { AdminPageKey } from './AppShell';
import type { FeedItem } from '../hooks/useNotificationFeed';

type Props = {
  items: FeedItem[];
  totalCount: number;
  loading: boolean;
  onNavigate: (page: AdminPageKey) => void;
};

export const NotificationFeed = ({ items, totalCount, loading, onNavigate }: Props) => {
  if (loading) {
    return (
      <article className="panel" style={{ marginBottom: 18 }}>
        <h3>Потрібна ваша увага</h3>
        <p>Завантаження...</p>
      </article>
    );
  }

  return (
    <article className="panel" style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
      }}>
        <h3 style={{ margin: 0 }}>Потрібна ваша увага</h3>
        {totalCount > 0 && (
          <span className="feedBadge">{totalCount}</span>
        )}
      </div>
      {totalCount === 0 ? (
        <p style={{ color: '#607594', fontSize: 13, margin: 0 }}>Все добре, нових задач немає</p>
      ) : (
        <div className="feedList">
          {items.map((item) => (
            <div
              key={item.source}
              className={`feedItem ${item.priority === 'high' ? 'feedItemHigh' : ''}`}
            >
              <span className="feedIcon">{item.icon}</span>
              <span className="feedLabel">{item.label}</span>
              <button
                type="button"
                className="smallButton"
                onClick={() => onNavigate(item.source)}
              >
                Перейти →
              </button>
            </div>
          ))}
        </div>
      )}
    </article>
  );
};

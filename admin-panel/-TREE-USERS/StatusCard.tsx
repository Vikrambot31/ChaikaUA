import type { AccessStatus } from './types';

type StatusCardProps = {
  status: AccessStatus;
  trusted: boolean;
  onNavigate?: (page: string) => void;
};

const STATUS_CONFIG: Record<AccessStatus, { color: string; bg: string; label: string }> = {
  active: { color: '#065f46', bg: '#d1fae5', label: 'Цепочка активна' },
  pending: { color: '#92400e', bg: '#fef3c7', label: 'Цепочка ожидает подтверждения' },
  denied: { color: '#991b1b', bg: '#fee2e2', label: 'Доступ отклонён' },
  needs_review: { color: '#92400e', bg: '#fef3c7', label: 'Требуется проверка' },
  blocked: { color: '#991b1b', bg: '#fee2e2', label: 'Доступ заблокирован' },
};

export const StatusCard = ({ status, trusted, onNavigate }: StatusCardProps) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <div
      className="status-card"
      style={{ backgroundColor: config.bg, borderLeft: `4px solid ${config.color}` }}
      onClick={() => onNavigate?.('access_control')}
      role={onNavigate ? 'button' : undefined}
      tabIndex={onNavigate ? 0 : undefined}
    >
      <div className="status-card-header">
        <span className="status-card-icon">{trusted ? '🛡️' : '⚠️'}</span>
        <span className="status-card-title" style={{ color: config.color }}>{config.label}</span>
      </div>
      <p className="status-card-text" style={{ color: config.color }}>
        {trusted
          ? 'Пользователь имеет полный доступ (Trusted)'
          : `Статус: ${status}`}
      </p>
    </div>
  );
};

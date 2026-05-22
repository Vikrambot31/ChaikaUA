import type { KeyboardEvent } from 'react';
import type { AccessStatus } from '../types/guarantorTree';

type StatusCardProps = {
  status: AccessStatus;
  trusted: boolean;
  onNavigate?: () => void;
};

const STATUS_CONFIG: Record<AccessStatus, { label: string; className: string }> = {
  active: { label: 'Цепочка активна', className: 'active' },
  approved: { label: 'Цепочка активна', className: 'active' },
  temporary_access: { label: 'Временный доступ активен', className: 'active' },
  whitelist_access: { label: 'Доступ из whitelist активен', className: 'active' },
  pending: { label: 'Цепочка неактивна / доступ ограничен', className: 'warning' },
  pending_sponsor: { label: 'Ждет подтверждения поручителя', className: 'warning' },
  denied: { label: 'Цепочка неактивна / доступ ограничен', className: 'danger' },
  needs_review: { label: 'Цепочка неактивна / доступ ограничен', className: 'warning' },
  needs_manual_review: { label: 'Требует ручной проверки', className: 'warning' },
  blocked: { label: 'Цепочка неактивна / доступ ограничен', className: 'danger' },
  unknown: { label: 'Статус доступа неизвестен', className: 'warning' },
};

export const StatusCard = ({ status, trusted, onNavigate }: StatusCardProps) => {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const clickableProps = onNavigate ? { role: 'button', tabIndex: 0, onClick: onNavigate, onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter') onNavigate(); } } : {};

  return (
    <section className={`status-card ${config.className}`} {...clickableProps}>
      <div className="status-card-header">
        <span aria-hidden="true">{trusted || status === 'active' || status === 'approved' ? 'рџ›Ў' : 'вљ '}</span>
        <strong>{config.label}</strong>
      </div>
      <p className="status-card-text">
        {trusted || status === 'active' || status === 'approved' ? 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёРјРµРµС‚ РїРѕР»РЅС‹Р№ РґРѕСЃС‚СѓРї (Trusted)' : `РЎС‚Р°С‚СѓСЃ: ${status}`}
      </p>
    </section>
  );
};

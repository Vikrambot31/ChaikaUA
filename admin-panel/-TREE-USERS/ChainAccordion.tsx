import { useState, useCallback } from 'react';
import type { TrustChainNode, UserProfile, UserAccessRecord } from './types';

type ChainAccordionProps = {
  chain: TrustChainNode[];
  chainUsers: UserProfile[];
  childrenNodes: TrustChainNode[];
  childrenUsers: UserProfile[];
  userAccessMap?: Record<string, UserAccessRecord>;
  currentUserUid: string;
  onUserSelect?: (uid: string) => void;
};

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) return `+${digits.slice(0, 2)} ${digits.slice(2, 5)}***`;
  return phone;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активен', color: '#065f46' },
  pending: { label: 'Ожидает', color: '#92400e' },
  denied: { label: 'Отклонён', color: '#991b1b' },
  blocked: { label: 'Заблокирован', color: '#991b1b' },
};

type AccordionItemProps = {
  index: number;
  node: TrustChainNode;
  user: UserProfile | undefined;
  isCurrentUser: boolean;
  childrenList: TrustChainNode[];
  childrenUsersList: UserProfile[];
  isOpen: boolean;
  onToggle: () => void;
  onUserClick?: (uid: string) => void;
};

const AccordionItem = ({
  index, node, user, isCurrentUser,
  childrenList, childrenUsersList,
  isOpen, onToggle, onUserClick,
}: AccordionItemProps) => {
  const statusInfo = STATUS_LABELS[node.status] || STATUS_LABELS.pending;

  return (
    <div className={`accordion-item ${isOpen ? 'accordion-item-open' : ''}`}>
      <button
        type="button"
        className="accordion-header"
        onClick={onToggle}
      >
        <span className="accordion-number">{index + 1}</span>
        <div className="accordion-header-info">
          <span className="accordion-name">{user?.name || 'Неизвестный'}</span>
          {user && <span className="accordion-phone">{maskPhone(user.phone)}</span>}
        </div>
        <span className="accordion-level">
          {isCurrentUser ? 'Вы' : `${node.depth + 1} уровень`}
        </span>
        <span className={`accordion-arrow ${isOpen ? 'accordion-arrow-up' : ''}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="accordion-content">
          {user?.address && (
            <p className="accordion-detail"><strong>Адрес:</strong> {user.address}{user.apartment ? `, кв. ${user.apartment}` : ''}</p>
          )}
          <p className="accordion-detail">
            <strong>Статус:</strong>{' '}
            <span style={{ color: statusInfo.color }}>{statusInfo.label}</span>
          </p>
          {node.approvedAt > 0 && (
            <p className="accordion-detail">
              <strong>Одобрено:</strong> {new Date(node.approvedAt).toLocaleDateString('ru-RU')}
            </p>
          )}

          <div className="accordion-children">
            <p className="accordion-children-title">Передали приглашение:</p>
            {childrenList.length === 0 ? (
              <p className="accordion-no-children">Приглашений не передал</p>
            ) : (
              <ul className="accordion-children-list">
                {childrenList.map((child) => {
                  const childUser = childrenUsersList.find((u) => u.uid === child.childUid);
                  return (
                    <li
                      key={child.childUid}
                      className="accordion-child-item"
                      onClick={() => onUserClick?.(child.childUid)}
                    >
                      <span className="accordion-child-avatar">👤</span>
                      <div className="accordion-child-info">
                        <span className="accordion-child-name">{childUser?.name || 'Неизвестный'}</span>
                        <span className="accordion-child-level">{child.depth + 1} уровень</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const ChainAccordion = ({
  chain, chainUsers, childrenNodes, childrenUsers,
  currentUserUid, onUserSelect,
}: ChainAccordionProps) => {
  const [openIndex, setOpenIndex] = useState<number>(0);

  const handleToggle = useCallback((index: number) => {
    setOpenIndex((prev) => (prev === index ? -1 : index));
  }, []);

  const getChildrenForNode = (node: TrustChainNode): TrustChainNode[] => {
    return childrenNodes.filter((c) => c.parentUid === node.childUid);
  };

  if (!chain.length) return null;

  return (
    <div className="chain-accordion">
      {chain.map((node, index) => {
        const isCurrentUser = node.childUid === currentUserUid || (index === 0);
        const user = chainUsers.find(
          (u) => u.uid === (isCurrentUser ? currentUserUid : node.childUid)
        );
        const nodeChildren = getChildrenForNode(node);

        return (
          <AccordionItem
            key={node.childUid + node.depth}
            index={index}
            node={node}
            user={user}
            isCurrentUser={isCurrentUser}
            childrenList={nodeChildren}
            childrenUsersList={childrenUsers}
            isOpen={openIndex === index}
            onToggle={() => handleToggle(index)}
            onUserClick={onUserSelect}
          />
        );
      })}

      <div className="accordion-total" onClick={() => onUserSelect?.('')}>
        <span>Всего в системе: {chain.length} человек</span>
        <span className="accordion-total-arrow">→</span>
      </div>
    </div>
  );
};

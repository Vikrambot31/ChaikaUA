import { useEffect, useState } from 'react';
import type { ChainEntry, InviteRequestBrief, TrustChainNode, UserAccessRecord, UserProfile } from '../types/guarantorTree';
import { maskPhone, shortUid } from '../services/guarantorTreeService';

type ChainAccordionProps = {
  chain: ChainEntry[];
  selectedUserUid: string;
  userAccess?: UserAccessRecord | null;
  inviteRequest?: InviteRequestBrief | null;
  childrenNodes: TrustChainNode[];
  childrenUsers: UserProfile[];
  totalUsers: number;
  onUserSelect?: (uid: string) => void;
  onNavigateToFullList?: () => void;
};

const dateTime = (value: number): string => (value ? new Date(value).toLocaleString('ru-RU') : '-');

const levelLabel = (entry: ChainEntry, isLast: boolean): string => {
  if (isLast) return `${entry.level + 1} уровень / последний`;
  return `${entry.level + 1} уровень`;
};

export const ChainAccordion = ({
  chain,
  selectedUserUid,
  userAccess,
  inviteRequest,
  childrenNodes,
  childrenUsers,
  totalUsers,
  onUserSelect,
  onNavigateToFullList,
}: ChainAccordionProps) => {
  const [openIndex, setOpenIndex] = useState(0);

  useEffect(() => setOpenIndex(0), [selectedUserUid]);

  if (!chain.length) return null;

  return (
    <section className="chain-accordion" aria-label="Участники цепочки">
      {chain.map((entry, index) => {
        const isOpen = openIndex === index;
        const isSelected = entry.uid === selectedUserUid;
        const children = childrenNodes.filter((node) => node.parentUid === entry.uid);

        return (
          <article key={`${entry.uid}:${entry.level}`} className={`accordion-item ${isOpen ? 'accordion-item-open' : ''}`}>
            <button type="button" className="accordion-header" onClick={() => setOpenIndex(isOpen ? -1 : index)}>
              <span className="accordion-number">{index + 1}</span>
              <span className="accordion-header-info">
                <strong>{isSelected ? 'Вы' : (entry.user.name || 'Без имени')}</strong>
                <small>{maskPhone(entry.user.phone)} · UID {shortUid(entry.uid)}</small>
              </span>
              <span className="accordion-level">{levelLabel(entry, index === chain.length - 1)}</span>
              <span className={`accordion-arrow ${isOpen ? 'accordion-arrow-up' : ''}`}>▼</span>
            </button>

            <div className="accordion-content" aria-hidden={!isOpen}>
              <dl className="details compactDetails">
                <div><dt>UID</dt><dd>{entry.uid}</dd></div>
                <div><dt>Адрес</dt><dd>{entry.user.address || entry.user.apartment ? `${entry.user.address}${entry.user.apartment ? `, кв. ${entry.user.apartment}` : ''}` : '-'}</dd></div>
                <div><dt>Статус в системе</dt><dd>{isSelected ? (userAccess?.status ?? '-') : (entry.node?.status ?? '-')}</dd></div>
                <div><dt>Дата одобрения</dt><dd>{dateTime(isSelected ? (inviteRequest?.moderatedAt || entry.node?.approvedAt || 0) : (entry.node?.approvedAt || 0))}</dd></div>
                <div><dt>Модератор</dt><dd>{isSelected ? (inviteRequest?.moderatedBy || '-') : '-'}</dd></div>
                {entry.orphaned ? <div><dt>Связь</dt><dd>⚠ Orphaned node</dd></div> : null}
              </dl>

              <div className="accordion-children">
                <p className="accordion-children-title">Передали приглашение:</p>
                {children.length === 0 ? <p className="accordion-no-children">Приглашений не передал</p> : null}
                {children.length > 0 ? (
                  <div className="accordion-children-list">
                    {children.map((child) => {
                      const childUser = childrenUsers.find((user) => user.uid === child.childUid);
                      return (
                        <button key={child.id} type="button" className="accordion-child-item" onClick={() => onUserSelect?.(child.childUid)}>
                          <span className="accordion-child-avatar" aria-hidden="true">👤</span>
                          <span className="accordion-child-info">
                            <strong>{childUser?.name || 'Пользователь удален'}</strong>
                            <small>{child.depth + 1} уровень · {shortUid(child.childUid)}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}

      <button type="button" className="accordion-total" onClick={onNavigateToFullList}>
        <span>Всего в системе: {totalUsers || chain.length} человек</span>
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
};

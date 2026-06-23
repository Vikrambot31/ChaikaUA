import { useCallback, useEffect, useRef, useState } from 'react';
import {
  subscribeToTickets,
  subscribeToMessages,
  sendAdminReply,
  closeTicket,
  markReadByAdmin,
  hasUnreadFromUser,
  getCategoryLabel,
  computeStats,
  type SupportTicket,
  type SupportMessage,
  type SupportCategory,
  type SupportStats,
} from '../services/supportService';
import {
  subscribeToAiConfigState,
  subscribeToSupportEscalations,
  resolveSupportEscalation,
  type SupportEscalationItem,
} from '../services/aiConfigService';
import { DEFAULT_AI_CONFIG, type AiConfig } from '../types/ai-config';
import { useViewMode } from '../contexts/ViewModeContext';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'open', label: 'Відкриті' },
  { value: 'closed', label: 'Закриті' },
] as const;

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear());
  return `${dd}.${mm}.${yy}`;
};

const formatTime = (ts: number): string => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateTime = (ts: number): string => `${formatDate(ts)} ${formatTime(ts)}`;

// ── Ticket List (left column) ──

function TicketList({
  tickets,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilter,
  categoryFilter,
  onCategoryFilter,
  page,
  onPageChange,
}: {
  tickets: SupportTicket[];
  selectedId: string | null;
  onSelect: (t: SupportTicket) => void;
  statusFilter: string;
  onStatusFilter: (v: string) => void;
  categoryFilter: string;
  onCategoryFilter: (v: string) => void;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const filtered = tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageTickets = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const categories = Array.from(new Set(tickets.map((t) => t.category))).sort();

  return (
    <div style={listStyles.container}>
      {/* Filters */}
      <div style={listStyles.filters}>
        <select
          value={statusFilter}
          onChange={(e) => { onStatusFilter(e.target.value); onPageChange(0); }}
          style={listStyles.select}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => { onCategoryFilter(e.target.value); onPageChange(0); }}
          style={listStyles.select}
        >
          <option value="">Всі категорії</option>
          {categories.map((c) => (
            <option key={c} value={c}>{getCategoryLabel(c)}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div style={listStyles.list}>
        {pageTickets.length === 0 && (
          <div style={listStyles.empty}>Немає звернень</div>
        )}
        {pageTickets.map((t) => {
          const unread = hasUnreadFromUser(t);
          const isSelected = t.ticketId === selectedId;
          return (
            <div
              key={t.ticketId}
              onClick={() => onSelect(t)}
              style={{
                ...listStyles.item,
                backgroundColor: isSelected ? '#e8f0fe' : unread ? '#fff8e1' : '#fff',
                borderLeft: isSelected ? '3px solid #3a5a9a' : '3px solid transparent',
                cursor: 'pointer',
              }}
            >
              <div style={listStyles.itemHeader}>
                <span style={listStyles.itemName}>
                  {unread && <span style={listStyles.unreadDot}>●</span>}
                  {t.userName}
                </span>
                <span style={listStyles.itemTime}>{formatTime(t.updatedAt)}</span>
              </div>
              <div style={listStyles.itemMeta}>
                <span style={{
                  ...listStyles.statusBadge,
                  backgroundColor: t.status === 'open' ? '#d4edda' : '#f8d7da',
                  color: t.status === 'open' ? '#155724' : '#721c24',
                }}>
                  {t.status === 'open' ? 'Відкрито' : 'Закрито'}
                </span>
                <span style={listStyles.category}>{getCategoryLabel(t.category)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={listStyles.pagination}>
          <button
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            style={listStyles.pageBtn}
          >
            ← Назад
          </button>
          <span style={listStyles.pageInfo}>{page + 1} / {totalPages}</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            style={listStyles.pageBtn}
          >
            Далі →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Chat (right column) ──

function ChatPanel({
  ticket,
  messages,
  onSend,
  onClose,
  sending,
}: {
  ticket: SupportTicket;
  messages: SupportMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
  sending: boolean;
}) {
  const [replyText, setReplyText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!replyText.trim() || sending) return;
    onSend(replyText.trim());
    setReplyText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={chatStyles.container}>
      {/* Ticket info */}
      <div style={chatStyles.info}>
        <div style={chatStyles.infoRow}>
          <strong>Категорія:</strong> {getCategoryLabel(ticket.category)}
        </div>
        <div style={chatStyles.infoRow}>
          <strong>Статус:</strong>{' '}
          <span style={{
            padding: '2px 8px',
            borderRadius: 4,
            backgroundColor: ticket.status === 'open' ? '#d4edda' : '#f8d7da',
            color: ticket.status === 'open' ? '#155724' : '#721c24',
            fontWeight: 600,
            fontSize: 13,
          }}>
            {ticket.status === 'open' ? 'Відкрито' : 'Закрито'}
          </span>
        </div>
        <div style={chatStyles.infoRow}>
          <strong>Користувач:</strong> {ticket.userName}
        </div>
        <div style={chatStyles.infoRow}>
          <strong>UID:</strong>{' '}
          <span
            style={{ fontFamily: 'monospace', fontSize: 11, color: '#555', userSelect: 'all', cursor: 'text' }}
            title="Клацніть щоб виділити UID"
          >
            {ticket.userId}
          </span>
        </div>
        <div style={chatStyles.infoRow}>
          <strong>Створено:</strong> {formatDateTime(ticket.createdAt)}
        </div>
      </div>

      {/* Messages */}
      <div style={chatStyles.messages}>
        {messages.length === 0 && (
          <div style={chatStyles.empty}>Повідомлень немає</div>
        )}
        {messages.map((m) => {
          const isAdmin = m.senderRole === 'admin';
          return (
            <div
              key={m.messageId}
              style={{
                ...chatStyles.bubble,
                alignSelf: isAdmin ? 'flex-end' : 'flex-start',
                backgroundColor: isAdmin ? '#3a5a9a' : '#e5e7eb',
                color: isAdmin ? '#fff' : '#1f2937',
              }}
            >
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                marginBottom: 2,
                color: isAdmin ? '#bfdbfe' : '#6b7280',
              }}>
                {isAdmin ? 'Адмін' : ticket.userName}
              </div>
              <div style={{ fontSize: 14, lineHeight: '20px', whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
              <div style={{
                fontSize: 10,
                textAlign: 'right',
                marginTop: 4,
                color: isAdmin ? '#93c5fd' : '#9ca3af',
              }}>
                {formatDateTime(m.timestamp)}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply area */}
      {ticket.status === 'open' && (
        <div style={chatStyles.replyArea}>
          <textarea
            style={chatStyles.textarea}
            placeholder="Введіть відповідь..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            maxLength={2000}
            disabled={sending}
          />
          <div style={chatStyles.replyActions}>
            <button
              style={{
                ...chatStyles.sendBtn,
                opacity: !replyText.trim() || sending ? 0.5 : 1,
              }}
              onClick={handleSend}
              disabled={!replyText.trim() || sending}
            >
              {sending ? 'Надсилаю...' : 'Відправити'}
            </button>
            <button style={chatStyles.closeBtn} onClick={onClose}>
              Закрити звернення
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──

function AiSupportPanel({
  config,
  configExists,
  escalations,
  tickets,
  onOpenTicket,
  onResolve,
}: {
  config: AiConfig;
  configExists: boolean;
  escalations: SupportEscalationItem[];
  tickets: SupportTicket[];
  onOpenTicket: (item: SupportEscalationItem) => void;
  onResolve: (id: string) => void;
}) {
  const primaryReady = configExists && config.apiKey.trim().length >= 8 && config.model.trim().length > 0;
  const supportActive = primaryReady && config.autonomous.enabled && config.autonomous.supportReplies;
  const fallbackReady = Boolean(
    config.fallback?.enabled &&
    config.fallback.apiKey.trim().length >= 8 &&
    config.fallback.model.trim().length > 0,
  );
  const statusText = supportActive ? 'ИИ-ответы работают' : primaryReady ? 'ИИ на паузе для поддержки' : 'ИИ не подключен';
  const statusColor = supportActive ? '#0f7a43' : primaryReady ? '#9a5b00' : '#9b1c31';
  const statusBg = supportActive ? '#e7f7ee' : primaryReady ? '#fff4dc' : '#fde8ec';

  return (
    <div style={aiPanelStyles.wrapper}>
      <div style={{ ...aiPanelStyles.statusBox, backgroundColor: statusBg, borderColor: statusColor }}>
        <div style={{ ...aiPanelStyles.statusText, color: statusColor }}>{statusText}</div>
        <div style={aiPanelStyles.modelLine}>
          Текст: {config.provider} / {config.model}
          {fallbackReady ? ` | авто-резерв: ${config.fallback?.provider} / ${config.fallback?.model}` : ''}
        </div>
      </div>

      <div style={aiPanelStyles.attentionBox}>
        <div style={aiPanelStyles.attentionHeader}>
          <div>
            <div style={aiPanelStyles.attentionTitle}>Нужно мое личное внимание</div>
            <div style={aiPanelStyles.attentionSub}>
              {escalations.length > 0
                ? `ИИ остановил ${escalations.length} ответ(ов) и ждет администратора`
                : 'Нет ожидающих AI-сигналов'}
            </div>
          </div>
          <span style={aiPanelStyles.counter}>{escalations.length}</span>
        </div>

        {escalations.length > 0 && (
          <div style={aiPanelStyles.escalationList}>
            {escalations.slice(0, 4).map((item) => {
              const ticketExists = tickets.some((t) => t.ticketId === item.ticketId);
              return (
                <div key={item.id} style={aiPanelStyles.escalationItem}>
                  <div style={aiPanelStyles.escalationMeta}>
                    <strong>{item.userName || 'Пользователь'}</strong>
                    <span>{item.urgency} / {item.category}</span>
                  </div>
                  <div style={aiPanelStyles.escalationText}>{item.userMessage}</div>
                  {item.aiDraftReply && (
                    <div style={aiPanelStyles.draftText}>Черновик ИИ: {item.aiDraftReply}</div>
                  )}
                  <div style={aiPanelStyles.escalationActions}>
                    <button
                      type="button"
                      style={{ ...aiPanelStyles.actionBtn, opacity: ticketExists ? 1 : 0.55 }}
                      onClick={() => onOpenTicket(item)}
                    >
                      Открыть чат
                    </button>
                    <button
                      type="button"
                      style={aiPanelStyles.secondaryBtn}
                      onClick={() => onResolve(item.id)}
                    >
                      Закрыть сигнал
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SupportPage() {
  const { viewMode } = useViewMode();
  const isSimpleMode = viewMode === 'simple';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState<SupportStats>({ total: 0, open: 0, today: 0 });
  const [aiConfig, setAiConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [aiConfigExists, setAiConfigExists] = useState(false);
  const [aiEscalations, setAiEscalations] = useState<SupportEscalationItem[]>([]);

  const selectedTicketIdRef = useRef<string | null>(null);
  selectedTicketIdRef.current = selectedTicket?.ticketId || null;

  // Subscribe to all tickets (once)
  useEffect(() => {
    const unsub = subscribeToTickets((list) => {
      setTickets(list);
      setStats(computeStats(list));
      // Update selected ticket if it changed
      const selId = selectedTicketIdRef.current;
      if (selId) {
        const updated = list.find((t) => t.ticketId === selId);
        if (updated) setSelectedTicket(updated);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToAiConfigState(({ config, exists }) => {
      setAiConfig(config);
      setAiConfigExists(exists);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToSupportEscalations(setAiEscalations);
    return unsub;
  }, []);

  // Subscribe to messages of selected ticket
  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToMessages(selectedTicket.ticketId, setMessages);
    return unsub;
  }, [selectedTicket?.ticketId]);

  // Mark as read when selecting ticket
  useEffect(() => {
    if (selectedTicket && hasUnreadFromUser(selectedTicket)) {
      markReadByAdmin(selectedTicket.ticketId);
    }
  }, [selectedTicket?.ticketId, selectedTicket?.lastUserMessage]);

  const handleSelect = (t: SupportTicket) => {
    setSelectedTicket(t);
  };

  const handleOpenAiEscalation = useCallback((item: SupportEscalationItem) => {
    const ticket = tickets.find((t) => t.ticketId === item.ticketId);
    if (!ticket) {
      alert('Тикет уже не найден или еще не загружен в списке поддержки.');
      return;
    }
    setStatusFilter('all');
    setCategoryFilter('');
    setSelectedTicket(ticket);
  }, [tickets]);

  const handleResolveAiEscalation = useCallback(async (id: string) => {
    try {
      await resolveSupportEscalation(id);
    } catch (e) {
      alert('Не удалось закрыть AI-сигнал: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  const handleSendReply = async (text: string) => {
    if (!selectedTicket) return;
    setSending(true);
    try {
      await sendAdminReply(selectedTicket.ticketId, text);
    } catch (e) {
      alert('Помилка відправки: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSending(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    if (!confirm('Закрити це звернення?')) return;
    try {
      await closeTicket(selectedTicket.ticketId);
    } catch (e) {
      alert('Помилка: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div style={pageStyles.container}>
      <h2 style={pageStyles.title}>🎧 Служба Підтримки</h2>
      {!isSimpleMode && (
        <AiSupportPanel
          config={aiConfig}
          configExists={aiConfigExists}
          escalations={aiEscalations}
          tickets={tickets}
          onOpenTicket={handleOpenAiEscalation}
          onResolve={handleResolveAiEscalation}
        />
      )}

      <div style={pageStyles.layout}>
        {/* Left: ticket list */}
        <TicketList
          tickets={tickets}
          selectedId={selectedTicket?.ticketId || null}
          onSelect={handleSelect}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          categoryFilter={categoryFilter}
          onCategoryFilter={setCategoryFilter}
          page={page}
          onPageChange={setPage}
        />

        {/* Right: chat */}
        <div style={pageStyles.chatArea}>
          {selectedTicket ? (
            <ChatPanel
              ticket={selectedTicket}
              messages={messages}
              onSend={handleSendReply}
              onClose={handleCloseTicket}
              sending={sending}
            />
          ) : (
            <div style={pageStyles.noSelection}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <div>Оберіть звернення зі списку</div>
            </div>
          )}
        </div>
      </div>
      {!isSimpleMode && (
        <div style={pageStyles.statsBar}>
        <span>Всього звернень: <strong>{stats.total}</strong></span>
        <span style={{ margin: '0 16px' }}>|</span>
        <span>Відкритих: <strong>{stats.open}</strong></span>
        <span style={{ margin: '0 16px' }}>|</span>
        <span>За сьогодні: <strong>{stats.today}</strong></span>
        </div>
      )}
    </div>
  );
}

// ── Styles ──

const pageStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '16px 20px',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#1a1a2e',
  },
  layout: {
    display: 'flex',
    flex: 1,
    gap: 16,
    minHeight: 0,
    overflow: 'hidden',
  },
  chatArea: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #ddd',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
  },
  noSelection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#999',
    fontSize: 15,
  },
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 16px',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    fontSize: 14,
    color: '#333',
  },
};

const aiPanelStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'grid',
    gridTemplateColumns: 'minmax(300px, 0.85fr) minmax(420px, 1.4fr)',
    gap: 12,
    alignItems: 'stretch',
  },
  statusBox: {
    border: '2px solid',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 82,
  },
  statusText: {
    fontSize: 30,
    fontWeight: 800,
    lineHeight: '34px',
  },
  modelLine: {
    marginTop: 8,
    fontSize: 13,
    color: '#263238',
    overflowWrap: 'anywhere',
  },
  attentionBox: {
    border: '1px solid #d7dce5',
    borderRadius: 10,
    backgroundColor: '#fff',
    minHeight: 82,
    overflow: 'hidden',
  },
  attentionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    borderBottom: '1px solid #edf0f5',
    backgroundColor: '#f7f9fc',
  },
  attentionTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#1f2937',
  },
  attentionSub: {
    marginTop: 2,
    fontSize: 13,
    color: '#667085',
  },
  counter: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#111827',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 800,
  },
  escalationList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 10,
    padding: 12,
    maxHeight: 260,
    overflowY: 'auto',
  },
  escalationItem: {
    border: '1px solid #e4e7ec',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  escalationMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    color: '#475467',
    marginBottom: 6,
  },
  escalationText: {
    fontSize: 13,
    color: '#1f2937',
    lineHeight: '18px',
    maxHeight: 54,
    overflow: 'hidden',
  },
  draftText: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f2f4f7',
    fontSize: 12,
    lineHeight: '17px',
    color: '#344054',
    maxHeight: 70,
    overflow: 'hidden',
  },
  escalationActions: {
    display: 'flex',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    padding: '7px 10px',
    borderRadius: 7,
    border: 'none',
    backgroundColor: '#3a5a9a',
    color: '#fff',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '7px 10px',
    borderRadius: 7,
    border: '1px solid #cfd6e4',
    backgroundColor: '#fff',
    color: '#344054',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  },
};

const listStyles: Record<string, React.CSSProperties> = {
  container: {
    width: 340,
    minWidth: 340,
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #ddd',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  filters: {
    display: 'flex',
    gap: 6,
    padding: '10px 10px 8px',
    borderBottom: '1px solid #eee',
  },
  select: {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid #ccc',
    fontSize: 13,
    backgroundColor: '#fff',
  },
  list: {
    flex: 1,
    overflowY: 'auto' as const,
  },
  empty: {
    padding: 24,
    textAlign: 'center' as const,
    color: '#999',
    fontSize: 14,
  },
  item: {
    padding: '10px 12px',
    borderBottom: '1px solid #f0f0f0',
    transition: 'background 0.15s',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontWeight: 600,
    fontSize: 14,
    color: '#1a1a2e',
  },
  itemTime: {
    fontSize: 12,
    color: '#888',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 4,
  },
  category: {
    fontSize: 12,
    color: '#666',
  },
  unreadDot: {
    color: '#3a5a9a',
    marginRight: 4,
    fontSize: 10,
  },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderTop: '1px solid #eee',
  },
  pageBtn: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1px solid #ccc',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  pageInfo: {
    fontSize: 13,
    color: '#666',
  },
};

const chatStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  },
  info: {
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    backgroundColor: '#fff',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 24px',
  },
  infoRow: {
    fontSize: 13,
    color: '#444',
  },
  messages: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  empty: {
    textAlign: 'center' as const,
    color: '#999',
    padding: 40,
    fontSize: 14,
  },
  bubble: {
    maxWidth: '70%',
    borderRadius: 12,
    padding: '8px 12px',
  },
  replyArea: {
    borderTop: '1px solid #eee',
    padding: '10px 16px',
    backgroundColor: '#fff',
  },
  textarea: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #ccc',
    fontSize: 14,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  replyActions: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  sendBtn: {
    padding: '8px 20px',
    borderRadius: 8,
    border: 'none',
    backgroundColor: '#3a5a9a',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  closeBtn: {
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid #dc3545',
    backgroundColor: '#fff',
    color: '#dc3545',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
};

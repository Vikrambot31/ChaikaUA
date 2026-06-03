// =============================================================
//  EditRequestModal — модальное окно редактирования заявки
//  с AI-подсказками и историей изменений
// =============================================================

import { useEffect, useState } from 'react';
import {
  editModerationItem,
  moderateItem,
  MODERATION_SECTIONS,
  type ModerationItem,
} from '../services/moderationService';
import { suggestFix, type AiSuggestion } from '../services/aiSuggestionService';
import type { AnalysisResult } from '../types/ai';

type Props = {
  item: ModerationItem;
  aiResult?: AnalysisResult | null;
  onClose: () => void;
  onSaved: (updatedItem: ModerationItem) => void;
  onSavedAndApproved: (updatedItem: ModerationItem) => void;
};

const FIELD_LABELS: Record<string, string> = {
  text: 'Текст заявки',
  description: 'Описание',
  title: 'Заголовок',
  phone: 'Телефон',
  address: 'Адрес',
  price: 'Цена',
  contactName: 'Контактное лицо',
  name: 'Имя',
  goal: 'Цель сбора',
  itemName: 'Название товара',
  categoryLabel: 'Категория',
  about: 'О себе',
};

const SECTION_FIELD_MAP: Record<string, string[]> = {
  requests: ['text', 'description', 'phone', 'address', 'name'],
  appSuggestions: ['text', 'description'],
  communityPhotos: ['title', 'description'],
  buySell: ['title', 'description', 'price', 'phone', 'contactName'],
  contactsListings: ['description', 'phone', 'contactName'],
  biznesChaikaListings: ['itemName', 'description', 'price', 'phone', 'contactName'],
  localBusiness: ['title', 'description', 'address', 'phone'],
  jobs: ['title', 'description', 'phone', 'contactName'],
  lostFound: ['title', 'description', 'phone', 'contactName'],
  osbbNews: ['title', 'text'],
  osbbVotes: ['title', 'description'],
  osbbHouseTopics: ['title', 'text'],
  osbbCollections: ['title', 'description', 'goal'],
};

type EditableField = { key: string; label: string; type: 'textarea' | 'input' };

const getEditableFields = (item: ModerationItem): EditableField[] => {
  const raw = item.raw || {};
  const keys = SECTION_FIELD_MAP[item.section] || ['text', 'description'];
  return keys
    .filter((key) => raw[key] !== undefined)
    .map((key) => ({
      key,
      label: FIELD_LABELS[key] || key,
      type: (['text', 'description', 'goal'].includes(key) ? 'textarea' : 'input') as 'textarea' | 'input',
    }));
};

const sectionLabel = (key: string): string =>
  MODERATION_SECTIONS.find((s) => s.key === key)?.label || key;

export const EditRequestModal = ({ item, aiResult, onClose, onSaved, onSavedAndApproved }: Props) => {
  const fields = getEditableFields(item);
  const raw = item.raw || {};

  // Edits state — инициализируем из raw
  const [edits, setEdits] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of fields) {
      initial[f.key] = String(raw[f.key] ?? '');
    }
    return initial;
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [appliedSuggestionId, setAppliedSuggestionId] = useState<string | null>(null);

  // Загрузка AI-подсказок при открытии
  useEffect(() => {
    if (aiResult && aiResult.verdict !== 'approve') {
      setSuggestionsLoading(true);
      suggestFix(item, aiResult)
        .then((suggestions) => setAiSuggestions(suggestions))
        .catch(() => { /* silent — AI-подсказки опциональны */ })
        .finally(() => setSuggestionsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySuggestion = (suggestion: AiSuggestion) => {
    setEdits((prev) => ({ ...prev, [suggestion.field]: suggestion.suggestion }));
    setAppliedSuggestionId(suggestion.id);
  };

  // Diff: какие поля изменены
  const getFieldState = (key: string): 'unchanged' | 'changed' | 'reverted' => {
    const original = String(raw[key] ?? '');
    const current = edits[key] ?? '';
    if (current === original) return 'unchanged';
    return 'changed';
  };

  const hasChanges = fields.some((f) => getFieldState(f.key) === 'changed');

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const changedEdits: Record<string, string> = {};
      for (const f of fields) {
        if (getFieldState(f.key) === 'changed') {
          changedEdits[f.key] = edits[f.key];
        }
      }
      if (Object.keys(changedEdits).length === 0) {
        setError('Нет изменений для сохранения.');
        return;
      }
      await editModerationItem(item, changedEdits, {
        aiSuggestionId: appliedSuggestionId || undefined,
      });
      onSaved({
        ...item,
        ...changedEdits,
        editedAt: Date.now(),
      } as ModerationItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndApprove = async () => {
    setError(null);
    setSaving(true);
    try {
      const changedEdits: Record<string, string> = {};
      for (const f of fields) {
        if (getFieldState(f.key) === 'changed') {
          changedEdits[f.key] = edits[f.key];
        }
      }
      if (Object.keys(changedEdits).length > 0) {
        await editModerationItem(item, changedEdits, {
          aiSuggestionId: appliedSuggestionId || undefined,
        });
      }
      await moderateItem(item, 'approved');
      onSavedAndApproved({
        ...item,
        ...changedEdits,
        status: 'approved',
        editedAt: Date.now(),
      } as ModerationItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const history = item.editHistory || [];

  return (
    <div className="editModalOverlay" onClick={onClose}>
      <div className="editModal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="editModalHeader">
          <strong>Редактирование: {item.title}</strong>
          <button type="button" className="smallButton" onClick={onClose}>Закрыть</button>
        </div>

        {/* Meta */}
        <dl className="editModalMeta">
          <dt>Раздел</dt>
          <dd>{sectionLabel(item.section)}</dd>
          <dt>Статус</dt>
          <dd>
            <span className={`pill ${item.status === 'approved' ? 'good' : item.status === 'rejected' ? 'danger' : ''}`}>
              {item.status}
            </span>
            {item.editedAt ? <small className="editedBadge">ред.</small> : null}
          </dd>
          <dt>Пользователь</dt>
          <dd>{item.userName || '-'} <small>({item.userId})</small></dd>
          <dt>Создано</dt>
          <dd>{item.timestampLabel}</dd>
        </dl>

        {/* AI Suggestions */}
        {suggestionsLoading ? (
          <div className="aiSuggestionBlock">
            <span className="issue">AI анализирует возможные исправления...</span>
          </div>
        ) : null}

        {aiSuggestions.map((s) => (
          <div key={s.id} className="aiSuggestionBlock">
            <span className="issue">AI: {s.issue}</span>
            <span className="suggestion">{s.suggestion}</span>
            <button
              type="button"
              className="smallButton"
              onClick={() => applySuggestion(s)}
              disabled={saving}
            >
              Применить исправление
            </button>
          </div>
        ))}

        {/* Editable fields */}
        {fields.map((f) => {
          const state = getFieldState(f.key);
          const fieldClassName = `editField${state === 'changed' ? ' changed' : ''}`;
          return (
            <div key={f.key} className={fieldClassName}>
              <label>{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea
                  className={state === 'changed' ? 'changed' : ''}
                  rows={4}
                  value={edits[f.key] || ''}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  disabled={saving}
                />
              ) : (
                <input
                  className={state === 'changed' ? 'changed' : ''}
                  type="text"
                  value={edits[f.key] || ''}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  disabled={saving}
                />
              )}
            </div>
          );
        })}

        {/* Edit history */}
        {history.length > 0 ? (
          <div className="editHistory">
            <strong>История редактирования</strong>
            {history.map((entry, idx) => (
              <div key={idx} className="editHistoryItem">
                <span className="meta">
                  {new Date(entry.timestamp).toLocaleString()} — {entry.moderatorEmail || entry.moderatorUid}
                  {entry.aiSuggestionId ? <span className="aiTag">AI</span> : null}
                </span>
                <span className="diff">
                  <strong>{FIELD_LABELS[entry.field] || entry.field}:</strong>{' '}
                  <del>{entry.previousValue}</del> <ins>{entry.newValue}</ins>
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* Error */}
        {error ? <p className="formError">{error}</p> : null}

        {/* Actions */}
        <div className="editActions">
          <button
            type="button"
            className="smallButton"
            disabled={saving || !hasChanges}
            onClick={() => void handleSave()}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button
            type="button"
            className="smallButton"
            disabled={saving}
            onClick={() => void handleSaveAndApprove()}
          >
            {saving ? '...' : 'Сохранить и одобрить'}
          </button>
          <button type="button" className="smallButton" onClick={onClose} disabled={saving}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
};

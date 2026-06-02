import { useState } from 'react';

const REJECTION_TEMPLATES = [
  { label: 'Спам / реклама', value: 'Заявка отклонена: спам или нецелевая реклама.' },
  { label: 'Дубликат', value: 'Заявка отклонена: дубликат существующей записи.' },
  { label: 'Неверные данные', value: 'Заявка отклонена: указаны некорректные или неполные данные.' },
  { label: 'Оскорбления / нарушение правил', value: 'Заявка отклонена: содержит оскорбления или нарушает правила сообщества.' },
  { label: 'Не по теме раздела', value: 'Заявка отклонена: не соответствует тематике раздела.' },
  { label: 'Подозрительная активность', value: 'Заявка отклонена: подозрительная активность аккаунта.' },
];

type RejectModalProps = {
  /** How many items are being rejected (1 = single, >1 = batch) */
  count: number;
  onConfirm: (reason: string | undefined) => void;
  onCancel: () => void;
};

export const RejectModal = ({ count, onConfirm, onCancel }: RejectModalProps) => {
  const [reason, setReason] = useState('');

  const applyTemplate = (template: string) => {
    setReason(template);
  };

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
  };

  const isBatch = count > 1;

  return (
    <div className="previewOverlay" onClick={onCancel}>
      <div className="rejectModalDialog" onClick={(e) => e.stopPropagation()}>
        <div className="rejectModalHeader">
          <strong>{isBatch ? `Отклонить ${count} записей` : 'Отклонить запись'}</strong>
          <button type="button" className="smallButton dangerButton" onClick={onCancel}>Закрыть</button>
        </div>

        <div className="rejectModalBody">
          <label className="field">
            <span>Причина отклонения (необязательно):</span>
            <textarea
              className="rejectTextarea"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Укажите причину отклонения..."
            />
          </label>

          <div className="rejectTemplates">
            <small>Шаблоны:</small>
            <div className="rejectTemplateButtons">
              {REJECTION_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className="smallButton rejectTemplateBtn"
                  onClick={() => applyTemplate(t.value)}
                  title={t.value}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rejectModalFooter">
          <button type="button" className="smallButton" onClick={onCancel}>Отмена</button>
          <button type="button" className="smallButton dangerButton" onClick={handleConfirm}>
            {isBatch ? `Отклонить (${count})` : 'Отклонить'}
          </button>
        </div>
      </div>
    </div>
  );
};

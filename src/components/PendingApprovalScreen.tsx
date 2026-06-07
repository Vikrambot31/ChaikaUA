import React from 'react';
import { useSelector } from 'react-redux';
import SystemStatusScreen from './SystemStatusScreen';
import type { RootState } from '../redux/store';
import { normalizeLanguage } from '../redux/slices/languageSlice';

type PendingApprovalScreenProps = {
  message?: string;
  onRetry?: () => void;
};

const TEXTS = {
  ua: {
    title: 'Очікування на одобрення пристрою',
    defaultMessage: 'Цей пристрій чекає на одобрення. Спробуйте пізніше.',
    refreshBtn: 'Оновити статус',
  },
  ru: {
    title: 'Ожидание одобрения устройства',
    defaultMessage: 'Это устройство ожидает одобрения. Попробуйте позже.',
    refreshBtn: 'Обновить статус',
  },
  en: {
    title: 'Device approval pending',
    defaultMessage: 'This device is waiting for approval. Please try again a bit later.',
    refreshBtn: 'Refresh status',
  },
} as const;

const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({ message, onRetry }) => {
  const language = useSelector((state: RootState) => state.language.current);
  const text = TEXTS[normalizeLanguage(language) as keyof typeof TEXTS] ?? TEXTS.ua;

  return (
    <SystemStatusScreen
      icon="clock-outline"
      title={text.title}
      message={message || text.defaultMessage}
      actionLabel={onRetry ? text.refreshBtn : undefined}
      onAction={onRetry}
    />
  );
};

export default PendingApprovalScreen;

import React from 'react';
import SystemStatusScreen from './SystemStatusScreen';

type PendingApprovalScreenProps = {
  message?: string;
  onRetry?: () => void;
};

const PendingApprovalScreen: React.FC<PendingApprovalScreenProps> = ({ message, onRetry }) => (
  <SystemStatusScreen
    icon="clock-outline"
    title="Device approval pending"
    message={message || 'This device is waiting for approval. Please try again a bit later.'}
    actionLabel={onRetry ? 'Refresh status' : undefined}
    onAction={onRetry}
  />
);

export default PendingApprovalScreen;

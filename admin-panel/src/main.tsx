import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

const REQUIRED_ENV_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_ADMIN_SERVICE_EMAIL',
] as const;

const missing = REQUIRED_ENV_VARS.filter((key) => !import.meta.env[key]);
if (missing.length > 0) {
  console.error('[ENV] Missing required environment variables:', missing.join(', '));
  throw new Error(`Отсутствуют обязательные переменные окружения: ${missing.join(', ')}. Проверьте .env.local.`);
}

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UnhandledRejection]', event.reason);
});

window.addEventListener('error', (event) => {
  if (event.error) console.error('[GlobalError]', event.error);
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

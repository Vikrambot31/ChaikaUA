/**
 * Breadcrumb Service
 * Tracks the last 30 user actions (navigation, button taps, API calls, etc.)
 * before an error occurs. Breadcrumbs are attached to critical error reports
 * so admins can reconstruct the exact sequence of events that led to a crash.
 *
 * Usage:
 *   addBreadcrumb('navigation', 'ProfileScreen')
 *   addBreadcrumb('action', 'uploadPhoto', { screen: 'EditProfileScreen' })
 *   addBreadcrumb('network', 'GET users/uid/photos → 200')
 *
 * In error handler:
 *   const trail = getBreadcrumbs();
 */

export type BreadcrumbCategory =
  | 'navigation'
  | 'action'
  | 'network'
  | 'auth'
  | 'form'
  | 'media'
  | 'firebase'
  | 'debug';

export interface Breadcrumb {
  at: number;
  category: BreadcrumbCategory;
  message: string;
  screen?: string;
  data?: Record<string, unknown>;
}

const MAX_BREADCRUMBS = 30;
const breadcrumbs: Breadcrumb[] = [];

const SENSITIVE_KEY_RE = /password|token|secret|email|phone/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;

const sanitizeData = (data: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  Object.entries(data).slice(0, 10).forEach(([k, v]) => {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[redacted]';
      return;
    }
    if (typeof v === 'string') {
      out[k] = v.replace(EMAIL_RE, '[redacted-email]').replace(PHONE_RE, '[redacted-phone]').slice(0, 200);
      return;
    }
    out[k] = v;
  });
  return out;
};

export const addBreadcrumb = (
  category: BreadcrumbCategory,
  message: string,
  options: { screen?: string; data?: Record<string, unknown> } = {},
): void => {
  breadcrumbs.push({
    at: Date.now(),
    category,
    message: String(message).slice(0, 300),
    screen: options.screen ? String(options.screen).slice(0, 100) : undefined,
    data: options.data ? sanitizeData(options.data) : undefined,
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
};

export const getBreadcrumbs = (): Breadcrumb[] => [...breadcrumbs];

export const clearBreadcrumbs = (): void => {
  breadcrumbs.length = 0;
};

export const formatBreadcrumbs = (items: Breadcrumb[] = breadcrumbs): string =>
  items
    .map((b) => {
      const t = new Date(b.at).toLocaleTimeString('ru-RU');
      const dataStr = b.data && Object.keys(b.data).length ? ` | ${JSON.stringify(b.data)}` : '';
      return `[${t}] ${b.category.toUpperCase().padEnd(10)} ${b.screen ? `(${b.screen}) ` : ''}→ ${b.message}${dataStr}`;
    })
    .join('\n');

// =============================================================
//  AI Config Types — конфигурация AI-провайдера через RTDB
// =============================================================

export type AiProvider = 'opencode' | 'deepseek' | 'openai' | 'claude';

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  opencode: 'OpenCode Zen (бесплатно)',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  claude: 'Claude (Anthropic)',
};

export const AI_PROVIDER_DEFAULT_MODELS: Record<AiProvider, string> = {
  opencode: 'deepseek-v4-flash-free',
  deepseek: 'deepseek-chat',
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
};

export type AiAutonomousConfig = {
  enabled: boolean;
  textModeration: boolean;
  photoModeration: boolean;
  supportReplies: boolean;
  reportsTriage: boolean;
};

export type AiThresholdsConfig = {
  autoApprove: number;   // 0.80–0.95: авто-одобрение
  autoReject: number;    // 0.90–0.99: авто-отклонение
  escalateBelow: number; // 0.50–0.75: эскалация человеку
};

export type AiVisionConfig = {
  provider: 'claude' | 'openai';
  model: string;
  apiKey: string; // если пустой — используется основной apiKey
};

export type AiFallbackConfig = {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
};

export type AiConfig = {
  provider: AiProvider;
  model: string;
  apiKey: string;
  baseUrl: string;
  budgetDaily: number;
  budgetMonthly: number;
  autonomous: AiAutonomousConfig;
  thresholds: AiThresholdsConfig;
  vision: AiVisionConfig;
  fallback?: AiFallbackConfig;
  updatedAt?: number;
  updatedBy?: string;
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'opencode',
  model: 'deepseek-v4-flash-free',
  apiKey: '',
  baseUrl: '',
  budgetDaily: 5000,
  budgetMonthly: 100000,
  autonomous: {
    enabled: false,
    textModeration: false,
    photoModeration: false,
    supportReplies: false,
    reportsTriage: false,
  },
  thresholds: {
    autoApprove: 0.90,
    autoReject: 0.95,
    escalateBelow: 0.65,
  },
  vision: {
    provider: 'claude',
    model: 'claude-haiku-4-5-20251001',
    apiKey: '',
  },
  fallback: {
    enabled: false,
    provider: 'openai',
    model: 'gpt-4.1-nano',
    apiKey: '',
    baseUrl: '',
  },
};

export type AiTestResult = {
  success: boolean;
  provider: string;
  model: string;
  tokensUsed?: number;
  latencyMs?: number;
  error?: string;
};

export type AiLogEntry = {
  id: string;
  timestamp: number;
  type: 'text_analysis' | 'auto_approve' | 'auto_reject' | 'escalation' | 'support_reply' | 'report_triage' | 'test';
  section?: string;
  verdict?: string;
  confidence?: number;
  provider: string;
  model: string;
  tokensUsed: number;
  cached: boolean;
  autoAction?: boolean;
  moderatorUid?: string;
  textTruncated?: string;
  latency?: number;
};

export type EscalationItem = {
  id: string;
  itemPath: string;
  section: string;
  statusField: string;
  approvedStatus: string;
  rejectedStatus: string;
  itemId: string;
  textPreview: string;
  userId?: string | null;
  ai_verdict: string;
  ai_confidence: number;
  ai_explanation: string;
  ai_flags: string[];
  provider: string;
  model: string;
  createdAt: number;
  status: 'pending' | 'resolved_approved' | 'resolved_rejected';
  resolvedAt?: number;
  resolvedBy?: string;
  resolvedReason?: string;
};

export type AiQueueLastRun = {
  timestamp: number;
  totalProcessed: number;
  totalApproved: number;
  totalRejected: number;
  totalEscalated: number;
};

export type SupportEscalationItem = {
  id: string;
  ticketId: string;
  userId: string | null;
  userName: string;
  category: string;
  urgency: 'low' | 'medium' | 'high';
  userMessage: string;
  aiDraftReply: string;
  createdAt: number;
  status: 'pending' | 'resolved';
  resolvedAt?: number;
  resolvedBy?: string;
  requiresHuman: boolean;
};

export type ReportEscalationItem = {
  id: string;
  reportId: string;
  reporterId: string | null;
  reportedUserId: string | null;
  reportedListingId: string | null;
  reason: string;
  description: string;
  aiVerdict: 'spam' | 'revenge' | 'legitimate' | 'serious';
  aiConfidence: number;
  aiPriority: 'low' | 'medium' | 'high';
  aiReason: string;
  provider: string;
  createdAt: number;
  status: 'pending' | 'resolved';
  resolvedAt?: number;
  resolvedBy?: string;
};

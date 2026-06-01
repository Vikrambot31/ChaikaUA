// =============================================================
//  AI Moderation Types — провайдеронезависимые типы для AI-анализа
// =============================================================

export type AiVerdict = 'approve' | 'review' | 'suspicious';

export type AnalysisResult = {
  verdict: AiVerdict;
  confidence: number; // 0.0 – 0.99 (никогда не 1.0)
  explanation: string; // 1-2 предложения на русском
  flags: string[]; // ["spam", "scam", "profanity", ...]
  provider: string; // 'deepseek', 'openai', 'claude', 'mock'
  model: string; // 'deepseek-chat', 'gpt-4o-mini', etc.
  tokensUsed: number;
  cached: boolean;
};

export type AnalysisContext = {
  text: string;
  section: string;
  category: string;
  title: string;
  description: string;
  userId?: string;
};

export type AiAnalyzePayload = {
  text: string;
  section: string;
  category: string;
  title: string;
  description: string;
  userId?: string;
};

export type AiAnalyzeResponse = {
  verdict: AiVerdict;
  confidence: number;
  explanation: string;
  flags: string[];
  provider: string;
  model: string;
  tokensUsed: number;
  cached: boolean;
};

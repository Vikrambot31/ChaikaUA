// =============================================================
//  AI Analysis Service — провайдеронезависимый сервис AI-анализа
//  для модерации контента в админ-панели
// =============================================================

import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';
import type { ModerationItem } from './moderationService';
import type { AnalysisResult, AiAnalyzePayload, AiAnalyzeResponse } from '../types/ai';

const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

/**
 * Анализирует текст заявки через AI (Cloud Function `adminAnalyzeContent`).
 * В LOCAL_MODE возвращает мок-результат с задержкой.
 */
export async function analyzeText(item: ModerationItem): Promise<AnalysisResult> {
  if (LOCAL_MODE) {
    return mockAnalyze(item);
  }

  if (!functions) {
    throw new Error('Firebase Functions не инициализированы.');
  }

  const text = String(item.subtitle || item.title || '').trim();
  if (!text) {
    return {
      verdict: 'review',
      confidence: 0,
      explanation: 'Пустой текст — невозможно проанализировать.',
      flags: ['empty_text'],
      provider: 'none',
      model: 'none',
      tokensUsed: 0,
      cached: false,
    };
  }

  const callable = httpsCallable<AiAnalyzePayload, AiAnalyzeResponse>(
    functions,
    'adminAnalyzeContent',
  );

  const raw = item.raw || {};
  const result = await callable({
    text,
    section: item.section,
    category: String(raw.category || raw.type || ''),
    title: item.title,
    description: String(raw.description || ''),
    userId: item.userId || undefined,
  });

  return {
    verdict: result.data.verdict,
    confidence: result.data.confidence,
    explanation: result.data.explanation,
    flags: result.data.flags,
    provider: result.data.provider,
    model: result.data.model,
    tokensUsed: result.data.tokensUsed,
    cached: result.data.cached,
  };
}

// --------------- LOCAL_MODE mock ---------------

const MOCK_VERDICTS: Array<Pick<AnalysisResult, 'verdict' | 'confidence' | 'explanation' | 'flags'>> = [
  { verdict: 'approve', confidence: 0.92, explanation: '[MOCK] Текст не содержит нарушений.', flags: [] },
  { verdict: 'review', confidence: 0.6, explanation: '[MOCK] Требует проверки модератором.', flags: ['uncertain'] },
  { verdict: 'suspicious', confidence: 0.85, explanation: '[MOCK] Обнаружены признаки спама.', flags: ['spam'] },
];

async function mockAnalyze(_item: ModerationItem): Promise<AnalysisResult> {
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
  const pick = MOCK_VERDICTS[Math.floor(Math.random() * MOCK_VERDICTS.length)];
  return {
    ...pick,
    provider: 'mock',
    model: 'mock-local',
    tokensUsed: 0,
    cached: false,
  };
}

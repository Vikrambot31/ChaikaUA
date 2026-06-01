// =============================================================
//  AI Suggestion Service — AI-подсказки для редактирования заявок
// =============================================================

import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '../firebase/firebase';
import { LOCAL_MODE } from '../local/LOCAL_MODE';
import type { ModerationItem } from './moderationService';
import type { AnalysisResult } from '../types/ai';

const functions = LOCAL_MODE ? null : getFunctions(firebaseApp);

export type AiSuggestion = {
  id: string;
  field: string;
  issue: string;
  suggestion: string;
  originalText: string;
};

type SuggestFixPayload = {
  text: string;
  section: string;
  category: string;
  flags: string[];
  fields: Record<string, string>;
};

type SuggestFixResponse = {
  suggestions: AiSuggestion[];
};

/**
 * Запрашивает у AI предложения по исправлению текста заявки.
 * Вызывается только когда AI-вердикт !== 'approve'.
 */
export async function suggestFix(
  item: ModerationItem,
  analysisResult: AnalysisResult,
): Promise<AiSuggestion[]> {
  if (LOCAL_MODE) {
    return mockSuggestFix(item, analysisResult);
  }

  if (!functions) throw new Error('Firebase Functions не инициализированы.');
  if (!analysisResult.flags.length && analysisResult.verdict === 'approve') return [];

  const raw = item.raw || {};
  const fields: Record<string, string> = {};
  for (const key of ['text', 'description', 'title', 'phone', 'address', 'price', 'contactName', 'name', 'goal']) {
    if (raw[key] !== undefined) {
      fields[key] = String(raw[key]);
    }
  }

  const callable = httpsCallable<SuggestFixPayload, SuggestFixResponse>(
    functions,
    'adminSuggestFix',
  );

  const result = await callable({
    text: String(item.subtitle || item.title || ''),
    section: item.section,
    category: String(raw.category || raw.type || ''),
    flags: analysisResult.flags,
    fields,
  });

  return result.data.suggestions || [];
}

// --------------- LOCAL_MODE mock ---------------

async function mockSuggestFix(
  item: ModerationItem,
  analysisResult: AnalysisResult,
): Promise<AiSuggestion[]> {
  await new Promise((r) => setTimeout(r, 600));
  const raw = item.raw || {};
  const text = String(raw.text || raw.description || item.subtitle || '');
  if (!text) return [];

  return [
    {
      id: 'mock-suggestion-1',
      field: 'text',
      issue: `[MOCK] AI обнаружил проблему: ${analysisResult.flags[0] || 'требует проверки'}`,
      suggestion: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
      originalText: text,
    },
  ];
}

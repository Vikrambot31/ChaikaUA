import { useState } from 'react';
import { analyzeText } from '../services/aiAnalysisService';
import type { ModerationItem } from '../services/moderationService';
import type { AnalysisResult, AiVerdict } from '../types/ai';

type Props = {
  item: ModerationItem;
  onResult?: (itemPath: string, result: AnalysisResult) => void;
};

const VERDICT_META: Record<AiVerdict, { icon: string; label: string; prefix: string }> = {
  approve: { icon: '✅', label: 'AI рекомендует одобрить', prefix: 'К одобрению' },
  review: { icon: '⚠️', label: 'AI рекомендует проверить', prefix: 'Проверьте' },
  suspicious: { icon: '❌', label: 'AI считает подозрительным', prefix: 'Подозрительно' },
};

const formatConfidence = (confidence: number): string => `${Math.round(confidence * 100)}%`;

export const AiAnalysisButton = ({ item, onResult }: Props) => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const meta = result ? VERDICT_META[result.verdict] : null;
  const buttonLabel = result ? meta?.label : error ? 'AI-анализ завершился ошибкой' : 'Запустить AI-анализ';
  const className = [
    'aiIndicator',
    result ? `verdict-${result.verdict}` : '',
    error ? 'verdict-error' : '',
    isAnalyzing ? 'isAnalyzing' : '',
  ].filter(Boolean).join(' ');

  const handleAnalyze = async () => {
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const nextResult = await analyzeText(item);
      setResult(nextResult);
      onResult?.(item.path, nextResult);
      setIsPopoverOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить AI-анализ.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <span
      className="aiIndicatorWrap"
      onMouseEnter={() => setIsPopoverOpen(true)}
      onMouseLeave={() => setIsPopoverOpen(false)}
      onFocus={() => setIsPopoverOpen(true)}
      onBlur={() => setIsPopoverOpen(false)}
    >
      <button
        type="button"
        className={className}
        onClick={handleAnalyze}
        disabled={isAnalyzing}
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <span aria-hidden="true">{isAnalyzing ? '🧠···' : meta?.icon ?? (error ? '❗' : '🧠')}</span>
      </button>

      {isPopoverOpen && (result || error || isAnalyzing) ? (
        <span className="aiPopover" role="status">
          {isAnalyzing ? (
            <span className="aiPopoverTitle">AI анализирует заявку...</span>
          ) : null}

          {error ? (
            <>
              <span className="aiPopoverTitle">Ошибка AI-анализа</span>
              <span className="aiPopoverText">{error}</span>
              <span className="provider">Нажмите, чтобы повторить.</span>
            </>
          ) : null}

          {result && meta ? (
            <>
              <span className="aiPopoverTitle">{meta.prefix}: {result.explanation}</span>
              <span className="aiConfidence" aria-label={`Уверенность ${formatConfidence(result.confidence)}`}>
                <span style={{ width: formatConfidence(result.confidence) }} />
              </span>
              <span className="aiPopoverText">Уверенность: {formatConfidence(result.confidence)}</span>
              {result.flags.length > 0 ? (
                <span className="aiFlags">Флаги: {result.flags.join(', ')}</span>
              ) : null}
              <span className="provider">
                AI: {result.provider} / {result.model}
                {result.cached ? ' · кеш' : ''}
                {result.tokensUsed ? ` · ${result.tokensUsed} ток.` : ''}
              </span>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
};

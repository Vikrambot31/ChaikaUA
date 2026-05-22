const OLLAMA_URL = 'http://127.0.0.1:11434';
const MODEL = 'deepseek-v2'; // User should adjust model name if needed
const TIMEOUT_MS = 120_000; // 2 min timeout
const MAX_RETRIES = 2;

export async function queryDeepSeek(prompt, options = {}) {
  const model = options.model || MODEL;
  const timeout = options.timeout || TIMEOUT_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.3, num_predict: 2048 },
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, text: data.response || '', model: data.model };
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      if (isLast) {
        return {
          success: false,
          text: '',
          error: err.name === 'AbortError' ? 'Ollama timeout' : err.message,
        };
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

export async function isOllamaAvailable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function generateAISummary(findings, categoryScores, healthScore) {
  const available = await isOllamaAvailable();
  if (!available) {
    return { success: false, text: 'DeepSeek/Ollama недоступен. AI-анализ пропущен.', error: 'offline' };
  }

  const severityCounts = {};
  for (const f of findings) {
    const key = f.severity;
    severityCounts[key] = (severityCounts[key] || 0) + 1;
  }

  const criticals = findings.filter(f => f.severity === 'CRITICAL').slice(0, 5);
  const highs = findings.filter(f => f.severity === 'HIGH').slice(0, 5);

  const prompt = `Ты — senior software architect. Проанализируй результаты аудита React Native + Firebase проекта.

Health Score: ${healthScore}/100
Category Scores: ${JSON.stringify(categoryScores)}
Severity Counts: ${JSON.stringify(severityCounts)}
Total Findings: ${findings.length}

Top Critical Issues:
${criticals.map(f => `- [${f.severity}] ${f.file}:${f.line} — ${f.rule}: ${f.why}`).join('\n')}

Top High Issues:
${highs.map(f => `- [${f.severity}] ${f.file}:${f.line} — ${f.rule}: ${f.why}`).join('\n')}

Напиши краткое резюме на русском языке:
1. Общее состояние проекта (1-2 предложения)
2. Топ-3 критических риска для production
3. Топ-3 рекомендации для улучшения стабильности
4. Production readiness оценка (готов / условно готов / не готов)

Будь конкретным и практичным. Не более 500 слов.`;

  return queryDeepSeek(prompt);
}

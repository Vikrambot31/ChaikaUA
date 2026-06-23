import { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import type { AiConfig, AiProvider, AiLogEntry, EscalationItem, AiQueueLastRun, SupportEscalationItem, ReportEscalationItem } from '../types/ai-config';
import { AI_PROVIDER_LABELS, AI_PROVIDER_DEFAULT_MODELS, DEFAULT_AI_CONFIG } from '../types/ai-config';
import type { AiUsageStats } from '../services/aiConfigService';
import {
  saveAiConfig,
  testAiConnection,
  loadAiLog,
  loadAiUsageStats,
  maskApiKey,
  subscribeToAiConfigState,
  subscribeToEscalations,
  resolveEscalation,
  loadQueueLastRun,
  loadPhotoQueueLastRun,
  subscribeToSupportEscalations,
  subscribeToReportEscalations,
  resolveSupportEscalation,
  resolveReportEscalation,
} from '../services/aiConfigService';
import { useViewMode } from '../contexts/ViewModeContext';

type Tab = 'model' | 'autonomous' | 'escalations' | 'log' | 'stats';

type Props = {
  user: User;
};

const VERDICT_COLORS: Record<string, string> = {
  approve: '#4caf50',
  review: '#ff9800',
  suspicious: '#f44336',
};

const formatDate = (ts: number) =>
  new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const AiControlCenterPage = ({ user }: Props) => {
  const { viewMode } = useViewMode();
  const isSimpleMode = viewMode === 'simple';
  const [tab, setTab] = useState<Tab>('model');
  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [savedConfig, setSavedConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const [configExists, setConfigExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [log, setLog] = useState<AiLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<AiQueueLastRun | null>(null);
  const [photoLastRun, setPhotoLastRun] = useState<AiQueueLastRun | null>(null);
  const [supportEscalations, setSupportEscalations] = useState<SupportEscalationItem[]>([]);
  const [reportEscalations, setReportEscalations] = useState<ReportEscalationItem[]>([]);
  const [escalationFilter, setEscalationFilter] = useState<'all' | 'content' | 'support' | 'reports'>('all');

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 5000);
    const unsub = subscribeToAiConfigState(({ config: cfg, exists }) => {
      clearTimeout(timer);
      setConfig(cfg);
      setSavedConfig(cfg);
      setConfigExists(exists);
      setLoading(false);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const unsub = subscribeToEscalations(setEscalations);
    void loadQueueLastRun().then(setLastRun);
    void loadPhotoQueueLastRun().then(setPhotoLastRun);
    return unsub;
  }, []);

  useEffect(() => {
    const u1 = subscribeToSupportEscalations(setSupportEscalations);
    const u2 = subscribeToReportEscalations(setReportEscalations);
    return () => { u1(); u2(); };
  }, []);

  const hasChanges = JSON.stringify(config) !== JSON.stringify(savedConfig);
  const hasApiKey = config.apiKey.trim().length >= 8;
  const isMainVisionCompatible = config.provider === config.vision.provider;
  const hasVisionKey = config.vision.apiKey.trim().length >= 8;
  const visionReady = hasVisionKey || (hasApiKey && isMainVisionCompatible);
  const fallbackReady = Boolean(config.fallback?.enabled && config.fallback.apiKey.trim().length >= 8 && config.fallback.model.trim());
  const autonomousEnabledCount = Object.entries(config.autonomous)
    .filter(([key, value]) => key !== 'enabled' && value)
    .length;
  const totalEscalations = escalations.length + supportEscalations.length + reportEscalations.length;
  const aiDisconnected = !configExists || !hasApiKey || !config.model.trim();
  const aiPaused = !aiDisconnected && (!config.autonomous.enabled || autonomousEnabledCount === 0);
  const aiWorking = !aiDisconnected && config.autonomous.enabled && autonomousEnabledCount > 0;
  const aiState = aiDisconnected
    ? {
      title: 'ИИ не подключен',
      subtitle: 'Нет сохранённого конфига, ключа или модели',
      color: '#ef5350',
      background: 'linear-gradient(135deg, #3a1515 0%, #1a1a2a 100%)',
      border: '#ef5350',
    }
    : aiPaused
      ? {
        title: 'ИИ на паузе',
        subtitle: 'Модель подключена, но автономные режимы выключены',
        color: '#ffd54f',
        background: 'linear-gradient(135deg, #3a2f12 0%, #1a1a2a 100%)',
        border: '#8d6e00',
      }
      : aiWorking && lastRun
        ? {
          title: 'ИИ работает',
          subtitle: 'Автономная модерация активна',
          color: '#69f0ae',
          background: 'linear-gradient(135deg, #0d3b24 0%, #1a1a2a 100%)',
          border: '#2e7d32',
        }
        : {
          title: 'ИИ спит',
          subtitle: 'Модель подключена, ждёт ближайший scheduled-прогон',
          color: '#90caf9',
          background: 'linear-gradient(135deg, #102b3f 0%, #1a1a2a 100%)',
          border: '#1976d2',
        };

  const modeBadges = [
    { label: 'Текст', enabled: config.autonomous.enabled && config.autonomous.textModeration, value: `${config.provider} / ${config.model || 'модель не выбрана'}${fallbackReady ? ` -> ${config.fallback?.provider} / ${config.fallback?.model}` : ''}` },
    { label: 'Фото', enabled: config.autonomous.enabled && config.autonomous.photoModeration && visionReady, value: visionReady ? `${config.vision.provider} / ${config.vision.model}` : 'не подключена' },
    { label: 'Поддержка', enabled: config.autonomous.enabled && config.autonomous.supportReplies, value: config.autonomous.supportReplies ? `${config.provider} / ${config.model}` : 'на паузе' },
    { label: 'Жалобы', enabled: config.autonomous.enabled && config.autonomous.reportsTriage, value: config.autonomous.reportsTriage ? `${config.provider} / ${config.model}` : 'на паузе' },
  ];

  const applySafeTemplate = () => {
    setConfig((c) => ({
      ...c,
      provider: 'opencode',
      model: AI_PROVIDER_DEFAULT_MODELS.opencode,
      baseUrl: c.baseUrl || 'https://opencode.ai/zen/v1',
      budgetDaily: c.budgetDaily || 5000,
      budgetMonthly: c.budgetMonthly || 100000,
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
        ...c.vision,
        provider: 'openai',
        model: c.vision.model || 'gpt-4o-mini',
      },
    }));
  };

  const statusItems = [
    { label: 'RTDB конфиг', ok: configExists, detail: configExists ? 'создан' : 'не создан' },
    { label: 'API key', ok: hasApiKey, detail: hasApiKey ? maskApiKey(config.apiKey) : 'не заполнен' },
    { label: 'Модель', ok: Boolean(config.model.trim()), detail: config.model || 'не выбрана' },
    { label: 'Автономность', ok: config.autonomous.enabled && autonomousEnabledCount > 0, detail: config.autonomous.enabled ? `${autonomousEnabledCount} режима` : 'выключена' },
    { label: 'Vision', ok: visionReady, detail: visionReady ? `${config.vision.provider}/${config.vision.model}` : 'нужен ключ OpenAI/Claude' },
    { label: 'Резерв', ok: fallbackReady, detail: fallbackReady ? `${config.fallback?.provider}/${config.fallback?.model}` : 'не настроен' },
    { label: 'Эскалации', ok: totalEscalations === 0, detail: `${totalEscalations} pending` },
  ];

  const renderStatusPanel = () => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 10,
      marginBottom: 24,
    }}>
      {statusItems.map((item) => (
        <div key={item.label} style={{
          padding: '10px 12px',
          borderRadius: 8,
          border: `1px solid ${item.ok ? '#2e7d32' : '#6a4b00'}`,
          background: item.ok ? '#102414' : '#2a2110',
        }}>
          <div style={{ fontSize: 11, color: item.ok ? '#81c784' : '#ffd54f', fontWeight: 800, textTransform: 'uppercase' }}>{item.label}</div>
          <div style={{ marginTop: 4, color: '#e0e0e0', fontSize: 13, overflowWrap: 'anywhere' }}>{item.detail}</div>
        </div>
      ))}
    </div>
  );

  const renderAiHero = () => (
    <div style={{
      marginBottom: 24,
      padding: '22px 24px',
      borderRadius: 10,
      border: `2px solid ${aiState.border}`,
      background: aiState.background,
      boxShadow: `0 0 0 1px ${aiState.border}22, 0 16px 40px #00000033`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: aiState.color, fontSize: 38, lineHeight: 1, fontWeight: 900, letterSpacing: 0 }}>
            {aiState.title}
          </div>
          <div style={{ marginTop: 8, color: '#e0e0e0', fontSize: 17, fontWeight: 700 }}>
            Рабочая модель: {hasApiKey ? `${config.provider} / ${config.model || 'не выбрана'}` : 'не подключена'}
          </div>
          {fallbackReady && (
            <div style={{ marginTop: 6, color: '#ffd54f', fontSize: 15, fontWeight: 800 }}>
              Авто-резерв при лимитах: {config.fallback?.provider} / {config.fallback?.model}
            </div>
          )}
          <div style={{ marginTop: 6, color: '#aaa', fontSize: 13 }}>
            {aiState.subtitle}
            {lastRun ? ` · последний текстовый прогон: ${formatDate(lastRun.timestamp)}` : ''}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 8, minWidth: 280 }}>
          {modeBadges.map((mode) => (
            <div key={mode.label} style={{
              padding: '9px 10px',
              borderRadius: 8,
              border: `1px solid ${mode.enabled ? '#2e7d32' : '#555'}`,
              background: mode.enabled ? '#0f2a18' : '#20202d',
            }}>
              <div style={{ color: mode.enabled ? '#69f0ae' : '#888', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                {mode.enabled ? 'работает' : 'спит'}
              </div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 800, marginTop: 2 }}>{mode.label}</div>
              <div style={{ color: '#aaa', fontSize: 11, marginTop: 2, overflowWrap: 'anywhere' }}>{mode.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveOk(false);
    try {
      await saveAiConfig(config, user.uid);
      setSavedConfig(config);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAiConnection(config.provider, config.apiKey, config.model, config.baseUrl);
      if (result.success) {
        setTestResult({ success: true, msg: `OK — ${result.model} (${result.latencyMs}ms, ${result.tokensUsed} tokens)` });
      } else {
        setTestResult({ success: false, msg: result.error || 'Ошибка соединения' });
      }
    } catch (err) {
      setTestResult({ success: false, msg: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const handleProviderChange = (provider: AiProvider) => {
    setConfig((c) => ({
      ...c,
      provider,
      model: AI_PROVIDER_DEFAULT_MODELS[provider],
    }));
  };

  const handleResolve = async (escalationId: string, action: 'approve' | 'reject') => {
    setResolvingId(escalationId);
    try {
      await resolveEscalation(escalationId, action);
    } catch (err) {
      console.error('Resolve error:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const entries = await loadAiLog(100);
      setLog(entries);
    } finally {
      setLogLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    const s = await loadAiUsageStats();
    setStats(s);
  }, []);

  useEffect(() => {
    if (isSimpleMode && tab !== 'escalations') setTab('escalations');
  }, [isSimpleMode, tab]);

  useEffect(() => {
    if (tab === 'log') void loadLog();
    if (tab === 'stats') void loadStats();
  }, [tab, loadLog, loadStats]);

  if (loading) return <div className="loadingScreen">Загрузка конфигурации AI...</div>;

  const renderTabModel = () => (
    <div style={{ maxWidth: 600, color: '#e0e0e0' }}>
      <h3 style={{ marginBottom: 20, color: '#fff', fontSize: 20 }}>Настройка AI-провайдера</h3>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Провайдер</label>
        <select
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 16 }}
        >
          {(Object.keys(AI_PROVIDER_LABELS) as AiProvider[]).map((p) => (
            <option key={p} value={p}>{AI_PROVIDER_LABELS[p]}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Модель</label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
          placeholder={AI_PROVIDER_DEFAULT_MODELS[config.provider]}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>API Ключ</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
            placeholder="sk-..."
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 16 }}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #555', background: '#3a3a4a', color: '#ccc', cursor: 'pointer', fontSize: 13 }}
          >
            {showKey ? 'Скрыть' : 'Показать'}
          </button>
        </div>
        {savedConfig.apiKey && (
          <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Сохранённый: {maskApiKey(savedConfig.apiKey)}</p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>
          Base URL <span style={{ fontWeight: 400, color: '#aaa' }}>(необязательно)</span>
        </label>
        <input
          type="text"
          value={config.baseUrl}
          onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
          placeholder="https://opencode.ai/zen/v1"
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Дневной лимит (запросов)</label>
          <input
            type="number"
            value={config.budgetDaily}
            onChange={(e) => setConfig((c) => ({ ...c, budgetDaily: Number(e.target.value) }))}
            min={100}
            max={50000}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Месячный лимит (запросов)</label>
          <input
            type="number"
            value={config.budgetMonthly}
            onChange={(e) => setConfig((c) => ({ ...c, budgetMonthly: Number(e.target.value) }))}
            min={1000}
            max={500000}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* ---- Vision AI (фото-модерация) ---- */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #444' }}>
        <h3 style={{ marginBottom: 16, fontSize: 20, color: '#fff' }}>Vision AI (фото-модерация)</h3>
        <p style={{ fontSize: 14, color: '#aaa', marginBottom: 16 }}>
          Отдельный провайдер для анализа фотографий. Поддерживаются только Claude и OpenAI (Vision API).
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Vision-провайдер</label>
          <select
            value={config.vision.provider}
            onChange={(e) => setConfig((c) => ({
              ...c,
              vision: { ...c.vision, provider: e.target.value as 'claude' | 'openai' },
            }))}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 16 }}
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>Vision-модель</label>
          <input
            type="text"
            value={config.vision.model}
            onChange={(e) => setConfig((c) => ({
              ...c,
              vision: { ...c.vision, model: e.target.value },
            }))}
            placeholder={config.vision.provider === 'claude' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 16 }}>
            Vision API Ключ <span style={{ fontWeight: 400, color: '#aaa' }}>(если пустой — используется основной ключ)</span>
          </label>
          <input
            type="password"
            value={config.vision.apiKey}
            onChange={(e) => setConfig((c) => ({
              ...c,
              vision: { ...c.vision, apiKey: e.target.value },
            }))}
            placeholder="sk-... (необязательно)"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #444', background: '#2a2a3a', color: '#e0e0e0', fontSize: 14, boxSizing: 'border-box' }}
          />
          {savedConfig.vision?.apiKey && (
            <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Сохранённый: {maskApiKey(savedConfig.vision.apiKey)}</p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 24 }}>
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={testing || !config.apiKey}
          style={{
            padding: '10px 20px', borderRadius: 8, border: 'none',
            background: testing ? '#555' : '#1976d2', color: '#fff',
            fontWeight: 700, fontSize: 14, cursor: testing ? 'default' : 'pointer',
          }}
        >
          {testing ? 'Тестируется...' : 'Тест соединения'}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !hasChanges}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: saveOk ? '#388e3c' : (hasChanges ? '#7c4dff' : '#555'),
            color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: (saving || !hasChanges) ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Сохранение...' : saveOk ? '\u2713 Сохранено' : 'Сохранить'}
        </button>
        {hasChanges && <span style={{ fontSize: 12, color: '#ff9800' }}>• Есть несохранённые изменения</span>}
      </div>

      {testResult && (
        <div style={{
          marginTop: 16, padding: '12px 16px', borderRadius: 8,
          background: testResult.success ? '#1b3a1b' : '#3a1b1b',
          border: `1px solid ${testResult.success ? '#4caf50' : '#f44336'}`,
          color: testResult.success ? '#81c784' : '#ef9a9a',
          fontSize: 13, fontFamily: 'monospace',
        }}>
          {testResult.success ? '\u2713 ' : '\u2717 '}{testResult.msg}
        </div>
      )}

      {savedConfig.updatedAt && (
        <p style={{ fontSize: 12, color: '#666', marginTop: 20 }}>
          Последнее обновление: {formatDate(savedConfig.updatedAt)}
          {savedConfig.updatedBy && ` · ${savedConfig.updatedBy}`}
        </p>
      )}
    </div>
  );

  const renderTabAutonomous = () => (
    <div style={{ maxWidth: 620, color: '#e0e0e0' }}>
      <div style={{
        marginBottom: 24, padding: '12px 16px', borderRadius: 8,
        background: '#2a2a1a', border: '1px solid #665500', color: '#ffd54f', fontSize: 15,
      }}>
        <strong>Фаза 2 (активна)</strong> — авто-модерация запущена. Scheduled function работает каждые 5 минут. Эскалации появляются во вкладке &quot;Эскалации&quot;.
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 20px', background: '#1e1e2e', borderRadius: 10,
        border: config.autonomous.enabled ? '1px solid #7c4dff' : '1px solid #444',
        marginBottom: 24,
      }}>
        <div style={{ flexShrink: 0 }}>
          <input
            type="checkbox"
            id="autonomous-master"
            checked={config.autonomous.enabled}
            onChange={(e) => setConfig((c) => ({ ...c, autonomous: { ...c.autonomous, enabled: e.target.checked } }))}
            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#7c4dff' }}
          />
        </div>
        <label htmlFor="autonomous-master" style={{ cursor: 'pointer' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Автономный режим</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>Главный выключатель. Отключение останавливает все авто-действия AI.</div>
        </label>
      </div>

      {([
        { key: 'textModeration' as const, label: 'Авто-модерация текста', desc: 'AI анализирует новые заявки и авто-одобряет/отклоняет при высокой уверенности' },
        { key: 'photoModeration' as const, label: 'Авто-модерация фото', desc: 'Vision AI проверяет фото на NSFW/спам без участия модератора' },
        { key: 'supportReplies' as const, label: 'Авто-ответы в поддержку', desc: 'AI отвечает на типовые вопросы (регистрация, профиль, фото)' },
        { key: 'reportsTriage' as const, label: 'Триаж жалоб', desc: 'AI классифицирует жалобы и авто-отклоняет спам-репорты' },
      ]).map(({ key, label, desc }) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '14px 20px', background: '#1a1a2a', borderRadius: 8,
          border: '1px solid #333', marginBottom: 10,
          opacity: config.autonomous.enabled ? 1 : 0.5,
        }}>
          <div style={{ flexShrink: 0 }}>
            <input
              type="checkbox"
              id={`autonomous-${key}`}
              checked={config.autonomous[key]}
              disabled={!config.autonomous.enabled}
              onChange={(e) => setConfig((c) => ({
                ...c,
                autonomous: { ...c.autonomous, [key]: e.target.checked },
              }))}
              style={{ width: 16, height: 16, cursor: config.autonomous.enabled ? 'pointer' : 'default', accentColor: '#7c4dff' }}
            />
          </div>
          <label htmlFor={`autonomous-${key}`} style={{ cursor: config.autonomous.enabled ? 'pointer' : 'default' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{desc}</div>
          </label>
        </div>
      ))}

      <h4 style={{ marginTop: 28, marginBottom: 16 }}>Пороги уверенности</h4>

      {([
        { key: 'autoApprove' as const, label: 'Авто-одобрение', desc: 'confidence >= X -> авто-approve', color: '#4caf50', min: 0.75, max: 0.99 },
        { key: 'autoReject' as const, label: 'Авто-отклонение', desc: 'confidence >= X + verdict suspicious -> авто-reject', color: '#f44336', min: 0.80, max: 0.99 },
        { key: 'escalateBelow' as const, label: 'Эскалация человеку', desc: 'confidence < X -> отправить на проверку модератору', color: '#ff9800', min: 0.40, max: 0.80 },
      ]).map(({ key, label, desc, color, min, max }) => (
        <div key={key} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
              <span style={{ fontSize: 11, color: '#aaa', marginLeft: 8 }}>{desc}</span>
            </div>
            <span style={{ fontWeight: 700, fontSize: 14, color }}>{Math.round(config.thresholds[key] * 100)}%</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={0.01}
            value={config.thresholds[key]}
            onChange={(e) => setConfig((c) => ({
              ...c,
              thresholds: { ...c.thresholds, [key]: Number(e.target.value) },
            }))}
            style={{ width: '100%', accentColor: color }}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving || !hasChanges}
        style={{
          marginTop: 8, padding: '10px 24px', borderRadius: 8, border: 'none',
          background: saveOk ? '#388e3c' : (hasChanges ? '#7c4dff' : '#555'),
          color: '#fff', fontWeight: 700, fontSize: 14,
          cursor: (saving || !hasChanges) ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Сохранение...' : saveOk ? '\u2713 Сохранено' : 'Сохранить настройки'}
      </button>
      {hasChanges && <span style={{ marginLeft: 12, fontSize: 12, color: '#ff9800' }}>• Есть несохранённые изменения</span>}
    </div>
  );

  const renderTabEscalations = () => {
    const SECTION_LABELS: Record<string, string> = {
      requests: 'Заявки', buySell: 'Куплю/Продам', contactsListings: 'Контакты',
      biznesChaikaListings: 'Бизнес', jobs: 'Работа', lostFound: 'Потеряно/Найдено',
      appSuggestions: 'Предложения',
    };
    const URGENCY_COLORS: Record<string, string> = { high: '#f44336', medium: '#ff9800', low: '#4caf50' };
    const REPORT_VERDICT_LABELS: Record<string, string> = { legitimate: 'Реальная', serious: 'Серьёзная', spam: 'Спам', revenge: 'Месть' };

    const totalAll = escalations.length + supportEscalations.length + reportEscalations.length;
    const showContent = escalationFilter === 'all' || escalationFilter === 'content';
    const showSupport = escalationFilter === 'all' || escalationFilter === 'support';
    const showReports = escalationFilter === 'all' || escalationFilter === 'reports';
    const filterBtns: Array<{ key: typeof escalationFilter; label: string; count: number }> = [
      { key: 'all', label: 'Все', count: totalAll },
      { key: 'content', label: 'Контент', count: escalations.length },
      { key: 'support', label: 'Поддержка', count: supportEscalations.length },
      { key: 'reports', label: 'Жалобы', count: reportEscalations.length },
    ];

    return (
      <div style={{ color: '#e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, marginBottom: 4, color: '#fff', fontSize: 20 }}>Очередь эскалаций</h3>
            <p style={{ color: '#aaa', fontSize: 14, margin: 0 }}>Контент и тикеты, требующие вашего решения</p>
          </div>
          {lastRun && (
            <div style={{ fontSize: 11, color: '#666', textAlign: 'right' }}>
              <div>Прогон: {formatDate(lastRun.timestamp)}</div>
              <div>{'\u2713'}{lastRun.totalApproved} {'\u2717'}{lastRun.totalRejected} {'\u26a1'}{lastRun.totalEscalated}</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {filterBtns.map(({ key, label, count }) => (
            <button key={key} type="button" onClick={() => setEscalationFilter(key)}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
                background: escalationFilter === key ? '#2a2a4a' : '#1a1a2a',
                color: escalationFilter === key ? '#a0b4ff' : '#666',
                fontWeight: escalationFilter === key ? 700 : 400 }}>
              {label} {count > 0 && <span style={{ background: '#f44336', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 10, marginLeft: 4 }}>{count}</span>}
            </button>
          ))}
        </div>

        {totalAll === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', background: '#1a1a2a', borderRadius: 10, border: '1px solid #2a2a3a', color: '#666', fontSize: 14 }}>
            {'\u2713'} Очередь пуста
          </div>
        )}

        {/* Content escalations */}
        {showContent && escalations.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {escalationFilter === 'all' && <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Модерация контента</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {escalations.map((esc) => (
                <div key={esc.id} style={{ padding: '14px 18px', background: '#1a1a2a', borderRadius: 10, border: `1px solid ${esc.ai_verdict === 'suspicious' ? '#f4433644' : '#ff980044'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#2a2a4a', color: '#a0b4ff' }}>{SECTION_LABELS[esc.section] || esc.section}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: (VERDICT_COLORS[esc.ai_verdict] || '#888') + '33', color: VERDICT_COLORS[esc.ai_verdict] || '#888' }}>{esc.ai_verdict} {Math.round(esc.ai_confidence * 100)}%</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#555' }}>{formatDate(esc.createdAt)}</span>
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: 13, color: '#ccc', background: '#12121e', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #333', fontStyle: 'italic' }}>{esc.textPreview}</p>
                  {esc.ai_explanation && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#aaa' }}>{'\ud83d\udcac'} {esc.ai_explanation}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" disabled={resolvingId === esc.id} onClick={() => void handleResolve(esc.id, 'approve')}
                      style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: resolvingId === esc.id ? '#555' : '#2e7d32', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{'\u2713'} Одобрить</button>
                    <button type="button" disabled={resolvingId === esc.id} onClick={() => void handleResolve(esc.id, 'reject')}
                      style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: resolvingId === esc.id ? '#555' : '#c62828', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{'\u2717'} Отклонить</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Support escalations */}
        {showSupport && supportEscalations.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {escalationFilter === 'all' && <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Поддержка</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {supportEscalations.map((esc) => (
                <div key={esc.id} style={{ padding: '14px 18px', background: '#1a1a2a', borderRadius: 10, border: `1px solid ${esc.urgency === 'high' ? '#f4433655' : '#ff980033'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#2a2a4a', color: '#a0b4ff' }}>{esc.category}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: (URGENCY_COLORS[esc.urgency] || '#888') + '33', color: URGENCY_COLORS[esc.urgency] || '#888' }}>{esc.urgency}</span>
                      {esc.requiresHuman && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, background: '#f4433633', color: '#f44336' }}>Требует человека</span>}
                      <span style={{ fontSize: 12, color: '#aaa' }}>{esc.userName}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#555' }}>{formatDate(esc.createdAt)}</span>
                  </div>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#ccc', background: '#12121e', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #1976d2', fontStyle: 'italic' }}>{esc.userMessage}</p>
                  {esc.aiDraftReply && (
                    <div style={{ margin: '0 0 10px', padding: '8px 12px', background: '#0a1a0a', borderRadius: 6, borderLeft: '3px solid #4caf50' }}>
                      <div style={{ fontSize: 10, color: '#4caf50', marginBottom: 4, fontWeight: 700 }}>AI черновик:</div>
                      <p style={{ margin: 0, fontSize: 12, color: '#9e9e9e' }}>{esc.aiDraftReply.slice(0, 300)}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href="#support" style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #1976d2', color: '#90caf9', fontSize: 12, textDecoration: 'none' }}>Открыть тикет</a>
                    <button type="button" onClick={() => void resolveSupportEscalation(esc.id)}
                      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #555', background: 'transparent', color: '#aaa', fontSize: 12, cursor: 'pointer' }}>Закрыть</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Report escalations */}
        {showReports && reportEscalations.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            {escalationFilter === 'all' && <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Жалобы</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reportEscalations.map((esc) => (
                <div key={esc.id} style={{ padding: '14px 18px', background: '#1a1a2a', borderRadius: 10, border: `1px solid ${esc.aiVerdict === 'serious' ? '#f4433666' : '#55555544'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: '#3a2a2a', color: '#ef9a9a' }}>{esc.reason}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: esc.aiVerdict === 'serious' ? '#f4433633' : '#2a2a2a', color: esc.aiVerdict === 'serious' ? '#f44336' : '#888' }}>{REPORT_VERDICT_LABELS[esc.aiVerdict] || esc.aiVerdict}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, background: (URGENCY_COLORS[esc.aiPriority] || '#888') + '22', color: URGENCY_COLORS[esc.aiPriority] || '#888' }}>{esc.aiPriority}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#555' }}>{formatDate(esc.createdAt)}</span>
                  </div>
                  {esc.description && <p style={{ margin: '0 0 6px', fontSize: 13, color: '#ccc', background: '#12121e', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #f44336', fontStyle: 'italic' }}>{esc.description}</p>}
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: '#aaa' }}>{'\ud83d\udcac'} AI: {esc.aiReason}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href="#reports" style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #f44336', color: '#ef9a9a', fontSize: 12, textDecoration: 'none' }}>Открыть жалобу</a>
                    <button type="button" onClick={() => void resolveReportEscalation(esc.id)}
                      style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #555', background: 'transparent', color: '#aaa', fontSize: 12, cursor: 'pointer' }}>Закрыть</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTabLog = () => (
    <div style={{ color: '#e0e0e0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: '#fff', fontSize: 20 }}>Лог действий AI</h3>
        <button type="button" onClick={() => void loadLog()} disabled={logLoading}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #555', background: '#2a2a3a', color: '#ccc', cursor: 'pointer', fontSize: 13 }}>
          {logLoading ? 'Загрузка...' : '\u21bb Обновить'}
        </button>
      </div>
      {logLoading ? (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>Загрузка...</div>
      ) : log.length === 0 ? (
        <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>Лог пуст</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#1a1a2a', color: '#aaa' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Время</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Раздел</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Вердикт</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Уверенность</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Провайдер</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Токены</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #333' }}>Кеш</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #222' }}>
                  <td style={{ padding: '7px 10px', color: '#aaa' }}>{formatDate(entry.timestamp)}</td>
                  <td style={{ padding: '7px 10px', color: '#ccc' }}>{entry.section || '—'}</td>
                  <td style={{ padding: '7px 10px' }}>
                    {entry.verdict ? (
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: (VERDICT_COLORS[entry.verdict] ?? '#888') + '33',
                        color: VERDICT_COLORS[entry.verdict] ?? '#888',
                      }}>{entry.verdict}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: '#ccc' }}>
                    {entry.confidence != null ? `${Math.round(entry.confidence * 100)}%` : '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: '#aaa', fontFamily: 'monospace', fontSize: 11 }}>
                    {entry.provider}/{entry.model?.slice(0, 20) || '—'}
                  </td>
                  <td style={{ padding: '7px 10px', color: '#aaa' }}>{entry.tokensUsed || 0}</td>
                  <td style={{ padding: '7px 10px', color: entry.cached ? '#81c784' : '#666' }}>
                    {entry.cached ? '\u2713' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderTabStats = () => {
    const dailyPct = stats ? Math.min((stats.dailyTotal / config.budgetDaily) * 100, 100) : 0;
    const monthlyPct = stats ? Math.min((stats.monthlyTotal / config.budgetMonthly) * 100, 100) : 0;

    return (
      <div style={{ maxWidth: 500, color: '#e0e0e0' }}>
        <h3 style={{ marginBottom: 24, color: '#fff', fontSize: 20 }}>Использование бюджета</h3>
        {!stats ? (
          <div style={{ color: '#666' }}>Нет данных</div>
        ) : (
          <>
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>Сегодня ({stats.dailyDate})</span>
                <span style={{ color: dailyPct > 80 ? '#f44336' : '#81c784' }}>{stats.dailyTotal} / {config.budgetDaily}</span>
              </div>
              <div style={{ background: '#2a2a3a', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${dailyPct}%`, background: dailyPct > 80 ? '#f44336' : '#4caf50', borderRadius: 6, transition: 'width 0.3s' }} />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>Этот месяц ({stats.monthlyDate})</span>
                <span style={{ color: monthlyPct > 80 ? '#f44336' : '#81c784' }}>{stats.monthlyTotal} / {config.budgetMonthly}</span>
              </div>
              <div style={{ background: '#2a2a3a', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${monthlyPct}%`, background: monthlyPct > 80 ? '#f44336' : '#4caf50', borderRadius: 6, transition: 'width 0.3s' }} />
              </div>
            </div>

            <div style={{ padding: '14px 18px', background: '#1a1a2a', borderRadius: 8, border: '1px solid #333' }}>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Провайдер: <span style={{ color: '#ccc' }}>{config.provider}</span></div>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Модель: <span style={{ color: '#ccc', fontFamily: 'monospace' }}>{config.model}</span></div>
              <div style={{ fontSize: 12, color: '#aaa' }}>Запросов/мин сейчас: <span style={{ color: '#ccc' }}>{stats.minuteTotal || 0}</span></div>
            </div>

            <button type="button" onClick={() => void loadStats()}
              style={{ marginTop: 20, padding: '8px 16px', borderRadius: 6, border: '1px solid #555', background: '#2a2a3a', color: '#ccc', cursor: 'pointer', fontSize: 13 }}>
              \u21bb Обновить
            </button>
          </>
        )}
      </div>
    );
  };

  const tabs: Array<{ key: Tab; label: string; badge?: number }> = [
    { key: 'model', label: 'Модель' },
    { key: 'autonomous', label: 'Автономность' },
    { key: 'escalations', label: 'Эскалации', badge: escalations.length + supportEscalations.length + reportEscalations.length },
    { key: 'log', label: 'Лог действий' },
    { key: 'stats', label: 'Статистика' },
  ];
  const visibleTabs = isSimpleMode ? tabs.filter((item) => item.key === 'escalations') : tabs;

  return (
    <div style={{ padding: '24px 32px', color: '#e0e0e0', background: '#1a1a2a', minHeight: '100vh' }}>
      <h2 style={{ marginBottom: 8, fontSize: 22, fontWeight: 800, color: '#fff' }}>AI Control Center</h2>
      <p style={{ color: '#aaa', marginBottom: 28, fontSize: 16 }}>
        Управление AI-провайдером и автономным режимом модерации
      </p>

      {renderAiHero()}
      {renderStatusPanel()}

      {!isSimpleMode && !configExists && (
        <div style={{
          marginBottom: 20,
          padding: '14px 16px',
          borderRadius: 8,
          background: '#2a2110',
          border: '1px solid #6a4b00',
          color: '#ffd54f',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
        }}>
          <div>
            <strong>AI config ещё не создан.</strong>
            <div style={{ marginTop: 4, fontSize: 13, color: '#e0c56a' }}>
              Можно применить безопасный шаблон, затем добавить API key и сохранить.
            </div>
          </div>
          <button
            type="button"
            onClick={applySafeTemplate}
            style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid #8d6e00', background: '#3a2f12', color: '#ffd54f', cursor: 'pointer', fontWeight: 700 }}
          >
            Безопасный шаблон
          </button>
        </div>
      )}

      {!isSimpleMode && (lastRun || photoLastRun) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20, color: '#aaa', fontSize: 12 }}>
          {lastRun && <span>Текстовый прогон: {formatDate(lastRun.timestamp)} · ✓{lastRun.totalApproved} ✕{lastRun.totalRejected} ⚡{lastRun.totalEscalated}</span>}
          {photoLastRun && <span>Фото-прогон: {formatDate(photoLastRun.timestamp)} · ✓{photoLastRun.totalApproved} ✕{photoLastRun.totalRejected} ⚡{photoLastRun.totalEscalated}</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid #333', paddingBottom: 0 }}>
        {visibleTabs.map(({ key, label, badge }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px', border: 'none', borderRadius: '6px 6px 0 0',
              background: tab === key ? '#2a2a4a' : 'transparent',
              color: tab === key ? '#a0b4ff' : '#888',
              fontWeight: tab === key ? 700 : 400,
              fontSize: 16, cursor: 'pointer',
              borderBottom: tab === key ? '2px solid #7c4dff' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {label}
            {badge != null && badge > 0 && (
              <span style={{
                background: '#f44336', color: '#fff', borderRadius: 10,
                padding: '1px 7px', fontSize: 11, fontWeight: 800,
              }}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {!isSimpleMode && tab === 'model' && renderTabModel()}
      {!isSimpleMode && tab === 'autonomous' && renderTabAutonomous()}
      {tab === 'escalations' && renderTabEscalations()}
      {!isSimpleMode && tab === 'log' && renderTabLog()}
      {!isSimpleMode && tab === 'stats' && renderTabStats()}
    </div>
  );
};

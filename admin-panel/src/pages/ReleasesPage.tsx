import { useEffect, useState } from 'react';
import { LiveDiagnosticsPanel } from '../components/LiveDiagnosticsPanel';
import { useReleases } from '../hooks/useReleases';
import {
  setRuntimeDiagnosticsControl,
  subscribeRuntimeDiagnosticsControl,
} from '../services/liveDiagnosticsService';
import { getScreenNameForFile } from '../services/releasesService';

export const ReleasesPage = () => {
  const { releases, loading, error, updateSummary, refresh } = useReleases();
  const [expandedKey, setExpandedKey] = useState<string | null>(releases[0]?.versionKey ?? null);
  const [summaryInputs, setSummaryInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [runtimeDiagnosticsEnabled, setRuntimeDiagnosticsEnabled] = useState<boolean | null>(null);
  const [runtimeDiagnosticsBusy, setRuntimeDiagnosticsBusy] = useState(false);
  const [runtimeDiagnosticsStatus, setRuntimeDiagnosticsStatus] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeRuntimeDiagnosticsControl(
      (enabled) => {
        setRuntimeDiagnosticsEnabled(enabled);
      },
      (err) => setRuntimeDiagnosticsStatus(`Ошибка контроля диагностики: ${err.message}`),
    );
    return unsubscribe;
  }, []);

  const handleSummary = async (versionKey: string) => {
    setSavingKey(versionKey);
    setSaveError(null);
    try {
      await updateSummary(versionKey, summaryInputs[versionKey] ?? '');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить описание.');
    } finally {
      setSavingKey(null);
    }
  };

  const handleRuntimeDiagnosticsToggle = async (enabled: boolean) => {
    setRuntimeDiagnosticsBusy(true);
    setRuntimeDiagnosticsStatus('');
    const previous = runtimeDiagnosticsEnabled;
    setRuntimeDiagnosticsEnabled(enabled);
    try {
      await setRuntimeDiagnosticsControl(enabled);
      setRuntimeDiagnosticsStatus(
        enabled
          ? 'Live diagnostics включены для тестовой диагностики.'
          : 'Live diagnostics выключены. Новые запуски APK будут идти в обычном режиме без активного потока диагностики.',
      );
    } catch (err) {
      setRuntimeDiagnosticsEnabled(previous);
      setRuntimeDiagnosticsStatus(err instanceof Error ? err.message : 'Не удалось сохранить режим диагностики.');
    } finally {
      setRuntimeDiagnosticsBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="releasesPage">
        <h2>📦 Релизы</h2>
        <p>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="releasesPage">
      <div className="releasesHeader">
        <h2>📦 Релизы</h2>
        <button type="button" className="refreshBtn" onClick={() => void refresh()}>
          🔄 Обновить
        </button>
      </div>

      <section className="releaseDiagnosticsSwitch">
        <div>
          <p className="eyebrow">APK runtime mode</p>
          <h3>Обычная сборка без Live Diagnostics</h3>
          <p>
            Когда переключатель выключен, мобильное приложение не отправляет live diagnostics события
            из App.tsx и RootNavigator.tsx. Используйте этот режим перед установкой обычной APK.
          </p>
          {runtimeDiagnosticsStatus ? <small>{runtimeDiagnosticsStatus}</small> : null}
        </div>
        <div className="releaseDiagnosticsActions">
          <span className={`releaseDiagnosticsState ${runtimeDiagnosticsEnabled ? 'enabled' : 'disabled'}`}>
            {runtimeDiagnosticsEnabled === null
              ? 'Проверка режима...'
              : runtimeDiagnosticsEnabled
                ? 'Сейчас: включены'
                : 'Сейчас: выключены'}
          </span>
        <button
          type="button"
          className={`releaseDiagnosticsButton ${runtimeDiagnosticsEnabled ? 'dangerButton' : ''}`}
          disabled={runtimeDiagnosticsBusy || runtimeDiagnosticsEnabled === null}
          onClick={() => void handleRuntimeDiagnosticsToggle(!Boolean(runtimeDiagnosticsEnabled))}
        >
          {runtimeDiagnosticsBusy
            ? 'Сохранение...'
            : runtimeDiagnosticsEnabled === null
              ? 'Загрузка режима...'
              : runtimeDiagnosticsEnabled
              ? 'Отключить Live Diagnostics'
              : 'Включить Live Diagnostics'}
        </button>
        </div>
      </section>

      <LiveDiagnosticsPanel />

      {error ? (
        <div className="releaseError">
          <p>Ошибка: {error}</p>
          <button type="button" onClick={() => void refresh()}>Повторить</button>
        </div>
      ) : releases.length === 0 ? (
        <p className="releaseEmpty">Нет зарегистрированных релизов.</p>
      ) : (
        <>
          <table className="releasesTable">
            <thead>
              <tr>
                <th>Версия</th>
                <th>Файлы</th>
                <th>Дата сборки</th>
                <th>Размер</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr
                  key={r.versionKey}
                  className={expandedKey === r.versionKey ? 'releaseRowActive' : 'releaseRow'}
                  onClick={() => setExpandedKey(expandedKey === r.versionKey ? null : r.versionKey)}
                  style={{ cursor: 'pointer' }}
                >
                  <td><strong>v{r.version}</strong></td>
                  <td>{Object.keys(r.files).length}</td>
                  <td>{r.buildStamp || r.timestamp?.slice(0, 10) || '—'}</td>
                  <td>{r.apkSizeMB > 0 ? `${r.apkSizeMB} MB` : '—'}</td>
                  <td>{expandedKey === r.versionKey ? '▲' : '▼'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {expandedKey ? (() => {
            const r = releases.find((x) => x.versionKey === expandedKey);
            if (!r) return null;
            return (
              <div className="releaseDetail">
                <h3>Детали: v{r.version}</h3>
                <div className="releaseDetailMeta">
                  <p><strong>Коммит:</strong> {r.commitHash || '—'}</p>
                  <p><strong>Сборка:</strong> {r.buildStamp || '—'}</p>
                  <p><strong>Машина:</strong> {r.machineId || '—'}</p>
                  <p><strong>Режим:</strong> {r.buildMode || '—'}</p>
                  <p><strong>OTA:</strong> {r.otaMode || '—'}</p>
                  <p><strong>SHA256:</strong> <code>{r.apkSha256 ? r.apkSha256.slice(0, 20) + '...' : '—'}</code></p>
                  <p><strong>Bundle:</strong> <code>{r.bundleFingerprint ? r.bundleFingerprint.slice(0, 20) + '...' : '—'}</code></p>
                </div>

                <h4>Измененные файлы ({Object.keys(r.files).length})</h4>
                <div className="releaseFiles">
                  {Object.entries(r.files).map(([filePath, entry]) => {
                    const screenName = getScreenNameForFile(filePath);
                    return (
                      <div key={filePath} className="releaseFileEntry">
                        <p className="releaseFilePath">
                          <code>{filePath}</code>
                          {screenName ? <span className="releaseScreenName"> [{screenName}]</span> : null}
                        </p>
                        {entry.commits.map((commit, idx) => (
                          <p key={idx} className="releaseCommitMsg">└─ "{commit}"</p>
                        ))}
                      </div>
                    );
                  })}
                </div>

                <div className="releaseSummaryEdit">
                  <h4>Описание (для отображения)</h4>
                  <textarea
                    className="releaseSummaryInput"
                    value={summaryInputs[r.versionKey] ?? r.summary}
                    onChange={(e) => setSummaryInputs((prev) => ({ ...prev, [r.versionKey]: e.target.value }))}
                    rows={4}
                    placeholder="Введите описание релиза..."
                  />
                  <button
                    type="button"
                    className="releaseSaveBtn"
                    onClick={() => void handleSummary(r.versionKey)}
                    disabled={savingKey === r.versionKey}
                  >
                    {savingKey === r.versionKey ? 'Сохранение...' : 'Сохранить'}
                  </button>
                  {saveError && savingKey !== r.versionKey && (
                    <p style={{ color: '#e05050', fontSize: 12, marginTop: 6 }}>{saveError}</p>
                  )}
                </div>
              </div>
            );
          })() : null}
        </>
      )}
    </div>
  );
};

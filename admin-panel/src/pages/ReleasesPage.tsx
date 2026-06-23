import { useEffect, useState } from 'react';
import { LiveDiagnosticsPanel } from '../components/LiveDiagnosticsPanel';
import { useReleases } from '../hooks/useReleases';
import { useViewMode } from '../contexts/ViewModeContext';
import {
  setRuntimeDiagnosticsControl,
  subscribeRuntimeDiagnosticsControl,
} from '../services/liveDiagnosticsService';
import { getScreenNameForFile } from '../services/releasesService';

export const ReleasesPage = () => {
  const { releases, loading, error, updateSummary, updateControl, refresh } = useReleases();
  const { viewMode } = useViewMode();
  const isSimpleMode = viewMode === 'simple';
  const [expandedKey, setExpandedKey] = useState<string | null>(releases[0]?.versionKey ?? null);
  const [summaryInputs, setSummaryInputs] = useState<Record<string, string>>({});
  const [controlInputs, setControlInputs] = useState<Record<string, {
    minimumRequiredVersion: string;
    forceUpdateRequired: boolean;
    maintenanceMessage: string;
    betaModeEnabled: boolean;
  }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ versionKey: string; message: string } | null>(null);
  const [runtimeDiagnosticsEnabled, setRuntimeDiagnosticsEnabled] = useState<boolean | null>(null);
  const [runtimeDiagnosticsBusy, setRuntimeDiagnosticsBusy] = useState(false);
  const [runtimeDiagnosticsStatus, setRuntimeDiagnosticsStatus] = useState('');

  useEffect(() => {
    if (releases.length > 0 && expandedKey === null) {
      setExpandedKey(releases[0].versionKey);
    }
  }, [releases]);

  useEffect(() => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      setRuntimeDiagnosticsEnabled(false);
      setRuntimeDiagnosticsStatus(
        'Не удалось загрузить режим диагностики за 10 секунд. Проверьте сеть/Firebase; переключатель временно показан как выключенный.',
      );
    }, 10_000);

    const unsubscribe = subscribeRuntimeDiagnosticsControl(
      (enabled) => {
        settled = true;
        window.clearTimeout(timeoutId);
        setRuntimeDiagnosticsEnabled(enabled);
        setRuntimeDiagnosticsStatus('');
      },
      (err) => {
        settled = true;
        window.clearTimeout(timeoutId);
        setRuntimeDiagnosticsEnabled(false);
        setRuntimeDiagnosticsStatus(`Ошибка контроля диагностики: ${err.message}`);
      },
    );

    return () => {
      settled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  const handleSummary = async (versionKey: string) => {
    setSavingKey(versionKey);
    setSaveError(null);
    try {
      const release = releases.find((item) => item.versionKey === versionKey);
      await updateSummary(versionKey, summaryInputs[versionKey] ?? release?.summary ?? '');
    } catch (err) {
      setSaveError({
        versionKey,
        message: err instanceof Error ? err.message : 'Не удалось сохранить описание.',
      });
    } finally {
      setSavingKey(null);
    }
  };

  const getControlInput = (versionKey: string) => {
    const release = releases.find((item) => item.versionKey === versionKey);
    return controlInputs[versionKey] ?? {
      minimumRequiredVersion: release?.minimumRequiredVersion || release?.version || '',
      forceUpdateRequired: Boolean(release?.forceUpdateRequired),
      maintenanceMessage: release?.maintenanceMessage || '',
      betaModeEnabled: Boolean(release?.betaModeEnabled),
    };
  };

  const patchControlInput = (versionKey: string, patch: Partial<ReturnType<typeof getControlInput>>) => {
    setControlInputs((current) => ({
      ...current,
      [versionKey]: { ...getControlInput(versionKey), ...patch },
    }));
  };

  const handleControlSave = async (versionKey: string) => {
    setSavingKey(versionKey);
    setSaveError(null);
    try {
      const input = getControlInput(versionKey);
      await updateControl(versionKey, {
        ...input,
        maintenanceMessage: input.maintenanceMessage.slice(0, 280),
      });
    } catch (err) {
      setSaveError({
        versionKey,
        message: err instanceof Error ? err.message : 'Не удалось сохранить force_update настройки.',
      });
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

      {!isSimpleMode && (
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

      )}
      {!isSimpleMode && <LiveDiagnosticsPanel />}

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
                {!isSimpleMode && (
                  <>
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

                  </>
                )}
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
                  {saveError?.versionKey === r.versionKey && savingKey !== r.versionKey && (
                    <p className="releaseSaveError">{saveError.message}</p>
                  )}
                </div>
                {!isSimpleMode && (
                <div className="releaseSummaryEdit">
                  <h4>Force update / тестирование</h4>
                  {(() => {
                    const control = getControlInput(r.versionKey);
                    return (
                      <>
                        <label className="field">
                          <span>Минимальная поддерживаемая версия</span>
                          <input
                            value={control.minimumRequiredVersion}
                            onChange={(e) => patchControlInput(r.versionKey, { minimumRequiredVersion: e.target.value })}
                            placeholder={r.version}
                          />
                        </label>
                        <label className="checkboxRow">
                          <input
                            type="checkbox"
                            checked={control.forceUpdateRequired}
                            onChange={(e) => patchControlInput(r.versionKey, { forceUpdateRequired: e.target.checked })}
                          />
                          <span>Принудительное обновление</span>
                        </label>
                        <label className="checkboxRow">
                          <input
                            type="checkbox"
                            checked={control.betaModeEnabled}
                            onChange={(e) => patchControlInput(r.versionKey, { betaModeEnabled: e.target.checked })}
                          />
                          <span>Сначала протестировать для tester/moderator</span>
                        </label>
                        <label className="field">
                          <span>Текст уведомления пользователю, max 280</span>
                          <textarea
                            className="releaseSummaryInput"
                            rows={3}
                            maxLength={280}
                            value={control.maintenanceMessage}
                            onChange={(e) => patchControlInput(r.versionKey, { maintenanceMessage: e.target.value.slice(0, 280) })}
                          />
                        </label>
                        <button
                          type="button"
                          className="releaseSaveBtn"
                          onClick={() => void handleControlSave(r.versionKey)}
                          disabled={savingKey === r.versionKey}
                        >
                          {savingKey === r.versionKey ? 'Сохранение...' : 'Сохранить force_update'}
                        </button>
                      </>
                    );
                  })()}
                </div>
                )}
              </div>
            );
          })() : null}
        </>
      )}
    </div>
  );
};

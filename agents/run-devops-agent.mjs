#!/usr/bin/env node
/**
 * Chaika Life — DevOps Agent
 * Автоматизация проверок перед STABLE APK BUILD
 * и анализ результатов (APK + Netlify деплой)
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(__dirname, 'logs');
const BACKUPS_DIR = path.join(__dirname, 'backups');

// Защищённые файлы (агент их не трогает, только предупреждает)
const PROTECTED_FILES = [
  'firebase.rules.json',
  'storage.rules',
  'src/services/deviceAuth.ts',
  'src/components/AppAccessGuard.tsx',
  'src/navigation/RootNavigator.tsx',
];

// CLI аргументы
const args = process.argv.slice(2);
const MODE = (args[0] || 'safe').toLowerCase();
const SKIP_TSC = args.includes('--skip-tsc');
const SKIP_RULES = args.includes('--skip-rules');
const VERBOSE = args.includes('--verbose');

const VALID_MODES = ['safe', 'deploy', 'stable', 'audit'];
if (!VALID_MODES.includes(MODE)) {
  console.error(`\nНеизвестный режим: "${MODE}"`);
  console.error(`Доступные режимы: ${VALID_MODES.join(', ')}\n`);
  process.exit(1);
}

// Цвета для вывода
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m', white: '\x1b[97m',
};

// Состояние
const state = {
  mode: MODE.toUpperCase(),
  startTime: new Date(),
  errors: [],
  warnings: [],
  steps: [],
  apkPath: null,
  apkSizeMB: null,
  version: null,
  deployedTo: [],
  netlifyStatus: 'UNKNOWN',
};

let logBuffer = '';

function tee(msg) {
  logBuffer += msg + '\n';
  process.stdout.write(msg + '\n');
}

function log(msg, color = C.reset) {
  tee(`${color}${msg}${C.reset}`);
}

function logOk(name, msg) {
  tee(`  ${C.green}[${name}]${C.reset} ${msg}`);
}

function logWarn(name, msg) {
  tee(`  ${C.yellow}[${name}] WARN: ${msg}${C.reset}`);
}

function logFail(name, msg) {
  tee(`  ${C.red}[${name}] FAIL: ${msg}${C.reset}`);
}

function logInfo(msg) {
  tee(`  ${C.gray}${msg}${C.reset}`);
}

function addError(level, file, msg) {
  state.errors.push({ level, file, msg });
}

function addWarning(msg) {
  state.warnings.push(msg);
}

function addStep(name, status, detail = '') {
  state.steps.push({ name, status, detail });
}

// Утилиты
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCmd(cmd, opts = {}) {
  const { cwd = ROOT, ignoreError = false } = opts;
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', stdio: VERBOSE ? 'inherit' : 'pipe' });
    return { success: true, output: out || '' };
  } catch (err) {
    if (ignoreError) return { success: false, output: err.stdout || '', stderr: err.stderr || '' };
    throw err;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ─── ПРОВЕРКИ ─────────────────────────────────────────────────────────────
function checkProtectedFiles() {
  tee(`\n${C.cyan}[SECURITY] Проверка защищённых файлов...${C.reset}`);
  PROTECTED_FILES.forEach(rel => {
    const full = path.join(ROOT, rel);
    if (fs.existsSync(full)) logInfo(`защищён: ${rel}`);
  });
  logOk('SECURITY', 'Защищённые файлы зафиксированы');
  addStep('SECURITY', 'OK');
}

function stepTypeCheck() {
  if (SKIP_TSC) {
    logWarn('TSC', 'Пропущен (--skip-tsc)');
    addStep('TSC', 'SKIP');
    return true;
  }
  tee(`\n${C.cyan}[TSC] TypeScript проверка...${C.reset}`);
  const result = runCmd('npm run type-check', { ignoreError: true });
  if (result.success) {
    logOk('TSC', 'Нет ошибок');
    addStep('TSC', 'OK');
    return true;
  }
  const errorCount = (result.output + result.stderr).split('\n').filter(l => l.includes(': error TS')).length;
  logFail('TSC', `${errorCount} ошибок`);
  addError('HIGH', 'TypeScript', `${errorCount} errors`);
  addStep('TSC', 'FAIL', `${errorCount} errors`);
  return false;
}

function stepFirebaseRules() {
  if (SKIP_RULES) {
    logWarn('RULES', 'Пропущены (--skip-rules)');
    addStep('RULES', 'SKIP');
    return true;
  }
  tee(`\n${C.cyan}[RULES] Проверка Firebase Rules...${C.reset}`);

  const dbResult = runCmd('npm run rules:check', { ignoreError: true });
  if (!dbResult.success) {
    logFail('RULES', 'firebase.rules.json невалиден');
    addError('CRITICAL', 'firebase.rules.json', 'Invalid JSON');
    addStep('RULES', 'FAIL');
    return false;
  }

  const stResult = runCmd('npm run rules:check:storage', { ignoreError: true });
  if (!stResult.success) {
    logFail('RULES', 'storage.rules невалиден');
    addError('CRITICAL', 'storage.rules', 'Invalid');
    addStep('RULES', 'FAIL');
    return false;
  }

  logOk('RULES', 'firebase.rules.json + storage.rules OK');
  addStep('RULES', 'OK');
  return true;
}

function stepVersionCheck() {
  tee(`\n${C.cyan}[VERSION] Проверка версии...${C.reset}`);
  try {
    const avj = readJson(path.join(ROOT, 'app-version.json'));
    state.version = avj.latestVersion;
    logOk('VERSION', `v${avj.latestVersion} (stamp: ${avj.lastBuildStamp})`);
    addStep('VERSION', 'OK', `v${avj.latestVersion}`);
    return true;
  } catch (e) {
    logFail('VERSION', e.message);
    addError('HIGH', 'app-version.json', e.message);
    addStep('VERSION', 'FAIL');
    return false;
  }
}

function stepChangedFiles() {
  tee(`\n${C.cyan}[GIT] Анализ изменённых файлов...${C.reset}`);
  try {
    const result = runCmd('git status --short', { ignoreError: true });
    if (!result.success || !result.output.trim()) {
      logInfo('Нет незакоммиченных изменений');
      addStep('GIT', 'OK', 'clean');
      return;
    }
    const lines = result.output.trim().split('\n');
    logInfo(`Изменённых файлов: ${lines.length}`);
    const touchedProtected = lines.filter(l => PROTECTED_FILES.some(p => l.includes(p)));
    if (touchedProtected.length > 0) {
      logWarn('GIT', 'Изменены защищённые файлы!');
      touchedProtected.forEach(f => {
        addWarning(`Защищённый файл изменён: ${f}`);
        logWarn('GIT', f);
      });
    }
    addStep('GIT', 'OK', `${lines.length} changed`);
  } catch { addStep('GIT', 'SKIP'); }
}

// ─── GRADLE PROGRESS BAR ──────────────────────────────────────────────────
// Ищем ТОЛЬКО строки вида "> Task :app:xxx" — они появляются в момент выполнения,
// а не в конце (где все задачи перечисляются разом в итоге).
const GRADLE_MILESTONES = [
  { task: '> Task :app:preBuild',                        label: 'Pre-build',              weight: 3  },
  { task: '> Task :app:generateReleaseBuildConfig',      label: 'Generate config',        weight: 3  },
  { task: '> Task :app:compileReleaseKotlin',            label: 'Compile Kotlin',         weight: 14 },
  { task: '> Task :app:javaPreCompileRelease',           label: 'Java pre-compile',       weight: 4  },
  { task: '> Task :app:compileReleaseJavaWithJavac',     label: 'Compile Java',           weight: 6  },
  { task: '> Task :app:bundleReleaseJsAndAssets',        label: 'Bundle JS + assets',     weight: 20 },
  { task: '> Task :app:processReleaseResources',         label: 'Process resources',      weight: 8  },
  { task: '> Task :app:mergeReleaseResources',           label: 'Merge resources',        weight: 6  },
  { task: '> Task :app:mergeReleaseJavaResource',        label: 'Merge Java resources',   weight: 5  },
  { task: '> Task :app:mergeReleaseAssets',              label: 'Merge assets',           weight: 5  },
  { task: '> Task :app:mergeReleaseNativeLibs',          label: 'Merge native libs',      weight: 5  },
  { task: '> Task :app:dexBuilderRelease',               label: 'DEX compile',            weight: 12 },
  { task: '> Task :app:packageRelease',                  label: 'Package APK',            weight: 6  },
  { task: '> Task :app:assembleRelease',                 label: 'Assemble APK',           weight: 3  },
];
const GRADLE_TOTAL_WEIGHT = GRADLE_MILESTONES.reduce((s, m) => s + m.weight, 0);

function makeBuildProgressUI(gradleLogPath) {
  const SPIN = ['|', '/', '-', '\\'];
  let spinIdx = 0;
  let completedWeight = 0;
  let currentLabel = 'Подготовка...';
  let gradleActive = false;
  let lastLogSize = 0;
  const seenTasks = new Set();
  const startTime = Date.now();

  function elapsed() {
    const s = Math.round((Date.now() - startTime) / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
  }

  function renderBar() {
    const pct = Math.min(100, Math.round(completedWeight / GRADLE_TOTAL_WEIGHT * 100));
    const BAR_W = 32;
    const filled = Math.round(pct / 100 * BAR_W);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(BAR_W - filled);
    const label = currentLabel.slice(0, 28).padEnd(28);
    process.stdout.write(
      `\r  ${C.cyan}[GRADLE]${C.reset} ${C.green}${bar}${C.reset} ${String(pct).padStart(3)}%  ${C.gray}${label}  ${elapsed()}${C.reset}  `
    );
  }

  function renderSpinner() {
    spinIdx = (spinIdx + 1) % SPIN.length;
    process.stdout.write(
      `\r  ${C.cyan}[BUILD] ${C.reset}${SPIN[spinIdx]}  ${C.gray}${currentLabel.padEnd(36)} ${elapsed()}${C.reset}  `
    );
  }

  function clearLine() {
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
  }

  function checkGradleLog() {
    try {
      if (!fs.existsSync(gradleLogPath)) return false;
      const size = fs.statSync(gradleLogPath).size;
      if (size === lastLogSize) { if (gradleActive) renderBar(); return gradleActive; }

      // Читаем только новый кусок файла (инкрементально)
      let newChunk = '';
      const fd = fs.openSync(gradleLogPath, 'r');
      const toRead = size - lastLogSize;
      const buf = Buffer.alloc(toRead);
      fs.readSync(fd, buf, 0, toRead, lastLogSize);
      fs.closeSync(fd);
      newChunk = buf.toString('utf8');
      lastLogSize = size;
      gradleActive = true;

      for (const m of GRADLE_MILESTONES) {
        if (!seenTasks.has(m.task) && newChunk.includes(m.task)) {
          seenTasks.add(m.task);
          completedWeight += m.weight;
          currentLabel = m.label;
        }
      }
      renderBar();
      return true;
    } catch { return gradleActive; }
  }

  function tick() {
    if (!checkGradleLog()) renderSpinner();
  }

  return { tick, clearLine, renderBar, setLabel: (l) => { currentLabel = l; } };
}

// ─── STABLE APK BUILD ──────────────────────────────────────────────────────
async function stepStableBuild() {
  tee(`\n${C.cyan}[STABLE BUILD] Запуск STABLE APK BUILD.bat...${C.reset}`);
  const batPath = path.join(ROOT, 'ЗАПУСК АПК', 'STABLE APK BUILD.bat');
  if (!fs.existsSync(batPath)) {
    logFail('BUILD', `Bat-файл не найден: ${batPath}`);
    addError('CRITICAL', batPath, 'File not found');
    addStep('BUILD', 'FAIL', 'bat not found');
    return false;
  }

  logInfo(`Запуск: ${batPath}`);
  tee(`${C.gray}  Прогресс Gradle отображается в реальном времени ниже...${C.reset}\n`);

  const gradleLogPath = path.join(ROOT, 'release', 'gradle-release-build.log');
  const ui = makeBuildProgressUI(gradleLogPath);

  return new Promise((resolve) => {
    const env = { ...process.env, DEPLOY_NO_PAUSE: '1', NO_PAUSE: '1', BUILD_MODE_FORCE: 'RELEASE' };
    const proc = spawn('cmd.exe', ['/d', '/c', batPath], { cwd: ROOT, env, stdio: 'pipe' });

    let stdout = '', stderr = '';

    proc.stdout.on('data', (data) => {
      const txt = data.toString();
      stdout += txt;
      // Показываем значимые строки из bat (STEP/WARN/ERROR/SUCCESS)
      // Фильтруем: пропускаем строки-команды bat при echo ON
      // (они начинаются с "echo ", "if ", промпта "C:\..." или содержат errorlevel)
      for (const line of txt.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Исключаем bat-команды с включённым echo: "echo [ERROR]...", "if errorlevel...", "C:\...>"
        const isBatCommand = /^echo\s/i.test(trimmed)
                          || /^if\s/i.test(trimmed)
                          || /^for\s/i.test(trimmed)
                          || /^set\s/i.test(trimmed)
                          || /^call\s/i.test(trimmed)
                          || /errorlevel/i.test(trimmed)
                          || /^[A-Z]:\\.+>/.test(trimmed);
        if (isBatCommand) continue;

        if (/\[(STEP|ERROR|WARN|SUCCESS)\]/.test(trimmed)) {
          ui.clearLine();
          const color = /\[ERROR\]/.test(trimmed) ? C.red
                      : /\[WARN\]/.test(trimmed)  ? C.yellow
                      : /\[SUCCESS\]/.test(trimmed) ? C.green
                      : C.gray;
          process.stdout.write(`  ${color}${trimmed}${C.reset}\n`);
        } else if (VERBOSE) {
          process.stdout.write(C.gray + '  ' + trimmed + C.reset + '\n');
        }
      }
    });
    proc.stderr.on('data', (data) => {
      const txt = data.toString();
      stderr += txt;
      if (VERBOSE) process.stderr.write(C.yellow + txt + C.reset);
    });

    // Живой тик прогресс-бара каждые 600ms
    const ticker = setInterval(() => ui.tick(), 600);

    proc.on('close', (code) => {
      clearInterval(ticker);
      ui.clearLine();

      const output = stdout + stderr;
      const hasBuildDone = code === 0 || /B\s*U\s*I\s*L\s*D\s+D\s*O\s*N\s*E/i.test(output);
      const hasErrors = /\[ERROR\]/.test(output) && !/Netlify|token/i.test(output);

      // Статус Netlify
      const netlifyMatch = output.match(/\[SUCCESS\]\s+Netlify deploy\s*:\s*(\S+)/i);
      const netlifyStatus = netlifyMatch ? netlifyMatch[1] : 'UNKNOWN';
      state.netlifyStatus = netlifyStatus;

      if (code === 0 && hasBuildDone && !hasErrors) {
        logOk('BUILD', 'Сборка APK: успешна');
        addStep('BUILD:APK', 'OK');

        if (netlifyStatus === 'SUCCESS') {
          logOk('NETLIFY', 'Деплой сайта Чайки: успешен');
          state.deployedTo.push('Netlify (chaika-life.netlify.app)');
          addStep('BUILD:NETLIFY', 'OK');
        } else if (netlifyStatus === 'SKIPPED' || netlifyStatus === 'FAILED_NO_TOKEN') {
          logWarn('NETLIFY', `Деплой сайта: ${netlifyStatus}`);
          addStep('BUILD:NETLIFY', 'WARN', netlifyStatus);
        } else {
          logWarn('NETLIFY', `Деплой сайта: ${netlifyStatus}`);
          addStep('BUILD:NETLIFY', 'WARN', netlifyStatus);
        }
      } else if (hasBuildDone) {
        logWarn('BUILD', `Завершено с предупреждениями (exit ${code})`);
        addStep('BUILD:APK', 'WARN');
      } else {
        logFail('BUILD', `Ошибка при сборке (exit ${code})`);
        output.split('\n').filter(l => /\[ERROR\]/.test(l)).slice(0, 5).forEach(l => {
          addError('HIGH', 'build', l.trim());
        });
        addStep('BUILD:APK', 'FAIL', `exit ${code}`);
      }

      // Ищем APK
      extractApkPaths(output);

      // Сохраняем лог
      saveBatLog(output, code);

      resolve(code === 0);
    });

    proc.on('error', (err) => {
      clearInterval(ticker);
      ui.clearLine();
      logFail('BUILD', `Ошибка запуска: ${err.message}`);
      addError('CRITICAL', 'bat', err.message);
      addStep('BUILD:APK', 'FAIL');
      resolve(false);
    });
  });
}

function extractApkPaths(output) {
  tee(`\n${C.cyan}[APK] Анализ файлов APK...${C.reset}`);
  const lines = output.split('\n');
  const versionedLine = lines.find(l => /\[SUCCESS\]\s+Versioned APK/.test(l));

  if (versionedLine) {
    const match = versionedLine.match(/:\s*(.+\.apk)$/);
    if (match) {
      const apkPath = match[1].trim();
      if (fs.existsSync(apkPath)) {
        state.apkPath = apkPath;
        const sizeMB = Math.round(fs.statSync(apkPath).size / 1024 / 1024 * 100) / 100;
        state.apkSizeMB = sizeMB;
        logOk('APK', `${path.basename(apkPath)} — ${sizeMB} MB`);
        addStep('APK', 'OK', `${sizeMB} MB`);
        return;
      }
    }
  }

  // Fallback: ищем в release/ папке (самый свежий APK)
  const releaseDir = path.join(ROOT, 'release');
  if (fs.existsSync(releaseDir)) {
    const apks = fs.readdirSync(releaseDir)
      .filter(f => f.endsWith('.apk') && f.startsWith('ChaikaLife'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(releaseDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (apks.length > 0) {
      const apkPath = path.join(releaseDir, apks[0].name);
      state.apkPath = apkPath;
      const sizeMB = Math.round(fs.statSync(apkPath).size / 1024 / 1024 * 100) / 100;
      state.apkSizeMB = sizeMB;
      logOk('APK', `${apks[0].name} — ${sizeMB} MB`);
      addStep('APK', 'OK', `${sizeMB} MB`);
      return;
    }
  }

  logWarn('APK', 'APK не найден в release/');
  addStep('APK', 'WARN', 'not found');
}

function saveBatLog(output, code) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logName = `${timestamp()}_${MODE}.log`;
  const logPath = path.join(LOGS_DIR, logName);
  fs.writeFileSync(logPath, `Exit: ${code}\n\n${output}`);
  logInfo(`Лог: agents/logs/${logName}`);
}

// ─── AUDIT ────────────────────────────────────────────────────────────────
function stepAudit() {
  tee(`\n${C.cyan}[AUDIT] Анализ проекта...${C.reset}`);
  const expectedDirs = ['src', 'functions', 'scripts', 'admin-panel', 'android', 'chaika-site'];
  const missingDirs = expectedDirs.filter(d => !fs.existsSync(path.join(ROOT, d)));
  if (missingDirs.length > 0) {
    logWarn('AUDIT', `Отсутствуют: ${missingDirs.join(', ')}`);
    missingDirs.forEach(d => addWarning(`Директория не найдена: ${d}`));
  } else {
    logOk('AUDIT', 'Структура проекта: OK');
  }
  addStep('AUDIT', 'OK');
}

// ─── BACKUP ПЕРЕД DEPLOY ──────────────────────────────────────────────────
function stepBackupRules() {
  tee(`\n${C.cyan}[BACKUP] Сохранение правил Firebase...${C.reset}`);
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const stamp = timestamp();
  const rulesFiles = [
    { src: 'firebase.rules.json', key: 'database' },
    { src: 'storage.rules', key: 'storage' },
  ];

  for (const { src, key } of rulesFiles) {
    const srcPath = path.join(ROOT, src);
    if (!fs.existsSync(srcPath)) continue;
    const destPath = path.join(BACKUPS_DIR, `${key}_${stamp}.bak`);
    fs.copyFileSync(srcPath, destPath);
    logOk('BACKUP', `${src}`);
  }
  addStep('BACKUP', 'OK');
}

// ─── FIREBASE DEPLOY ──────────────────────────────────────────────────────
async function stepFirebaseDeploy() {
  tee(`\n${C.cyan}[DEPLOY:RULES] Деплой Firebase Rules (Database + Storage)...${C.reset}`);
  const result = runCmd('firebase deploy --only database,storage --project chaikaua-3cd9d', { ignoreError: true });
  if (result.success || /Deploy complete/i.test(result.output + result.stderr)) {
    logOk('DEPLOY:RULES', 'Firebase Rules задеплоены (DB + Storage)');
    state.deployedTo.push('Firebase Rules (Database + Storage)');
    addStep('DEPLOY:RULES', 'OK');
    return true;
  } else {
    logFail('DEPLOY:RULES', 'Ошибка при деплое правил');
    addError('HIGH', 'firebase deploy --only database,storage', result.output.slice(0, 200));
    addStep('DEPLOY:RULES', 'FAIL');
    return false;
  }
}

async function stepFirebaseFunctionsDeploy() {
  tee(`\n${C.cyan}[DEPLOY:FUNCTIONS] Деплой Cloud Functions...${C.reset}`);
  const result = runCmd('firebase deploy --only functions --project chaikaua-3cd9d', { ignoreError: true });
  if (result.success || /Deploy complete/i.test(result.output + result.stderr)) {
    logOk('DEPLOY:FUNCTIONS', 'Cloud Functions задеплоены');
    state.deployedTo.push('Firebase Functions');
    addStep('DEPLOY:FUNCTIONS', 'OK');
    return true;
  } else {
    // Functions могут упасть из-за lint — предупреждение, не блокируем
    logWarn('DEPLOY:FUNCTIONS', 'Деплой Functions завершился с ошибкой (non-blocking)');
    addWarning('Firebase Functions deploy failed — проверь functions/src на lint ошибки');
    addStep('DEPLOY:FUNCTIONS', 'WARN');
    return false;
  }
}

// ─── ОТЧЁТ ────────────────────────────────────────────────────────────────
function printReport() {
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  const criticals = state.errors.filter(e => e.level === 'CRITICAL');
  const overall = criticals.length > 0 ? 'FAIL' : (state.errors.length > 0 ? 'FAIL' : 'OK');
  const overallColor = overall === 'OK' ? C.green : C.red;

  tee('\n' + C.cyan + '═'.repeat(52) + C.reset);
  tee(C.bold + C.white + '  CHAIKA DEVOPS AGENT — ОТЧЁТ' + C.reset);
  tee(C.gray + `  Режим: ${state.mode}  |  ${now()}  |  ${elapsed}s` + C.reset);
  tee(C.cyan + '═'.repeat(52) + C.reset);

  tee('\n' + C.bold + 'ШАГИ:' + C.reset);
  for (const s of state.steps) {
    const [icon, color] = s.status === 'OK' ? ['✓', C.green]
                        : s.status === 'FAIL' ? ['✗', C.red]
                        : s.status === 'WARN' ? ['!', C.yellow]
                        : ['—', C.gray];
    tee(`  ${color}${icon}${C.reset} ${s.name.padEnd(20)} ${color}${s.status}${C.reset}${s.detail ? C.gray + '  ' + s.detail + C.reset : ''}`);
  }

  tee('\n' + C.bold + 'РЕЗУЛЬТАТЫ:' + C.reset);
  if (state.version) tee(`  Версия:      ${C.cyan}v${state.version}${C.reset}`);
  if (state.apkPath) tee(`  APK:         ${C.green}${path.basename(state.apkPath)}${C.reset}`);
  if (state.apkSizeMB) tee(`  Размер:      ${C.cyan}${state.apkSizeMB} MB${C.reset}`);
  if (state.deployedTo.length > 0) tee(`  Задеплоено:  ${C.green}${state.deployedTo.join(', ')}${C.reset}`);

  if (state.errors.length > 0) {
    tee(`\n${C.bold}${C.red}ОШИБКИ (${state.errors.length}):${C.reset}`);
    state.errors.forEach(e => tee(`  ${C.red}[${e.level}]${C.reset} ${e.file}: ${e.msg}`));
  }

  if (state.warnings.length > 0) {
    tee(`\n${C.bold}${C.yellow}ПРЕДУПРЕЖДЕНИЯ (${state.warnings.length}):${C.reset}`);
    state.warnings.forEach(w => tee(`  ${C.yellow}!${C.reset} ${w}`));
  }

  tee('\n' + C.gray + '─'.repeat(52) + C.reset);
  tee(`  ${C.bold}ИТОГ: ${overallColor}${overall}${C.reset}`);
  if (overall === 'OK') {
    tee(`  ${C.green}✓ Готово. Проект в порядке.${C.reset}`);
  } else {
    tee(`  ${C.red}✗ Обнаружены проблемы. Проверьте выше.${C.reset}`);
  }
  tee(C.gray + '─'.repeat(52) + C.reset);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  tee('');
  tee(C.bold + C.cyan + '╔══════════════════════════════════════════════╗' + C.reset);
  tee(C.bold + C.cyan + '║   Chaika Life — DevOps Agent                 ║' + C.reset);
  tee(C.bold + C.cyan + `║   Режим: ${state.mode.padEnd(36)}║` + C.reset);
  tee(C.bold + C.cyan + `║   ${now().padEnd(44)}║` + C.reset);
  tee(C.bold + C.cyan + '╚══════════════════════════════════════════════╝' + C.reset);

  checkProtectedFiles();
  stepChangedFiles();

  let proceed = true;

  if (MODE === 'safe' || MODE === 'audit' || MODE === 'deploy') {
    const tscOk = stepTypeCheck();
    const rulesOk = stepFirebaseRules();
    stepVersionCheck();

    if (!rulesOk) proceed = false;

    if (MODE === 'audit') stepAudit();

    if (MODE === 'deploy' && proceed) {
      stepBackupRules();
      await stepFirebaseDeploy();
    }
  }

  if (MODE === 'stable') {
    stepVersionCheck();
    stepFirebaseRules();
    // Firebase deploy выполняется отдельно в Phase 1 FULL-DEPLOY-ALL.bat
    // В stable режиме только валидация правил + сборка APK
    await stepStableBuild();
  }

  printReport();

  // Сохраняем лог
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logPath = path.join(LOGS_DIR, `${timestamp()}_${MODE}_final.log`);
  fs.writeFileSync(logPath, stripAnsi(logBuffer));
  logInfo(`Лог сохранён: agents/logs/${path.basename(logPath)}`);

  const criticals = state.errors.filter(e => e.level === 'CRITICAL');
  process.exit(criticals.length > 0 ? 1 : 0);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

main().catch(err => {
  console.error('\n[FATAL]', err.message || err);
  process.exit(1);
});

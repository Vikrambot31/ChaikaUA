import { createFinding } from '../utils/severity.mjs';

const SCANNER = 'observability';

export function analyze(files) {
  const findings = [];

  for (const file of files) {
    const { relativePath, content, lines } = file;

    if (!/\.(tsx?|jsx?|mjs)$/.test(relativePath)) continue;

    // 1. empty-catch (HIGH)
    lines.forEach((line, i) => {
      if (/catch\s*\(\s*\w*\s*\)\s*\{/.test(line)) {
        // Skip: catch body is on the SAME line (one-liner with code)
        // e.g. `} catch (err) { console.error(...); }`
        const afterCatch = line.replace(/^.*catch\s*\(\s*\w*\s*\)\s*\{/, '').trim();
        if (afterCatch && afterCatch !== '}' && !/^\s*\}\s*$/.test(afterCatch)) {
          return; // has inline body — not empty
        }
        // Check for inline empty catch: catch(e) {} on same line
        if (/catch\s*\(\s*\w*\s*\)\s*\{\s*\}\s*$/.test(line.trim())) {
          if (/\/\//.test(line)) return;
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'empty-catch', scanner: SCANNER,
            why: 'Empty catch block silently swallows errors',
            risk: 'Bugs become invisible, impossible to diagnose production issues',
            uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Log the error or report it to an error tracking service',
          }));
          return;
        }
        const catchBody = lines.slice(i + 1, Math.min(i + 8, lines.length)).join('\n').trim();
        // Strip comments — if only comments remain, the catch is intentionally empty (documented)
        const stripped = catchBody.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const firstMeaningfulLine = stripped.split('\n').map(l => l.trim()).find(l => l.length > 0) || '';
        if (firstMeaningfulLine === '}' || firstMeaningfulLine === '') {
          // If the catch body had comments, it's intentionally empty — skip
          if (catchBody !== stripped) return;
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'empty-catch', scanner: SCANNER,
            why: 'Empty catch block silently swallows errors',
            risk: 'Bugs become invisible, impossible to diagnose production issues',
            uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Log the error or report it to an error tracking service',
          }));
        }
      }
    });

    // 2. console-only-error (LOW)
    // Downgraded: console.error is valid logging in many contexts, not a bug.
    // Also include logClientError/logClientEvent as proper reporting.
    lines.forEach((line, i) => {
      if (/catch\s*\(\s*\w*\s*\)\s*\{/.test(line)) {
        const catchBody = lines.slice(i + 1, Math.min(i + 6, lines.length));
        const bodyText = catchBody.join('\n');
        const hasConsole = /console\.(log|error|warn)\s*\(/.test(bodyText);
        const hasProperReporting = /Sentry|crashlytics|Analytics|reportError|logError|logClientError|logClientEvent|errorService|Alert\.alert|showError|toast|Toast/.test(bodyText);
        if (hasConsole && !hasProperReporting) {
          findings.push(createFinding({
            severity: 'LOW', file: relativePath, line: i + 1, rule: 'console-only-error', scanner: SCANNER,
            why: 'Catch block only uses console.log/error without proper error reporting',
            risk: 'Errors lost in production where console is not visible',
            uxImpact: 'low', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Add error reporting service (Sentry, Crashlytics) or show user-facing alert',
          }));
        }
      }
    });

    // 3. missing-screen-tracing (LOW)
    if (/screens?\//i.test(relativePath) && /Screen/.test(relativePath)) {
      if (!/analytics|track|log.*mount|trace|screenView|logScreen|useScreenTracking/.test(content)) {
        findings.push(createFinding({
          severity: 'LOW', file: relativePath, line: 1, rule: 'missing-screen-tracing', scanner: SCANNER,
          why: 'Screen component without analytics/tracing on mount',
          risk: 'No visibility into which screens users visit, cannot diagnose UX issues',
          uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
          suggestion: 'Add screen view tracking in useEffect or useFocusEffect',
        }));
      }
    }

    // 4. silent-failure (MEDIUM)
    // Downgraded from HIGH: returning fallback values from catch is a valid pattern
    // in many cases (optional data, non-critical operations).
    lines.forEach((line, i) => {
      if (/catch\s*\(\s*\w*\s*\)\s*\{/.test(line)) {
        const catchBody = lines.slice(i + 1, Math.min(i + 8, lines.length)).join('\n');
        if (/return\s+(null|undefined|false|\[\]|\{\})\s*;/.test(catchBody)) {
          if (!/console|log|report|alert|throw|Sentry|crashlytics|logClient|safeLog|void\s/.test(catchBody)) {
            findings.push(createFinding({
              severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'silent-failure', scanner: SCANNER,
              why: 'Function returns fallback value on error without any logging',
              risk: 'Errors completely invisible, stale or missing data shown to users silently',
              uxImpact: 'medium', perfImpact: 'none', memoryImpact: 'none',
              suggestion: 'Add error logging before returning fallback value',
            }));
          }
        }
      }
    });

    // 5. missing-error-context (MEDIUM)
    lines.forEach((line, i) => {
      if (/console\.(error|warn|log)\s*\(\s*['"`]/.test(line)) {
        // Check if the log message includes context (file, function, screen name)
        const logContent = line;
        if (!/\[|\bscreen\b|\bfunction\b|\bservice\b|\bcomponent\b|\berror in\b/i.test(logContent)) {
          // Check if it's just logging the error object without context
          if (/console\.(error|warn)\s*\(\s*['"`][^'"`]{0,15}['"`]\s*,/.test(line) || /console\.(error|warn)\s*\(\s*err/.test(line)) {
            findings.push(createFinding({
              severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'missing-error-context', scanner: SCANNER,
              why: 'Error log message lacks file/function/screen context',
              risk: 'Cannot trace error origin in production logs when debugging',
              uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
              suggestion: 'Include file name and function name in error log: console.error("[ScreenName.funcName]", err)',
            }));
          }
        }
      }
    });

    // 6. swallowed-rejection (MEDIUM)
    // Downgraded from HIGH: many intentional fire-and-forget patterns exist in real apps.
    // Whitelist: patterns where swallowing is intentional.
    const INTENTIONAL_SWALLOW_PATTERNS = [
      /AsyncStorage/,
      /Linking\./,
      /analytics|Analytics/,
      /logClientEvent|recordRuntimeTrace|safeLog/,
      /prefetch|preload|warmup/i,
      /Notifications\.(schedule|cancel)/,
      /BackgroundFetch/,
      /void\s+\w/,  // explicit void cast = intentional fire-and-forget
      /signInAnonymously|signOut|logOut/,
      /removeToken|clearToken|deleteToken/,
      /\.finally\s*\(/,
      /\.then\s*\([\s\S]*?\.catch/,
      /setItem|getItem|removeItem/,  // storage operations — non-critical
      /rateLimiter|rateLimit|cooldown/i,
      /unsubscribe|unsub|cleanup/i,
      /dashboard|stats|metric/i,  // dashboard data — non-critical reads
    ];
    lines.forEach((line, i) => {
      if (/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)/.test(line) ||
          /\.catch\s*\(\s*\(\s*\w*\s*\)\s*=>\s*(null|undefined|false|\{\s*\})\s*\)/.test(line) ||
          /\.catch\s*\(\s*\(\s*\)\s*=>\s*(null|undefined|false)\s*\)/.test(line)) {
        const context = lines.slice(Math.max(0, i - 5), Math.min(i + 5, lines.length)).join('\n');
        const isIntentional = INTENTIONAL_SWALLOW_PATTERNS.some(p => p.test(context));
        if (!isIntentional) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'swallowed-rejection', scanner: SCANNER,
            why: 'Promise rejection completely swallowed with empty/noop .catch()',
            risk: 'Errors silently discarded, failures invisible in production',
            uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Add error logging inside .catch() handler',
          }));
        }
      }
    });

    // 7. inconsistent-logging (INFO)
    const hasConsoleLog = /console\.log\s*\(/.test(content);
    const hasConsoleWarn = /console\.warn\s*\(/.test(content);
    const hasConsoleError = /console\.error\s*\(/.test(content);
    const hasCustomLogger = /logger\.|Logger\.|log\.\w+\(/.test(content);
    const logMethods = [hasConsoleLog, hasConsoleWarn, hasConsoleError, hasCustomLogger].filter(Boolean).length;
    if (logMethods >= 3) {
      findings.push(createFinding({
        severity: 'INFO', file: relativePath, line: 1, rule: 'inconsistent-logging', scanner: SCANNER,
        why: 'File uses multiple different logging approaches',
        risk: 'Inconsistent log formatting makes log analysis and filtering harder',
        uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
        suggestion: 'Adopt a unified logging utility with consistent format and severity levels',
      }));
    }
  }

  return findings;
}

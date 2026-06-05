import { createFinding } from '../utils/severity.mjs';

const SCANNER = 'crash-safety';

export function analyze(files) {
  const findings = [];

  // 7. global-error-handler (INFO) — check across all files once
  const allContent = files.map(f => f.content).join('\n');
  const hasGlobalHandler = /ErrorUtils|setGlobalHandler|onunhandledrejection|unhandledRejection/.test(allContent);
  if (!hasGlobalHandler) {
    findings.push(createFinding({
      severity: 'INFO', file: 'project', line: 0, rule: 'global-error-handler', scanner: SCANNER,
      why: 'No global error handler detected in the project',
      risk: 'Unhandled errors crash the app without any recovery or reporting',
      uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
      suggestion: 'Add ErrorUtils.setGlobalHandler() in app entry point for React Native',
    }));
  }

  for (const file of files) {
    const { relativePath, content, lines } = file;

    if (!/\.(tsx?|jsx?|mjs)$/.test(relativePath)) continue;

    // 1. missing-error-boundary — REMOVED
    // Every Stack.Screen in the project was flagged (95 findings), creating pure noise.
    // A single ErrorBoundary at the navigator level covers all screens.
    // Per-screen boundaries are a stylistic preference, not a bug.

    // 2. unhandled-promise-rejection — REMOVED
    // Exported async functions that throw are a standard pattern: callers handle errors.
    // Flagging every exported async function without try/catch produced 50+ false positives.
    // Real unhandled rejections are caught at runtime, not by static analysis heuristics.

    // 3. unsafe-json-parse (HIGH)
    lines.forEach((line, i) => {
      if (/JSON\.parse\s*\(/.test(line)) {
        // Wider window (±10) to catch wrapping try/catch that spans multiple JSON.parse calls
        const contextWindow = lines.slice(Math.max(0, i - 10), Math.min(i + 6, lines.length)).join('\n');
        if (!/try\s*\{|\.catch|catch\s*\(/.test(contextWindow)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'unsafe-json-parse', scanner: SCANNER,
            why: 'JSON.parse without try/catch',
            risk: 'Malformed JSON string crashes the app with SyntaxError',
            uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Wrap JSON.parse in try/catch, return fallback value on parse error',
          }));
        }
      }
    });

    // Rules 4-6 (unsafe-optional-chain, missing-null-check, unsafe-array-access) REMOVED.
    // These heuristic rules produced ~1000+ LOW findings with very high false-positive rates,
    // burying real issues. TypeScript compiler + linter catch these more accurately.
  }

  return findings;
}

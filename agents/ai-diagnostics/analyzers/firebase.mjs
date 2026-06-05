import { createFinding } from '../utils/severity.mjs';

const SCANNER = 'firebase';

const LARGE_COLLECTIONS = ['requests', 'community_photos', 'job_listings', 'lost_found', 'buy_sell', 'users', 'messages', 'notifications'];

export function analyze(files) {
  const findings = [];

  for (const file of files) {
    const { relativePath, content, lines } = file;

    // Skip firebase rules files for hardcoded-uid check
    const isRulesFile = /rules|\.rules/i.test(relativePath);

    // 1. missing-catch-firebase (HIGH)
    lines.forEach((line, i) => {
      if (/\b(get|set|update|push|remove)\s*\(\s*ref\s*\(/.test(line)) {
        // Skip: Firebase call inside a lambda/arrow function passed as callback —
        // the wrapping function (e.g. runAction) handles errors.
        const nearbyBefore = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
        if (/=>\s*\{?\s*$|=>\s*\w/.test(nearbyBefore) && /\)\s*=>/.test(nearbyBefore)) {
          return; // callback lambda — wrapper handles errors
        }
        // Skip: the call is inside a lambda on the same line (inline callback)
        if (/\(\)\s*=>\s*(update|remove|set|get|push)\s*\(/.test(line)) {
          return;
        }

        // Skip: inside useCallback/useMemo — the wrapping caller handles errors
        const hookContext = lines.slice(Math.max(0, i - 20), i + 1).join('\n');
        if (/useCallback\s*\(|useMemo\s*\(/.test(hookContext) && !/try\s*\{/.test(hookContext)) {
          return;
        }

        // Skip: exported/const async service functions — callers are responsible for error handling.
        const funcSearchStart = Math.max(0, i - 80);
        const blockBefore = lines.slice(funcSearchStart, i + 1).join('\n');
        // Match: export const/async function, or just const funcName = async
        if (/export\s+(const|async\s+function|function)\s+\w+/.test(blockBefore) ||
            /const\s+\w+\s*=\s*async\s/.test(blockBefore)) {
          const lastFuncIdx = Math.max(
            blockBefore.lastIndexOf('export'),
            blockBefore.lastIndexOf('const ')
          );
          const sinceFunc = blockBefore.slice(Math.max(0, lastFuncIdx));
          if (!/try\s*\{/.test(sinceFunc) && !/\.catch/.test(sinceFunc)) {
            return; // service function — callers handle errors
          }
        }

        // Wide context window (±35 lines) to catch wrapping try/catch blocks in longer functions
        const contextWindow = lines.slice(Math.max(0, i - 35), Math.min(i + 35, lines.length)).join('\n');
        if (!/\.catch|catch\s*\(|try\s*\{/.test(contextWindow)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'missing-catch-firebase', scanner: SCANNER,
            why: 'Firebase RTDB operation without error handling',
            risk: 'Network failure or permission denied crashes the app silently',
            uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Wrap Firebase operation in try/catch with user-facing error feedback',
          }));
        }
      }
    });

    // 2. duplicated-listener (HIGH)
    const listenerPaths = new Map();
    lines.forEach((line, i) => {
      const match = line.match(/on(?:Value|ChildAdded|ChildChanged|ChildRemoved)\s*\(\s*ref\s*\(\s*\w+\s*,\s*['"`]([^'"`]+)['"`]/);
      if (match) {
        const path = match[1];
        if (listenerPaths.has(path)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'duplicated-listener', scanner: SCANNER,
            why: `Duplicate RTDB listener on path "${path}" (first at line ${listenerPaths.get(path)})`,
            risk: 'Multiple listeners on same path cause redundant reads and data processing',
            uxImpact: 'none', perfImpact: 'high', memoryImpact: 'medium',
            suggestion: 'Consolidate listeners or ensure previous listener is detached before reattaching',
          }));
        } else {
          listenerPaths.set(path, i + 1);
        }
      }
    });

    // 3. leaked-listener (HIGH)
    lines.forEach((line, i) => {
      if (/useEffect\s*\(/.test(line)) {
        // Wider window (60 lines) to capture cleanup in longer effects
        const effectBlock = lines.slice(i, Math.min(i + 60, lines.length)).join('\n');
        if (/on(?:Value|ChildAdded|ChildChanged|ChildRemoved)\s*\(/.test(effectBlock)) {
          // Check for cleanup: return arrow, off(), unsubscribe, or variable assigned then returned
          if (!/return\s*\(\s*\)\s*=>|return\s*\(\)\s*=>|return\s*\w+\s*;|off\s*\(|unsubscribe|unsub/.test(effectBlock)) {
            // Also skip if the file has a general off() or unsubscribe anywhere nearby (component-level cleanup)
            const fileContext = lines.slice(Math.max(0, i - 5), Math.min(i + 60, lines.length)).join('\n');
            if (!/off\s*\(|unsubscribe|unsub/.test(fileContext)) {
              findings.push(createFinding({
                severity: 'HIGH', file: relativePath, line: i + 1, rule: 'leaked-listener', scanner: SCANNER,
                why: 'Firebase RTDB listener in useEffect without cleanup/unsubscribe',
                risk: 'Memory leak and zombie listeners processing data after component unmounts',
                uxImpact: 'none', perfImpact: 'medium', memoryImpact: 'high',
                suggestion: 'Return a cleanup function that calls off() or the unsubscribe callback',
              }));
            }
          }
        }
      }
    });

    // 4. heavy-read-no-limit (MEDIUM)
    lines.forEach((line, i) => {
      const pathMatch = line.match(/ref\s*\(\s*\w+\s*,\s*['"`]([^'"`]+)['"`]/);
      if (pathMatch) {
        const path = pathMatch[1];
        const isLargeCollection = LARGE_COLLECTIONS.some(col => path === col || path.endsWith('/' + col) || path.startsWith(col + '/'));
        if (isLargeCollection) {
          // Check if there's a query constraint nearby
          const context = lines.slice(Math.max(0, i - 2), Math.min(i + 5, lines.length)).join('\n');
          if (!/limitToFirst|limitToLast|orderBy|startAt|endAt|equalTo|query\s*\(/.test(context)) {
            // Only flag if it's a read operation (get or onValue)
            if (/\b(get|onValue|onChildAdded)\s*\(/.test(context)) {
              findings.push(createFinding({
                severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'heavy-read-no-limit', scanner: SCANNER,
                why: `Reading large collection "${path}" without query limits`,
                risk: 'Downloads entire collection, slow on mobile networks, high bandwidth cost',
                uxImpact: 'medium', perfImpact: 'high', memoryImpact: 'high',
                suggestion: 'Add limitToFirst/limitToLast or query constraints to limit data fetched',
              }));
            }
          }
        }
      }
    });

    // 5. unsafe-retry-loop (CRITICAL)
    // Only flag while() loops — for...of / for...in / for(let i=0;...) are iteration, not retry.
    // True retry patterns use while(true), while(shouldRetry), while(attempts < max), etc.
    lines.forEach((line, i) => {
      if (/\bwhile\s*\(/.test(line)) {
        const loopBlock = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');
        if (/\b(set|update|push|remove)\s*\(\s*ref\s*\(/.test(loopBlock)) {
          if (!/break|maxRetries|retryCount|attempt|MAX_RETRIES/.test(loopBlock)) {
            findings.push(createFinding({
              severity: 'CRITICAL', file: relativePath, line: i + 1, rule: 'unsafe-retry-loop', scanner: SCANNER,
              why: 'Firebase write operation inside while loop without retry limit',
              risk: 'Infinite retry loop on persistent errors, drains battery and bandwidth',
              uxImpact: 'high', perfImpact: 'high', memoryImpact: 'none',
              suggestion: 'Add maximum retry count and exponential backoff to the loop',
            }));
          }
        }
      }
    });

    // 6. no-offline-handling (LOW)
    // Lowered from MEDIUM: per-file check produces many false positives for utility/service files
    // Only flag screen/component files (not services, not hooks)
    if (/src\/(screens|components)\//i.test(relativePath)) {
      if (/\b(get|set|update|push)\s*\(\s*ref\s*\(/.test(content)) {
        if (!/goOnline|goOffline|\.info\/connected|NetInfo|isConnected|onLine/.test(content)) {
          findings.push(createFinding({
            severity: 'LOW', file: relativePath, line: 1, rule: 'no-offline-handling', scanner: SCANNER,
            why: 'Firebase operations without offline/connectivity awareness',
            risk: 'Operations queue silently offline, user thinks data is saved but it is not synced',
            uxImpact: 'low', perfImpact: 'none', memoryImpact: 'none',
            suggestion: 'Check network connectivity before critical writes, show offline indicator',
          }));
        }
      }
    }

    // 7. transaction-missing (MEDIUM)
    // Lowered from HIGH: read-then-write is often intentional; true race conditions require specific concurrency patterns
    lines.forEach((line, i) => {
      if (/\bget\s*\(\s*ref\s*\(/.test(line)) {
        const afterRead = lines.slice(i + 1, Math.min(i + 12, lines.length)).join('\n');
        const pathMatch = line.match(/ref\s*\(\s*\w+\s*,\s*['"`]([^'"`]+)['"`]/);
        if (pathMatch) {
          const pathEscaped = pathMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (new RegExp(`(set|update)\\s*\\(\\s*ref\\s*\\(\\s*\\w+\\s*,\\s*['"\`]${pathEscaped}`).test(afterRead)) {
            if (!/runTransaction|transaction/.test(lines.slice(i, Math.min(i + 12, lines.length)).join('\n'))) {
              findings.push(createFinding({
                severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'transaction-missing', scanner: SCANNER,
                why: `Read-then-write on "${pathMatch[1]}" without runTransaction`,
                risk: 'Potential race condition under concurrent writes — review if atomic update is required',
                uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
                suggestion: 'Use runTransaction() for atomic read-modify-write operations if concurrency is possible',
              }));
            }
          }
        }
      }
    });

    // 8. hardcoded-uid (LOW)
    // Downgraded: most matches are screen names, route names, or hash constants — not UIDs.
    // Tightened: only flag strings that look like Firebase UIDs (mixed case + digits, no camelCase).
    if (!isRulesFile) {
      lines.forEach((line, i) => {
        const match = line.match(/['"`]([A-Za-z0-9]{25,35})['"`]/);
        if (match) {
          const candidate = match[1];
          // Firebase UIDs have mixed case letters + digits, no pure camelCase names
          const hasDigits = /\d/.test(candidate);
          const hasMixedCase = /[a-z]/.test(candidate) && /[A-Z]/.test(candidate);
          // Skip: camelCase names (screen names, component names)
          const isCamelCase = /^[a-z][a-zA-Z]+$/.test(candidate) || /^[A-Z][a-zA-Z]+$/.test(candidate);
          if (!hasDigits || !hasMixedCase || isCamelCase) return;
          if (/import|require|http|sha|hash|key|token|secret|\.js|\.ts|\.mjs|Screen|Component|name\s*=/.test(line)) return;
          const context = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join('\n');
          if (/uid|user|admin|owner|author|creator/i.test(context)) {
            findings.push(createFinding({
              severity: 'LOW', file: relativePath, line: i + 1, rule: 'hardcoded-uid', scanner: SCANNER,
              why: 'Hardcoded UID string detected in source code',
              risk: 'Breaks if user UID changes, makes code environment-specific',
              uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
              suggestion: 'Move UID to environment config or fetch dynamically from auth context',
            }));
          }
        }
      });
    }

    // 9. large-payload-write (MEDIUM)
    lines.forEach((line, i) => {
      if (/JSON\.stringify/.test(line)) {
        const context = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
        if (/\b(set|update)\s*\(\s*ref\s*\(/.test(context)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'large-payload-write', scanner: SCANNER,
            why: 'JSON.stringify near Firebase write suggests potentially large payload',
            risk: 'Large writes may exceed RTDB size limits or cause slow writes on mobile',
            uxImpact: 'low', perfImpact: 'medium', memoryImpact: 'low',
            suggestion: 'Validate payload size before write, consider splitting into smaller paths',
          }));
        }
      }
    });
  }

  return findings;
}

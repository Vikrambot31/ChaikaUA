import { createFinding } from '../utils/severity.mjs';

const SCANNER = 'runtime';

export function analyze(files) {
  const findings = [];

  for (const file of files) {
    const { relativePath, content, lines } = file;

    // Only analyze React component files
    if (!/\.(tsx?|jsx?)$/.test(relativePath)) continue;

    // 1. missing-cleanup-useeffect (MEDIUM)
    lines.forEach((line, i) => {
      if (/useEffect\s*\(\s*(async\s*)?\(?\)?\s*=>\s*\{?/.test(line)) {
        const effectBlock = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
        const hasSubscription = /setInterval|setTimeout|addEventListener|onValue|onChildAdded|subscribe|\.on\(|Keyboard\.add|AppState\.add|Linking\.add|BackHandler\.add/.test(effectBlock);
        if (hasSubscription) {
          // Check for cleanup return
          if (!/return\s*\(\s*\)\s*=>|return\s*\(\)\s*=>|return\s+function|return\s+\w+\s*;/.test(effectBlock)) {
            findings.push(createFinding({
              severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'missing-cleanup-useeffect', scanner: SCANNER,
              why: 'useEffect with subscription/interval but no cleanup return',
              risk: 'Memory leak from lingering subscriptions after component unmounts',
              uxImpact: 'none', perfImpact: 'medium', memoryImpact: 'high',
              suggestion: 'Return a cleanup function that clears intervals and removes listeners',
            }));
          }
        }
      }
    });

    // 2. stale-closure (MEDIUM)
    lines.forEach((line, i) => {
      // Find useEffect or useCallback with deps array
      const hookMatch = line.match(/\b(useEffect|useCallback)\s*\(/);
      if (hookMatch) {
        const block = lines.slice(i, Math.min(i + 25, lines.length)).join('\n');
        // Find the deps array
        const depsMatch = block.match(/\]\s*,\s*\[([^\]]*)\]\s*\)/);
        if (depsMatch) {
          const deps = depsMatch[1];
          // Look for state variables used in the block but not in deps
          const stateRefs = block.match(/\b\w+(?=\s*[^(=])/g) || [];
          // Check for common state patterns used inside but not in deps
          const bodyBeforeDeps = block.split(depsMatch[0])[0];
          const stateUsages = bodyBeforeDeps.match(/\b(count|data|items|value|list|user|loading|error|visible|show|open|selected)\b/g);
          if (stateUsages && stateUsages.length > 0) {
            const missingDeps = stateUsages.filter(s => !deps.includes(s));
            // Only report if there are setter calls suggesting these are state vars
            if (missingDeps.some(d => content.includes(`set${d.charAt(0).toUpperCase() + d.slice(1)}`))) {
              // This is a heuristic, may have false positives
              // Only flag if deps array is not empty (empty deps is intentional)
              if (deps.trim().length > 0) {
                findings.push(createFinding({
                  severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'stale-closure', scanner: SCANNER,
                  why: `Possible stale closure: state variable may be missing from ${hookMatch[1]} deps`,
                  risk: 'Callback uses outdated state value, causing subtle bugs',
                  uxImpact: 'medium', perfImpact: 'none', memoryImpact: 'none',
                  suggestion: 'Verify all referenced state variables are included in the dependency array',
                }));
              }
            }
          }
        }
      }
    });

    // 3. async-useeffect (LOW)
    lines.forEach((line, i) => {
      if (/useEffect\s*\(\s*async\s/.test(line)) {
        findings.push(createFinding({
          severity: 'LOW', file: relativePath, line: i + 1, rule: 'async-useeffect', scanner: SCANNER,
          why: 'Async function passed directly to useEffect',
          risk: 'useEffect cleanup cannot work with async functions, React warns about this',
          uxImpact: 'none', perfImpact: 'none', memoryImpact: 'none',
          suggestion: 'Define async function inside effect and call it: useEffect(() => { async function load() {...} load(); }, [])',
        }));
      }
    });

    // 4. unresolved-promise (HIGH)
    lines.forEach((line, i) => {
      // Look for async function calls without await, .then, or .catch
      // Detect common patterns: functionName() on its own line returning a promise
      if (/^\s*\w+\s*\(.*\)\s*;?\s*$/.test(line) && !/await|\.then|\.catch|console\.|return|const|let|var|=/.test(line)) {
        // Check if the function is likely async
        const funcName = line.match(/^\s*(\w+)\s*\(/)?.[1];
        if (funcName) {
          // Search for async definition of this function in the file
          const asyncDef = new RegExp(`async\\s+(function\\s+)?${funcName}\\b`);
          if (asyncDef.test(content)) {
            findings.push(createFinding({
              severity: 'HIGH', file: relativePath, line: i + 1, rule: 'unresolved-promise', scanner: SCANNER,
              why: `Async function "${funcName}" called without await or error handling`,
              risk: 'Unhandled promise rejection may crash the app in production',
              uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
              suggestion: 'Add await keyword or .catch() handler to the async call',
            }));
          }
        }
      }
    });

    // 5. appstate-no-cleanup (MEDIUM)
    lines.forEach((line, i) => {
      if (/AppState\.addEventListener/.test(line)) {
        const context = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
        if (!/removeEventListener|remove\(\)|\.remove\(|return.*remove/.test(context)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'appstate-no-cleanup', scanner: SCANNER,
            why: 'AppState.addEventListener without corresponding removal',
            risk: 'Listener accumulates on each mount, processing events after unmount',
            uxImpact: 'none', perfImpact: 'low', memoryImpact: 'medium',
            suggestion: 'Store subscription and call .remove() in useEffect cleanup',
          }));
        }
      }
    });

    // 6. setstate-after-unmount (MEDIUM)
    lines.forEach((line, i) => {
      // Look for setState inside .then() or after await in async callbacks
      if (/\.then\s*\(\s*(?:async\s*)?\(?.*?\)?\s*=>\s*\{?/.test(line) || /await\s+/.test(line)) {
        const thenBlock = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        if (/\bset[A-Z]\w*\s*\(/.test(thenBlock)) {
          const funcContext = lines.slice(Math.max(0, i - 20), Math.min(i + 15, lines.length)).join('\n');
          if (!/isMounted|mounted|cancelled|aborted|useRef.*mounted/.test(funcContext)) {
            findings.push(createFinding({
              severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'setstate-after-unmount', scanner: SCANNER,
              why: 'setState in async callback without isMounted guard',
              risk: 'React warning or crash if component unmounts before async completes',
              uxImpact: 'none', perfImpact: 'none', memoryImpact: 'low',
              suggestion: 'Add isMounted ref check before setState calls in async callbacks',
            }));
          }
        }
      }
    });

    // 7. navigation-missing-focus (LOW)
    lines.forEach((line, i) => {
      // Check if this looks like a screen component
      if (/function\s+\w+Screen|Screen\s*[:=]/.test(line) || /export\s+(default\s+)?function\s+\w+/.test(line)) {
        if (/Screen/.test(relativePath) || /screens\//.test(relativePath)) {
          const compBlock = lines.slice(i, Math.min(i + 50, lines.length)).join('\n');
          if (/useEffect\s*\(/.test(compBlock) && /fetch|load|get\s*\(|api/i.test(compBlock)) {
            if (!/useFocusEffect|useIsFocused|isFocused/.test(compBlock)) {
              findings.push(createFinding({
                severity: 'LOW', file: relativePath, line: i + 1, rule: 'navigation-missing-focus', scanner: SCANNER,
                why: 'Screen fetches data in useEffect instead of useFocusEffect',
                risk: 'Data not refreshed when navigating back to this screen',
                uxImpact: 'medium', perfImpact: 'none', memoryImpact: 'none',
                suggestion: 'Use useFocusEffect from @react-navigation/native to refresh data on screen focus',
              }));
            }
          }
        }
      }
    });

    // 8. infinite-rerender-risk (HIGH)
    lines.forEach((line, i) => {
      // setState inside useEffect with no deps or wrong deps
      if (/useEffect\s*\(\s*\(\)\s*=>\s*\{/.test(line)) {
        const effectBlock = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');
        // Check for setState without deps array (runs every render)
        const setStateMatch = effectBlock.match(/\bset[A-Z]\w*\s*\(/);
        if (setStateMatch) {
          // Check if deps array is missing entirely (not empty [])
          if (!/\]\s*\);\s*$/.test(effectBlock) && !/,\s*\[/.test(effectBlock)) {
            findings.push(createFinding({
              severity: 'HIGH', file: relativePath, line: i + 1, rule: 'infinite-rerender-risk', scanner: SCANNER,
              why: 'setState inside useEffect without dependency array',
              risk: 'Infinite re-render loop: setState triggers render, which triggers effect again',
              uxImpact: 'high', perfImpact: 'high', memoryImpact: 'none',
              suggestion: 'Add a dependency array to useEffect to control when it runs',
            }));
          }
        }
      }

      // setState directly in render body (not inside hooks or handlers)
      if (/^\s*set[A-Z]\w*\s*\(/.test(line)) {
        const context = lines.slice(Math.max(0, i - 10), i).join('\n');
        // If not inside useEffect, useCallback, handler function, or event handler
        if (!/useEffect|useCallback|useMemo|handle|on[A-Z]|function\s+\w+|=>\s*\{/.test(context)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'infinite-rerender-risk', scanner: SCANNER,
            why: 'setState call appears to be in render body',
            risk: 'setState in render body causes infinite re-render loop',
            uxImpact: 'high', perfImpact: 'high', memoryImpact: 'none',
            suggestion: 'Move setState into useEffect, event handler, or callback',
          }));
        }
      }
    });
  }

  return findings;
}

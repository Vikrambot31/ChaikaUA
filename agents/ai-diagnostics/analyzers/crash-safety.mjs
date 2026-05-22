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

    // 1. missing-error-boundary (MEDIUM)
    // Check navigation files for screen registrations without ErrorBoundary
    if (/navigation|navigator|Navigator/i.test(relativePath)) {
      lines.forEach((line, i) => {
        if (/Screen\s+name\s*=\s*['"`]/.test(line) || /component\s*=\s*\{/.test(line)) {
          const context = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join('\n');
          if (!/ErrorBoundary|errorBoundary|ErrorFallback/.test(context)) {
            // Only flag top-level screen registrations
            if (/Stack\.Screen|Tab\.Screen|Drawer\.Screen/.test(context)) {
              findings.push(createFinding({
                severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'missing-error-boundary', scanner: SCANNER,
                why: 'Screen component registered without ErrorBoundary wrapper',
                risk: 'Unhandled error in one screen crashes the entire app navigation',
                uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
                suggestion: 'Wrap screen component in ErrorBoundary to isolate crashes per screen',
              }));
            }
          }
        }
      });
    }

    // 2. unhandled-promise-rejection (HIGH)
    lines.forEach((line, i) => {
      if (/^\s*(?:export\s+)?(?:async\s+)?function\s+\w+|^\s*(?:export\s+)?const\s+\w+\s*=\s*async/.test(line)) {
        // Found an async function definition at top level
        const isAsync = /async/.test(line);
        if (isAsync) {
          const funcBlock = lines.slice(i, Math.min(i + 30, lines.length)).join('\n');
          // Find the function body
          if (!/try\s*\{/.test(funcBlock.slice(0, 200))) {
            // No try/catch near the start of the function
            // Check if there's any error handling at all
            if (!/\.catch|catch\s*\(/.test(funcBlock.slice(0, 300))) {
              findings.push(createFinding({
                severity: 'HIGH', file: relativePath, line: i + 1, rule: 'unhandled-promise-rejection', scanner: SCANNER,
                why: 'Top-level async function without try/catch',
                risk: 'Unhandled promise rejection crashes the app in production',
                uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
                suggestion: 'Wrap async function body in try/catch with proper error handling',
              }));
            }
          }
        }
      }
    });

    // 3. unsafe-json-parse (HIGH)
    lines.forEach((line, i) => {
      if (/JSON\.parse\s*\(/.test(line)) {
        const contextWindow = lines.slice(Math.max(0, i - 3), Math.min(i + 4, lines.length)).join('\n');
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

    // 4. unsafe-optional-chain (MEDIUM)
    lines.forEach((line, i) => {
      // Match deep property access a.b.c.d (4+ levels) without optional chaining
      const deepAccess = line.match(/\b(\w+)\.(\w+)\.(\w+)\.(\w+)\b/g);
      if (deepAccess) {
        for (const access of deepAccess) {
          // Skip if it uses optional chaining
          if (/\?\.\w+\?\.\w+/.test(line)) continue;
          // Skip common safe patterns (imports, console, React, process, module)
          if (/^(console|React|process|module|exports|require|window|document|Math|Object|Array|String|Number|Date|JSON|Promise|Error)\b/.test(access)) continue;
          // Skip if the full chain uses optional chaining somewhere
          const chainStart = access.split('.')[0];
          const lineContext = line;
          if (new RegExp(`${chainStart}\\?\\.`).test(lineContext)) continue;

          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'unsafe-optional-chain', scanner: SCANNER,
            why: `Deep property access "${access}" without optional chaining`,
            risk: 'TypeError: Cannot read property of undefined if any intermediate value is null',
            uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
            suggestion: `Use optional chaining: ${access.split('.').join('?.')}`,
          }));
        }
      }
    });

    // 5. missing-null-check (MEDIUM)
    lines.forEach((line, i) => {
      // Match array methods called without null check
      const arrayMethodMatch = line.match(/(\w+)\.(map|filter|forEach|find|some|every|reduce|flatMap|includes)\s*\(/);
      if (arrayMethodMatch) {
        const varName = arrayMethodMatch[1];
        // Skip common safe objects
        if (/^(Array|Object|String|console|Math|JSON|React|Promise|this|props|state|styles)$/.test(varName)) return;
        // Skip if preceded by null check or optional chain
        if (new RegExp(`${varName}\\?\\.`).test(line)) return;
        if (new RegExp(`${varName}\\s*&&\\s*${varName}\\.`).test(line)) return;

        // Check if there's a null check in the preceding lines
        const contextBefore = lines.slice(Math.max(0, i - 5), i).join('\n');
        if (!new RegExp(`if\\s*\\(\\s*!?${varName}\\b|${varName}\\s*&&|${varName}\\s*\\?\\.|\\?\\?`).test(contextBefore)) {
          // Check if the variable is initialized as array in the component
          if (!new RegExp(`(const|let|var)\\s+${varName}\\s*=\\s*\\[`).test(content.slice(0, content.indexOf(line)))) {
            findings.push(createFinding({
              severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'missing-null-check', scanner: SCANNER,
              why: `Array method .${arrayMethodMatch[2]}() called on "${varName}" without null check`,
              risk: 'TypeError if variable is null/undefined, crashes the component',
              uxImpact: 'high', perfImpact: 'none', memoryImpact: 'none',
              suggestion: `Add null check: ${varName}?.${arrayMethodMatch[2]}(...) or (${varName} || []).${arrayMethodMatch[2]}(...)`,
            }));
          }
        }
      }
    });

    // 6. unsafe-array-access (LOW)
    lines.forEach((line, i) => {
      // Match array[0] or array[i] without length check
      const indexAccess = line.match(/(\w+)\[(\d+|[a-z]\w*)\]/);
      if (indexAccess) {
        const varName = indexAccess[1];
        const index = indexAccess[2];
        // Skip common safe patterns
        if (/^(arguments|process|module|exports|style|styles|colors|theme)$/.test(varName)) return;
        // Skip string literals and object property access
        if (/['"`]/.test(index)) return;

        // Only flag numeric indices > 0 or variable indices without bounds check
        if (/^\d+$/.test(index) && parseInt(index) > 0) {
          const contextBefore = lines.slice(Math.max(0, i - 3), i).join('\n');
          if (!new RegExp(`${varName}\\.length|${varName}\\s*&&|if\\s*\\(\\s*${varName}`).test(contextBefore)) {
            findings.push(createFinding({
              severity: 'LOW', file: relativePath, line: i + 1, rule: 'unsafe-array-access', scanner: SCANNER,
              why: `Array access "${varName}[${index}]" without bounds checking`,
              risk: 'Returns undefined if array is shorter than expected, may cause downstream errors',
              uxImpact: 'low', perfImpact: 'none', memoryImpact: 'none',
              suggestion: `Check ${varName}.length > ${index} before accessing, or use ${varName}?.[${index}]`,
            }));
          }
        } else if (!/^\d+$/.test(index)) {
          // Variable index
          const contextBefore = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
          if (!new RegExp(`${index}\\s*<\\s*${varName}\\.length|${varName}\\.length|bounds|clamp`).test(contextBefore)) {
            // Only flag if it looks like a loop index without guard
            if (/^[ijk]$/.test(index)) {
              findings.push(createFinding({
                severity: 'LOW', file: relativePath, line: i + 1, rule: 'unsafe-array-access', scanner: SCANNER,
                why: `Array access "${varName}[${index}]" with loop variable without explicit bounds check`,
                risk: 'Out-of-bounds access if loop condition is wrong',
                uxImpact: 'low', perfImpact: 'none', memoryImpact: 'none',
                suggestion: `Ensure loop bounds are checked against ${varName}.length`,
              }));
            }
          }
        }
      }
    });
  }

  return findings;
}

import { createFinding } from '../utils/severity.mjs';

const SCANNER = 'performance';

export function analyze(files) {
  const findings = [];

  for (const file of files) {
    const { relativePath, content, lines } = file;

    if (!/\.(tsx?|jsx?)$/.test(relativePath)) continue;

    // 1. large-inline-style (LOW)
    lines.forEach((line, i) => {
      if (/style\s*=\s*\{\s*\{/.test(line)) {
        // Count properties in inline style — look ahead for the closing }}
        const styleBlock = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');
        const match = styleBlock.match(/style\s*=\s*\{\s*\{([\s\S]*?)\}\s*\}/);
        if (match) {
          const propCount = (match[1].match(/\w+\s*:/g) || []).length;
          if (propCount >= 5) {
            findings.push(createFinding({
              severity: 'LOW', file: relativePath, line: i + 1, rule: 'large-inline-style', scanner: SCANNER,
              why: `Inline style object with ${propCount} properties`,
              risk: 'New object created every render, triggers unnecessary re-renders of native views',
              uxImpact: 'none', perfImpact: 'low', memoryImpact: 'low',
              suggestion: 'Extract style object to StyleSheet.create() or a const outside render',
            }));
          }
        }
      }
    });

    // 2. flatlist-missing-keys (MEDIUM)
    lines.forEach((line, i) => {
      if (/<FlatList\b/.test(line)) {
        const context = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');
        // Check for self-closing or multi-line FlatList without keyExtractor
        if (!/keyExtractor/.test(context)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'flatlist-missing-keys', scanner: SCANNER,
            why: 'FlatList without keyExtractor prop',
            risk: 'React cannot efficiently reconcile list items, causing unnecessary re-renders',
            uxImpact: 'low', perfImpact: 'medium', memoryImpact: 'none',
            suggestion: 'Add keyExtractor={(item) => item.id} prop to FlatList',
          }));
        }
      }
    });

    // 3. flatlist-no-optimization (LOW)
    // Downgraded: a suggestion, not a bug — FlatList works correctly without these.
    lines.forEach((line, i) => {
      if (/<FlatList\b/.test(line)) {
        const context = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');
        const hasGetItemLayout = /getItemLayout/.test(context);
        const hasMaxRender = /maxToRenderPerBatch/.test(context);
        const hasWindowSize = /windowSize/.test(context);
        const hasInitialRender = /initialNumToRender/.test(context);
        if (!hasGetItemLayout && !hasMaxRender && !hasWindowSize && !hasInitialRender) {
          findings.push(createFinding({
            severity: 'LOW', file: relativePath, line: i + 1, rule: 'flatlist-no-optimization', scanner: SCANNER,
            why: 'FlatList without any performance optimization props',
            risk: 'Large lists render all items at once, causing jank and high memory usage',
            uxImpact: 'medium', perfImpact: 'high', memoryImpact: 'high',
            suggestion: 'Add getItemLayout, maxToRenderPerBatch, windowSize, or initialNumToRender',
          }));
        }
      }
    });

    // 4. image-no-resize (MEDIUM)
    lines.forEach((line, i) => {
      if (/<Image\b/.test(line) && !/import/.test(line)) {
        const context = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');
        if (!/resizeMode|resizeMethod|contentFit/.test(context)) {
          findings.push(createFinding({
            severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'image-no-resize', scanner: SCANNER,
            why: 'Image component without resizeMode prop',
            risk: 'Full-resolution images rendered without scaling, wasting memory on mobile',
            uxImpact: 'low', perfImpact: 'medium', memoryImpact: 'high',
            suggestion: 'Add resizeMode="cover" or resizeMode="contain" to Image component',
          }));
        }
      }
    });

    // 5. expensive-rerender (LOW)
    // Downgraded: .map()/.filter() in JSX is extremely common React pattern, rarely a real perf issue.
    lines.forEach((line, i) => {
      if (/\.\b(map|filter|reduce|sort)\s*\(/.test(line)) {
        const contextBefore = lines.slice(Math.max(0, i - 15), i).join('\n');
        const isInRender = /return\s*\(/.test(contextBefore) && /</.test(contextBefore);
        const isInUseMemo = /useMemo/.test(lines.slice(Math.max(0, i - 5), i).join('\n'));
        if (isInRender && !isInUseMemo) {
          if (!/\[\s*['"`\d]/.test(line)) {
            findings.push(createFinding({
              severity: 'LOW', file: relativePath, line: i + 1, rule: 'expensive-rerender', scanner: SCANNER,
              why: 'Array transformation in render body without useMemo',
              risk: 'Expensive computation runs on every render, causing UI jank',
              uxImpact: 'low', perfImpact: 'medium', memoryImpact: 'low',
              suggestion: 'Wrap array computation in useMemo() with appropriate dependencies',
            }));
          }
        }
      }
    });

    // 6. missing-memo (LOW)
    lines.forEach((line, i) => {
      // Look for component definitions receiving object/array props
      if (/function\s+(\w+)\s*\(\s*\{/.test(line) || /const\s+(\w+)\s*[:=]\s*\(\s*\{/.test(line)) {
        const compName = (line.match(/function\s+(\w+)/) || line.match(/const\s+(\w+)/))?.[1];
        if (compName && /^[A-Z]/.test(compName)) {
          // Check props for objects/arrays
          const propsBlock = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
          if (/:\s*(object|any\[\]|Record|Array)/.test(propsBlock) || /\w+\s*=\s*\{/.test(propsBlock)) {
            // Check if component is wrapped in React.memo
            const fileContext = content;
            if (!new RegExp(`React\\.memo\\s*\\(\\s*${compName}|memo\\s*\\(\\s*${compName}`).test(fileContext)) {
              if (!/export\s+default\s+React\.memo|export\s+default\s+memo/.test(fileContext)) {
                findings.push(createFinding({
                  severity: 'LOW', file: relativePath, line: i + 1, rule: 'missing-memo', scanner: SCANNER,
                  why: `Component "${compName}" receives object/array props without React.memo`,
                  risk: 'Component re-renders unnecessarily when parent renders with same props',
                  uxImpact: 'none', perfImpact: 'low', memoryImpact: 'none',
                  suggestion: `Wrap ${compName} with React.memo() or use useMemo for prop values`,
                }));
              }
            }
          }
        }
      }
    });

    // 7. blocking-operation (HIGH)
    lines.forEach((line, i) => {
      if (/readFileSync|writeFileSync|existsSync|mkdirSync|readdirSync/.test(line)) {
        // Skip __DEV__ guarded code — only runs in dev, not production
        const nearbyContext = lines.slice(Math.max(0, i - 10), i + 1).join('\n');
        if (/__DEV__|process\.env\.NODE_ENV/.test(nearbyContext)) return;
        // Only flag in React component files, not scripts/config/tests/utils
        if (/src\//.test(relativePath) && !/scripts|config|\.config|__tests__|\.test\.|\.spec\.|utils\/env/.test(relativePath)) {
          findings.push(createFinding({
            severity: 'HIGH', file: relativePath, line: i + 1, rule: 'blocking-operation', scanner: SCANNER,
            why: 'Synchronous file operation blocks the JavaScript thread',
            risk: 'UI freezes during file I/O, causing ANR on Android or unresponsive UI',
            uxImpact: 'high', perfImpact: 'high', memoryImpact: 'none',
            suggestion: 'Use async alternatives: readFile, writeFile, access, mkdir, readdir',
          }));
        }
      }
    });

    // 8. large-state-object (MEDIUM)
    lines.forEach((line, i) => {
      if (/useState\s*\(\s*\{/.test(line)) {
        // Count how many lines the initial state spans
        const stateBlock = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
        const match = stateBlock.match(/useState\s*\(\s*(\{[\s\S]*?\})\s*\)/);
        if (match) {
          const propCount = (match[1].match(/\w+\s*:/g) || []).length;
          if (propCount >= 6) {
            findings.push(createFinding({
              severity: 'MEDIUM', file: relativePath, line: i + 1, rule: 'large-state-object', scanner: SCANNER,
              why: `useState initialized with object containing ${propCount} properties`,
              risk: 'Every property change creates new object, complex updates risk stale state',
              uxImpact: 'none', perfImpact: 'low', memoryImpact: 'low',
              suggestion: 'Split into multiple useState calls or use useReducer for complex state',
            }));
          }
        }
      }
    });
  }

  return findings;
}

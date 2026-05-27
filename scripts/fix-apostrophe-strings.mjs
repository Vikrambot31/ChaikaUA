/**
 * Fix broken string literals where Ukrainian apostrophes (з'явиться, зв'язатися, etc.)
 * are inside single-quoted strings, causing premature string termination.
 * Solution: switch those specific string literals to double-quote delimiters.
 */
import { readFileSync, writeFileSync } from 'fs';

// Ukrainian apostrophe trigger patterns
const UA_APOSTROPHE = /[а-яА-ЯіІїЇєЄ]'[а-яА-ЯіІїЇєЄ]/;

function fixFile(filePath) {
  const original = readFileSync(filePath, 'utf8');
  const lines = original.split('\n');
  let changed = 0;

  const fixed = lines.map((line, idx) => {
    // Skip comment lines, import lines, type assertion lines
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) return line;
    // Skip TypeScript type assertions like 'object' as const, 'success' in result
    if (/ as const/.test(line) && !UA_APOSTROPHE.test(line)) return line;

    // Process character by character looking for single-quote string literals
    let result = '';
    let i = 0;

    while (i < line.length) {
      const ch = line[i];

      // Template literal — skip entirely
      if (ch === '`') {
        let j = i + 1;
        result += ch;
        while (j < line.length) {
          result += line[j];
          if (line[j] === '`' && line[j - 1] !== '\\') { j++; break; }
          j++;
        }
        i = j;
        continue;
      }

      // Double-quote string — copy as-is
      if (ch === '"') {
        let j = i + 1;
        result += ch;
        while (j < line.length) {
          result += line[j];
          if (line[j] === '"' && line[j - 1] !== '\\') { j++; break; }
          j++;
        }
        i = j;
        continue;
      }

      // Single-quote string — check if it contains Ukrainian apostrophes
      if (ch === "'") {
        // Find the end of the string
        let j = i + 1;
        let strContent = '';
        while (j < line.length) {
          if (line[j] === "'" && line[j - 1] !== '\\') break;
          strContent += line[j];
          j++;
        }
        const fullStr = line.slice(i, j + 1); // includes both quotes

        if (UA_APOSTROPHE.test(strContent) && !strContent.includes('"')) {
          // Switch to double quotes
          result += '"' + strContent + '"';
          changed++;
        } else {
          result += fullStr;
        }
        i = j + 1;
        continue;
      }

      // Line comment — stop processing
      if (ch === '/' && line[i + 1] === '/') {
        result += line.slice(i);
        break;
      }

      result += ch;
      i++;
    }

    if (changed > 0 && result !== line) {
      console.log('  L' + (idx + 1) + ': ' + line.trim().slice(0, 80));
      console.log('    → ' + result.trim().slice(0, 80));
    }

    return result;
  });

  const output = fixed.join('\n');
  if (output !== original) {
    writeFileSync(filePath, output, 'utf8');
    return changed;
  }
  return 0;
}

const files = [
  './src/screens/Foto-Rayona.tsx',
  './src/screens/OSBB-Setup.tsx',
  './src/screens/Detal-Zayavki.tsx',
  './src/screens/Kontakt-XXX.tsx',
  './src/screens/OSBB-Finansy.tsx',
  './src/screens/Spisok-Zayavok.tsx',
  './src/utils/userFacingErrors.ts',
  './src/services/chaykaNewsIntelligence.ts',
  './src/services/chaykaPlacesData.ts',
  './src/screens/OSBB-AdminPanel.tsx',
  './src/components/SoftInviteAccessGate.tsx',
  './src/components/CustomIcons.tsx',
  './src/utils/validationMessages.ts',
  './src/screens/admin/SecurityControlScreen.tsx',
  './src/screens/AuthDiagnosticScreen.tsx',
  './src/utils/textUtils.ts',
];

let totalFixed = 0;
for (const f of files) {
  try {
    const n = fixFile(f);
    if (n > 0) {
      console.log('\n✓ ' + f + ': ' + n + ' рядків виправлено');
      totalFixed += n;
    }
  } catch (e) {
    console.log('✗ Error on ' + f + ': ' + e.message);
  }
}

if (totalFixed === 0) console.log('✓ Нічого не потребувало виправлення');
else console.log('\n━ Всього виправлено: ' + totalFixed + ' рядків');

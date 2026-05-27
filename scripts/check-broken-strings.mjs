import { readFileSync } from 'fs';

function findBrokenStrings(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const problems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;

    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const prev = j > 0 ? line[j - 1] : '';

      // Skip comments
      if (!inSingle && !inDouble && !inTemplate && ch === '/' && line[j + 1] === '/') break;

      if (!inSingle && !inDouble && !inTemplate && ch === '`') { inTemplate = true; continue; }
      if (inTemplate && ch === '`' && prev !== '\\') { inTemplate = false; continue; }
      if (inTemplate) continue;

      if (!inSingle && !inDouble && ch === '"') { inDouble = true; continue; }
      if (!inSingle && !inDouble && ch === "'") { inSingle = true; continue; }

      if (inDouble && ch === '"' && prev !== '\\') { inDouble = false; continue; }

      if (inSingle && ch === "'" && prev !== '\\') {
        inSingle = false;
        const remaining = line.slice(j + 1).trim();
        // If something follows that looks like regular text (identifier chars), it's broken
        if (remaining && /^[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(remaining)) {
          problems.push({ line: i + 1, content: line.trim().slice(0, 110) });
          break;
        }
        continue;
      }
    }
  }
  return problems;
}

const files = [
  './src/screens/Foto-Rayona.tsx',
  './src/components/SoftInviteAccessGate.tsx',
  './src/screens/OSBB-AdminPanel.tsx',
  './src/components/CustomIcons.tsx',
  './src/utils/validationMessages.ts',
  './src/screens/admin/SecurityControlScreen.tsx',
  './src/screens/AuthDiagnosticScreen.tsx',
  './src/screens/OSBB-Setup.tsx',
  './src/screens/Detal-Zayavki.tsx',
  './src/screens/Kontakt-XXX.tsx',
  './src/screens/OSBB-Finansy.tsx',
  './src/screens/Spisok-Zayavok.tsx',
  './src/utils/userFacingErrors.ts',
  './src/utils/textUtils.ts',
  './src/services/chaykaNewsIntelligence.ts',
  './src/services/chaykaPlacesData.ts',
];

let total = 0;
for (const f of files) {
  try {
    const probs = findBrokenStrings(f);
    if (probs.length) {
      console.log('\n' + f + ':');
      probs.forEach(p => console.log('  L' + p.line + ': ' + p.content));
      total += probs.length;
    }
  } catch (e) {
    console.log('Помилка читання ' + f + ': ' + e.message);
  }
}
if (total === 0) console.log('✓ Проблем з лапками не знайдено');
else console.log('\n⚠ Всього проблемних рядків: ' + total);

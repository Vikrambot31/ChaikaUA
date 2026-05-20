const fs = require('fs');

const files = [
  'src/screens/Profil-Polzovatelya.tsx',
  'src/screens/Reyting-Domov.tsx',
  'src/screens/Zapros-Pomoshi.tsx',
  'src/screens/Lyudi-Chayki.tsx',
  'src/screens/Istoriya-Znakomstv.tsx',
  'src/screens/Registraciya-Polnaya.tsx',
  'src/screens/Kuplu-Prodam.tsx',
  'src/screens/Poisk-Raboty.tsx',
  'src/screens/archive/Vibor-Temy-Zayavki-OLD.tsx',
];

// Common mojibake fragments visible in UI when UTF-8/cp1251 got mixed.
const re = /(Р['\u2019]|В©|Р’В©|в|рџ|в­|вЂ|Ѓ|‚|„|…|™)/;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let found = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i])) {
      if (found === 0) {
        console.log(`\n${file}`);
      }
      found += 1;
      console.log(`${String(i + 1).padStart(4, ' ')}: ${lines[i].trim()}`);
    }
  }

  if (found === 0) {
    console.log(`\n${file}\n  (clean by heuristic)`);
  }
}


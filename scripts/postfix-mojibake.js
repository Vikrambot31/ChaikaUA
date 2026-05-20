const fs = require('fs');
const path = require('path');

const root = 'C:/ChaikaUA/mobile-app-short';
const exts = new Set(['.ts', '.tsx']);
const replacements = [
  ['вЂ”', '—'],
  ['вЂ“', '–'],
  ['вЂў', '•'],
  ['вЂє', '›'],
  ['вЂ', '—'],
  ['СЃ', 'с'],
  ['С‚', 'т'],
  ['СЏ', 'я'],
  ['С€', 'ш'],
  ['Р ', 'Р'],
  ['РЎ', 'С'],
  ['Рќ', 'Н'],
  ['Рџ', 'П'],
  ['Р§', 'Ч'],
  ['Chaika Life Life', 'Chaika Life'],
  ['Чайка Life Life', 'Чайка Life'],
];

function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(p))) out.push(p);
  }
  return out;
}

const files = walk(path.join(root, 'src'));
files.push(path.join(root, 'App.tsx'));
let changed = 0;
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const orig = c;
  for (const [a,b] of replacements) c = c.split(a).join(b);
  if (c !== orig) {
    fs.writeFileSync(f, c, 'utf8');
    changed++;
  }
}
console.log('changed', changed);

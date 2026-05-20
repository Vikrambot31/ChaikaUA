const fs = require('fs');
const path = require('path');

const root = process.cwd();
const exts = new Set(['.ts', '.tsx', '.js', '.json']);
const ignoreDirs = new Set(['node_modules', '.git', 'android', 'Info--', 'release', 'assets', 'archive']);
const suspiciousRe = new RegExp(
  [
    'Р[ќўѕ»їєѓґ]',
    'С[џќўѕ»їєѓґ]',
    'в[Ђ—†]',
    '\\?>W74:8',
    '!E>20B8',
    'A8BC0FVW',
    '!:@KBL',
    '0AA:068B5',
    '!;54CNICN',
    '5403C20B8',
    '!\\?@02',
    '\\bWW\\b',
    'РіСЂРЅ',
    'РґРЅ\\.',
  ].join('|'),
  'u'
);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) {
        walk(path.join(dir, entry.name), out);
      }
      continue;
    }

    const file = path.join(dir, entry.name);
    if (exts.has(path.extname(file))) {
      out.push(file);
    }
  }
  return out;
}

const files = walk(path.join(root, 'src'));
files.push(path.join(root, 'package.json'));

const failures = [];

for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('{/*') ||
      trimmed.includes('looksLikeBrokenEncoding')
    ) {
      return;
    }

    if (suspiciousRe.test(line)) {
      failures.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error('Encoding check failed. Suspicious text fragments found:\n');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Encoding check passed');

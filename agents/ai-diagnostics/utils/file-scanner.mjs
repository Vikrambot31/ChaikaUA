import fs from 'fs';
import path from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'android', 'ios', '.expo', '.gradle', 'build', 'dist', '.gradle-user-home', 'WEBP-version']);

const DEFAULT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function scanFiles(rootDir, options = {}) {
  const extensions = options.extensions ? new Set(options.extensions) : DEFAULT_EXTENSIONS;
  const subDirs = options.dirs || ['src', 'admin-panel/src', 'functions'];
  const results = [];

  for (const sub of subDirs) {
    const dir = path.join(rootDir, sub);
    if (!fs.existsSync(dir)) continue;
    walkDir(dir, rootDir, extensions, results);
  }
  return results;
}

function walkDir(dir, rootDir, extensions, results) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkDir(full, rootDir, extensions, results);
    } else if (extensions.has(path.extname(entry.name))) {
      try {
        const content = fs.readFileSync(full, 'utf8');
        results.push({
          filePath: full,
          relativePath: path.relative(rootDir, full).replace(/\\/g, '/'),
          content,
          lines: content.split('\n'),
        });
      } catch { /* skip unreadable */ }
    }
  }
}

export function readFileContent(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}

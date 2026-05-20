const fs = require('fs');
const path = require('path');

const authServicePath = path.join(__dirname, '..', 'src', 'services', 'authService.ts');
const source = fs.readFileSync(authServicePath, 'utf8');

const requiredSnippets = [
  'const FALLBACK_PRIMARY_SERVICE_EMAIL',
  'VITE_ADMIN_SERVICE_EMAIL',
  'export const isPrimaryServiceEmail',
  "if (isPrimaryServiceEmail(user)) {",
  "return 'admin';",
];

const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));

if (missing.length > 0) {
  console.error('Admin access guard check failed.');
  console.error('Missing required authService snippets:');
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('Admin access guard check passed.');

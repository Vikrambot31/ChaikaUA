import { spawn } from 'child_process';

const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === 'string'),
);

const command = 'firebase emulators:exec --only database --project chaika-rules-test "npm test -- --runInBand src/__tests__/firebaseRulesEmulator.test.ts"';
const child = spawn(
  process.platform === 'win32' ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' : 'sh',
  process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-lc', command],
  {
    stdio: 'inherit',
    env: {
      ...env,
      RUN_FIREBASE_EMULATOR_TESTS: '1',
    },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

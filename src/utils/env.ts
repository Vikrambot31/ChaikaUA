/**
 * Environment configuration loader
 * Load environment variables from .env file (dev only)
 */

const loadEnv = (): Record<string, string> => {
  if (__DEV__) {
    try {
      const fs = require('fs');
      const path = require('path');

      const envPath = path.resolve(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const env: Record<string, string> = {};
        envContent.split('\n').forEach((line: string) => {
          const match = line.match(/^(\w+)=([^\\n]*)$/);
          if (match) {
            const [_, key, value] = match;
            env[key] = value.trim();
          }
        });
        return env;
      }
    } catch (e) {
      console.warn('[env] Failed to load .env file:', e);
    }
  }
  return {};
};

export const ENV = loadEnv();

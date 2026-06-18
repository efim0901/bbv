import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const srcDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(srcDir, '..');
const dataDir = join(rootDir, 'data');
const envPath = join(rootDir, '.env');

function loadLocalEnv() {
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"|"$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return value;
}

export const config = {
  rootDir,
  dataDir,
  publicDir: join(rootDir, 'public'),
  uploadDir: join(rootDir, 'public', 'uploads'),
  databaseProvider: process.env.DATABASE_PROVIDER || 'auto',
  dbPath: process.env.MARKETPLACE_DB_PATH || join(dataDir, 'marketplace.sqlite'),
  port: numberFromEnv('PORT', 3000),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  webAppUrl: process.env.WEB_APP_URL || 'http://localhost:3000',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'listing-images'
};

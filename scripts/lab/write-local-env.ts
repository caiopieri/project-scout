// Writes the git-ignored local env files (apps/worker/.dev.vars, apps/web/.env.local) from the
// running local Supabase stack, so `wrangler dev` and `next dev` talk to it. Optional LLM keys
// are copied from the shell environment when present. Usage:
//   npx vite-node scripts/lab/write-local-env.ts
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { readLocalSupabase } from './local-env';

const supabase = readLocalSupabase();
const optional = (name: string, ...aliases: string[]) => {
  const value = [name, ...aliases].map((key) => process.env[key]).find(Boolean);
  return value ? [`${name}=${value}`] : [];
};

writeFileSync(
  'apps/worker/.dev.vars',
  [
    `SUPABASE_URL=${supabase.apiUrl}`,
    `SUPABASE_ANON_KEY=${supabase.anonKey}`,
    `SUPABASE_SERVICE_ROLE_KEY=${supabase.serviceRoleKey}`,
    'WEB_ORIGIN=http://localhost:3000',
    'PUBLIC_API_ENABLED=true',
    // Lab-only key for pseudonymous raw-store prefixes; regenerated on every run.
    `EBAY_IDENTITY_HASH_SECRET=${randomBytes(24).toString('hex')}`,
    ...optional('GEMINI_API_KEY', 'GOOGLE_API_KEY'),
    ...optional('GROQ_API_KEY', 'GROQ_API'),
    ...optional('CEREBRAS_API_KEY', 'CEREBRAS1_API'),
    ...optional('OPENROUTER_API_KEY', 'OPENROUTER_API'),
    '',
  ].join('\n'),
  { mode: 0o600 },
);
writeFileSync(
  'apps/web/.env.local',
  [
    `NEXT_PUBLIC_SUPABASE_URL=${supabase.apiUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabase.anonKey}`,
    'NEXT_PUBLIC_API_URL=http://localhost:8787',
    '',
  ].join('\n'),
  { mode: 0o600 },
);
console.log('Wrote apps/worker/.dev.vars and apps/web/.env.local (both git-ignored).');

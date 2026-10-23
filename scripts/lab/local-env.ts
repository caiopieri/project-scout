// Lab harness: drives the real Worker in-process against the local Supabase stack.
// Evidence produced with it is "local integration", never "live".
import { execFileSync } from 'node:child_process';
import worker from '../../apps/worker/src/index';

export interface LocalSupabase {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
}

export const readLocalSupabase = (): LocalSupabase => {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' });
  const values = Object.fromEntries(
    output
      .split('\n')
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );
  for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL'])
    if (!values[key]) throw new Error(`Local Supabase is not running (missing ${key}).`);
  return {
    apiUrl: values.API_URL,
    anonKey: values.ANON_KEY,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
    dbUrl: values.DB_URL,
  };
};

export const ensureUser = async (supabase: LocalSupabase, email: string, password: string) => {
  await fetch(`${supabase.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: supabase.serviceRoleKey,
      Authorization: `Bearer ${supabase.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const response = await fetch(`${supabase.apiUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabase.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Local sign-in failed (${response.status}).`);
  const body = (await response.json()) as { access_token: string; user: { id: string } };
  return { accessToken: body.access_token, userId: body.user.id };
};

export const workerEnv = (supabase: LocalSupabase, overrides: Record<string, unknown> = {}) =>
  ({
    SUPABASE_URL: supabase.apiUrl,
    SUPABASE_ANON_KEY: supabase.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
    WEB_ORIGIN: 'http://localhost:3000',
    PUBLIC_API_ENABLED: 'true',
    ...overrides,
  }) as never;

export const callWorker = async (
  env: never,
  accessToken: string,
  path: string,
  init: RequestInit = {},
) => {
  const response = await worker.fetch(
    new Request(`http://worker.local${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    }),
    env,
    {} as never,
  );
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON bodies are returned as text.
  }
  return { status: response.status, body };
};

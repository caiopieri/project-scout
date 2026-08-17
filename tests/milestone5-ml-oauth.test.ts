import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMercadoLivreAuthorizationUrl,
  exchangeMercadoLivreAuthorizationCode,
} from '@scout/ml-connector';
import {
  mercadoLivreSetupInputSchema,
  updateMercadoLivreDevVars,
  writeDevVarsAtomically,
} from '../packages/ml-connector/src/setup-config';
import { GET as callback } from '../apps/web/src/app/oauth/mercadolivre/callback/route';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('Mercado Livre OAuth bootstrap', () => {
  it('builds an exact authorization URL without adding untrusted redirect targets', () => {
    const url = buildMercadoLivreAuthorizationUrl({
      clientId: 'client-id-123456',
      redirectUri: 'https://eletrofy.com.br/oauth/mercadolivre/callback',
      state: 'state-123',
      codeChallenge: 'challenge-123456',
    });
    expect(url.origin + url.pathname).toBe('https://auth.mercadolivre.com.br/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://eletrofy.com.br/oauth/mercadolivre/callback',
    );
    expect(url.searchParams.get('code_challenge')).toBe('challenge-123456');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(() =>
      buildMercadoLivreAuthorizationUrl({
        clientId: 'client-id-123456',
        redirectUri: 'http://attacker.test/callback',
        state: 'state-123',
        codeChallenge: 'challenge-123456',
      }),
    ).toThrow('https');
  });

  it('exchanges authorization code and requires a refresh token', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(String(init?.body)).toContain('grant_type=authorization_code');
      expect(String(init?.body)).toContain('code=one-time-code');
      expect(String(init?.body)).toContain('code_verifier=verifier-123456');
      return Response.json({
        access_token: 'access-token-123456',
        refresh_token: 'refresh-token-123456',
        expires_in: 21600,
        token_type: 'bearer',
      });
    });
    const token = await exchangeMercadoLivreAuthorizationCode(
      {
        clientId: 'client-id-123456',
        clientSecret: 'client-secret-123456',
        code: 'one-time-code',
        redirectUri: 'https://eletrofy.com.br/oauth/mercadolivre/callback',
        codeVerifier: 'verifier-123456',
      },
      { fetch: fetcher },
    );
    expect(token.refresh_token).toBe('refresh-token-123456');
    expect(fetcher).toHaveBeenCalledOnce();

    const incomplete = vi.fn(async () => Response.json({ access_token: 'access-token-123456' }));
    await expect(
      exchangeMercadoLivreAuthorizationCode(
        {
          clientId: 'client-id-123456',
          clientSecret: 'client-secret-123456',
          code: 'one-time-code',
          redirectUri: 'https://eletrofy.com.br/oauth/mercadolivre/callback',
          codeVerifier: 'verifier-123456',
        },
        { fetch: incomplete },
      ),
    ).rejects.toMatchObject({ code: 'ML_OAUTH_INVALID_RESPONSE' });
  });

  it('keeps OAuth callback output token-free and rejects missing parameters', () => {
    const valid = callback(
      new Request(
        'https://eletrofy.com.br/oauth/mercadolivre/callback?code=one-time-code&state=state-123',
      ),
    );
    const invalid = callback(
      new Request('https://eletrofy.com.br/oauth/mercadolivre/callback?code=one-time-code'),
    );
    expect(valid.status).toBe(200);
    expect(invalid.status).toBe(400);
  });

  it('updates only managed local variables and writes owner-only files atomically', async () => {
    const input = mercadoLivreSetupInputSchema.parse({
      clientId: 'client-id-123456',
      clientSecret: 'client-secret-123456',
      accessToken: 'access-token-123456',
      refreshToken: 'refresh-token-123456',
    });
    const content = updateMercadoLivreDevVars(
      'SUPABASE_URL="http://supabase.local"\nML_CONNECTOR_MODE="unavailable"\n',
      input,
    );
    expect(content).toContain('SUPABASE_URL="http://supabase.local"');
    expect(content).toContain('ML_CONNECTOR_MODE="production"');
    expect(content.match(/ML_REFRESH_TOKEN=/g)).toHaveLength(1);

    const directory = await mkdtemp(join(tmpdir(), 'scout-ml-oauth-'));
    temporaryDirectories.push(directory);
    const target = join(directory, '.dev.vars');
    await writeFile(target, 'OLD=true\n', 'utf8');
    await writeDevVarsAtomically(target, content);
    expect(await readFile(target, 'utf8')).toBe(content);
    expect((await stat(target)).mode & 0o777).toBe(0o600);
    await chmod(target, 0o600);
  });
});

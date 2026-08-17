import { ConnectorError } from '@scout/domain';
import { mercadoLivreOAuthTokenSchema, type MercadoLivreOAuthToken } from './api-schemas';

export const MERCADO_LIVRE_AUTHORIZATION_URL = 'https://auth.mercadolivre.com.br/authorization';
export const MERCADO_LIVRE_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';

export interface MercadoLivreOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
}

export type MercadoLivreOAuthFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const defaultFetch: MercadoLivreOAuthFetch = (input, init) => globalThis.fetch(input, init);

const validateHttpsUrl = (value: string, field: string): string => {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error(`${field} must use https.`);
  return url.toString();
};

export const buildMercadoLivreAuthorizationUrl = (input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): URL => {
  const clientId = input.clientId.trim();
  const state = input.state.trim();
  const codeChallenge = input.codeChallenge.trim();
  if (!clientId || !state || !codeChallenge)
    throw new Error('Mercado Livre OAuth client ID, state and PKCE challenge are required.');
  const redirectUri = validateHttpsUrl(input.redirectUri, 'Mercado Livre redirect URI');
  const url = new URL(MERCADO_LIVRE_AUTHORIZATION_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url;
};

export const exchangeMercadoLivreAuthorizationCode = async (
  input: MercadoLivreOAuthConfig & { code: string },
  dependencies: { fetch?: MercadoLivreOAuthFetch } = {},
): Promise<MercadoLivreOAuthToken> => {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const code = input.code.trim();
  const codeVerifier = input.codeVerifier.trim();
  if (!clientId || !clientSecret || !code || !codeVerifier)
    throw new ConnectorError(
      'Mercado Livre OAuth authorization code is incomplete.',
      'permanent',
      'ML_OAUTH_INPUT_INVALID',
    );
  const redirectUri = validateHttpsUrl(input.redirectUri, 'Mercado Livre redirect URI');
  const fetcher = dependencies.fetch ?? defaultFetch;
  const response = await fetcher(MERCADO_LIVRE_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok)
    throw new ConnectorError(
      'Mercado Livre rejected the OAuth authorization code.',
      'permanent',
      'ML_OAUTH_CODE_REJECTED',
    );
  const token = mercadoLivreOAuthTokenSchema.safeParse(raw);
  if (!token.success || !token.data.refresh_token)
    throw new ConnectorError(
      'Mercado Livre OAuth returned an incomplete token payload.',
      'permanent',
      'ML_OAUTH_INVALID_RESPONSE',
    );
  return token.data;
};

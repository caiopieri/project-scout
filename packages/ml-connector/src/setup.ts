import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exchangeMercadoLivreAuthorizationCode, buildMercadoLivreAuthorizationUrl } from './oauth';
import {
  browserLaunchCommand,
  gitignoreProtectsDevVars,
  mercadoLivreSetupInputSchema,
  readOptionalTextFile,
  updateMercadoLivreDevVars,
  writeDevVarsAtomically,
} from './setup-config';

const REDIRECT_URI = 'https://eletrofy.com.br/oauth/mercadolivre/callback';

const ask = async (question: string): Promise<string> => {
  const terminal = createInterface({ input, output });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
};

const askHidden = async (question: string): Promise<string> => {
  if (!input.isTTY || !output.isTTY || !input.setRawMode)
    throw new Error('A secure interactive terminal is required to enter the Client Secret.');
  output.write(question);
  input.setEncoding('utf8');
  input.setRawMode(true);
  input.resume();
  return new Promise<string>((resolveSecret, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolveSecret(value);
    };
    const onData = (chunk: string | Buffer) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') return finish(new Error('Setup cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    };
    input.on('data', onData);
  });
};

const openBrowser = (url: string) => {
  const launch = browserLaunchCommand(process.platform, url);
  const child = spawn(launch.command, launch.args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Abra manualmente: ${url}`));
  child.unref();
};

const sameSecret = (expected: string, actual: string) => {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
};

const base64Url = (value: Buffer) => value.toString('base64url');

const parseCallbackUrl = (raw: string, state: string) => {
  const callback = new URL(raw.trim());
  const configured = new URL(REDIRECT_URI);
  if (callback.origin !== configured.origin || callback.pathname !== configured.pathname)
    throw new Error('A URL colada não é o callback oficial configurado.');
  const error = callback.searchParams.get('error');
  if (error) throw new Error(`Mercado Livre recusou a autorização (${error}).`);
  const returnedState = callback.searchParams.get('state');
  const code = callback.searchParams.get('code');
  if (!returnedState || !code || !sameSecret(state, returnedState))
    throw new Error('Callback OAuth inválido ou state não confere.');
  return code;
};

const main = async () => {
  if (!input.isTTY || !output.isTTY) throw new Error('Execute ml:setup em um terminal interativo.');
  console.log('Configuração local do Mercado Livre — tokens não serão exibidos.');
  const clientId =
    (await ask('App ID / Client ID (7771264507025824): ')).trim() || '7771264507025824';
  const clientSecret = await askHidden('Chave secreta (oculta): ');
  const state = randomBytes(32).toString('hex');
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  const authorizationUrl = buildMercadoLivreAuthorizationUrl({
    clientId,
    redirectUri: REDIRECT_URI,
    state,
    codeChallenge,
  });
  console.log('Abrindo autorização do Mercado Livre...');
  openBrowser(authorizationUrl.toString());
  const callbackUrl = await ask('Depois de autorizar, cole aqui a URL completa do callback: ');
  const code = parseCallbackUrl(callbackUrl, state);
  const token = await exchangeMercadoLivreAuthorizationCode({
    clientId,
    clientSecret,
    code,
    redirectUri: REDIRECT_URI,
    codeVerifier,
  });
  const inputValues = mercadoLivreSetupInputSchema.parse({
    clientId,
    clientSecret,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
  });
  const repositoryRoot = process.cwd();
  const targetPath = resolve(repositoryRoot, 'apps', 'worker', '.dev.vars');
  const gitignore = await readOptionalTextFile(resolve(repositoryRoot, '.gitignore'));
  if (!gitignoreProtectsDevVars(gitignore))
    throw new Error('apps/worker/.dev.vars não está protegido pelo .gitignore; setup abortado.');
  const current = await readOptionalTextFile(targetPath);
  await writeDevVarsAtomically(targetPath, updateMercadoLivreDevVars(current, inputValues));
  console.log('Mercado Livre configurado em apps/worker/.dev.vars com permissão 0600.');
};

void main().catch((error: unknown) => {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
  const message = error instanceof Error ? error.message : 'Erro desconhecido.';
  if (message === 'Setup cancelled.') console.error(message);
  else console.error(`Configuração do Mercado Livre falhou${code ? ` [${code}]` : ''}: ${message}`);
  process.exitCode = 1;
});

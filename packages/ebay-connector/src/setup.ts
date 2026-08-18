import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ConnectorError } from '@scout/domain';
import {
  browserLaunchCommand,
  ebaySetupInputSchema,
  gitignoreProtectsDevVars,
  readOptionalTextFile,
  updateDevVars,
  writeDevVarsAtomically,
} from './setup-config';
import { runEbayConnectionSmoke } from './smoke-check';

const APPLICATION_KEYS_URL = 'https://developer.ebay.com/my/keys';

const ask = async (question: string): Promise<string> => {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
};

const askHidden = async (question: string): Promise<string> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('A secure interactive terminal is required to enter the Client Secret.');
  }
  process.stdout.write(question);
  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolveSecret, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
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
    process.stdin.on('data', onData);
  });
};

const openApplicationKeys = () => {
  const launch = browserLaunchCommand(process.platform, APPLICATION_KEYS_URL);
  const child = spawn(launch.command, launch.args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log(`Abra manualmente: ${APPLICATION_KEYS_URL}`));
  child.unref();
};

const isYes = (answer: string, defaultValue: boolean) => {
  const normalized = answer.trim().toLocaleLowerCase('pt-BR');
  if (!normalized) return defaultValue;
  return normalized === 's' || normalized === 'sim' || normalized === 'y' || normalized === 'yes';
};

const main = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Run ebay:setup in an interactive terminal.');
  console.log(
    'Configuração local do eBay — as credenciais não serão exibidas nem enviadas ao frontend.',
  );
  if (isYes(await ask('Abrir a página oficial de Application Keys? [S/n] '), true))
    openApplicationKeys();

  const rawEnvironment =
    (await ask('Ambiente [sandbox/production] (sandbox): ')).trim() || 'sandbox';
  const clientId = (await ask('App ID / Client ID: ')).trim();
  const clientSecret = await askHidden('Cert ID / Client Secret (oculto): ');
  const browseBudget = Number((await ask('Orçamento Browse por execução: ')).trim());
  const input = ebaySetupInputSchema.parse({
    environment: rawEnvironment,
    clientId,
    clientSecret,
    browseBudget,
  });

  const repositoryRoot = process.cwd();
  const targetPath = resolve(repositoryRoot, 'apps', 'worker', '.dev.vars');
  const gitignore = await readOptionalTextFile(resolve(repositoryRoot, '.gitignore'));
  if (!gitignoreProtectsDevVars(gitignore)) {
    throw new Error('apps/worker/.dev.vars is not protected by .gitignore; setup aborted.');
  }
  const current = await readOptionalTextFile(targetPath);
  await writeDevVarsAtomically(targetPath, updateDevVars(current, input));
  console.log('Credenciais salvas em apps/worker/.dev.vars com permissão 0600.');

  if (isYes(await ask('Testar OAuth e uma busca agora? [S/n] '), true)) {
    try {
      const smoke = await runEbayConnectionSmoke({
        environment: input.environment,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        maxBrowseRequests: input.browseBudget,
      });
      console.log(
        `Conexão válida: provider=${smoke.provider} marketplace=${smoke.marketplaceId} items=${smoke.itemCount}`,
      );
    } catch (error) {
      console.error(
        error instanceof ConnectorError
          ? `Falha do eBay: ${error.code}`
          : 'Falha inesperada no smoke test.',
      );
      console.log(
        'As credenciais locais foram preservadas; corrija-as ou execute npm run ebay:setup novamente.',
      );
      process.exitCode = 1;
    }
  }
};

void main().catch((error: unknown) => {
  const message =
    error instanceof ConnectorError
      ? `Falha do eBay: ${error.code}`
      : error instanceof Error && error.message === 'Setup cancelled.'
        ? error.message
        : 'Configuração falhou. Revise os dados e tente novamente.';
  console.error(message);
  process.exitCode = 1;
});

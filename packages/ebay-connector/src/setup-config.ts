import { randomUUID } from 'node:crypto';
import { chmod, lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { z } from 'zod';

const containsWhitespaceOrControl = (value: string) =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /\s/u.test(character) || codePoint < 32 || codePoint === 127;
  });

const credentialSchema = (maximum: number) =>
  z
    .string()
    .min(8)
    .max(maximum)
    .refine(
      (value) => !containsWhitespaceOrControl(value),
      'Credential cannot contain whitespace or control characters.',
    );

export const ebaySetupInputSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
  clientId: credentialSchema(256),
  clientSecret: credentialSchema(512),
});
export type EbaySetupInput = z.infer<typeof ebaySetupInputSchema>;

const managedKeys = [
  'EBAY_CONNECTOR_MODE',
  'EBAY_MARKETPLACE_ID',
  'EBAY_APP_ID_CLIENT_ID',
  'EBAY_CERT_ID_CLIENT_SECRET',
] as const;

const quoteDotenv = (value: string) => JSON.stringify(value);

export const updateDevVars = (current: string, rawInput: EbaySetupInput): string => {
  const input = ebaySetupInputSchema.parse(rawInput);
  const updates = new Map<string, string>([
    ['EBAY_CONNECTOR_MODE', input.environment],
    ['EBAY_MARKETPLACE_ID', 'EBAY_US'],
    ['EBAY_APP_ID_CLIENT_ID', input.clientId],
    ['EBAY_CERT_ID_CLIENT_SECRET', input.clientSecret],
  ]);
  const seen = new Set<string>();
  const lines = current
    .split(/\r?\n/)
    .filter((line) => {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (!match || !updates.has(match[1])) return true;
      if (seen.has(match[1])) return false;
      seen.add(match[1]);
      return true;
    })
    .map((line) => {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      const key = match?.[1];
      return key && updates.has(key) ? `${key}=${quoteDotenv(updates.get(key)!)}` : line;
    });

  if (lines.at(-1) === '') lines.pop();
  if (lines.length > 0) lines.push('');
  for (const key of managedKeys) {
    if (!seen.has(key)) lines.push(`${key}=${quoteDotenv(updates.get(key)!)}`);
  }
  return `${lines.join('\n')}\n`;
};

export const gitignoreProtectsDevVars = (gitignore: string): boolean =>
  gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === '.dev.vars' || line === 'apps/worker/.dev.vars');

export const writeDevVarsAtomically = async (
  targetPath: string,
  content: string,
): Promise<void> => {
  const existing = await lstat(targetPath).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing?.isSymbolicLink())
    throw new Error('Refusing to replace a symbolic-link .dev.vars file.');

  const temporaryPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, targetPath);
    await chmod(targetPath, 0o600);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

export const readOptionalTextFile = async (path: string): Promise<string> =>
  readFile(path, 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  });

export const browserLaunchCommand = (platform: NodeJS.Platform, url: string) => {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
};

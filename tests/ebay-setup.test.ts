import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  browserLaunchCommand,
  ebaySetupInputSchema,
  gitignoreProtectsDevVars,
  updateDevVars,
  writeDevVarsAtomically,
} from '@scout/ebay-connector/setup-config';

const temporaryDirectories: string[] = [];
const input = {
  environment: 'sandbox' as const,
  clientId: 'fixture-client-id-not-real',
  clientSecret: 'fixture-client-secret-not-real',
  browseBudget: 250,
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('eBay local setup assistant', () => {
  it('preserves unrelated configuration and replaces each managed key exactly once', () => {
    const result = updateDevVars(
      [
        '# existing worker config',
        'SUPABASE_URL="http://127.0.0.1:54321"',
        'EBAY_CONNECTOR_MODE="mock"',
        'EBAY_APP_ID_CLIENT_ID="old-client"',
        'EBAY_APP_ID_CLIENT_ID="duplicate-client"',
        '',
      ].join('\n'),
      input,
    );
    expect(result).toContain('SUPABASE_URL="http://127.0.0.1:54321"');
    expect(result).toContain('EBAY_CONNECTOR_MODE="sandbox"');
    expect(result).toContain('EBAY_MARKETPLACE_ID="EBAY_US"');
    expect(result).toContain('EBAY_CERT_ID_CLIENT_SECRET="fixture-client-secret-not-real"');
    expect(result).toContain('EBAY_BROWSE_BUDGET_PER_RUN="250"');
    expect(result.match(/EBAY_APP_ID_CLIENT_ID=/g)).toHaveLength(1);
    expect(result).not.toContain('old-client');
    expect(result).not.toContain('duplicate-client');
  });

  it('rejects whitespace, control characters and unsupported environments', () => {
    expect(
      ebaySetupInputSchema.safeParse({ ...input, clientSecret: 'bad secret value' }).success,
    ).toBe(false);
    expect(ebaySetupInputSchema.safeParse({ ...input, clientSecret: 'bad\nsecret' }).success).toBe(
      false,
    );
    expect(ebaySetupInputSchema.safeParse({ ...input, environment: 'mock' }).success).toBe(false);
  });

  it('requires an explicit gitignore rule for the secret file', () => {
    expect(gitignoreProtectsDevVars('node_modules\napps/worker/.dev.vars\n')).toBe(true);
    expect(gitignoreProtectsDevVars('.dev.vars\n')).toBe(true);
    expect(gitignoreProtectsDevVars('node_modules\n')).toBe(false);
  });

  it('selects fixed browser commands without interpolating shell input', () => {
    const url = 'https://developer.ebay.com/my/keys';
    expect(browserLaunchCommand('darwin', url)).toEqual({ command: 'open', args: [url] });
    expect(browserLaunchCommand('linux', url)).toEqual({ command: 'xdg-open', args: [url] });
    expect(browserLaunchCommand('win32', url)).toEqual({
      command: 'cmd.exe',
      args: ['/c', 'start', '', url],
    });
  });

  it('writes atomically with owner-only permissions and leaves no temporary file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'scout-ebay-setup-'));
    temporaryDirectories.push(directory);
    const target = join(directory, '.dev.vars');
    await writeDevVarsAtomically(target, 'EBAY_CONNECTOR_MODE="sandbox"\n');
    expect(await readFile(target, 'utf8')).toBe('EBAY_CONNECTOR_MODE="sandbox"\n');
    expect((await stat(target)).mode & 0o777).toBe(0o600);
    expect(await readdir(directory)).toEqual(['.dev.vars']);
  });

  it('refuses to replace a symbolic-link credential file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'scout-ebay-setup-'));
    temporaryDirectories.push(directory);
    const realFile = join(directory, 'real.vars');
    const target = join(directory, '.dev.vars');
    await writeFile(realFile, 'SAFE=true\n', 'utf8');
    await symlink(realFile, target);
    await expect(writeDevVarsAtomically(target, 'SECRET=not-written\n')).rejects.toThrow(
      'symbolic-link',
    );
    expect(await readFile(realFile, 'utf8')).toBe('SAFE=true\n');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const wranglerConfig = readFileSync(resolve(process.cwd(), 'apps/worker/wrangler.toml'), 'utf8');

const consumerBlock = (queueName: string, production = false) => {
  const section = production ? '[[env.production.queues.consumers]]' : '[[queues.consumers]]';
  const marker = `${section}\nqueue = "${queueName}"`;
  const start = wranglerConfig.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = wranglerConfig.indexOf('[[', start + marker.length);
  return wranglerConfig.slice(start, end === -1 ? undefined : end);
};

describe('Cloudflare Queue failure routing', () => {
  it('routes collection and analysis retries to explicit dead-letter queues', () => {
    expect(consumerBlock('ebay-collect-queue')).toContain('dead_letter_queue = "ebay-collect-dlq"');
    expect(consumerBlock('analysis-queue')).toContain('dead_letter_queue = "analysis-dlq"');
    expect(consumerBlock('project-scout-ebay-collect-prod', true)).toContain(
      'dead_letter_queue = "project-scout-ebay-collect-dlq-prod"',
    );
  });

  it('does not retain account identifiers in a new deletion DLQ yet', () => {
    expect(consumerBlock('ebay-account-deletion-queue')).not.toContain('dead_letter_queue');
    expect(consumerBlock('project-scout-ebay-account-deletion-prod', true)).not.toContain(
      'dead_letter_queue',
    );
  });
});

import { ConnectorError, type SourceConnector } from '@scout/domain';
import {
  rawListingRecordSchema,
  researchCriteriaSchema,
  type RawListingRecord,
} from '@scout/schemas';
import { SwappaConnector } from '@scout/swappa-connector';
import { BrowserScrapingProvider } from './BrowserScrapingProvider';

/**
 * Scout Local Agent. Pulls tasks from the API with its own token (it never listens on a port),
 * runs them with the browser profile of the person at this machine, and returns extracted
 * records. Usage:
 *   SCOUT_API=http://127.0.0.1:8787 SCOUT_AGENT_TOKEN=... SCOUT_PROFILE_DIR=~/.scout-profile \
 *   SCOUT_SOURCE_BASE_SWAPPA=http://127.0.0.1:8098 npm start --workspace @scout/local-agent -- --once
 */
const SWAPPA_SOURCE_ID = '00000000-0000-4000-a000-000000000004';

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const connectorFor = (sourceId: string, browser: BrowserScrapingProvider): SourceConnector => {
  if (sourceId === SWAPPA_SOURCE_ID) {
    const base = process.env.SCOUT_SOURCE_BASE_SWAPPA;
    // Live Swappa stays refused by its manifest; a loopback base runs the recorded/fixture site.
    return new SwappaConnector(browser, base ? 'fixture' : 'live', base);
  }
  throw new ConnectorError(
    'This agent has no connector for the source.',
    'permanent',
    'SOURCE_UNSUPPORTED',
  );
};

const api = async (path: string, body?: unknown) => {
  const response = await fetch(`${env('SCOUT_API')}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Agent ${env('SCOUT_AGENT_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(`API ${path} answered ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};

export const runOnce = async (browser: BrowserScrapingProvider) => {
  const { task } = (await api('/api/local-agent/claim')) as {
    task: { id: string; sourceId: string; payload: { criteria: unknown } } | null;
  };
  if (!task) return null;
  try {
    const connector = connectorFor(task.sourceId, browser);
    const criteria = researchCriteriaSchema.parse(task.payload.criteria);
    const page = await connector.search({ criteria, limit: connector.manifest.limits.pageSize });
    const records: RawListingRecord[] = [];
    for (const preview of page.items)
      records.push(rawListingRecordSchema.parse(await connector.fetchDetails(preview.externalId)));
    const result = await api(`/api/local-agent/tasks/${task.id}/result`, {
      status: 'completed',
      records,
    });
    return { taskId: task.id, sent: records.length, result };
  } catch (error) {
    const errorCode = error instanceof ConnectorError ? error.code : 'LOCAL_AGENT_ERROR';
    await api(`/api/local-agent/tasks/${task.id}/result`, { status: 'failed', errorCode });
    return { taskId: task.id, failed: errorCode };
  }
};

const main = async () => {
  const browser = new BrowserScrapingProvider(
    env('SCOUT_PROFILE_DIR'),
    Number(process.env.SCOUT_MIN_INTERVAL_MS ?? 8000),
  );
  try {
    const once = process.argv.includes('--once');
    let running = true;
    while (running) {
      const outcome = await runOnce(browser);
      console.log(JSON.stringify(outcome ?? { idle: true }));
      running = !once;
      if (running) await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  } finally {
    await browser.close();
  }
};

if (process.argv[1]?.endsWith('index.ts')) void main();

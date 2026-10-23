// Calls GET /api/projects/:projectId/listings through the real Worker and summarizes the
// reference-discount outcome. Usage: npx vite-node scripts/lab/inspect-listings.ts <projectId>
import { callWorker, ensureUser, readLocalSupabase, workerEnv } from './local-env';

const main = async () => {
  const projectId = process.argv[2];
  if (!projectId) throw new Error('Usage: inspect-listings.ts <projectId>');
  const supabase = readLocalSupabase();
  const { accessToken } = await ensureUser(supabase, 'lab@scout.local', 'lab-password-123');
  const { status, body } = await callWorker(
    workerEnv(supabase),
    accessToken,
    `/api/projects/${projectId}/listings`,
  );
  if (status !== 200) throw new Error(`Listings route returned ${status}: ${JSON.stringify(body)}`);
  const listings = body as Array<{
    title: string;
    referenceDiscount?: {
      status: string;
      reasons?: string[];
      discountMinor?: number;
      discountBasisPoints?: number;
      referenceMedianMinor?: number;
      landedCostMinor?: number;
      sample?: { nRaw: number; selfObservationsExcluded: number } | null;
    };
  }>;
  const refusals: Record<string, number> = {};
  for (const listing of listings)
    if (listing.referenceDiscount?.status === 'NAO_RANQUEAVEL') {
      const key = (listing.referenceDiscount.reasons ?? []).join('+');
      refusals[key] = (refusals[key] ?? 0) + 1;
    }
  const known = listings.filter((listing) => listing.referenceDiscount?.status === 'known');
  console.log(
    JSON.stringify(
      {
        status,
        total: listings.length,
        known: known.length,
        refused: listings.length - known.length,
        refusals,
        sampleKnown: known
          .slice(0, 3)
          .map((listing) => ({ title: listing.title, ...listing.referenceDiscount })),
      },
      null,
      2,
    ),
  );
};

void main();

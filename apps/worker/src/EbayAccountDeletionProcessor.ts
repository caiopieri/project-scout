import { SupabaseRestEbayDeletionRepository } from '@scout/database/ebay-deletion';
import { ebayAccountDeletionTaskSchema } from '@scout/schemas';
import type { Env } from './env';
import { ebaySellerRawPrefix } from './R2RawListingObjectStore';

const deleteObjects = async (bucket: R2Bucket, keys: string[]) => {
  for (let offset = 0; offset < keys.length; offset += 100)
    await bucket.delete(keys.slice(offset, offset + 100));
};

const deleteRawSellerPrefixes = async (
  bucket: R2Bucket,
  identifiers: string[],
  identityHashSecret: string,
) => {
  for (const identifier of new Set(identifiers)) {
    const prefix = await ebaySellerRawPrefix(identifier, identityHashSecret);
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix, cursor, limit: 1000 });
      await deleteObjects(
        bucket,
        page.objects.map((object) => object.key),
      );
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
};

export async function processEbayAccountDeletionTask(rawTask: unknown, env: Env): Promise<void> {
  const task = ebayAccountDeletionTaskSchema.parse(rawTask);
  const repository = new SupabaseRestEbayDeletionRepository({
    baseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const preparation = await repository.prepare(task);
  if (preparation.alreadyCompleted) return;
  await deleteRawSellerPrefixes(
    env.RAW_BUCKET,
    [task.username, task.userId, task.eiasToken].filter((value): value is string => Boolean(value)),
    env.EBAY_IDENTITY_HASH_SECRET ?? '',
  );
  await deleteObjects(env.RAW_BUCKET, preparation.rawObjectKeys);
  await deleteObjects(env.IMAGE_BUCKET, preparation.imageObjectKeys);
  await repository.finalize(task);
}

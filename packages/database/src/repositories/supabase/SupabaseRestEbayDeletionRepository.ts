import {
  ebayAccountDeletionFinalizationRowSchema,
  ebayAccountDeletionPreparationRowSchema,
  ebayAccountDeletionPreparationSchema,
  ebayAccountDeletionTaskSchema,
  type EbayAccountDeletionTask,
} from '@scout/schemas';

interface Config {
  baseUrl: string;
  serviceRoleKey: string;
}

export class SupabaseRestEbayDeletionRepository {
  constructor(private readonly config: Config) {}

  async prepare(rawTask: EbayAccountDeletionTask) {
    const task = ebayAccountDeletionTaskSchema.parse(rawTask);
    const rows = await this.rpc('prepare_ebay_account_deletion', task);
    const row = ebayAccountDeletionPreparationRowSchema.parse(rows[0]);
    return ebayAccountDeletionPreparationSchema.parse({
      alreadyCompleted: row.already_completed,
      rawObjectKeys: row.raw_object_keys,
      imageObjectKeys: row.image_object_keys,
      matchedSellers: row.matched_sellers,
      matchedListings: row.matched_listings,
    });
  }

  async finalize(rawTask: EbayAccountDeletionTask): Promise<void> {
    const task = ebayAccountDeletionTaskSchema.parse(rawTask);
    const rows = await this.rpc('finalize_ebay_account_deletion', task);
    ebayAccountDeletionFinalizationRowSchema.parse(rows[0]);
  }

  private async rpc(name: string, task: EbayAccountDeletionTask): Promise<unknown[]> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: this.config.serviceRoleKey,
        Authorization: `Bearer ${this.config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_notification_id: task.notificationId,
        p_username: task.username ?? null,
        p_user_id: task.userId ?? null,
        p_eias_token: task.eiasToken ?? null,
      }),
    });
    if (!response.ok) throw new Error(`eBay deletion RPC ${name} failed.`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length !== 1)
      throw new Error(`eBay deletion RPC ${name} returned an invalid result.`);
    return rows;
  }
}

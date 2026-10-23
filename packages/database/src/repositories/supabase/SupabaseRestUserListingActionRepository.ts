import {
  listingUserActionSchema,
  type ListingUserAction,
  type ListingUserActionUpdate,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface ActionRow {
  listing_id: string;
  favorite: boolean;
  label: ListingUserAction['label'];
  decision: ListingUserAction['decision'];
  notes: string | null;
  updated_at: string;
}

const select = 'listing_id,favorite,label,decision,notes,updated_at';

const toAction = (row: ActionRow): ListingUserAction =>
  listingUserActionSchema.parse({
    favorite: row.favorite,
    label: row.label,
    decision: row.decision,
    notes: row.notes,
    updatedAt: row.updated_at,
  });

/** Heart, triage label and decision per (user, listing). RLS restricts rows to the owner. */
export class SupabaseRestUserListingActionRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async findByListingIds(userId: string, listingIds: string[]) {
    const actions = new Map<string, ListingUserAction>();
    for (let offset = 0; offset < listingIds.length; offset += 50) {
      const ids = listingIds.slice(offset, offset + 50);
      const rows = await this.request<ActionRow[]>(
        `user_listing_actions?user_id=eq.${encodeURIComponent(userId)}&listing_id=in.(${ids.join(',')})&select=${select}`,
      );
      for (const row of rows) actions.set(row.listing_id, toAction(row));
    }
    return actions;
  }

  async upsert(userId: string, listingId: string, update: ListingUserActionUpdate) {
    const body: Record<string, unknown> = {
      user_id: userId,
      listing_id: listingId,
      updated_at: new Date().toISOString(),
    };
    if (update.favorite !== undefined) body.favorite = update.favorite;
    if (update.label !== undefined) body.label = update.label;
    if (update.decision !== undefined) body.decision = update.decision;
    if (update.notes !== undefined) body.notes = update.notes;
    const rows = await this.request<ActionRow[]>(
      `user_listing_actions?on_conflict=user_id,listing_id&select=${select}`,
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(body),
      },
    );
    if (!rows[0]) throw new Error('User listing action was not persisted.');
    return toAction(rows[0]);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (response.status === 401 || response.status === 403)
      throw new Error('User listing action is not allowed for this listing.');
    if (!response.ok) throw new Error(`Supabase user action request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}

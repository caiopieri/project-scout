import { UserListingAction, UserListingActionRepository } from '@scout/domain';
import { SqlExecutor } from '../../sql/SqlExecutor';

export class PgUserListingActionRepository implements UserListingActionRepository {
  constructor(private sql: SqlExecutor) {}

  async setAction(
    action: Omit<UserListingAction, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): Promise<UserListingAction> {
    const res = await this.sql.query<UserListingAction>(
      `INSERT INTO user_listing_actions (user_id, listing_id, project_id, favorite, decision, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, listing_id, project_id) DO UPDATE
       SET favorite = EXCLUDED.favorite,
           decision = EXCLUDED.decision,
           notes = EXCLUDED.notes,
           updated_at = NOW()
       RETURNING id, user_id as "userId", listing_id as "listingId", project_id as "projectId",
                 favorite, decision, notes, created_at as "createdAt", updated_at as "updatedAt"`,
      [
        action.userId,
        action.listingId,
        action.projectId,
        action.favorite || false,
        action.decision || 'pending',
        action.notes || null,
      ],
    );
    return res.rows[0];
  }

  async getAction(
    userId: string,
    listingId: string,
    projectId: string,
  ): Promise<UserListingAction | null> {
    const res = await this.sql.query<UserListingAction>(
      `SELECT id, user_id as "userId", listing_id as "listingId", project_id as "projectId",
              favorite, decision, notes, created_at as "createdAt", updated_at as "updatedAt"
       FROM user_listing_actions
       WHERE user_id = $1 AND listing_id = $2 AND project_id = $3`,
      [userId, listingId, projectId],
    );
    return res.rows.length > 0 ? res.rows[0] : null;
  }

  async getUserActionsForProject(userId: string, projectId: string): Promise<UserListingAction[]> {
    const res = await this.sql.query<UserListingAction>(
      `SELECT id, user_id as "userId", listing_id as "listingId", project_id as "projectId",
              favorite, decision, notes, created_at as "createdAt", updated_at as "updatedAt"
       FROM user_listing_actions
       WHERE user_id = $1 AND project_id = $2`,
      [userId, projectId],
    );
    return res.rows;
  }
}

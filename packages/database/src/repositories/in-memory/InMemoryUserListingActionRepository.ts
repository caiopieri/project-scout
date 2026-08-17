import { UserListingAction, UserListingActionRepository } from '@scout/domain';

export class InMemoryUserListingActionRepository implements UserListingActionRepository {
  private actions: Map<string, UserListingAction> = new Map();

  private getKey(userId: string, listingId: string, projectId: string): string {
    return `${userId}:${listingId}:${projectId}`;
  }

  constructor(initialActions: UserListingAction[] = []) {
    for (const action of initialActions) {
      const key = this.getKey(action.userId, action.listingId, action.projectId);
      this.actions.set(key, { ...action });
    }
  }

  async setAction(
    action: Omit<UserListingAction, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<UserListingAction> {
    const key = this.getKey(action.userId, action.listingId, action.projectId);
    const existing = this.actions.get(key);
    const now = new Date();

    if (existing) {
      const updated: UserListingAction = {
        ...existing,
        ...action,
        id: existing.id,
        updatedAt: now,
      };
      this.actions.set(key, updated);
      return { ...updated };
    }

    const created: UserListingAction = {
      ...action,
      id: action.id || crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.actions.set(key, created);
    return { ...created };
  }

  async getAction(userId: string, listingId: string, projectId: string): Promise<UserListingAction | null> {
    const key = this.getKey(userId, listingId, projectId);
    const item = this.actions.get(key);
    return item ? { ...item } : null;
  }

  async getUserActionsForProject(userId: string, projectId: string): Promise<UserListingAction[]> {
    return Array.from(this.actions.values())
      .filter((a) => a.userId === userId && a.projectId === projectId)
      .map((a) => ({ ...a }));
  }
}

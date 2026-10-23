import { localAgentTaskTransportSchema, type LocalAgentTaskTransport } from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface TaskRow {
  id: string;
  project_id: string;
  source_id: string;
  agent_id: string | null;
  status: LocalAgentTaskTransport['status'];
  payload: Record<string, unknown>;
  items_received: number | null;
  items_created: number | null;
  items_updated: number | null;
  error_code: string | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
}

const taskSelect =
  'id,project_id,source_id,agent_id,status,payload,items_received,items_created,items_updated,error_code,created_at,claimed_at,completed_at';

const toTask = (row: TaskRow): LocalAgentTaskTransport =>
  localAgentTaskTransportSchema.parse({
    id: row.id,
    projectId: row.project_id,
    sourceId: row.source_id,
    agentId: row.agent_id,
    status: row.status,
    payload: row.payload,
    itemsReceived: row.items_received,
    itemsCreated: row.items_created,
    itemsUpdated: row.items_updated,
    errorCode: row.error_code,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    completedAt: row.completed_at,
  });

/** Local Agent registry and task queue. Agent-side calls run with the service role. */
export class SupabaseRestLocalAgentRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async register(userId: string, name: string, tokenHash: string) {
    const rows = await this.request<Array<{ id: string; name: string; created_at: string }>>(
      'local_agents?select=id,name,created_at',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, name, token_hash: tokenHash }),
      },
    );
    return rows[0];
  }

  async listAgents(userId: string) {
    return this.request<
      Array<{ id: string; name: string; last_seen_at: string | null; created_at: string }>
    >(
      `local_agents?user_id=eq.${userId}&revoked_at=is.null&select=id,name,last_seen_at,created_at&order=created_at.desc`,
    );
  }

  async findAgentByTokenHash(tokenHash: string) {
    const rows = await this.request<Array<{ id: string; user_id: string; name: string }>>(
      `local_agents?token_hash=eq.${tokenHash}&revoked_at=is.null&select=id,user_id,name&limit=1`,
    );
    return rows[0] ?? null;
  }

  async createTask(input: {
    userId: string;
    projectId: string;
    sourceId: string;
    payload: Record<string, unknown>;
  }) {
    const rows = await this.request<TaskRow[]>(`local_agent_tasks?select=${taskSelect}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: input.userId,
        project_id: input.projectId,
        source_id: input.sourceId,
        payload: input.payload,
      }),
    });
    return toTask(rows[0]);
  }

  async listTasks(projectId: string) {
    return (
      await this.request<TaskRow[]>(
        `local_agent_tasks?project_id=eq.${projectId}&select=${taskSelect}&order=created_at.desc&limit=20`,
      )
    ).map(toTask);
  }

  async claim(agentId: string) {
    const rows = await this.request<TaskRow[]>('rpc/claim_local_agent_task', {
      method: 'POST',
      body: JSON.stringify({ p_agent_id: agentId }),
    });
    return rows[0] ? toTask(rows[0]) : null;
  }

  async findClaimedTask(agentId: string, taskId: string) {
    const rows = await this.request<TaskRow[]>(
      `local_agent_tasks?id=eq.${taskId}&agent_id=eq.${agentId}&status=eq.claimed&select=${taskSelect}&limit=1`,
    );
    return rows[0] ? toTask(rows[0]) : null;
  }

  async finish(
    taskId: string,
    agentId: string,
    result:
      | { status: 'completed'; itemsReceived: number; itemsCreated: number; itemsUpdated: number }
      | { status: 'failed'; errorCode: string },
  ) {
    const rows = await this.request<TaskRow[]>(
      `local_agent_tasks?id=eq.${taskId}&agent_id=eq.${agentId}&status=eq.claimed&select=${taskSelect}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(
          result.status === 'completed'
            ? {
                status: 'completed',
                items_received: result.itemsReceived,
                items_created: result.itemsCreated,
                items_updated: result.itemsUpdated,
                completed_at: new Date().toISOString(),
                lease_expires_at: null,
              }
            : {
                status: 'failed',
                error_code: result.errorCode,
                completed_at: new Date().toISOString(),
              },
        ),
      },
    );
    return rows[0] ? toTask(rows[0]) : null;
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
    if (!response.ok) throw new Error(`Supabase local agent request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}

import {
  CreateResearchProject,
  ResearchProject,
  ResearchProjectRepository,
  UpdateResearchProject,
} from '@scout/domain';
import { researchProjectSchema } from '@scout/schemas';

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  natural_language_query: string;
  structured_query: unknown;
  status: string;
  taxonomy_version: string;
  interpreter_provider: string;
  interpreter_model: string;
  interpreter_version: string;
  interpreted_at: string;
  interpretation_confidence: number;
  interpretation_ambiguities: unknown;
  interpretation_warnings: unknown;
  unidentified_fields: unknown;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseRestConfig {
  baseUrl: string;
  anonKey: string;
  accessToken: string;
}

const mapProject = (row: ProjectRow): ResearchProject =>
  researchProjectSchema.parse({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description ?? undefined,
    category: row.category,
    naturalLanguageQuery: row.natural_language_query,
    structuredQuery: row.structured_query,
    interpretation: {
      confidence: row.interpretation_confidence,
      ambiguities: row.interpretation_ambiguities,
      warnings: row.interpretation_warnings,
      unidentifiedFields: row.unidentified_fields,
      provider: row.interpreter_provider,
      model: row.interpreter_model,
      promptOrRuleVersion: row.interpreter_version,
      taxonomyVersion: row.taxonomy_version,
      interpretedAt: row.interpreted_at,
    },
    status: row.status,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  });

const metadataColumns = (
  project: CreateResearchProject | UpdateResearchProject,
): Record<string, unknown> => {
  if (!project.interpretation) return {};
  return {
    taxonomy_version: project.interpretation.taxonomyVersion,
    interpreter_provider: project.interpretation.provider,
    interpreter_model: project.interpretation.model,
    interpreter_version: project.interpretation.promptOrRuleVersion,
    interpreted_at: project.interpretation.interpretedAt,
    interpretation_confidence: project.interpretation.confidence,
    interpretation_ambiguities: project.interpretation.ambiguities,
    interpretation_warnings: project.interpretation.warnings,
    unidentified_fields: project.interpretation.unidentifiedFields,
  };
};

export class SupabaseRestResearchProjectRepository implements ResearchProjectRepository {
  constructor(private readonly config: SupabaseRestConfig) {}

  async findById(id: string, userId: string): Promise<ResearchProject | null> {
    const rows = await this.request<ProjectRow[]>(
      `research_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&status=neq.deleted&limit=1`,
    );
    return rows[0] ? mapProject(rows[0]) : null;
  }

  async findByUserId(userId: string, includeDeleted = false): Promise<ResearchProject[]> {
    const status = includeDeleted ? '' : '&status=neq.deleted';
    const rows = await this.request<ProjectRow[]>(
      `research_projects?user_id=eq.${encodeURIComponent(userId)}${status}&order=updated_at.desc`,
    );
    return rows.map(mapProject);
  }

  async create(userId: string, project: CreateResearchProject): Promise<ResearchProject> {
    const rows = await this.request<ProjectRow[]>('research_projects', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        name: project.name,
        description: project.description ?? null,
        category: project.structuredQuery.category ?? 'unknown',
        natural_language_query: project.naturalLanguageQuery,
        structured_query: project.structuredQuery,
        status: project.status,
        interpretation_schema_version: '1.0.0',
        ...metadataColumns(project),
      }),
    });
    return mapProject(rows[0]);
  }

  async update(
    id: string,
    userId: string,
    project: UpdateResearchProject,
  ): Promise<ResearchProject> {
    const payload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...metadataColumns(project),
    };
    if (project.name !== undefined) payload.name = project.name;
    if (project.description !== undefined) payload.description = project.description;
    if (project.naturalLanguageQuery !== undefined)
      payload.natural_language_query = project.naturalLanguageQuery;
    if (project.structuredQuery !== undefined) {
      payload.structured_query = project.structuredQuery;
      payload.category = project.structuredQuery.category ?? 'unknown';
    }
    return this.patchOne(id, userId, payload);
  }

  archive(id: string, userId: string): Promise<ResearchProject> {
    return this.patchOne(id, userId, { status: 'archived', updated_at: new Date().toISOString() });
  }

  restore(id: string, userId: string): Promise<ResearchProject> {
    return this.patchOne(id, userId, { status: 'active', updated_at: new Date().toISOString() });
  }

  async softDelete(id: string, userId: string): Promise<void> {
    await this.patchOne(id, userId, {
      status: 'deleted',
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  private async patchOne(
    id: string,
    userId: string,
    body: Record<string, unknown>,
  ): Promise<ResearchProject> {
    const rows = await this.request<ProjectRow[]>(
      `research_projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&status=neq.deleted`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
    if (!rows[0]) throw new Error('Project not found or access denied.');
    return mapProject(rows[0]);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: init.method === 'POST' || init.method === 'PATCH' ? 'return=representation' : '',
      },
    });
    if (!response.ok) throw new Error(`Supabase request failed (${response.status}).`);
    return response.json() as Promise<T>;
  }
}

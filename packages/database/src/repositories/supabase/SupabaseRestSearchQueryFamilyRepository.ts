import type {
  SearchQueryFamilyRepository,
  SearchTermObservationReviewRepository,
} from '@scout/domain';
import {
  searchQueryFamilySchema,
  searchTermObservationSchema,
  searchTermObservationTransportSchema,
  type SearchTermObservation,
  type SearchTermObservationTransport,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

interface SearchQueryFamilyRow {
  id: string;
}

interface SearchTermObservationRow {
  id: string;
  project_id: string;
  family_id: string;
  term: string;
  normalized_term: string;
  kind: SearchTermObservation['kind'];
  status: SearchTermObservation['status'];
  evidence: unknown;
  source: string;
  created_at: string;
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();

export class SupabaseRestSearchQueryFamilyRepository
  implements SearchQueryFamilyRepository, SearchTermObservationReviewRepository
{
  constructor(private readonly config: SupabaseRestConfig) {}

  async findAcceptedObservations(projectId: string): Promise<SearchTermObservation[]> {
    const rows = await this.request<SearchTermObservationRow[]>(
      `search_term_observations?project_id=eq.${encodeURIComponent(projectId)}&status=eq.accepted&order=created_at.desc`,
    );
    return rows.map((row) =>
      searchTermObservationSchema.parse({
        term: row.term,
        normalizedTerm: row.normalized_term,
        kind: row.kind,
        status: row.status,
        evidence: row.evidence,
        source: row.source,
      }),
    );
  }

  async findByProjectId(projectId: string): Promise<SearchTermObservationTransport[]> {
    const rows = await this.request<SearchTermObservationRow[]>(
      `search_term_observations?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc`,
    );
    return rows.map((row) => this.mapTransport(row));
  }

  async review(input: {
    projectId: string;
    observationId: string;
    status: 'accepted' | 'rejected';
  }): Promise<SearchTermObservationTransport> {
    const rows = await this.request<SearchTermObservationRow[]>(
      `search_term_observations?id=eq.${encodeURIComponent(input.observationId)}&project_id=eq.${encodeURIComponent(input.projectId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: input.status }),
        prefer: 'return=representation',
      },
    );
    if (!rows[0]) throw new Error('Observation not found or access denied.');
    return this.mapTransport(rows[0]);
  }

  async saveFamily(input: Parameters<SearchQueryFamilyRepository['saveFamily']>[0]): Promise<void> {
    const family = searchQueryFamilySchema.parse(input.family);
    const familyRows = await this.request<SearchQueryFamilyRow[]>(
      'search_query_families?on_conflict=collection_run_id',
      {
        method: 'POST',
        body: JSON.stringify({
          project_id: input.projectId,
          source_id: input.sourceId,
          collection_run_id: input.collectionRunId,
          version: family.version,
          base_query: family.baseQuery,
          queries: family.queries,
        }),
        prefer: 'resolution=merge-duplicates,return=representation',
      },
    );
    const familyId = familyRows[0]?.id;
    if (!familyId) throw new Error('Supabase query family insert returned no id.');

    const observations = family.queries.map((query) =>
      searchTermObservationSchema.parse({
        term: query.query,
        normalizedTerm: normalize(query.query),
        kind: query.kind,
        status: 'candidate',
        evidence: [`generated:${family.version}`],
        source: 'deterministic-query-family',
      }),
    );
    if (observations.length === 0) return;
    await this.request(
      'search_term_observations?on_conflict=project_id%2Cnormalized_term%2Ckind%2Csource',
      {
        method: 'POST',
        body: JSON.stringify(
          observations.map((observation) => ({
            project_id: input.projectId,
            family_id: familyId,
            term: observation.term,
            normalized_term: observation.normalizedTerm,
            kind: observation.kind,
            status: observation.status,
            evidence: observation.evidence,
            source: observation.source,
          })),
        ),
        prefer: 'resolution=ignore-duplicates,return=minimal',
      },
    );
  }

  private async request<T>(
    path: string,
    input: RequestInit & { prefer?: string } = {},
  ): Promise<T> {
    const { prefer, ...init } = input;
    const response = await fetch(`${this.config.baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: prefer ?? '',
      },
    });
    if (!response.ok) throw new Error(`Supabase search query request failed (${response.status}).`);
    if (response.status === 204 || prefer?.includes('return=minimal')) return undefined as T;
    return response.json() as Promise<T>;
  }

  private mapTransport(row: SearchTermObservationRow): SearchTermObservationTransport {
    return searchTermObservationTransportSchema.parse({
      id: row.id,
      projectId: row.project_id,
      familyId: row.family_id,
      term: row.term,
      normalizedTerm: row.normalized_term,
      kind: row.kind,
      status: row.status,
      evidence: row.evidence,
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }
}

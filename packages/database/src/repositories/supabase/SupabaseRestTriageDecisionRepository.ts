import type {
  CrossSourceIdentityCandidateRepository,
  ListingTriageDecisionReadRepository,
  ListingTriageReviewRepository,
  TriageDecisionRepository,
} from '@scout/domain';
import {
  crossSourceIdentityCandidateTransportSchema,
  listingTriageDecisionSchema,
  listingTriageDecisionTransportSchema,
  listingTriageReviewTransportSchema,
} from '@scout/schemas';
import type { SupabaseRestConfig } from './SupabaseRestResearchProjectRepository';

export const TRIAGE_DECISION_BATCH_SIZE = 50;

interface TriageDecisionRow {
  id: string;
  project_id: string;
  source_id: string;
  listing_id: string;
  filter_decision: 'KEEP' | 'REJECT' | 'REVIEW';
  filter_reasons: unknown;
  identity: unknown;
  investigation: unknown;
  decision_version: string;
  created_at: string;
}

interface TriageReviewRow {
  id: string;
  project_id: string;
  listing_id: string;
  status: 'accepted' | 'rejected';
  reviewed_at: string;
}

interface CrossSourceCandidateRow {
  id: string;
  project_id: string;
  left_source_id: string;
  left_listing_id: string;
  right_source_id: string;
  right_listing_id: string;
  relation: 'MATCH_CANDIDATE' | 'REVIEW';
  confidence: number;
  evidence: unknown;
  merge_eligible: false;
  review_status: 'pending' | 'accepted' | 'rejected';
  reviewed_at: string | null;
  created_at: string;
}

export class SupabaseRestTriageDecisionRepository
  implements
    TriageDecisionRepository,
    ListingTriageDecisionReadRepository,
    ListingTriageReviewRepository,
    CrossSourceIdentityCandidateRepository
{
  constructor(private readonly config: SupabaseRestConfig) {}

  async save(input: Parameters<TriageDecisionRepository['save']>[0]): Promise<void> {
    await this.saveMany([input]);
  }

  async saveMany(inputs: Parameters<TriageDecisionRepository['saveMany']>[0]): Promise<void> {
    for (let offset = 0; offset < inputs.length; offset += TRIAGE_DECISION_BATCH_SIZE) {
      const decisions = inputs.slice(offset, offset + TRIAGE_DECISION_BATCH_SIZE).map((input) => {
        const decision = listingTriageDecisionSchema.parse(input);
        return {
          project_id: decision.projectId,
          source_id: decision.sourceId,
          listing_id: decision.listingId,
          filter_decision: decision.filter.decision,
          filter_reasons: decision.filter.reasons,
          identity: decision.identity,
          investigation: decision.investigation,
          decision_version: decision.decisionVersion,
          created_at: decision.createdAt.toISOString(),
        };
      });
      const response = await fetch(
        `${this.config.baseUrl}/rest/v1/listing_triage_decisions?select=id`,
        {
          method: 'POST',
          headers: {
            apikey: this.config.anonKey,
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(decisions),
        },
      );
      if (!response.ok) throw new Error(`Supabase triage request failed (${response.status}).`);
    }
  }

  async findByProjectId(projectId: string) {
    const rows = await this.request<TriageDecisionRow[]>(
      `listing_triage_decisions?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc`,
    );
    return rows.map((row) =>
      listingTriageDecisionTransportSchema.parse({
        id: row.id,
        projectId: row.project_id,
        sourceId: row.source_id,
        listingId: row.listing_id,
        filter: { decision: row.filter_decision, reasons: row.filter_reasons },
        identity: row.identity,
        investigation: row.investigation,
        decisionVersion: row.decision_version,
        createdAt: new Date(row.created_at).toISOString(),
      }),
    );
  }

  async findReviewsByProjectId(projectId: string) {
    return this.findReviews(projectId);
  }

  async review(input: Parameters<ListingTriageReviewRepository['review']>[0]) {
    const response = await this.request<TriageReviewRow | TriageReviewRow[]>(
      'rpc/review_listing_triage',
      {
        method: 'POST',
        body: JSON.stringify({
          p_project_id: input.projectId,
          p_listing_id: input.listingId,
          p_status: input.status,
        }),
      },
    );
    const row = Array.isArray(response) ? response[0] : response;
    if (!row) throw new Error('Triage review insert returned no row.');
    return this.mapReview(row);
  }

  async saveCandidate(
    input: Parameters<CrossSourceIdentityCandidateRepository['saveCandidate']>[0],
  ): Promise<void> {
    const decision = crossSourceIdentityCandidateTransportSchema
      .omit({ id: true, projectId: true, reviewStatus: true, reviewedAt: true, createdAt: true })
      .parse(input.decision);
    const response = await fetch(
      `${this.config.baseUrl}/rest/v1/cross_source_identity_candidates?on_conflict=project_id,left_source_id,left_listing_id,right_source_id,right_listing_id`,
      {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          project_id: input.projectId,
          left_source_id: decision.leftSourceId,
          left_listing_id: decision.leftListingId,
          right_source_id: decision.rightSourceId,
          right_listing_id: decision.rightListingId,
          relation: decision.relation,
          confidence: decision.confidence,
          evidence: decision.evidence,
          merge_eligible: false,
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Supabase identity candidate request failed (${response.status}).`);
  }

  async findCandidatesByProjectId(projectId: string) {
    const rows = await this.request<CrossSourceCandidateRow[]>(
      `cross_source_identity_candidates?project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc`,
    );
    return rows.map((row) => this.mapCandidate(row));
  }

  async reviewCandidate(
    input: Parameters<CrossSourceIdentityCandidateRepository['reviewCandidate']>[0],
  ) {
    const response = await this.request<CrossSourceCandidateRow | CrossSourceCandidateRow[]>(
      'rpc/review_cross_source_identity_candidate',
      {
        method: 'POST',
        body: JSON.stringify({
          p_project_id: input.projectId,
          p_candidate_id: input.candidateId,
          p_status: input.status,
        }),
      },
    );
    const row = Array.isArray(response) ? response[0] : response;
    if (!row) throw new Error('Identity candidate review returned no row.');
    return this.mapCandidate(row);
  }

  private async findReviews(projectId: string) {
    const rows = await this.request<TriageReviewRow[]>(
      `listing_triage_reviews?project_id=eq.${encodeURIComponent(projectId)}&order=reviewed_at.desc`,
    );
    return rows.map((row) => this.mapReview(row));
  }

  private mapReview(row: TriageReviewRow) {
    return listingTriageReviewTransportSchema.parse({
      id: row.id,
      projectId: row.project_id,
      listingId: row.listing_id,
      status: row.status,
      reviewedAt: new Date(row.reviewed_at).toISOString(),
    });
  }

  private mapCandidate(row: CrossSourceCandidateRow) {
    return crossSourceIdentityCandidateTransportSchema.parse({
      id: row.id,
      projectId: row.project_id,
      leftSourceId: row.left_source_id,
      leftListingId: row.left_listing_id,
      rightSourceId: row.right_source_id,
      rightListingId: row.right_listing_id,
      relation: row.relation,
      confidence: row.confidence,
      evidence: row.evidence,
      mergeEligible: false,
      reviewStatus: row.review_status,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    });
  }

  private async request<T>(path: string, input: RequestInit & { prefer?: string } = {}) {
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
    if (!response.ok) throw new Error(`Supabase triage request failed (${response.status}).`);
    if (response.status === 204 || prefer?.includes('return=minimal')) return undefined as T;
    return response.json() as Promise<T>;
  }
}

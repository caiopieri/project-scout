import {
  researchCriteriaSchema,
  searchQueryFamilySchema,
  searchQuerySchema,
  searchTermObservationSchema,
  type ResearchCriteria,
  type SearchQuery,
  type SearchQueryFamily,
  type SearchTermObservation,
  type ProductIdentity,
} from '@scout/schemas';
import type {
  CollectionTriageProcessor,
  CrossSourceIdentityCandidateRepository,
  ListingTriageDecisionReadRepository,
  SearchQueryFamilyProvider,
  SearchQueryFamilyRepository,
  TriageDecisionInput,
  TriageDecisionRepository,
} from '@scout/domain';

export * from './screening';
import {
  CheapListingFilter,
  CrossSourceIdentityComparator,
  InvestigationClassifier,
  ProductIdentityEngine,
} from './screening';

const CATEGORY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  smartphone: ['celular', 'telefone', 'mobile'],
  laptop: ['notebook', 'laptop', 'computador portátil'],
};

const CONDITION_TERMS: Readonly<Record<string, readonly string[]>> = {
  used: ['usado', 'seminovo'],
  refurbished: ['recondicionado', 'refurbished'],
  for_repair: ['para conserto', 'para reparo'],
  parts_only: ['para peças', 'parts only'],
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();

const unique = (queries: SearchQuery[]): SearchQuery[] => {
  const byNormalizedQuery = new Map<string, SearchQuery>();
  for (const query of queries) {
    const key = normalize(query.query);
    const previous = byNormalizedQuery.get(key);
    if (!previous || query.kind === 'learned') byNormalizedQuery.set(key, query);
  }
  return [...byNormalizedQuery.values()];
};

const safeTranspose = (value: string): string | undefined => {
  const chars = [...value];
  if (chars.length < 5) return undefined;
  [chars[0], chars[1]] = [chars[1], chars[0]];
  return chars.join('');
};

const coreTerms = (criteria: ResearchCriteria): string[] =>
  [
    ...criteria.brands,
    ...criteria.models,
    ...criteria.variants,
    ...criteria.storageGb.map((value) => `${value}GB`),
    ...criteria.memoryGb.map((value) => `${value}GB RAM`),
    ...criteria.additionalKeywords,
  ].filter(Boolean);

const learnedQueries = (observations: SearchTermObservation[]): SearchQuery[] =>
  observations
    .map((observation) => searchTermObservationSchema.parse(observation))
    .filter((observation) => observation.status === 'accepted')
    .map((observation) =>
      searchQuerySchema.parse({
        query: observation.term,
        kind: 'learned',
        confidence: 0.75,
        evidence: observation.evidence,
      }),
    );

export const proposeSearchTermObservation = (input: {
  term: string;
  kind: SearchTermObservation['kind'];
  source: string;
  evidence: string[];
}): SearchTermObservation =>
  searchTermObservationSchema.parse({
    term: input.term,
    normalizedTerm: normalize(input.term),
    kind: input.kind,
    status: 'candidate',
    evidence: input.evidence,
    source: input.source,
  });

export class DeterministicQueryFamilyGenerator {
  constructor(private readonly version = 'query-family-rules.v1') {}

  generate(
    rawCriteria: ResearchCriteria,
    rawObservations: SearchTermObservation[] = [],
  ): SearchQueryFamily {
    const criteria = researchCriteriaSchema.parse(rawCriteria);
    const terms = coreTerms(criteria);
    if (terms.length === 0 && criteria.category) terms.push(criteria.category);
    const baseQuery = terms.join(' ');
    const queries: SearchQuery[] = [];

    queries.push(searchQuerySchema.parse({ query: baseQuery, kind: 'exact', confidence: 1 }));

    for (const alias of CATEGORY_ALIASES[criteria.category ?? ''] ?? []) {
      queries.push(
        searchQuerySchema.parse({
          query: [alias, ...terms].join(' '),
          kind: 'alias',
          confidence: 0.88,
        }),
      );
    }

    for (const condition of criteria.acceptedConditions) {
      for (const term of CONDITION_TERMS[condition] ?? []) {
        queries.push(
          searchQuerySchema.parse({
            query: [...terms, term].join(' '),
            kind: 'localized',
            confidence: 0.82,
          }),
        );
      }
    }

    const compact = terms
      .map((term) => term.replace(/\s+/g, '').replace(/GB RAM$/i, 'G'))
      .join(' ');
    if (compact !== baseQuery) {
      queries.push(
        searchQuerySchema.parse({
          query: compact,
          kind: 'abbreviation',
          confidence: 0.7,
        }),
      );
    }

    for (const term of criteria.models.slice(0, 3)) {
      const typo = safeTranspose(term);
      if (typo && normalize(typo) !== normalize(term)) {
        queries.push(
          searchQuerySchema.parse({
            query: [...terms.filter((candidate) => candidate !== term), typo].join(' '),
            kind: 'typo',
            confidence: 0.55,
          }),
        );
      }
    }

    queries.push(...learnedQueries(rawObservations));
    return searchQueryFamilySchema.parse({
      version: this.version,
      baseQuery,
      queries: unique(queries).slice(0, 100),
    });
  }
}

export class CollectionQueryFamilyProvider implements SearchQueryFamilyProvider {
  constructor(
    private readonly repository: SearchQueryFamilyRepository,
    private readonly generator = new DeterministicQueryFamilyGenerator(),
  ) {}

  async getFamily(input: {
    projectId: string;
    criteria: ResearchCriteria;
  }): Promise<SearchQueryFamily> {
    const observations = await this.repository.findAcceptedObservations(input.projectId);
    return this.generator.generate(input.criteria, observations);
  }
}

export class CollectionTriageService implements CollectionTriageProcessor {
  constructor(
    private readonly repository: TriageDecisionRepository &
      Partial<ListingTriageDecisionReadRepository>,
    private readonly filter = new CheapListingFilter(),
    private readonly identity = new ProductIdentityEngine(),
    private readonly classifier = new InvestigationClassifier(),
    private readonly candidateRepository?: CrossSourceIdentityCandidateRepository,
    private readonly comparator = new CrossSourceIdentityComparator(),
  ) {}

  async process(input: Parameters<CollectionTriageProcessor['process']>[0]): Promise<void> {
    const previousDecisions = this.repository.findByProjectId
      ? await this.repository.findByProjectId(input.projectId)
      : [];
    const currentDecisions: Array<{
      sourceId: string;
      listingId: string;
      identity: ProductIdentity;
    }> = [];
    const decisions: TriageDecisionInput[] = [];
    for (const record of input.result.items) {
      const listingId = input.persistence.listingIdsByExternalId[record.preview.externalId];
      if (!listingId) continue;
      const filter = this.filter.screen(record, input.criteria);
      const identity = this.identity.identify(record, input.criteria);
      const investigation = this.classifier.classify({ filter, identity });
      currentDecisions.push({ sourceId: input.sourceId, listingId, identity });
      decisions.push({
        projectId: input.projectId,
        sourceId: input.sourceId,
        listingId,
        filter,
        identity,
        investigation,
      });
    }
    await this.repository.saveMany(decisions);
    if (!this.candidateRepository) return;
    for (const current of currentDecisions) {
      for (const previous of previousDecisions) {
        if (previous.sourceId === current.sourceId || previous.listingId === current.listingId)
          continue;
        const leftFirst =
          `${current.sourceId}:${current.listingId}` < `${previous.sourceId}:${previous.listingId}`;
        const decision = this.comparator.compare({
          left: leftFirst ? current : previous,
          right: leftFirst ? previous : current,
        });
        if (decision.relation === 'MATCH_CANDIDATE' || decision.relation === 'REVIEW')
          await this.candidateRepository.saveCandidate({ projectId: input.projectId, decision });
      }
    }
  }
}

export const SEARCH_INTELLIGENCE_PACKAGE_MARKER = '@scout/search-intelligence';

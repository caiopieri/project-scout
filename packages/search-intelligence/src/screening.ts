import {
  cheapFilterResultSchema,
  crossSourceIdentityDecisionSchema,
  crossSourceIdentityReferenceSchema,
  jsonObjectSchema,
  productIdentitySchema,
  rawListingAspectSchema,
  rawListingImageReferenceSchema,
  rawListingRecordSchema,
  researchCriteriaSchema,
  investigationDecisionSchema,
  type CheapFilterResult,
  type CrossSourceIdentityDecision,
  type CrossSourceIdentityReference,
  type InvestigationDecision,
  type ProductIdentity,
  type ResearchCriteria,
  type RawListingRecord,
  type RawListingPreview,
} from '@scout/schemas';

const defectTerms: Readonly<Record<string, readonly string[]>> = {
  cracked_screen: ['cracked screen', 'broken screen', 'tela quebrada', 'tela trincada'],
  broken_back_glass: ['broken back glass', 'cracked back glass', 'back glass quebrado'],
  degraded_battery: ['degraded battery', 'bad battery', 'bateria degradada', 'bateria ruim'],
  activation_lock: ['activation lock', 'ativacao bloqueada', 'bloqueio de ativacao'],
  icloud_lock: ['icloud lock', 'icloud bloqueado', 'bloqueio icloud'],
  logic_board_failure: ['logic board failure', 'logic board issue', 'placa logica'],
  no_power: ['no power', 'does not power on', 'nao liga', 'não liga'],
  parts_only: ['parts only', 'for parts', 'para pecas', 'para peças'],
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();

const categoryTerms: Readonly<Record<string, readonly string[]>> = {
  smartphone: ['smartphone', 'celular', 'telefone', 'iphone', 'galaxy'],
  laptop: ['notebook', 'laptop', 'macbook', 'thinkpad', 'latitude', 'elitebook'],
};

const componentOnlyPatterns = [
  /\breplacement\b/,
  /\bdigitizer\b/,
  /\blcd(?: assembly| screen)?\b/,
  /\bdisplay assembly\b/,
  /\bpalm ?rest\b/,
  /\bbezel\b/,
  /\bhousing\b/,
  /\bshell\b/,
  /\b(?:charger|cable|battery|keyboard) only\b/,
  /\bscreen only\b/,
  /\b(?:empty )?box only\b/,
  /\bpartial machine\b/,
];

const payloadString = (record: RawListingRecord, key: string): string | undefined => {
  const payload = jsonObjectSchema.parse(record.payload);
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const payloadAspects = (record: RawListingRecord) => {
  const payload = jsonObjectSchema.parse(record.payload);
  const parsed = rawListingAspectSchema.array().safeParse(payload.localizedAspects);
  return parsed.success ? parsed.data.slice(0, 50) : [];
};

const payloadAdditionalImages = (record: RawListingRecord) => {
  const payload = jsonObjectSchema.parse(record.payload);
  const parsed = rawListingImageReferenceSchema.array().safeParse(payload.additionalImages);
  const maxAdditionalImages = record.preview.imageUrl ? 19 : 20;
  return parsed.success ? parsed.data.slice(0, maxAdditionalImages) : [];
};

const attributeValue = (aspects: ReturnType<typeof payloadAspects>, names: string[]) => {
  const normalizedNames = names.map(normalize);
  return aspects.find((aspect) =>
    normalizedNames.some(
      (name) => name === normalize(aspect.name) || normalize(aspect.name).includes(name),
    ),
  )?.value;
};

const storageToGb = (value: string | undefined): number | undefined => {
  const match = value?.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)/i);
  if (!match) return undefined;
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * (match[2].toLowerCase() === 'tb' ? 1024 : 1));
};

export interface CheapFilterOptions {
  knownExternalIds?: ReadonlySet<string>;
  suspiciousPriceFloorMinor?: number;
}

export class CheapListingFilter {
  screenPreview(
    preview: RawListingPreview,
    rawCriteria: ResearchCriteria,
    options: CheapFilterOptions = {},
  ): CheapFilterResult {
    return this.screen({ preview, payload: {} }, rawCriteria, options);
  }

  screen(
    rawRecord: RawListingRecord,
    rawCriteria: ResearchCriteria,
    options: CheapFilterOptions = {},
  ): CheapFilterResult {
    const record = rawListingRecordSchema.parse(rawRecord);
    const criteria = researchCriteriaSchema.parse(rawCriteria);
    const title = normalize(record.preview.title);
    const reasons: CheapFilterResult['reasons'] = [];

    if (options.knownExternalIds?.has(record.preview.externalId)) reasons.push('DUPLICATE');
    if (criteria.excludedKeywords.some((keyword) => title.includes(normalize(keyword)))) {
      reasons.push('EXCLUDED_KEYWORD');
    }

    const expectedTerms = categoryTerms[criteria.category ?? ''] ?? [];
    const matchesModel = criteria.models.some((model) => title.includes(normalize(model)));
    const matchesCategory = expectedTerms.some((term) => title.includes(normalize(term)));
    if (criteria.category && !matchesCategory && !matchesModel) reasons.push('CATEGORY_MISMATCH');

    if (componentOnlyPatterns.some((pattern) => pattern.test(title))) {
      reasons.push('COMPONENT_OR_ACCESSORY');
    }

    if (
      criteria.rejectedDefects.some((defect) =>
        (defectTerms[defect] ?? []).some((term) => title.includes(normalize(term))),
      )
    ) {
      reasons.push('REJECTED_DEFECT');
    }

    if (
      criteria.maximumPrice &&
      record.preview.price.currency === criteria.maximumPrice.currency &&
      record.preview.price.amountMinor > criteria.maximumPrice.amountMinor
    ) {
      reasons.push('PRICE_ABOVE_MAXIMUM');
    }

    if (
      options.suspiciousPriceFloorMinor !== undefined &&
      record.preview.price.amountMinor <= options.suspiciousPriceFloorMinor
    ) {
      reasons.push('PRICE_BAIT_SIGNAL');
    }

    if (
      reasons.includes('DUPLICATE') ||
      reasons.includes('EXCLUDED_KEYWORD') ||
      reasons.includes('CATEGORY_MISMATCH') ||
      reasons.includes('REJECTED_DEFECT') ||
      reasons.includes('PRICE_ABOVE_MAXIMUM') ||
      reasons.includes('COMPONENT_OR_ACCESSORY')
    ) {
      return cheapFilterResultSchema.parse({ decision: 'REJECT', reasons });
    }
    if (reasons.length > 0) return cheapFilterResultSchema.parse({ decision: 'REVIEW', reasons });
    return cheapFilterResultSchema.parse({ decision: 'KEEP', reasons: [] });
  }
}

export class ProductIdentityEngine {
  identify(rawRecord: RawListingRecord, rawCriteria: ResearchCriteria): ProductIdentity {
    const record = rawListingRecordSchema.parse(rawRecord);
    const criteria = researchCriteriaSchema.parse(rawCriteria);
    const title = normalize(
      [record.preview.title, payloadString(record, 'description')].filter(Boolean).join(' '),
    );
    const aspects = payloadAspects(record);
    const attributes = productIdentitySchema.shape.attributes.parse({
      brand: attributeValue(aspects, ['brand', 'marca']),
      model: attributeValue(aspects, ['model', 'modelo']),
      variant: attributeValue(aspects, ['variant', 'variante']),
      storageGb: storageToGb(attributeValue(aspects, ['storage capacity', 'capacidade'])),
      memoryGb: storageToGb(attributeValue(aspects, ['memory', 'ram', 'memória'])),
    });
    const additionalImages = payloadAdditionalImages(record);
    const media = productIdentitySchema.shape.media.parse({
      imageCount: (record.preview.imageUrl ? 1 : 0) + additionalImages.length,
      primaryImagePresent: Boolean(record.preview.imageUrl),
    });
    const matchingModels = criteria.models.filter(
      (model) =>
        title.includes(normalize(model)) ||
        normalize(attributes.model ?? '').includes(normalize(model)),
    );
    const matchingBrands = criteria.brands.filter(
      (brand) =>
        title.includes(normalize(brand)) ||
        normalize(attributes.brand ?? '').includes(normalize(brand)),
    );
    const matchingStorage = criteria.storageGb.filter(
      (storage) => title.includes(`${storage}gb`) || attributes.storageGb === storage,
    );
    const evidence = [
      ...matchingModels.map((model) =>
        attributes.model?.includes(model)
          ? `attribute:model:${attributes.model}`
          : `title:model:${model}`,
      ),
      ...matchingBrands.map((brand) =>
        attributes.brand && normalize(attributes.brand).includes(normalize(brand))
          ? `attribute:brand:${attributes.brand}`
          : `title:brand:${brand}`,
      ),
      ...matchingStorage.map((storage) =>
        attributes.storageGb === storage
          ? `attribute:storage:${storage}GB`
          : `title:storage:${storage}GB`,
      ),
      ...(media.primaryImagePresent ? ['media:primary-image'] : []),
      ...(additionalImages.length > 0
        ? [`media:additional-images:${additionalImages.length}`]
        : []),
    ];

    if (matchingModels.length === 1 && matchingBrands.length <= 1) {
      const canonicalKey = normalize(
        [matchingBrands[0], matchingModels[0], matchingStorage[0] && `${matchingStorage[0]}gb`]
          .filter(Boolean)
          .join('|'),
      );
      return productIdentitySchema.parse({
        canonicalKey,
        status: 'MATCHED',
        confidence: matchingStorage.length > 0 ? 0.95 : 0.85,
        evidence,
        attributes,
        media,
        mergeEligible: false,
      });
    }
    if (matchingModels.length > 1 || matchingBrands.length > 1) {
      return productIdentitySchema.parse({
        status: 'AMBIGUOUS',
        confidence: 0.45,
        evidence,
        attributes,
        media,
        mergeEligible: false,
      });
    }
    return productIdentitySchema.parse({
      status: 'UNIDENTIFIED',
      confidence: 0.1,
      evidence,
      attributes,
      media,
      mergeEligible: false,
    });
  }
}

const sameNormalizedValue = (left: string | undefined, right: string | undefined) =>
  left !== undefined && right !== undefined && normalize(left) === normalize(right);

export class CrossSourceIdentityComparator {
  compare(input: {
    left: CrossSourceIdentityReference;
    right: CrossSourceIdentityReference;
  }): CrossSourceIdentityDecision {
    const left = crossSourceIdentityReferenceSchema.parse(input.left);
    const right = crossSourceIdentityReferenceSchema.parse(input.right);
    const base = {
      leftSourceId: left.sourceId,
      leftListingId: left.listingId,
      rightSourceId: right.sourceId,
      rightListingId: right.listingId,
      mergeEligible: false as const,
    };

    if (left.sourceId === right.sourceId) {
      return crossSourceIdentityDecisionSchema.parse({
        ...base,
        relation: 'NO_MATCH',
        confidence: 1,
        evidence: ['same-source-is-not-cross-source'],
      });
    }

    if (
      left.identity.status !== 'MATCHED' ||
      right.identity.status !== 'MATCHED' ||
      !left.identity.canonicalKey ||
      !right.identity.canonicalKey
    ) {
      return crossSourceIdentityDecisionSchema.parse({
        ...base,
        relation: 'INSUFFICIENT_EVIDENCE',
        confidence: 0.2,
        evidence: ['both-identities-must-be-matched-with-canonical-keys'],
      });
    }

    if (normalize(left.identity.canonicalKey) !== normalize(right.identity.canonicalKey)) {
      return crossSourceIdentityDecisionSchema.parse({
        ...base,
        relation: 'NO_MATCH',
        confidence: 0.98,
        evidence: ['canonical-key-conflict'],
      });
    }

    const leftAttributes = left.identity.attributes;
    const rightAttributes = right.identity.attributes;
    const evidence: string[] = ['canonical-key-equal'];

    if (!sameNormalizedValue(leftAttributes.brand, rightAttributes.brand)) {
      if (leftAttributes.brand && rightAttributes.brand) {
        return crossSourceIdentityDecisionSchema.parse({
          ...base,
          relation: 'NO_MATCH',
          confidence: 0.95,
          evidence: [...evidence, 'structured-brand-conflict'],
        });
      }
      return crossSourceIdentityDecisionSchema.parse({
        ...base,
        relation: 'REVIEW',
        confidence: 0.55,
        evidence: [...evidence, 'structured-brand-missing'],
      });
    }

    if (!sameNormalizedValue(leftAttributes.model, rightAttributes.model)) {
      if (leftAttributes.model && rightAttributes.model) {
        return crossSourceIdentityDecisionSchema.parse({
          ...base,
          relation: 'NO_MATCH',
          confidence: 0.98,
          evidence: [...evidence, 'structured-model-conflict'],
        });
      }
      return crossSourceIdentityDecisionSchema.parse({
        ...base,
        relation: 'REVIEW',
        confidence: 0.55,
        evidence: [...evidence, 'structured-model-missing'],
      });
    }

    evidence.push('structured-brand-equal', 'structured-model-equal');

    for (const [label, leftValue, rightValue] of [
      ['storage', leftAttributes.storageGb, rightAttributes.storageGb],
      ['memory', leftAttributes.memoryGb, rightAttributes.memoryGb],
    ] as const) {
      if (leftValue !== undefined && rightValue !== undefined && leftValue !== rightValue) {
        return crossSourceIdentityDecisionSchema.parse({
          ...base,
          relation: 'NO_MATCH',
          confidence: 0.95,
          evidence: [...evidence, `structured-${label}-conflict`],
        });
      }
      if (leftValue === undefined || rightValue === undefined) {
        evidence.push(`structured-${label}-incomplete`);
      } else {
        evidence.push(`structured-${label}-equal`);
      }
    }

    if (
      leftAttributes.variant !== undefined &&
      rightAttributes.variant !== undefined &&
      !sameNormalizedValue(leftAttributes.variant, rightAttributes.variant)
    ) {
      return crossSourceIdentityDecisionSchema.parse({
        ...base,
        relation: 'NO_MATCH',
        confidence: 0.9,
        evidence: [...evidence, 'structured-variant-conflict'],
      });
    }
    if (leftAttributes.variant === undefined || rightAttributes.variant === undefined) {
      evidence.push('structured-variant-incomplete');
    } else {
      evidence.push('structured-variant-equal');
    }

    if (left.identity.media.primaryImagePresent && right.identity.media.primaryImagePresent) {
      evidence.push('media-primary-image-present-both');
    }

    const hasCompleteOptionalAttributes =
      leftAttributes.storageGb !== undefined &&
      rightAttributes.storageGb !== undefined &&
      leftAttributes.memoryGb !== undefined &&
      rightAttributes.memoryGb !== undefined &&
      leftAttributes.variant !== undefined &&
      rightAttributes.variant !== undefined;
    return crossSourceIdentityDecisionSchema.parse({
      ...base,
      relation: hasCompleteOptionalAttributes ? 'MATCH_CANDIDATE' : 'REVIEW',
      confidence: hasCompleteOptionalAttributes ? 0.98 : 0.78,
      evidence,
    });
  }
}

export class InvestigationClassifier {
  classify(input: { filter: CheapFilterResult; identity: ProductIdentity }): InvestigationDecision {
    const { filter, identity } = input;
    if (filter.reasons.includes('DUPLICATE')) {
      return investigationDecisionSchema.parse({
        state: 'DUPLICATE',
        confidence: 0.99,
        reasons: filter.reasons,
        requiresHumanReview: false,
      });
    }
    if (filter.reasons.includes('PRICE_BAIT_SIGNAL')) {
      return investigationDecisionSchema.parse({
        state: 'PRICE_BAIT',
        confidence: 0.72,
        reasons: filter.reasons,
        requiresHumanReview: true,
      });
    }
    if (filter.reasons.includes('CATEGORY_MISMATCH')) {
      return investigationDecisionSchema.parse({
        state: 'WRONG_PRODUCT',
        confidence: 0.9,
        reasons: filter.reasons,
        requiresHumanReview: false,
      });
    }
    if (filter.reasons.includes('COMPONENT_OR_ACCESSORY')) {
      return investigationDecisionSchema.parse({
        state: 'WRONG_PRODUCT',
        confidence: 0.92,
        reasons: filter.reasons,
        requiresHumanReview: false,
      });
    }
    if (identity.status !== 'MATCHED') {
      return investigationDecisionSchema.parse({
        state: 'NEEDS_HUMAN_REVIEW',
        confidence: identity.confidence,
        reasons: ['Product identity is not sufficiently supported.'],
        requiresHumanReview: true,
      });
    }
    return investigationDecisionSchema.parse({
      state: filter.decision === 'REVIEW' ? 'NEEDS_HUMAN_REVIEW' : 'DISCOVERED',
      confidence: identity.confidence,
      reasons: filter.reasons,
      requiresHumanReview: filter.decision === 'REVIEW',
    });
  }
}

import type { ListingMapper } from '@scout/domain';
import {
  normalizedListingInputSchema,
  rawListingRecordSchema,
  type InferredProduct,
  type JsonObject,
} from '@scout/schemas';
import { ebayItemResponseSchema } from './api-schemas';
import { parseEbayAmountMinor } from './query';

const optionalString = (value: JsonObject, key: string) =>
  typeof value[key] === 'string' ? value[key] : undefined;

const percentage = (value?: string) => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
};

const inferProduct = (title: string, specifications: Record<string, string>) => {
  const searchable = `${title} ${Object.values(specifications).join(' ')}`;
  let model: string | undefined;
  if (/\biphone\s*13\b/i.test(searchable)) model = 'iPhone 13';
  else if (/\bmacbook\s+pro\s*16\b/i.test(searchable)) model = 'MacBook Pro 16';
  else if (/\bmacbook\s+pro\b/i.test(searchable)) model = 'MacBook Pro';
  else if (/\bmacbook\b/i.test(searchable)) model = 'MacBook';
  if (!model) return null;
  const capacity = searchable.match(/\b(\d{2,4})\s*(?:gb|g)\b/i)?.[1];
  return {
    brand: 'Apple',
    model,
    variant: capacity ? `${capacity} GB` : undefined,
    confidence: title.toLocaleLowerCase('en-US').includes(model.toLocaleLowerCase('en-US'))
      ? 0.95
      : 0.8,
  } satisfies Omit<InferredProduct, 'evidenceIds'>;
};

export class EbayListingMapper implements ListingMapper {
  constructor(private readonly now: () => Date = () => new Date()) {}

  map(input: Parameters<ListingMapper['map']>[0]) {
    const record = rawListingRecordSchema.parse(input);
    const official = ebayItemResponseSchema.safeParse(record.payload);
    const item = official.success ? official.data : undefined;
    const specifications = Object.fromEntries(
      item?.localizedAspects?.map(({ name, value }) => [name, value]) ?? [],
    );
    const shippingAmounts =
      item?.shippingOptions
        ?.map(({ shippingCost }) =>
          shippingCost?.currency === record.preview.price.currency
            ? parseEbayAmountMinor(shippingCost.value)
            : undefined,
        )
        .filter((amount): amount is number => amount !== undefined) ?? [];
    const shippingCostMinor = shippingAmounts.length > 0 ? Math.min(...shippingAmounts) : null;
    const location = item?.itemLocation
      ? [
          item.itemLocation.city,
          item.itemLocation.stateOrProvince,
          item.itemLocation.postalCode,
          item.itemLocation.country,
        ]
          .filter(Boolean)
          .join(', ')
      : undefined;
    const imageUrls = [
      item?.image?.imageUrl ?? record.preview.imageUrl,
      ...(item?.additionalImages?.map(({ imageUrl }) => imageUrl) ?? []),
    ].filter((url): url is string => Boolean(url));
    const availability = item?.estimatedAvailabilities
      ?.map(({ estimatedAvailabilityStatus }) => estimatedAvailabilityStatus)
      .filter(Boolean);
    const ended = item?.itemEndDate
      ? new Date(item.itemEndDate).getTime() <= this.now().getTime()
      : false;

    return normalizedListingInputSchema.parse({
      externalId: record.preview.externalId,
      url: item?.itemWebUrl ?? record.preview.url,
      title: item?.title ?? record.preview.title,
      description:
        item?.description ??
        item?.shortDescription ??
        optionalString(record.payload, 'description') ??
        '',
      condition:
        item?.condition ??
        optionalString(record.payload, 'condition') ??
        item?.conditionId ??
        optionalString(record.payload, 'conditionId') ??
        'Unknown',
      currency: record.preview.price.currency,
      priceMinor: record.preview.price.amountMinor,
      shippingCostMinor,
      totalVisibleCostMinor: record.preview.price.amountMinor + (shippingCostMinor ?? 0),
      seller: record.preview.sellerExternalId
        ? {
            externalId: record.preview.sellerExternalId,
            name: record.preview.sellerExternalId,
            reviewCount: item?.seller?.feedbackScore ?? 0,
            positiveFeedbackPercentage: percentage(item?.seller?.feedbackPercentage),
            accountType: 'unknown',
          }
        : undefined,
      location: location || undefined,
      status: availability?.some((status) => /OUT_OF_STOCK|NOT_AVAILABLE/i.test(status ?? ''))
        ? 'out_of_stock'
        : ended
          ? 'completed'
          : 'active',
      publishedAt: item?.itemCreationDate
        ? new Date(item.itemCreationDate).toISOString()
        : undefined,
      specifications,
      images: [...new Set(imageUrls)].map((url, position) => ({ url, position })),
      inferredProduct: inferProduct(item?.title ?? record.preview.title, specifications),
      rawDataMetadata: {
        conditionId: item?.conditionId ?? optionalString(record.payload, 'conditionId') ?? null,
        marketplaceId: item?.listingMarketplaceId ?? null,
        shippingCostKnown: shippingCostMinor !== null,
      },
    });
  }
}

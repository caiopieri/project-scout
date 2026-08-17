import { ListingMapper } from '@scout/domain';
import {
  jsonObjectSchema,
  normalizedListingInputSchema,
  rawListingRecordSchema,
} from '@scout/schemas';

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

export class GenericListingMapper implements ListingMapper {
  map(input: Parameters<ListingMapper['map']>[0]) {
    const record = rawListingRecordSchema.parse(input);
    const payload = jsonObjectSchema.parse(record.payload);
    const description = stringValue(payload.description) ?? '';
    const condition = stringValue(payload.condition) ?? 'Unknown';

    return normalizedListingInputSchema.parse({
      externalId: record.preview.externalId,
      url: record.preview.url,
      title: record.preview.title,
      description,
      condition,
      currency: record.preview.price.currency,
      priceMinor: record.preview.price.amountMinor,
      shippingCostMinor: null,
      totalVisibleCostMinor: record.preview.price.amountMinor,
      seller: record.preview.sellerExternalId
        ? {
            externalId: record.preview.sellerExternalId,
            name: record.preview.sellerExternalId,
            accountType: 'unknown',
          }
        : undefined,
      status: 'active',
      images: record.preview.imageUrl ? [{ url: record.preview.imageUrl, position: 0 }] : [],
      rawDataMetadata: { mapper: 'generic-v1' },
    });
  }
}

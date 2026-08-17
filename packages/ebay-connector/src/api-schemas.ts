import { z } from 'zod';

const ebayAmountSchema = z.object({
  value: z.string().regex(/^\d+(?:\.\d+)?$/),
  currency: z.string().length(3),
});

const ebayImageSchema = z.object({ imageUrl: z.string().url() });
const ebaySellerSchema = z.object({
  username: z.string().min(1),
  feedbackScore: z.number().int().nonnegative().optional(),
  feedbackPercentage: z.string().optional(),
});
const ebayShippingOptionSchema = z
  .object({
    shippingCost: ebayAmountSchema.optional(),
  })
  .passthrough();

export const ebayItemSummarySchema = z
  .object({
    itemId: z.string().min(1),
    title: z.string().min(1),
    itemWebUrl: z.string().url(),
    price: ebayAmountSchema,
    image: ebayImageSchema.optional(),
    seller: ebaySellerSchema.optional(),
    condition: z.string().optional(),
    conditionId: z.string().optional(),
    shortDescription: z.string().optional(),
    shippingOptions: z.array(ebayShippingOptionSchema).optional(),
    itemCreationDate: z.string().datetime().optional(),
    listingMarketplaceId: z.string().optional(),
  })
  .passthrough();

export const ebaySearchResponseSchema = z
  .object({
    href: z.string().url().optional(),
    next: z.string().url().optional(),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
    itemSummaries: z.array(ebayItemSummarySchema).default([]),
  })
  .passthrough();

export const ebayItemResponseSchema = ebayItemSummarySchema.extend({
  legacyItemWebUrl: z.string().url().optional(),
  description: z.string().optional(),
  additionalImages: z.array(ebayImageSchema).optional(),
  localizedAspects: z
    .array(
      z.object({
        name: z.string().min(1),
        value: z.string(),
      }),
    )
    .optional(),
  itemLocation: z
    .object({
      city: z.string().optional(),
      stateOrProvince: z.string().optional(),
      country: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .passthrough()
    .optional(),
  itemEndDate: z.string().datetime().optional(),
  estimatedAvailabilities: z
    .array(
      z
        .object({
          estimatedAvailabilityStatus: z.string().optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export const ebayOAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().min(1),
});

export const ebayErrorResponseSchema = z
  .object({
    errors: z
      .array(
        z
          .object({
            errorId: z.number().int().optional(),
            domain: z.string().optional(),
            category: z.string().optional(),
            message: z.string().optional(),
            longMessage: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type EbayItemSummary = z.infer<typeof ebayItemSummarySchema>;
export type EbayItemResponse = z.infer<typeof ebayItemResponseSchema>;

import { z } from 'zod';

const mercadoLivrePictureSchema = z
  .object({
    url: z.string().url().optional(),
    secure_url: z.string().url().optional(),
  })
  .passthrough();

const mercadoLivreAttributeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    value_name: z.string().optional().nullable(),
  })
  .passthrough();

export const mercadoLivreItemSchema = z
  .object({
    id: z.string().regex(/^ML[A-Z][A-Z0-9-]+$/),
    title: z.string().min(1),
    permalink: z.string().url(),
    price: z.number().nonnegative(),
    currency_id: z.string().length(3),
    thumbnail: z.string().url().optional().nullable(),
    seller_id: z.number().int().positive().optional(),
    condition: z.string().optional(),
    status: z.string().optional(),
    available_quantity: z.number().int().nonnegative().optional(),
    sold_quantity: z.number().int().nonnegative().optional(),
    date_created: z.string().datetime().optional(),
    last_updated: z.string().datetime().optional(),
    pictures: z.array(mercadoLivrePictureSchema).optional(),
    attributes: z.array(mercadoLivreAttributeSchema).optional(),
  })
  .passthrough();

export const mercadoLivreSearchResponseSchema = z
  .object({
    results: z.array(mercadoLivreItemSchema),
    paging: z.object({
      total: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
    }),
  })
  .passthrough();

export type MercadoLivreItem = z.infer<typeof mercadoLivreItemSchema>;
export type MercadoLivreSearchResponse = z.infer<typeof mercadoLivreSearchResponseSchema>;

export const mercadoLivreOAuthTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
});
export type MercadoLivreOAuthToken = z.infer<typeof mercadoLivreOAuthTokenSchema>;

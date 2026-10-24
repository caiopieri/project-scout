import { z } from 'zod';

/**
 * The only part of the Swappa connector a maintenance agent may change. It is data, not code:
 * each field lists HTML class or attribute tokens (alternatives, any of which may match), and the
 * token grammar cannot express a regular expression, a script or a URL.
 */
const token = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const attribute = z.string().regex(/^data-[a-z0-9-]{1,60}$/);
const alternatives = <T extends z.ZodTypeAny>(item: T) => z.array(item).min(1).max(4);

export const swappaSelectorMapSchema = z
  .object({
    containerClass: alternatives(token),
    cardClass: alternatives(token),
    codeAttribute: alternatives(attribute),
    priceAttribute: alternatives(attribute),
  })
  .strict();
export type SwappaSelectorMap = z.infer<typeof swappaSelectorMapSchema>;

export const DEFAULT_SWAPPA_SELECTORS: SwappaSelectorMap = {
  containerClass: ['xui_card_slots'],
  cardClass: ['xui_card_wrapper'],
  codeAttribute: ['data-code'],
  priceAttribute: ['data-price'],
};

/** True when `candidate` keeps every token of `current` and only appends alternatives. */
export const isAdditiveSelectorChange = (
  current: SwappaSelectorMap,
  candidate: SwappaSelectorMap,
) =>
  (Object.keys(current) as Array<keyof SwappaSelectorMap>).every((field) =>
    current[field].every((value, index) => candidate[field][index] === value),
  );

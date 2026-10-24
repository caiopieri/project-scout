import { parseSwappaListingsPage } from './index';
import {
  isAdditiveSelectorChange,
  swappaSelectorMapSchema,
  type SwappaSelectorMap,
} from './selectors';

export interface SandboxCheck {
  name: string;
  passed: boolean;
  detail: string;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Replays a candidate selector map against the recorded pages without touching the source:
 * the page that used to work must parse to exactly the same cards (meaning unchanged), the page
 * that broke must now yield enough cards, and prices on it must stay in the same order of
 * magnitude — a shift in meaning (cents, shipping folded in) needs a human, not a selector.
 */
export const evaluateSwappaSelectorCandidate = (input: {
  baselineHtml: string;
  brokenHtml: string;
  current: SwappaSelectorMap;
  candidate: unknown;
  expectedMinItems: number;
}) => {
  const checks: SandboxCheck[] = [];
  const parsed = swappaSelectorMapSchema.safeParse(input.candidate);
  checks.push({
    name: 'schema',
    passed: parsed.success,
    detail: parsed.success ? 'tokens only' : 'candidate is not a valid selector map',
  });
  if (!parsed.success) return { passed: false, checks };
  const candidate = parsed.data;

  const additive = isAdditiveSelectorChange(input.current, candidate);
  checks.push({
    name: 'additive',
    passed: additive,
    detail: additive ? 'only appends alternatives' : 'removes or reorders a working selector',
  });

  const baselineBefore = parseSwappaListingsPage(input.baselineHtml, input.current);
  const baselineAfter = parseSwappaListingsPage(input.baselineHtml, candidate);
  const unchanged =
    baselineBefore.length > 0 && JSON.stringify(baselineBefore) === JSON.stringify(baselineAfter);
  checks.push({
    name: 'baseline_unchanged',
    passed: unchanged,
    detail: `${baselineBefore.length} cards before, ${baselineAfter.length} after${unchanged ? ', identical' : ''}`,
  });

  const reproduced = parseSwappaListingsPage(input.brokenHtml, input.current).length;
  checks.push({
    name: 'failure_reproduced',
    passed: reproduced < input.expectedMinItems,
    detail: `current selectors find ${reproduced} cards on the broken page`,
  });

  const repaired = parseSwappaListingsPage(input.brokenHtml, candidate);
  const uniqueCodes = new Set(repaired.map((card) => card.code)).size === repaired.length;
  checks.push({
    name: 'broken_page_parses',
    passed: repaired.length >= input.expectedMinItems && uniqueCodes,
    detail: `${repaired.length} cards (minimum ${input.expectedMinItems})${uniqueCodes ? '' : ', duplicate codes'}`,
  });

  const ratio =
    repaired.length && baselineBefore.length
      ? median(repaired.map((card) => card.priceMinor)) /
        median(baselineBefore.map((card) => card.priceMinor))
      : 0;
  checks.push({
    name: 'price_meaning_kept',
    passed: ratio >= 0.5 && ratio <= 2,
    detail: `median price ratio broken/baseline = ${ratio.toFixed(2)} (allowed 0.50–2.00)`,
  });

  return {
    passed: checks.every((check) => check.passed),
    checks,
    candidate,
    cardsOnBrokenPage: repaired.length,
  };
};

/** A reviewable unified-style patch of the selector map, for the human approving the change. */
export const selectorPatch = (current: SwappaSelectorMap, candidate: SwappaSelectorMap) =>
  (Object.keys(current) as Array<keyof SwappaSelectorMap>)
    .flatMap((field) => {
      const added = candidate[field].filter((value) => !current[field].includes(value));
      const removed = current[field].filter((value) => !candidate[field].includes(value));
      return [
        ...removed.map((value) => `- ${field}: ${value}`),
        ...added.map((value) => `+ ${field}: ${value}`),
      ];
    })
    .join('\n');

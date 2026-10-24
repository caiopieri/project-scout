import type { AuctionTerms } from '@scout/schemas';

/** Collapses an auction's HTML terms into plain text; entities decoded, tags dropped. */
export const auctionTermsText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|p|div|li|tr|h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, 20_000);

const UNIT_WORDS =
  '(?:laptops?|notebooks?|computers?|desktops?|cpus?|tablets?|ipads?|iphones?|phones?|smartphones?|monitors?|servers?|printers?|cameras?|scanners?|switch(?:es)?|routers?|projectors?|units?|pcs|pieces|unidades|computadores|celulares)';
// A count is never a measurement ("2 inch printer") nor a container ("one lot of monitors").
const COUNT_GUARD =
  '(?!\\s*(?:inch(?:es)?|in\\b|"|cm|mm|[kmgt]b\\b|ghz|hz|dpi|watts?|w\\b|volts?|v\\b|years?|months?|days?|hours?|lots?\\b|pallets?\\b|box(?:es)?\\b|groups?\\b))';
const SMALL_NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const NUMBER_WORD = `(?:(?:${TENS.slice(2).join('|')})(?:[- ](?:${SMALL_NUMBERS.slice(1, 10).join('|')}))?|${SMALL_NUMBERS.slice(1).join('|')})`;

/** "27", "twenty seven", "twenty-seven", "nine" → number. */
const countValue = (raw: string) => {
  const word = raw.toLowerCase().trim();
  if (/^\d+$/.test(word)) return Number(word);
  const [tens, unit] = word.split(/[- ]/);
  const tensValue = TENS.indexOf(tens);
  if (tensValue >= 2) return tensValue * 10 + (unit ? SMALL_NUMBERS.indexOf(unit) : 0);
  return SMALL_NUMBERS.indexOf(word);
};

const snippet = (text: string, index: number, length: number) =>
  text
    .slice(Math.max(0, index - 40), index + length + 40)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

const find = (text: string, pattern: RegExp) => {
  const match = pattern.exec(text);
  return match ? { match, evidence: snippet(text, match.index, match[0].length) } : null;
};

const money = (raw: string) => {
  const normalized =
    raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) : undefined;
};

/**
 * Reads what an auction's terms state about cost and condition. Deterministic and evidence-first:
 * every fact keeps the snippet it came from, and anything the text does not say stays absent
 * (never defaulted) so the cost can call it unknown.
 */
export const parseAuctionTerms = (title: string, text: string): AuctionTerms => {
  const terms: AuctionTerms = { parserVersion: 'auction-terms.v1' };
  const all = `${title}\n${text}`;

  // Most specific first: a count leading the title, "contains N", an explicit quantity field;
  // the loose "N … laptops" pattern comes last, needs a quantifier or a boundary before the
  // number and no digits in between, so model numbers ("ProBook 630 Laptops") are not counts.
  // Quantity, most explicit first. Explicit enumerations are summed; a count is never a
  // measurement or a container; number words count only in the title or a "contains" clause;
  // several loose counts in the text are ambiguous and give no quantity (the user can assume one).
  const words = `(?:[A-Za-z][A-Za-z-]*\\s+){0,4}`;
  const count = `(\\d{1,4}|${NUMBER_WORD})${COUNT_GUARD}`;
  const unitAfter = `\\s+${words}${UNIT_WORDS}\\b`;
  const plainTitle = title.replace(/all[- ]in[- ]one/gi, 'allinone');
  const plainText = text.replace(/all[- ]in[- ]one/gi, 'allinone');
  const setQuantity = (value: number, evidence: string) => {
    if (value > 0 && !terms.quantity) terms.quantity = { value, evidence };
  };
  const enumerated = [
    ...plainTitle.matchAll(new RegExp(`\\((\\d{1,4})\\)\\s*${words}${UNIT_WORDS}\\b`, 'gi')),
  ];
  if (enumerated.length)
    setQuantity(
      enumerated.reduce((sum, match) => sum + Number(match[1]), 0),
      snippet(title, 0, title.length),
    );
  const leading = find(plainTitle, new RegExp(`^\\s*${count}${unitAfter}`, 'i'));
  if (leading) setQuantity(countValue(leading.match[1]), leading.evidence);
  const each = find(plainTitle, /\b(\d{1,4})\s*ea\b/i);
  if (each) setQuantity(Number(each.match[1]), each.evidence);
  const clause = find(plainText, /\b(?:contains|consists? of|lot of|cont[eé]m)\s+([^.]{1,300})/i);
  if (clause) {
    // A breakdown after "consisting of" restates the total; it is not added to it.
    const listing = clause.match[1].split(
      /\b(?:consisting of|including|of which|comprised of)\b/i,
    )[0];
    const listed = [...listing.matchAll(/\((\d{1,4})\)/g)];
    // Between an explicit "(N)" and its noun, model numbers are fine ("(74) Cisco C3850 switches").
    const modelWords = `(?:[A-Za-z0-9][\\w.-]*\\s+){0,5}`;
    const units = [
      ...listing.matchAll(new RegExp(`\\((\\d{1,4})\\)\\s*${modelWords}${UNIT_WORDS}\\b`, 'gi')),
    ];
    const first = new RegExp(`^${count}${unitAfter}`, 'i').exec(listing);
    // Every listed count must be a unit; a lot mixing units with cables or instruments has no
    // single quantity.
    if (listed.length && units.length === listed.length)
      setQuantity(
        units.reduce((sum, match) => sum + Number(match[1]), 0),
        clause.evidence,
      );
    else if (!listed.length && first) setQuantity(countValue(first[1]), clause.evidence);
  }
  const field = find(text, /\b(?:quantity|quantidade)[:\s]+(\d{1,4})\b/i);
  if (field) setQuantity(Number(field.match[1]), field.evidence);
  const loose = [
    ...plainText.matchAll(
      new RegExp(
        `(?:^|[.:;,(]\\s*|\\b(?:of|with|includes?|approximately|total(?: of)?)\\s+)(\\d{1,3})${COUNT_GUARD}${unitAfter}`,
        'gi',
      ),
    ),
  ];
  if (loose.length === 1)
    setQuantity(Number(loose[0][1]), snippet(text, loose[0].index ?? 0, loose[0][0].length));

  const noPremium = find(text, /\bno buyer'?s premium\b|\bsem comiss[aã]o\b/i);
  const premium =
    find(text, /buyer'?s premium[^.%\d]{0,40}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i) ??
    find(
      text,
      /comiss[aã]o (?:do leiloeiro|de leil[aã]o)?[^.%\d]{0,40}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i,
    );
  if (noPremium) terms.buyerPremiumPercent = { value: 0, evidence: noPremium.evidence };
  else if (premium)
    terms.buyerPremiumPercent = {
      value: Number(premium.match[1].replace(',', '.')),
      evidence: premium.evidence,
    };

  const fee =
    find(
      text,
      /(?:administrative|admin|processing|documentation) fee[^$\d]{0,30}\$\s?(\d{1,5}(?:[.,]\d{2})?)/i,
    ) ??
    find(
      text,
      /taxa (?:administrativa|de administra[cç][aã]o)[^R$\d]{0,30}R\$\s?(\d{1,5}(?:[.,]\d{2})?)/i,
    );
  if (fee) {
    const value = money(fee.match[1]);
    if (value !== undefined) terms.adminFeeMinor = { value, evidence: fee.evidence };
  }

  const exempt = find(text, /\b(?:tax[- ]exempt|no sales tax|not subject to sales tax)\b/i);
  const tax = find(text, /\bsales tax\b|\buse tax\b|\bICMS\b/i);
  if (exempt) terms.salesTaxApplies = { value: false, evidence: exempt.evidence };
  else if (tax) terms.salesTaxApplies = { value: true, evidence: tax.evidence };

  const removes = find(
    text,
    /(?:successful bidder|purchaser|buyer|arrematante)[^.]{0,80}(?:responsible|respons[aá]vel)[^.]{0,80}(?:removal|remov|retirada|loading|shipping)/i,
  );
  if (removes) terms.buyerRemoves = { value: true, evidence: removes.evidence };

  const removalDays =
    find(text, /remov\w*[^.]{0,60}?within\s+(\d{1,2})\s+(?:business|calendar|working)?\s*days?/i) ??
    find(text, /(\d{1,2})\s+(?:business|calendar|working)?\s*days?[^.]{0,40}(?:to|for)\s+remov/i) ??
    find(text, /retirada[^.]{0,60}?(\d{1,2})\s+dias/i);
  if (removalDays)
    terms.removalDays = { value: Number(removalDays.match[1]), evidence: removalDays.evidence };

  const paymentDays =
    find(text, /payment[^.]{0,60}?within\s+(\d{1,2})\s+(?:business|calendar|working)?\s*days?/i) ??
    find(text, /\bpaid (?:for )?within\s+(\d{1,2})\s+(?:business|calendar|working)?\s*days?/i) ??
    find(text, /pagamento[^.]{0,60}?(\d{1,2})\s+dias/i);
  if (paymentDays)
    terms.paymentDays = { value: Number(paymentDays.match[1]), evidence: paymentDays.evidence };

  const flag = (key: keyof AuctionTerms, pattern: RegExp) => {
    const hit = find(all, pattern);
    if (hit) (terms as Record<string, unknown>)[key] = { value: true, evidence: hit.evidence };
  };
  flag('asIs', /\bas[- ]is\b|\bwhere[- ]is\b|no estado em que se encontra/i);
  flag('partsMayBeMissing', /parts (?:may be|are) missing|missing parts|pe[cç]as faltantes/i);
  flag(
    'storageRemoved',
    /hard drives?[^.]{0,40}(?:removed|not included)|(?:no|without) (?:hard drives?|hdd|ssd|storage)|sem (?:hd|ssd|disco)/i,
  );
  flag(
    'memoryRemoved',
    // "RAM: DDR4 … Hard Drive Status: Removed" must not count: RAM itself has to be the subject.
    /\b(?:hard drives?|hdds?|storage) (?:and|&) ram (?:have been |were |are )?removed|\bram (?:has been |have been |was |were |is |are )?(?:removed|not included)|sem mem[oó]ria/i,
  );
  flag('inspectionByAppointment', /inspection[^.]{0,60}appointment|visita[^.]{0,40}agendamento/i);
  return terms;
};

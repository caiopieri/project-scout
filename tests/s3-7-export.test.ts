import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { exportListings } from '../apps/worker/src/ListingExport';

const listing = (overrides: Record<string, unknown>) =>
  ({
    title: 'iPhone 13',
    url: 'https://www.ebay.com/itm/1',
    condition: 'Used',
    currency: 'USD',
    landedCost: {
      status: 'known',
      totalMinor: 25150,
      components: { itemPrice: { amountMinor: 24000 }, shipping: { amountMinor: 1150 } },
    },
    referenceDiscount: {
      status: 'known',
      referenceMedianMinor: 30000,
      discountBasisPoints: 1617,
      sample: { nRaw: 14 },
    },
    score: { status: 'known', value: 61, policyVersion: 'listing-score.v1' },
    userAction: { favorite: true, label: 'shortlisted' },
    ...overrides,
  }) as never;

const hostile = listing({
  title: '=HYPERLINK("http://evil.example","click") "quoted", comma',
  referenceDiscount: {
    status: 'NAO_RANQUEAVEL',
    reasons: ['CUSTO_INDETERMINADO', 'AMOSTRA_INSUFICIENTE'],
    sample: null,
  },
  landedCost: {
    status: 'indeterminate',
    totalMinor: null,
    components: { itemPrice: { amountMinor: 9900 }, shipping: { amountMinor: null } },
  },
  score: { status: 'INCOMPLETO', value: null, policyVersion: 'listing-score.v1' },
  userAction: null,
});

describe('S3.7 export of the current selection', () => {
  it('writes CSV with escaping, unknowns as empty cells and formulas neutralized', () => {
    const file = exportListings([listing({}), hostile], 'csv');
    expect(file.contentType).toContain('text/csv');
    const lines = String(file.body).replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toBe(
      'group,title,url,condition,currency,price,shipping,landed_cost,landed_cost_status,reference_median,reference_distance_pct,reference_n,refusal_reasons,score,score_status,score_policy,heart,label',
    );
    expect(lines[1]).toBe(
      'rankable,iPhone 13,https://www.ebay.com/itm/1,Used,USD,240,11.5,251.5,known,300,16.17,14,,61,known,listing-score.v1,yes,shortlisted',
    );
    expect(lines[2]).toBe(
      `unbacked,"'=HYPERLINK(""http://evil.example"",""click"") ""quoted"", comma",https://www.ebay.com/itm/1,Used,USD,99,,,indeterminate,,,,CUSTO_INDETERMINADO+AMOSTRA_INSUFICIENTE,,INCOMPLETO,listing-score.v1,no,`,
    );
  });

  it('writes a valid XLSX package with inline strings and numeric cells', () => {
    const file = exportListings([listing({}), hostile], 'xlsx');
    const parts = unzipSync(file.body as Uint8Array);
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = strFromU8(parts['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('<c r="H2"><v>251.5</v></c>');
    expect(sheet).toContain("'=HYPERLINK(&quot;http://evil.example&quot;");
    expect(sheet).not.toContain('<f>');
  });
});

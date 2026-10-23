import { strToU8, zipSync } from 'fflate';
import type { ListingTransport } from '@scout/schemas';

export type ExportFormat = 'csv' | 'xlsx';

const COLUMNS = [
  'group',
  'title',
  'url',
  'condition',
  'currency',
  'price',
  'shipping',
  'landed_cost',
  'landed_cost_status',
  'reference_median',
  'reference_distance_pct',
  'reference_n',
  'refusal_reasons',
  'score',
  'score_status',
  'score_policy',
  'heart',
  'label',
] as const;

type Cell = string | number | null;

const minor = (amount: number | null | undefined) =>
  amount === null || amount === undefined ? null : Number((amount / 100).toFixed(2));

export const listingExportRows = (listings: ListingTransport[]): Cell[][] =>
  listings.map((listing) => {
    const discount = listing.referenceDiscount;
    const cost = listing.landedCost;
    return [
      discount?.status === 'known' ? 'rankable' : 'unbacked',
      listing.title,
      listing.url,
      listing.condition,
      listing.currency,
      minor(cost?.components.itemPrice.amountMinor),
      minor(cost?.components.shipping.amountMinor),
      minor(cost?.totalMinor),
      cost?.status ?? 'indeterminate',
      discount?.status === 'known' ? minor(discount.referenceMedianMinor) : null,
      discount?.status === 'known' ? discount.discountBasisPoints / 100 : null,
      discount?.sample?.nRaw ?? null,
      discount?.status === 'NAO_RANQUEAVEL' ? discount.reasons.join('+') : null,
      listing.score?.value ?? null,
      listing.score?.status ?? null,
      listing.score?.policyVersion ?? null,
      listing.userAction?.favorite ? 'yes' : 'no',
      listing.userAction?.label ?? null,
    ];
  });

// Collected titles are hostile: a cell starting with = + - @ would run as a formula when the
// file is opened in a spreadsheet, so text cells are neutralized with a leading apostrophe.
const safeText = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

const toCsv = (rows: Cell[][]) =>
  [COLUMNS as readonly string[], ...rows]
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null) return '';
          if (typeof cell === 'number') return String(cell);
          const text = safeText(cell);
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\r\n');

const xmlEscape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnName = (index: number) => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

const toXlsx = (rows: Cell[][]) => {
  const sheetRows = [COLUMNS as readonly Cell[], ...rows]
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          if (cell === null) return '';
          if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(safeText(cell))}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="listings" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
    ),
  };
  return zipSync(files);
};

export const exportListings = (listings: ListingTransport[], format: ExportFormat) => {
  const rows = listingExportRows(listings);
  const stamp = new Date().toISOString().slice(0, 10);
  return format === 'csv'
    ? {
        body: `﻿${toCsv(rows)}`,
        contentType: 'text/csv; charset=utf-8',
        filename: `scout-listings-${stamp}.csv`,
      }
    : {
        body: toXlsx(rows),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `scout-listings-${stamp}.xlsx`,
      };
};

import { assertBarcodeAvailable } from '@/db/barcode';
import { db, type Product } from '@/db/schema';
import { downloadTextFile } from '@/lib/downloadFile';
import { normalizeQty, parseQtyInput } from '@/lib/quantity';

export const PRODUCT_CSV_HEADERS = ['name', 'price', 'cost_price', 'stock', 'barcode'] as const;

export type ProductCsvRow = {
  name: string;
  price: number;
  cost_price: number | null;
  stock: number;
  barcode: string | null;
  lineNumber: number;
};

export type ProductImportSkip = {
  lineNumber: number;
  reason: string;
  name?: string;
};

export type ProductImportResult = {
  imported: number;
  skipped: ProductImportSkip[];
};

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Split one CSV line into fields, honoring double-quoted values. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

export function productImportTemplateCsv(): string {
  const header = PRODUCT_CSV_HEADERS.join(',');
  const example = [
    csvEscape('Sample Product'),
    csvEscape(10),
    csvEscape(6.5),
    csvEscape(20),
    csvEscape('1234567890123'),
  ].join(',');
  return `${header}\n${example}\n`;
}

export function downloadProductImportTemplate(): void {
  downloadTextFile('product_import_template.csv', productImportTemplateCsv(), 'text/csv');
}

/**
 * Parse a product CSV into validated rows. Does not write to the database.
 * Unknown columns are ignored. Missing optional columns are treated as empty.
 */
export function parseProductCsv(contents: string): { rows: ProductCsvRow[]; skipped: ProductImportSkip[] } {
  const text = contents.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], skipped: [{ lineNumber: 0, reason: 'File is empty' }] };
  }

  const headerFields = parseCsvLine(lines[0]).map(normalizeHeader);
  const indexOf = (key: (typeof PRODUCT_CSV_HEADERS)[number]) => headerFields.indexOf(key);

  if (indexOf('name') < 0 || indexOf('price') < 0) {
    return {
      rows: [],
      skipped: [
        {
          lineNumber: 1,
          reason: 'CSV must include a header row with at least "name" and "price" columns',
        },
      ],
    };
  }

  const rows: ProductCsvRow[] = [];
  const skipped: ProductImportSkip[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const fields = parseCsvLine(lines[i]);
    const get = (key: (typeof PRODUCT_CSV_HEADERS)[number]) => {
      const idx = indexOf(key);
      return idx >= 0 ? (fields[idx] ?? '').trim() : '';
    };

    const name = get('name');
    const priceRaw = get('price');
    const costRaw = get('cost_price');
    const stockRaw = get('stock');
    const barcodeRaw = get('barcode');

    if (!name) {
      skipped.push({ lineNumber, reason: 'Missing name' });
      continue;
    }

    const price = Number(priceRaw.replace(/,/g, ''));
    if (!Number.isFinite(price) || price < 0) {
      skipped.push({ lineNumber, name, reason: 'Invalid selling price' });
      continue;
    }

    let cost_price: number | null = null;
    if (costRaw !== '') {
      const cost = Number(costRaw.replace(/,/g, ''));
      if (!Number.isFinite(cost) || cost < 0) {
        skipped.push({ lineNumber, name, reason: 'Invalid cost price' });
        continue;
      }
      cost_price = cost;
    }

    let stock = 0;
    if (stockRaw !== '') {
      const parsed = parseQtyInput(stockRaw);
      if (parsed == null) {
        skipped.push({ lineNumber, name, reason: 'Invalid stock quantity' });
        continue;
      }
      stock = parsed;
    }

    const barcode = barcodeRaw === '' ? null : barcodeRaw;

    rows.push({
      name,
      price,
      cost_price,
      stock: normalizeQty(stock),
      barcode,
      lineNumber,
    });
  }

  return { rows, skipped };
}

/** Insert validated rows as new products. Duplicate barcodes are skipped. */
export async function importProductRows(rows: ProductCsvRow[]): Promise<ProductImportResult> {
  const skipped: ProductImportSkip[] = [];
  let imported = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    try {
      await assertBarcodeAvailable(row.barcode);
    } catch {
      skipped.push({
        lineNumber: row.lineNumber,
        name: row.name,
        reason: 'Barcode already in use',
      });
      continue;
    }

    const product: Product = {
      id: crypto.randomUUID(),
      name: row.name,
      price: row.price,
      cost_price: row.cost_price,
      stock_quantity: row.stock,
      barcode: row.barcode,
      sku: null,
      category_id: null,
      is_temporary: 0,
      synced_at: null,
      updated_at: now,
      auto_convert_json: null,
    };

    try {
      await db.products.add(product);
      imported += 1;
    } catch (error) {
      skipped.push({
        lineNumber: row.lineNumber,
        name: row.name,
        reason: error instanceof Error ? error.message : 'Could not save product',
      });
    }
  }

  return { imported, skipped };
}

export async function importProductsFromCsv(contents: string): Promise<ProductImportResult> {
  const { rows, skipped: parseSkipped } = parseProductCsv(contents);
  const writeResult = await importProductRows(rows);
  return {
    imported: writeResult.imported,
    skipped: [...parseSkipped, ...writeResult.skipped],
  };
}

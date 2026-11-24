import { describe, expect, it } from 'vitest';
import {
  parseCsvLine,
  parseProductCsv,
  productImportTemplateCsv,
} from '@/services/productImportService';

describe('parseCsvLine', () => {
  it('splits plain fields', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps commas inside quotes', () => {
    expect(parseCsvLine('"Soap, bar",5,2')).toEqual(['Soap, bar', '5', '2']);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsvLine('"Say ""hi""",1')).toEqual(['Say "hi"', '1']);
  });
});

describe('parseProductCsv', () => {
  it('parses a valid template-shaped file', () => {
    const csv = productImportTemplateCsv();
    const { rows, skipped } = parseProductCsv(csv);
    expect(skipped).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Sample Product',
      price: 10,
      cost_price: 6.5,
      stock: 20,
      barcode: '1234567890123',
      lineNumber: 2,
    });
  });

  it('requires name and price headers', () => {
    const { rows, skipped } = parseProductCsv('sku,qty\nA,1\n');
    expect(rows).toHaveLength(0);
    expect(skipped[0]?.reason).toMatch(/name.*price/i);
  });

  it('skips invalid rows and keeps valid ones', () => {
    const csv = [
      'name,price,cost_price,stock,barcode',
      'Good Item,4.5,,10,111',
      ',9,,1,222',
      'Bad Price,abc,,1,333',
      'Ok Two,2.0,1,0,',
    ].join('\n');
    const { rows, skipped } = parseProductCsv(csv);
    expect(rows.map((r) => r.name)).toEqual(['Good Item', 'Ok Two']);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]?.reason).toMatch(/name/i);
    expect(skipped[1]?.reason).toMatch(/price/i);
  });

  it('accepts flexible header spacing/case', () => {
    const csv = 'Name, Price, Cost Price, Stock, Barcode\nTea,3,1,5,99\n';
    const { rows, skipped } = parseProductCsv(csv);
    expect(skipped).toEqual([]);
    expect(rows[0]).toMatchObject({ name: 'Tea', price: 3, cost_price: 1, stock: 5, barcode: '99' });
  });
});

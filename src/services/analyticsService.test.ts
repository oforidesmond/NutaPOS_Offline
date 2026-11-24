import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Product, type Sale, type SaleItem } from '@/db/schema';
import { dayBounds } from '@/lib/dateBounds';
import {
  comparePeriods,
  getPaymentBreakdown,
  getPeriodSummary,
  getStaffBreakdown,
  getStockHealth,
  getTopProducts,
} from '@/services/analyticsService';

function product(overrides: Partial<Product> & Pick<Product, 'id' | 'name'>): Product {
  return {
    barcode: null,
    sku: null,
    price: 10,
    cost_price: 4,
    stock_quantity: 10,
    category_id: null,
    is_temporary: 0,
    synced_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    auto_convert_json: null,
    ...overrides,
  };
}

function sale(overrides: Partial<Sale> & Pick<Sale, 'id'>): Sale {
  return {
    total_amount: 10,
    tax_amount: 0,
    discount_amount: 0,
    payment_method: 'CASH',
    sold_at: '2026-11-24T10:00:00.000Z',
    synced_at: null,
    staff_id: 'staff-a',
    branch_id: null,
    is_return: 0,
    original_sale_id: null,
    receipt_number: 'RCP-1',
    ...overrides,
  };
}

function item(overrides: Partial<SaleItem> & Pick<SaleItem, 'id' | 'sale_id' | 'product_id'>): SaleItem {
  return {
    quantity: 1,
    unit_price: 10,
    total_price: 10,
    unit_cost: 4,
    is_temporary_product: 0,
    variance_reason: null,
    variance_note: null,
    ...overrides,
  };
}

describe('analyticsService', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.products.bulkPut([
      product({ id: 'p1', name: 'Paracetamol', price: 10, stock_quantity: 2 }),
      product({ id: 'p2', name: 'Bandage', price: 5, stock_quantity: 20 }),
      product({ id: 'p3', name: 'Temp', price: 1, stock_quantity: 0, is_temporary: 1 }),
    ]);
    await db.users.bulkPut([
      {
        id: 'staff-a',
        username: 'admin',
        display_name: 'Admin',
        pin_hash: 'x',
        pin_salt: 's',
        role: 'ADMIN',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'staff-b',
        username: 'agent',
        display_name: 'Agent',
        pin_hash: 'y',
        pin_salt: 's',
        role: 'AGENT',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('summarizes gross, returns, net, and margin for a day', async () => {
    await db.sales.bulkPut([
      sale({ id: 's1', total_amount: 20, payment_method: 'CASH', staff_id: 'staff-a' }),
      sale({
        id: 's2',
        total_amount: 10,
        payment_method: 'MOBILE_MONEY',
        staff_id: 'staff-b',
        sold_at: '2026-11-24T12:00:00.000Z',
      }),
      sale({
        id: 'r1',
        total_amount: 5,
        is_return: 1,
        original_sale_id: 's1',
        payment_method: 'RETURN',
        sold_at: '2026-11-24T14:00:00.000Z',
      }),
    ]);
    await db.sale_items.bulkPut([
      item({ id: 'i1', sale_id: 's1', product_id: 'p1', quantity: 2, unit_price: 10, total_price: 20, unit_cost: 4 }),
      item({ id: 'i2', sale_id: 's2', product_id: 'p2', quantity: 2, unit_price: 5, total_price: 10, unit_cost: 2 }),
      item({ id: 'i3', sale_id: 'r1', product_id: 'p1', quantity: 0.5, unit_price: 10, total_price: 5, unit_cost: 4 }),
    ]);

    const summary = await getPeriodSummary(dayBounds('2026-11-24'));
    expect(summary.grossSales).toBe(30);
    expect(summary.returnsAmount).toBe(5);
    expect(summary.netSales).toBe(25);
    expect(summary.transactionCount).toBe(2);
    expect(summary.returnCount).toBe(1);
    expect(summary.avgBasket).toBe(15);
    // pretax: 20 + 10 - 5 = 25; profit: (20-8) + (10-4) - (5-2) = 12+6-3 = 15
    expect(summary.pretaxNetRevenue).toBe(25);
    expect(summary.grossProfit).toBe(15);
    expect(summary.marginPercent).toBe(60);
    expect(summary.profitIncomplete).toBe(false);
  });

  it('flags incomplete profit when unit_cost is null', async () => {
    await db.sales.add(sale({ id: 's1', total_amount: 10 }));
    await db.sale_items.add(
      item({ id: 'i1', sale_id: 's1', product_id: 'p1', unit_cost: null, total_price: 10 }),
    );
    const summary = await getPeriodSummary(dayBounds('2026-11-24'));
    expect(summary.linesMissingCost).toBe(1);
    expect(summary.profitIncomplete).toBe(true);
    expect(summary.grossProfit).toBe(0);
    expect(summary.marginPercent).toBeNull();
  });

  it('breaks down payments, top products, and staff', async () => {
    await db.sales.bulkPut([
      sale({ id: 's1', total_amount: 20, payment_method: 'CASH', staff_id: 'staff-a' }),
      sale({
        id: 's2',
        total_amount: 10,
        payment_method: 'CASH',
        staff_id: 'staff-b',
        sold_at: '2026-11-24T11:00:00.000Z',
      }),
    ]);
    await db.sale_items.bulkPut([
      item({ id: 'i1', sale_id: 's1', product_id: 'p1', quantity: 2, total_price: 20, unit_cost: 4 }),
      item({ id: 'i2', sale_id: 's2', product_id: 'p2', quantity: 2, total_price: 10, unit_cost: 2 }),
    ]);

    const payments = await getPaymentBreakdown(dayBounds('2026-11-24'));
    expect(payments).toEqual([{ method: 'CASH', amount: 30, count: 2 }]);

    const top = await getTopProducts(dayBounds('2026-11-24'), 10, 'revenue');
    expect(top[0].name).toBe('Paracetamol');
    expect(top[0].revenue).toBe(20);

    const staff = await getStaffBreakdown(dayBounds('2026-11-24'));
    expect(staff[0].name).toBe('admin');
    expect(staff[0].netSales).toBe(20);
    expect(staff[0].grossProfit).toBe(12);
  });

  it('reports stock health excluding temporary products', async () => {
    const health = await getStockHealth(5);
    expect(health.lowStock.map((p) => p.id)).toEqual(['p1']);
    expect(health.inventoryRetailValue).toBe(10 * 2 + 5 * 20);
  });

  it('compares against the prior equal window', async () => {
    await db.sales.bulkPut([
      sale({ id: 's-today', total_amount: 20, sold_at: '2026-11-24T10:00:00.000Z' }),
      sale({ id: 's-yest', total_amount: 10, sold_at: '2026-11-23T10:00:00.000Z' }),
    ]);
    await db.sale_items.bulkPut([
      item({ id: 'i1', sale_id: 's-today', product_id: 'p1', total_price: 20, unit_cost: 4 }),
      item({ id: 'i2', sale_id: 's-yest', product_id: 'p1', total_price: 10, unit_cost: 4 }),
    ]);
    const delta = await comparePeriods(dayBounds('2026-11-24'));
    expect(delta.current.netSales).toBe(20);
    expect(delta.previous.netSales).toBe(10);
    expect(delta.netSalesDelta).toBe(10);
    expect(delta.netSalesDeltaPercent).toBe(100);
  });
});

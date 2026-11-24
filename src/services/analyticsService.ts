import { db, type Product, type Sale, type SaleItem } from '@/db/schema';
import { listSalesInRange } from '@/db/saleRepository';
import type { IsoBounds } from '@/lib/dateBounds';
import { dayBounds, priorPeriodBounds, utcDayKey } from '@/lib/dateBounds';

export type PeriodSummary = {
  grossSales: number;
  returnsAmount: number;
  netSales: number;
  transactionCount: number;
  returnCount: number;
  avgBasket: number;
  taxAmount: number;
  discountAmount: number;
  /** Pre-tax net revenue used for margin (sale lines − return lines). */
  pretaxNetRevenue: number;
  /** Gross profit from lines with known unit_cost only. */
  grossProfit: number;
  /** Margin % on pretax lines that have cost; null if no costed revenue. */
  marginPercent: number | null;
  linesWithCost: number;
  linesMissingCost: number;
  profitIncomplete: boolean;
};

export type PaymentBucket = {
  method: string;
  amount: number;
  count: number;
};

export type TopProductRow = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type StaffBucket = {
  staffId: string;
  name: string;
  transactionCount: number;
  netSales: number;
  grossProfit: number | null;
  profitIncomplete: boolean;
};

export type StockHealth = {
  lowStock: Product[];
  inventoryRetailValue: number;
  threshold: number;
};

export type PeriodDelta = {
  current: PeriodSummary;
  previous: PeriodSummary;
  netSalesDelta: number;
  netSalesDeltaPercent: number | null;
  transactionDelta: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadSalesAndItems(bounds: IsoBounds): Promise<{ sales: Sale[]; itemsBySale: Map<string, SaleItem[]> }> {
  const sales = await listSalesInRange(bounds.dateFrom, bounds.dateTo);
  const itemsBySale = new Map<string, SaleItem[]>();
  if (sales.length === 0) return { sales, itemsBySale };

  const ids = sales.map((s) => s.id);
  const allItems = await db.sale_items.where('sale_id').anyOf(ids).toArray();
  for (const item of allItems) {
    const list = itemsBySale.get(item.sale_id) ?? [];
    list.push(item);
    itemsBySale.set(item.sale_id, list);
  }
  return { sales, itemsBySale };
}

function emptySummary(): PeriodSummary {
  return {
    grossSales: 0,
    returnsAmount: 0,
    netSales: 0,
    transactionCount: 0,
    returnCount: 0,
    avgBasket: 0,
    taxAmount: 0,
    discountAmount: 0,
    pretaxNetRevenue: 0,
    grossProfit: 0,
    marginPercent: null,
    linesWithCost: 0,
    linesMissingCost: 0,
    profitIncomplete: false,
  };
}

function summarize(sales: Sale[], itemsBySale: Map<string, SaleItem[]>): PeriodSummary {
  const out = emptySummary();
  let costedPretax = 0;
  let costedProfit = 0;

  for (const sale of sales) {
    const items = itemsBySale.get(sale.id) ?? [];
    if (sale.is_return === 1) {
      out.returnCount += 1;
      out.returnsAmount = roundMoney(out.returnsAmount + sale.total_amount);
      for (const item of items) {
        out.pretaxNetRevenue = roundMoney(out.pretaxNetRevenue - item.total_price);
        if (item.unit_cost == null || !Number.isFinite(item.unit_cost)) {
          out.linesMissingCost += 1;
        } else {
          out.linesWithCost += 1;
          const cogs = item.unit_cost * item.quantity;
          costedPretax = roundMoney(costedPretax - item.total_price);
          costedProfit = roundMoney(costedProfit - (item.total_price - cogs));
        }
      }
      continue;
    }

    out.transactionCount += 1;
    out.grossSales = roundMoney(out.grossSales + sale.total_amount);
    out.taxAmount = roundMoney(out.taxAmount + sale.tax_amount);
    out.discountAmount = roundMoney(out.discountAmount + sale.discount_amount);

    for (const item of items) {
      out.pretaxNetRevenue = roundMoney(out.pretaxNetRevenue + item.total_price);
      if (item.unit_cost == null || !Number.isFinite(item.unit_cost)) {
        out.linesMissingCost += 1;
      } else {
        out.linesWithCost += 1;
        const cogs = item.unit_cost * item.quantity;
        costedPretax = roundMoney(costedPretax + item.total_price);
        costedProfit = roundMoney(costedProfit + (item.total_price - cogs));
      }
    }
  }

  out.netSales = roundMoney(out.grossSales - out.returnsAmount);
  out.avgBasket = out.transactionCount > 0 ? roundMoney(out.grossSales / out.transactionCount) : 0;
  out.grossProfit = costedProfit;
  out.marginPercent = costedPretax !== 0 ? roundMoney((costedProfit / costedPretax) * 100) : null;
  out.profitIncomplete = out.linesMissingCost > 0;
  return out;
}

export async function getPeriodSummary(bounds: IsoBounds): Promise<PeriodSummary> {
  const { sales, itemsBySale } = await loadSalesAndItems(bounds);
  return summarize(sales, itemsBySale);
}

export async function getPaymentBreakdown(bounds: IsoBounds): Promise<PaymentBucket[]> {
  const sales = await listSalesInRange(bounds.dateFrom, bounds.dateTo);
  const map = new Map<string, PaymentBucket>();
  for (const sale of sales) {
    if (sale.is_return === 1) continue;
    const method = (sale.payment_method ?? 'UNKNOWN').toUpperCase();
    const row = map.get(method) ?? { method, amount: 0, count: 0 };
    row.amount = roundMoney(row.amount + sale.total_amount);
    row.count += 1;
    map.set(method, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export async function getTopProducts(
  bounds: IsoBounds,
  limit = 10,
  sortBy: 'revenue' | 'quantity' = 'revenue',
): Promise<TopProductRow[]> {
  const { sales, itemsBySale } = await loadSalesAndItems(bounds);
  const saleSign = new Map(sales.map((s) => [s.id, s.is_return === 1 ? -1 : 1]));
  const agg = new Map<string, { quantity: number; revenue: number }>();

  for (const [saleId, items] of itemsBySale) {
    const sign = saleSign.get(saleId) ?? 1;
    for (const item of items) {
      const row = agg.get(item.product_id) ?? { quantity: 0, revenue: 0 };
      row.quantity = roundMoney(row.quantity + sign * item.quantity);
      row.revenue = roundMoney(row.revenue + sign * item.total_price);
      agg.set(item.product_id, row);
    }
  }

  const productIds = [...agg.keys()];
  const products = productIds.length ? await db.products.where('id').anyOf(productIds).toArray() : [];
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  const rows: TopProductRow[] = [...agg.entries()].map(([productId, stats]) => ({
    productId,
    name: nameById.get(productId) ?? productId.slice(0, 8),
    quantity: stats.quantity,
    revenue: stats.revenue,
  }));

  rows.sort((a, b) => (sortBy === 'quantity' ? b.quantity - a.quantity : b.revenue - a.revenue));
  return rows.filter((r) => r.quantity !== 0 || r.revenue !== 0).slice(0, limit);
}

export async function getStaffBreakdown(bounds: IsoBounds): Promise<StaffBucket[]> {
  const { sales, itemsBySale } = await loadSalesAndItems(bounds);
  const users = await db.users.toArray();
  const nameById = new Map(users.map((u) => [u.id, u.username]));

  type Acc = {
    staffId: string;
    gross: number;
    returns: number;
    txns: number;
    costedProfit: number;
    missing: number;
    withCost: number;
  };
  const map = new Map<string, Acc>();

  for (const sale of sales) {
    const acc =
      map.get(sale.staff_id) ??
      ({
        staffId: sale.staff_id,
        gross: 0,
        returns: 0,
        txns: 0,
        costedProfit: 0,
        missing: 0,
        withCost: 0,
      } satisfies Acc);

    if (sale.is_return === 1) {
      acc.returns = roundMoney(acc.returns + sale.total_amount);
    } else {
      acc.txns += 1;
      acc.gross = roundMoney(acc.gross + sale.total_amount);
    }

    const items = itemsBySale.get(sale.id) ?? [];
    const sign = sale.is_return === 1 ? -1 : 1;
    for (const item of items) {
      if (item.unit_cost == null || !Number.isFinite(item.unit_cost)) {
        acc.missing += 1;
      } else {
        acc.withCost += 1;
        const lineProfit = item.total_price - item.unit_cost * item.quantity;
        acc.costedProfit = roundMoney(acc.costedProfit + sign * lineProfit);
      }
    }
    map.set(sale.staff_id, acc);
  }

  return [...map.values()]
    .map((acc) => ({
      staffId: acc.staffId,
      name: nameById.get(acc.staffId) ?? acc.staffId.slice(0, 8),
      transactionCount: acc.txns,
      netSales: roundMoney(acc.gross - acc.returns),
      grossProfit: acc.withCost > 0 ? acc.costedProfit : null,
      profitIncomplete: acc.missing > 0,
    }))
    .sort((a, b) => b.netSales - a.netSales);
}

export async function getStockHealth(threshold = 5): Promise<StockHealth> {
  const products = await db.products.filter((p) => p.is_temporary !== 1).toArray();
  let inventoryRetailValue = 0;
  const lowStock: Product[] = [];
  for (const p of products) {
    inventoryRetailValue = roundMoney(inventoryRetailValue + p.price * Math.max(0, p.stock_quantity));
    if (p.stock_quantity <= threshold) lowStock.push(p);
  }
  lowStock.sort((a, b) => a.stock_quantity - b.stock_quantity || a.name.localeCompare(b.name));
  return { lowStock, inventoryRetailValue, threshold };
}

export async function comparePeriods(currentBounds: IsoBounds, now = new Date()): Promise<PeriodDelta> {
  const previousBounds = priorPeriodBounds(currentBounds, now);
  const [current, previous] = await Promise.all([
    getPeriodSummary(currentBounds),
    getPeriodSummary(previousBounds),
  ]);
  const netSalesDelta = roundMoney(current.netSales - previous.netSales);
  const netSalesDeltaPercent =
    previous.netSales !== 0 ? roundMoney((netSalesDelta / previous.netSales) * 100) : null;
  return {
    current,
    previous,
    netSalesDelta,
    netSalesDeltaPercent,
    transactionDelta: current.transactionCount - previous.transactionCount,
  };
}

export async function loadTodayGlance(): Promise<{ netSales: number; transactionCount: number }> {
  const summary = await getPeriodSummary(dayBounds(utcDayKey()));
  return { netSales: summary.netSales, transactionCount: summary.transactionCount };
}

export const analyticsService = {
  getPeriodSummary,
  getPaymentBreakdown,
  getTopProducts,
  getStaffBreakdown,
  getStockHealth,
  comparePeriods,
  loadTodayGlance,
};

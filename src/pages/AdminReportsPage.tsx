import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { RequireAdmin } from '@/components/RequireAuth';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import {
  dateBounds,
  shiftDayKey,
  utcDayKey,
  type DateRangePreset,
} from '@/lib/dateBounds';
import {
  comparePeriods,
  getPaymentBreakdown,
  getStaffBreakdown,
  getStockHealth,
  getTopProducts,
  type PaymentBucket,
  type PeriodDelta,
  type PeriodSummary,
  type StaffBucket,
  type StockHealth,
  type TopProductRow,
} from '@/services/analyticsService';
import { text } from '@/theme';

type ReportPreset = Extract<DateRangePreset, 'today' | 'yesterday' | 'week' | 'month' | 'custom'>;

function money(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(0)}%`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="report-kpi">
      <p className="report-kpi-label" style={text.caption}>
        {label}
      </p>
      <p className="report-kpi-value" style={text.headline}>
        {value}
      </p>
      {hint ? (
        <p className="report-kpi-hint" style={text.caption}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function paymentBarWidth(bucket: PaymentBucket, max: number): string {
  if (max <= 0) return '0%';
  return `${Math.max(4, Math.round((bucket.amount / max) * 100))}%`;
}

function AdminReportsInner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDay = searchParams.get('day')?.trim() || utcDayKey();
  const initialPreset = (searchParams.get('range') as ReportPreset | null) ?? 'today';

  const [preset, setPreset] = useState<ReportPreset>(
    ['today', 'yesterday', 'week', 'month', 'custom'].includes(initialPreset) ? initialPreset : 'today',
  );
  const [customDay, setCustomDay] = useState(initialDay);
  const [topMode, setTopMode] = useState<'revenue' | 'quantity'>('revenue');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [delta, setDelta] = useState<PeriodDelta | null>(null);
  const [payments, setPayments] = useState<PaymentBucket[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [staff, setStaff] = useState<StaffBucket[]>([]);
  const [stock, setStock] = useState<StockHealth | null>(null);

  const bounds = useMemo(() => dateBounds(preset, new Date(), customDay), [preset, customDay]);

  const historyQuery = useMemo(() => {
    const q = new URLSearchParams();
    if (bounds.dateFrom) q.set('from', bounds.dateFrom);
    if (bounds.dateTo) q.set('to', bounds.dateTo);
    if (preset === 'today' || preset === 'yesterday' || preset === 'custom') {
      q.set('range', 'today');
    } else if (preset === 'week') q.set('range', 'week');
    else if (preset === 'month') q.set('range', 'month');
    return q.toString();
  }, [bounds, preset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [periodDelta, paymentRows, tops, staffRows, stockHealth] = await Promise.all([
        comparePeriods(bounds),
        getPaymentBreakdown(bounds),
        getTopProducts(bounds, 10, topMode),
        getStaffBreakdown(bounds),
        getStockHealth(5),
      ]);
      setDelta(periodDelta);
      setSummary(periodDelta.current);
      setPayments(paymentRows);
      setTopProducts(tops);
      setStaff(staffRows);
      setStock(stockHealth);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reports');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [bounds, topMode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('range', preset);
    if (preset === 'custom' || preset === 'today' || preset === 'yesterday') {
      next.set('day', preset === 'custom' ? customDay : preset === 'yesterday' ? shiftDayKey(utcDayKey(), -1) : utcDayKey());
    }
    setSearchParams(next, { replace: true });
  }, [preset, customDay, setSearchParams]);

  const selectPreset = (next: ReportPreset) => {
    setPreset(next);
    if (next === 'today') setCustomDay(utcDayKey());
    if (next === 'yesterday') setCustomDay(shiftDayKey(utcDayKey(), -1));
  };

  const stepDay = (deltaDays: number) => {
    const base =
      preset === 'custom' || preset === 'today' || preset === 'yesterday'
        ? customDay || utcDayKey()
        : utcDayKey();
    const next = shiftDayKey(base, deltaDays);
    setCustomDay(next);
    setPreset('custom');
  };

  const maxPayment = payments[0]?.amount ?? 0;
  const empty = summary != null && summary.transactionCount === 0 && summary.returnCount === 0;

  return (
    <Screen header={<GlassHeader title="Reports" backTo="/admin" />}>
      <div className="stack">
        <p style={text.callout}>On-device sales for this shop. Pick a day or range to see how the counter performed.</p>

        <div className="filter-chips" role="group" aria-label="Report range">
          {(
            [
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['week', '7 days'],
              ['month', 'Month'],
              ['custom', 'Day'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip${preset === key ? ' filter-chip-on' : ''}`}
              aria-pressed={preset === key}
              onClick={() => selectPreset(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="report-day-nav">
          <Button title="← Prev day" variant="secondary" onClick={() => stepDay(-1)} />
          <TextField
            label="Calendar day"
            type="date"
            value={customDay}
            onChange={(event) => {
              setCustomDay(event.target.value || utcDayKey());
              setPreset('custom');
            }}
          />
          <Button title="Next day →" variant="secondary" onClick={() => stepDay(1)} />
        </div>

        {error ? <FeedbackBanner variant="error" message={error} /> : null}
        {loading ? <p style={text.callout}>Loading reports…</p> : null}

        {!loading && summary ? (
          <>
            {empty ? (
              <div className="history-empty">
                <p style={text.headline}>No sales in this period</p>
                <p style={text.callout}>Try another day, or complete a checkout on POS.</p>
              </div>
            ) : (
              <>
                <section className="report-section" aria-label="Snapshot">
                  <p style={text.title2}>Snapshot</p>
                  {delta ? (
                    <p style={text.caption}>
                      vs prior period: net {money(delta.netSalesDelta)} ({pct(delta.netSalesDeltaPercent)}) · txns{' '}
                      {delta.transactionDelta >= 0 ? '+' : ''}
                      {delta.transactionDelta}
                    </p>
                  ) : null}
                  <div className="report-kpi-grid">
                    <Kpi label="Net sales" value={money(summary.netSales)} hint={`Gross ${money(summary.grossSales)}`} />
                    <Kpi label="Transactions" value={String(summary.transactionCount)} hint={`Avg basket ${money(summary.avgBasket)}`} />
                    <Kpi label="Returns" value={money(summary.returnsAmount)} hint={`${summary.returnCount} refunds`} />
                    <Kpi
                      label="Gross profit"
                      value={money(summary.grossProfit)}
                      hint={summary.marginPercent != null ? `Margin ${summary.marginPercent.toFixed(1)}%` : 'Margin —'}
                    />
                    <Kpi label="Tax" value={money(summary.taxAmount)} />
                    <Kpi label="Discounts" value={money(summary.discountAmount)} />
                  </div>
                  {summary.profitIncomplete ? (
                    <FeedbackBanner
                      variant="warning"
                      message={`Profit incomplete — ${summary.linesMissingCost} line(s) missing cost (sales before this update).`}
                    />
                  ) : null}
                </section>

                <section className="report-section" aria-label="Payment mix">
                  <p style={text.title2}>Payment mix</p>
                  <p style={text.caption}>MIXED is a label only — split tenders are not stored.</p>
                  <div className="stack">
                    {payments.length === 0 ? (
                      <p style={text.callout}>No payments in this period.</p>
                    ) : (
                      payments.map((bucket) => (
                        <div key={bucket.method} className="report-pay-row">
                          <div className="report-pay-meta">
                            <span style={text.body}>{bucket.method}</span>
                            <span style={text.footnote}>
                              {money(bucket.amount)} · {bucket.count}
                            </span>
                          </div>
                          <div className="report-pay-track" aria-hidden>
                            <div className="report-pay-fill" style={{ width: paymentBarWidth(bucket, maxPayment) }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="report-section" aria-label="Top products">
                  <div className="report-section-head">
                    <p style={text.title2}>Top products</p>
                    <div className="filter-chips" role="group" aria-label="Sort top products">
                      <button
                        type="button"
                        className={`filter-chip${topMode === 'revenue' ? ' filter-chip-on' : ''}`}
                        aria-pressed={topMode === 'revenue'}
                        onClick={() => setTopMode('revenue')}
                      >
                        Revenue
                      </button>
                      <button
                        type="button"
                        className={`filter-chip${topMode === 'quantity' ? ' filter-chip-on' : ''}`}
                        aria-pressed={topMode === 'quantity'}
                        onClick={() => setTopMode('quantity')}
                      >
                        Units
                      </button>
                    </div>
                  </div>
                  {topProducts.length === 0 ? (
                    <p style={text.callout}>No product lines in this period.</p>
                  ) : (
                    <div className="stack">
                      {topProducts.map((row) => (
                        <div key={row.productId} className="list-row report-list-row">
                          <div>
                            <p style={text.body}>{row.name}</p>
                            <p style={text.footnote}>
                              {row.quantity} units · {money(row.revenue)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="report-section" aria-label="Staff">
                  <p style={text.title2}>By staff</p>
                  {staff.length === 0 ? (
                    <p style={text.callout}>No staff activity in this period.</p>
                  ) : (
                    <div className="stack">
                      {staff.map((row) => (
                        <div key={row.staffId} className="list-row report-list-row">
                          <div>
                            <p style={text.body}>{row.name}</p>
                            <p style={text.footnote}>
                              {row.transactionCount} sales · net {money(row.netSales)}
                              {row.grossProfit != null ? ` · profit ${money(row.grossProfit)}` : ''}
                              {row.profitIncomplete ? ' · cost incomplete' : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            <section className="report-section" aria-label="Stock">
              <p style={text.title2}>Stock attention</p>
              <p style={text.caption}>
                Inventory retail value {money(stock?.inventoryRetailValue ?? 0)}. Reorder points & expiry coming later.
              </p>
              {stock && stock.lowStock.length > 0 ? (
                <div className="stack">
                  {stock.lowStock.slice(0, 12).map((p) => (
                    <div key={p.id} className="list-row report-list-row">
                      <div>
                        <p style={text.body}>{p.name}</p>
                        <p style={text.footnote}>
                          Qty {p.stock_quantity} · {money(p.price)} each
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={text.callout}>No products at or below {stock?.threshold ?? 5} units.</p>
              )}
            </section>

            <Link className="list-row" to={`/sales-history?${historyQuery}`} style={text.body}>
              View receipts for this period
            </Link>
            <Button title="Refresh" variant="secondary" onClick={() => void load()} />
          </>
        ) : null}
      </div>
    </Screen>
  );
}

export function AdminReportsPage() {
  return (
    <RequireAdmin>
      <AdminReportsInner />
    </RequireAdmin>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { showToast } from '@/components/toast';
import { useAuth } from '@/context/AuthContext';
import { searchSales } from '@/db/saleRepository';
import type { Sale } from '@/db/schema';
import { dateBounds, type DateRangePreset, type IsoBounds } from '@/lib/dateBounds';
import { getPeriodSummary, type PeriodSummary } from '@/services/analyticsService';
import { printSaleReceipt, printSaleWithBrowser } from '@/services/printerService';
import { text } from '@/theme';

type Range = Extract<DateRangePreset, 'today' | 'week' | 'month' | 'all'>;

function parseRangeParam(value: string | null): Range | null {
  if (value === 'today' || value === 'week' || value === 'month' || value === 'all') return value;
  return null;
}

export function SalesHistoryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { adminUnlocked } = useAuth();

  const urlFrom = searchParams.get('from')?.trim() || undefined;
  const urlTo = searchParams.get('to')?.trim() || undefined;
  const urlRange = parseRangeParam(searchParams.get('range'));

  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>(urlRange ?? (urlFrom || urlTo ? 'today' : 'week'));
  const [customBounds, setCustomBounds] = useState<IsoBounds | null>(
    urlFrom || urlTo ? { dateFrom: urlFrom, dateTo: urlTo } : null,
  );
  const [payment, setPayment] = useState('');
  const [receiptQuery, setReceiptQuery] = useState('');
  const [minAmountStr, setMinAmountStr] = useState('');
  const [maxAmountStr, setMaxAmountStr] = useState('');
  const [rows, setRows] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [printingSaleId, setPrintingSaleId] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ saleId: string; message: string } | null>(null);

  const activeBounds = useMemo(() => {
    if (customBounds) return customBounds;
    return dateBounds(range);
  }, [customBounds, range]);

  const load = useCallback(
    async (next?: {
      range?: Range;
      bounds?: IsoBounds | null;
      receiptQuery?: string;
      minAmountStr?: string;
      maxAmountStr?: string;
      payment?: string;
    }) => {
      const activeRange = next?.range ?? range;
      const bounds =
        next?.bounds !== undefined
          ? next.bounds ?? dateBounds(activeRange)
          : customBounds && next?.range == null
            ? customBounds
            : dateBounds(activeRange);
      const activeReceipt = next?.receiptQuery ?? receiptQuery;
      const activeMin = next?.minAmountStr ?? minAmountStr;
      const activeMax = next?.maxAmountStr ?? maxAmountStr;
      const activePayment = next?.payment ?? payment;
      const trimmedMin = activeMin.trim();
      const trimmedMax = activeMax.trim();
      const minAmount = trimmedMin === '' ? undefined : Number(trimmedMin);
      const maxAmount = trimmedMax === '' ? undefined : Number(trimmedMax);
      const minInvalid = trimmedMin !== '' && !Number.isFinite(minAmount);
      const maxInvalid = trimmedMax !== '' && !Number.isFinite(maxAmount);
      const rangeInvalid =
        minAmount != null &&
        maxAmount != null &&
        Number.isFinite(minAmount) &&
        Number.isFinite(maxAmount) &&
        minAmount > maxAmount;

      if (minInvalid || maxInvalid || rangeInvalid) {
        setFeedbackMessage(
          minInvalid || maxInvalid
            ? 'Enter valid totals before applying filters.'
            : 'Minimum total cannot be greater than maximum total.',
        );
        return;
      }

      setFeedbackMessage(null);
      setLoading(true);
      try {
        let list = await searchSales(
          {
            dateFrom: bounds.dateFrom,
            dateTo: bounds.dateTo,
            receiptQuery: activeReceipt.trim() || undefined,
            minAmount: minAmount != null && !Number.isNaN(minAmount) ? minAmount : undefined,
            maxAmount: maxAmount != null && !Number.isNaN(maxAmount) ? maxAmount : undefined,
          },
          200,
        );
        const method = activePayment.trim().toUpperCase();
        if (method) {
          list = list.filter((sale) => (sale.payment_method ?? '').toUpperCase().includes(method));
        }
        setRows(list);
        const period = await getPeriodSummary(bounds);
        setSummary(period);
      } finally {
        setLoading(false);
      }
    },
    [range, customBounds, receiptQuery, minAmountStr, maxAmountStr, payment],
  );

  useEffect(() => {
    void load();
    // Initial load only (respects URL params via initial state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearFilters = () => {
    setRange('week');
    setCustomBounds(null);
    setPayment('');
    setReceiptQuery('');
    setMinAmountStr('');
    setMaxAmountStr('');
    setFeedbackMessage(null);
    void load({
      range: 'week',
      bounds: null,
      receiptQuery: '',
      minAmountStr: '',
      maxAmountStr: '',
      payment: '',
    });
  };

  const selectRange = (item: Range) => {
    setRange(item);
    setCustomBounds(null);
    if (feedbackMessage) setFeedbackMessage(null);
    void load({ range: item, bounds: null });
  };

  const hasActiveFilters =
    range !== 'week' ||
    customBounds != null ||
    receiptQuery.trim().length > 0 ||
    minAmountStr.trim().length > 0 ||
    maxAmountStr.trim().length > 0 ||
    payment.trim().length > 0;

  const printSale = (saleId: string) => {
    if (printingSaleId) return;
    setPrintingSaleId(saleId);
    setOffer(null);
    void (async () => {
      try {
        const result = await printSaleReceipt(saleId);
        if (result.ok) {
          showToast(result.printedVia === 'browser' ? 'Print sheet opened' : 'Receipt printed', result.message);
        } else {
          setOffer({ saleId, message: result.message });
          showToast('Print failed', result.message);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Print failed';
        setOffer({ saleId, message });
        showToast('Print failed', message);
      } finally {
        setPrintingSaleId(null);
      }
    })();
  };

  const printBrowser = (saleId: string) => {
    if (printingSaleId) return;
    setPrintingSaleId(saleId);
    void (async () => {
      try {
        await printSaleWithBrowser(saleId);
        setOffer(null);
        showToast('Print sheet opened', 'Receipt opened in the browser print sheet.');
      } catch (error) {
        showToast('Print failed', error instanceof Error ? error.message : 'Print failed');
      } finally {
        setPrintingSaleId(null);
      }
    })();
  };

  const reportsLink = useMemo(() => {
    const q = new URLSearchParams();
    if (range === 'today') q.set('range', 'today');
    else if (range === 'week') q.set('range', 'week');
    else if (range === 'month') q.set('range', 'month');
    else if (customBounds?.dateFrom) {
      q.set('range', 'custom');
      q.set('day', customBounds.dateFrom.slice(0, 10));
    } else q.set('range', 'today');
    return `/admin/reports?${q.toString()}`;
  }, [range, customBounds]);

  return (
    <Screen header={<GlassHeader title="Sales history" backTo="/pos" />}>
      <div className="stack">
        {summary ? (
          <div className="report-summary-strip" aria-label="Period summary">
            <div>
              <p style={text.caption}>Net sales</p>
              <p style={text.headline}>GHS {summary.netSales.toFixed(2)}</p>
            </div>
            <div>
              <p style={text.caption}>Transactions</p>
              <p style={text.headline}>{summary.transactionCount}</p>
            </div>
            <div>
              <p style={text.caption}>Returns</p>
              <p style={text.headline}>GHS {summary.returnsAmount.toFixed(2)}</p>
            </div>
            {adminUnlocked ? (
              <div>
                <p style={text.caption}>Gross profit</p>
                <p style={text.headline}>GHS {summary.grossProfit.toFixed(2)}</p>
              </div>
            ) : null}
            {adminUnlocked ? (
              <Link to={reportsLink} style={{ ...text.footnote, gridColumn: '1 / -1' }}>
                Open full reports
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="filter-chips" role="group" aria-label="Date range">
          {(['today', 'week', 'month', 'all'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`filter-chip${range === item && !customBounds ? ' filter-chip-on' : ''}`}
              aria-pressed={range === item && !customBounds}
              onClick={() => selectRange(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {customBounds ? (
          <p style={text.caption}>
            Custom window from reports
            {activeBounds.dateFrom ? ` · from ${activeBounds.dateFrom.slice(0, 10)}` : ''}
            {activeBounds.dateTo ? ` · to ${activeBounds.dateTo.slice(0, 10)}` : ''}
          </p>
        ) : null}
        <TextField
          label="Receipt contains"
          value={receiptQuery}
          onChange={(event) => {
            setReceiptQuery(event.target.value);
            if (feedbackMessage) setFeedbackMessage(null);
          }}
          placeholder="Receipt # or id contains..."
          autoCapitalize="none"
        />
        <div className="filter-pair">
          <TextField
            label="Min total"
            value={minAmountStr}
            onChange={(event) => {
              setMinAmountStr(event.target.value);
              if (feedbackMessage) setFeedbackMessage(null);
            }}
            inputMode="decimal"
            placeholder="0.00"
          />
          <TextField
            label="Max total"
            value={maxAmountStr}
            onChange={(event) => {
              setMaxAmountStr(event.target.value);
              if (feedbackMessage) setFeedbackMessage(null);
            }}
            inputMode="decimal"
            placeholder="0.00"
          />
        </div>
        <TextField
          label="Payment method"
          value={payment}
          onChange={(event) => {
            setPayment(event.target.value);
            if (feedbackMessage) setFeedbackMessage(null);
          }}
          placeholder="Filter payment method (e.g. CASH)"
          autoCapitalize="characters"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void load();
          }}
        />
        <FeedbackBanner message={feedbackMessage} />
        <Button title="Apply" onClick={() => void load()} />
        {hasActiveFilters ? <Button title="Clear filters" variant="ghost" onClick={clearFilters} /> : null}

        {loading ? (
          <p style={text.callout}>Loading sales…</p>
        ) : rows.length === 0 ? (
          hasActiveFilters ? (
            <div className="history-empty">
              <p style={text.headline}>No sales match these filters</p>
              <p style={text.callout}>Try another date range, or clear the filters.</p>
            </div>
          ) : (
            <div className="history-empty">
              <p style={text.headline}>No sales yet</p>
              <p style={text.callout}>Completed checkouts appear here for this device.</p>
              <Button title="Open new sale" onClick={() => navigate('/pos')} />
            </div>
          )
        ) : (
          <div className="stack">
            {rows.map((sale) => {
              const label = sale.receipt_number ?? sale.id.slice(0, 8).toUpperCase();
              const printing = printingSaleId === sale.id;
              return (
                <article key={sale.id} className="history-card">
                  <div className="history-main">
                    <div className="history-top">
                      <p style={text.headline}>{label}</p>
                      {sale.synced_at ? <span className="badge">Synced</span> : null}
                    </div>
                    <p className="history-meta" style={text.footnote}>
                      {sale.sold_at.slice(0, 16)} · GHS {Number(sale.total_amount).toFixed(2)} ·{' '}
                      {sale.payment_method ?? ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="print-mini"
                    disabled={printingSaleId !== null}
                    aria-busy={printing}
                    aria-label={`Print receipt ${label}`}
                    onClick={() => printSale(sale.id)}
                  >
                    {printing ? '…' : 'Print'}
                  </button>
                  {offer?.saleId === sale.id ? (
                    <div className="history-offer">
                      <p className="banner-error" role="alert" style={text.footnote}>
                        {offer.message}
                      </p>
                      <Button
                        title="Print with browser"
                        variant="secondary"
                        disabled={printingSaleId !== null}
                        onClick={() => printBrowser(sale.id)}
                      />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}

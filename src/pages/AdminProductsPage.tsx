import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { RequireAdmin } from '@/components/RequireAuth';
import { Screen } from '@/components/Screen';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { assertBarcodeAvailable } from '@/db/barcode';
import { db, type Product } from '@/db/schema';
import { formatQty, normalizeQty, parseQtyInput } from '@/lib/quantity';
import {
  downloadProductImportTemplate,
  importProductsFromCsv,
  type ProductImportResult,
} from '@/services/productImportService';
import { text } from '@/theme';

type FormMode = 'closed' | 'add' | 'edit';
type AdjustMode = 'add' | 'remove';

const PAGE_SIZE = 3;

function money(n: number): string {
  return `GHS ${n.toFixed(2)}`;
}

function emptyForm() {
  return {
    name: '',
    price: '',
    costPrice: '',
    stock: '0',
    barcode: '',
  };
}

function AdminProductsInner() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<FormMode>('closed');
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>('add');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustingBusy, setAdjustingBusy] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ProductImportResult | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setProducts(await db.products.orderBy('name').toArray());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const haystack = `${p.name} ${p.barcode ?? ''} ${p.sku ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [products, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  useEffect(() => {
    setPage(0);
  }, [query]);

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const closeForm = () => {
    setFormMode('closed');
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const openAdd = () => {
    setNotice(null);
    setError(null);
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setFormMode('add');
  };

  const openEdit = (product: Product) => {
    setNotice(null);
    setError(null);
    setEditing(product);
    setForm({
      name: product.name,
      price: String(product.price),
      costPrice: product.cost_price != null ? String(product.cost_price) : '',
      stock: String(product.stock_quantity),
      barcode: product.barcode ?? '',
    });
    setFormError(null);
    setFormMode('edit');
  };

  const openAdjust = (product: Product) => {
    setNotice(null);
    setError(null);
    setAdjusting(product);
    setAdjustMode('add');
    setAdjustAmount('');
    setAdjustNote('');
    setAdjustError(null);
  };

  const closeAdjust = () => {
    setAdjusting(null);
    setAdjustAmount('');
    setAdjustNote('');
    setAdjustError(null);
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || formMode === 'closed') return;
    setFormError(null);

    const priceNum = Number(form.price);
    const costTrimmed = form.costPrice.trim();
    const costNum = costTrimmed === '' ? null : Number(costTrimmed);
    if (!form.name.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setFormError('Enter a valid name and selling price');
      return;
    }
    if (costNum != null && (!Number.isFinite(costNum) || costNum < 0)) {
      setFormError('Enter a valid cost price, or leave it blank');
      return;
    }

    const barcode = form.barcode.trim() || null;
    const now = new Date().toISOString();
    setSaving(true);
    try {
      await assertBarcodeAvailable(barcode, editing?.id);

      if (formMode === 'edit' && editing) {
        await db.products.update(editing.id, {
          name: form.name.trim(),
          price: priceNum,
          cost_price: costNum,
          barcode,
          updated_at: now,
        });
        setNotice(`Updated “${form.name.trim()}”`);
      } else {
        const stockParsed = parseQtyInput(form.stock);
        const stockQty = stockParsed ?? 0;
        const id = crypto.randomUUID();
        await db.products.add({
          id,
          name: form.name.trim(),
          price: priceNum,
          cost_price: costNum,
          stock_quantity: stockQty,
          barcode,
          sku: null,
          category_id: null,
          is_temporary: 0,
          synced_at: null,
          updated_at: now,
          auto_convert_json: null,
        });
        setNotice(`Added “${form.name.trim()}”`);
      }
      closeForm();
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save product');
    } finally {
      setSaving(false);
    }
  };

  const adjustPreviewQty = useMemo(() => {
    if (!adjusting) return null;
    const amount = parseQtyInput(adjustAmount);
    if (amount == null || amount === 0) return null;
    const delta = adjustMode === 'add' ? amount : -amount;
    return normalizeQty(adjusting.stock_quantity + delta);
  }, [adjusting, adjustAmount, adjustMode]);

  const confirmAdjust = async () => {
    if (!adjusting || adjustingBusy) return;
    setAdjustError(null);
    const amount = parseQtyInput(adjustAmount);
    if (amount == null || amount === 0) {
      setAdjustError('Enter how many units to add or remove');
      return;
    }
    const delta = adjustMode === 'add' ? amount : -amount;
    const next = normalizeQty(adjusting.stock_quantity + delta);
    if (next < 0) {
      setAdjustError(`Cannot remove ${formatQty(amount)} — only ${formatQty(adjusting.stock_quantity)} in stock`);
      return;
    }

    const now = new Date().toISOString();
    const note = adjustNote.trim() || null;
    setAdjustingBusy(true);
    try {
      await db.transaction('rw', db.products, db.stock_movements, async () => {
        await db.products.update(adjusting.id, { stock_quantity: next, updated_at: now });
        await db.stock_movements.put({
          id: crypto.randomUUID(),
          product_id: adjusting.id,
          delta,
          reason: 'MANUAL_ADJUSTMENT',
          note,
          user_id: user?.userId ?? null,
          created_at: now,
        });
      });
      const verb = adjustMode === 'add' ? 'Added' : 'Removed';
      setNotice(`${verb} ${formatQty(amount)} for “${adjusting.name}” · now ${formatQty(next)}`);
      closeAdjust();
      await reload();
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : 'Could not adjust stock');
    } finally {
      setAdjustingBusy(false);
    }
  };

  const runImport = async (file: File) => {
    setImportBusy(true);
    setImportError(null);
    setImportResult(null);
    try {
      const contents = await file.text();
      const result = await importProductsFromCsv(contents);
      setImportResult(result);
      if (result.imported > 0) {
        setNotice(`Imported ${result.imported} product${result.imported === 1 ? '' : 's'}`);
        await reload();
      }
      if (result.imported === 0 && result.skipped.length > 0) {
        setImportError('No products were imported. Check the issues below.');
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      setImportBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteProduct = async () => {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    try {
      await db.products.delete(confirmDelete.id);
      setNotice(`Deleted “${confirmDelete.name}”`);
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete product');
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const adjustConfirmLabel =
    adjustMode === 'add'
      ? `Add ${adjustAmount.trim() || '…'} to stock`
      : `Remove ${adjustAmount.trim() || '…'} from stock`;

  return (
    <Screen header={<GlassHeader title="Products" backTo="/admin" />}>
      <div className="stack products-page">
        <div className="report-section-head">
          <div>
            <p style={text.headline}>Catalog</p>
            <p style={text.caption}>
              {products.length} product{products.length === 1 ? '' : 's'}
              {query.trim() ? ` · ${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : ''}
              {filtered.length > 0 ? ` · page ${safePage + 1} of ${pageCount}` : ''}
            </p>
          </div>
        </div>

        <div className="products-toolbar">
          <Button title="Add product" onClick={openAdd} />
          <Button
            title="Import CSV"
            variant="secondary"
            onClick={() => {
              setNotice(null);
              setImportError(null);
              setImportResult(null);
              setImportOpen(true);
            }}
          />
        </div>

        <TextField
          label="Search products"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, barcode, or SKU"
        />

        {notice ? <FeedbackBanner variant="success" message={notice} /> : null}
        {error ? <FeedbackBanner variant="error" message={error} /> : null}

        {filtered.length === 0 ? (
          <div className="products-empty">
            <p style={text.body}>
              {products.length === 0
                ? 'No products yet. Add one or import a CSV file.'
                : 'No products match your search.'}
            </p>
            {products.length === 0 ? (
              <div className="products-toolbar">
                <Button title="Add product" onClick={openAdd} />
                <Button title="Import CSV" variant="secondary" onClick={() => setImportOpen(true)} />
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="stack products-list">
              {pageItems.map((p) => (
                <div key={p.id} className="list-row products-row">
                  <div className="products-row-main">
                    <p style={text.body}>{p.name}</p>
                    <p style={text.caption}>
                      Sell {money(p.price)}
                      {p.cost_price != null ? ` · Cost ${money(p.cost_price)}` : ''}
                      {p.barcode ? ` · ${p.barcode}` : ''}
                    </p>
                  </div>
                  <div className="products-row-stock">
                    <span className="badge">Stock {formatQty(p.stock_quantity)}</span>
                  </div>
                  <div className="products-row-actions">
                    <Button title="Edit" variant="secondary" onClick={() => openEdit(p)} />
                    <Button title="Adjust stock" variant="secondary" onClick={() => openAdjust(p)} />
                    <Button title="Delete" variant="dangerOutline" onClick={() => setConfirmDelete(p)} />
                  </div>
                </div>
              ))}
            </div>

            {pageCount > 1 ? (
              <nav className="products-pager" aria-label="Catalog pages">
                <button
                  type="button"
                  className="products-pager-btn"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </button>
                <span className="products-pager-label" style={text.caption}>
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  className="products-pager-btn products-pager-btn-next"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>

      <Sheet
        open={formMode !== 'closed'}
        title={formMode === 'edit' ? 'Edit product' : 'Add product'}
        onClose={closeForm}
        dismissible={!saving}
      >
        <h2 style={text.title2}>{formMode === 'edit' ? 'Edit product' : 'Add product'}</h2>
        <form className="stack" onSubmit={(e) => void saveProduct(e)}>
          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            required
            disabled={saving}
          />
          <TextField
            label="Selling price (GHS)"
            inputMode="decimal"
            value={form.price}
            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
            required
            disabled={saving}
          />
          <TextField
            label="Cost price (GHS)"
            inputMode="decimal"
            value={form.costPrice}
            onChange={(e) => setForm((prev) => ({ ...prev, costPrice: e.target.value }))}
            placeholder="Optional"
            disabled={saving}
          />
          {formMode === 'add' ? (
            <TextField
              label="Opening stock"
              inputMode="decimal"
              value={form.stock}
              onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
              disabled={saving}
            />
          ) : editing ? (
            <p className="sheet-copy" style={text.callout}>
              Current stock: <strong>{formatQty(editing.stock_quantity)}</strong>
              <br />
              To change stock, close this and use Adjust stock.
            </p>
          ) : null}
          <TextField
            label="Barcode"
            value={form.barcode}
            onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))}
            disabled={saving}
          />
          {formError ? <FeedbackBanner variant="error" message={formError} /> : null}
          <div className="sheet-actions">
            <Button
              title={formMode === 'edit' ? 'Save changes' : 'Add product'}
              type="submit"
              disabled={saving}
            />
            <Button title="Cancel" variant="ghost" onClick={closeForm} disabled={saving} />
          </div>
        </form>
      </Sheet>

      <Sheet
        open={adjusting != null}
        title="Adjust stock"
        onClose={closeAdjust}
        dismissible={!adjustingBusy}
      >
        {adjusting ? (
          <>
            <h2 style={text.title2}>Adjust stock</h2>
            <p className="sheet-copy" style={text.callout}>
              {adjusting.name}
            </p>
            <div className="qty-compare">
              <div>
                <p style={text.caption}>Current stock</p>
                <p style={text.headline}>{formatQty(adjusting.stock_quantity)}</p>
              </div>
              <div>
                <p style={text.caption}>After change</p>
                <p style={text.headline}>
                  {adjustPreviewQty == null ? '—' : formatQty(adjustPreviewQty)}
                </p>
              </div>
            </div>

            <div className="filter-chips" role="group" aria-label="Adjust type">
              <button
                type="button"
                className={`filter-chip${adjustMode === 'add' ? ' filter-chip-on' : ''}`}
                onClick={() => setAdjustMode('add')}
                disabled={adjustingBusy}
              >
                Add stock
              </button>
              <button
                type="button"
                className={`filter-chip${adjustMode === 'remove' ? ' filter-chip-on' : ''}`}
                onClick={() => setAdjustMode('remove')}
                disabled={adjustingBusy}
              >
                Remove stock
              </button>
            </div>

            <TextField
              label={adjustMode === 'add' ? 'How many to add?' : 'How many to remove?'}
              inputMode="decimal"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="e.g. 10"
              disabled={adjustingBusy}
            />
            <TextField
              label="Note (optional)"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="e.g. New delivery, damaged, count fix"
              disabled={adjustingBusy}
            />
            {adjustError ? <FeedbackBanner variant="error" message={adjustError} /> : null}
            <div className="sheet-actions">
              <Button
                title={adjustConfirmLabel}
                onClick={() => void confirmAdjust()}
                disabled={adjustingBusy}
              />
              <Button title="Cancel" variant="ghost" onClick={closeAdjust} disabled={adjustingBusy} />
            </div>
          </>
        ) : null}
      </Sheet>

      <Sheet open={importOpen} title="Import products" onClose={closeImport} dismissible={!importBusy}>
        <h2 style={text.title2}>Import products</h2>
        <p className="sheet-copy" style={text.callout}>
          Upload a CSV file with columns: name, price, cost_price, stock, barcode. Download the template to see the
          exact format. Rows with duplicate barcodes are skipped.
        </p>
        <div className="sheet-actions">
          <Button
            title="Download template"
            variant="secondary"
            onClick={downloadProductImportTemplate}
            disabled={importBusy}
          />
          <Button
            title={importBusy ? 'Importing…' : 'Choose CSV file'}
            onClick={() => fileInputRef.current?.click()}
            disabled={importBusy}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void runImport(file);
          }}
        />
        {importError ? <FeedbackBanner variant="error" message={importError} /> : null}
        {importResult ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <FeedbackBanner
              variant={importResult.imported > 0 ? 'success' : 'warning'}
              message={`Imported ${importResult.imported}. Skipped ${importResult.skipped.length}.`}
            />
            {importResult.skipped.length > 0 ? (
              <div className="products-import-skips">
                <p style={text.caption}>Skipped rows</p>
                <ul>
                  {importResult.skipped.slice(0, 12).map((skip) => (
                    <li key={`${skip.lineNumber}-${skip.reason}`} style={text.caption}>
                      Line {skip.lineNumber}
                      {skip.name ? ` (${skip.name})` : ''}: {skip.reason}
                    </li>
                  ))}
                  {importResult.skipped.length > 12 ? (
                    <li style={text.caption}>…and {importResult.skipped.length - 12} more</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            <div className="sheet-actions">
              <Button title="Done" onClick={closeImport} />
            </div>
          </div>
        ) : (
          <div className="sheet-actions">
            <Button title="Close" variant="ghost" onClick={closeImport} disabled={importBusy} />
          </div>
        )}
      </Sheet>

      <Sheet
        open={confirmDelete != null}
        title="Delete product"
        onClose={() => setConfirmDelete(null)}
        dismissible={!deleting}
        align="center"
      >
        {confirmDelete ? (
          <>
            <h2 style={text.title2}>Delete product?</h2>
            <p className="sheet-copy" style={text.callout}>
              “{confirmDelete.name}” will be removed from this device. This cannot be undone.
            </p>
            <div className="sheet-actions">
              <Button title={deleting ? 'Deleting…' : 'Delete'} variant="dangerOutline" onClick={() => void deleteProduct()} disabled={deleting} />
              <Button title="Cancel" variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting} />
            </div>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

export function AdminProductsPage() {
  return (
    <RequireAdmin>
      <AdminProductsInner />
    </RequireAdmin>
  );
}

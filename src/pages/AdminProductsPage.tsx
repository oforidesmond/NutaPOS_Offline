import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { FeedbackBanner } from '@/components/FeedbackBanner';
import { GlassHeader } from '@/components/GlassHeader';
import { RequireAdmin } from '@/components/RequireAuth';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { db, type Product } from '@/db/schema';
import { text } from '@/theme';

function AdminProductsInner() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [barcode, setBarcode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState('0');

  const reload = useCallback(async () => {
    setProducts(await db.products.orderBy('name').toArray());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const priceNum = Number(price);
    const stockNum = Number(stock);
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
      setError('Enter a valid name and price');
      return;
    }
    const now = new Date().toISOString();
    if (editing) {
      await db.products.update(editing.id, {
        name: name.trim(),
        price: priceNum,
        stock_quantity: Number.isFinite(stockNum) ? stockNum : editing.stock_quantity,
        barcode: barcode.trim() || null,
        updated_at: now,
      });
    } else {
      const id = crypto.randomUUID();
      await db.products.put({
        id,
        name: name.trim(),
        price: priceNum,
        cost_price: null,
        stock_quantity: Number.isFinite(stockNum) ? stockNum : 0,
        barcode: barcode.trim() || null,
        sku: null,
        category_id: null,
        is_temporary: 0,
        synced_at: null,
        updated_at: now,
        auto_convert_json: null,
      });
    }
    setEditing(null);
    setName('');
    setPrice('');
    setStock('0');
    setBarcode('');
    await reload();
  };

  const startEdit = (p: Product) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.price));
    setStock(String(p.stock_quantity));
    setBarcode(p.barcode ?? '');
  };

  const adjustStock = async (product: Product) => {
    const delta = Number(adjustQty);
    if (!Number.isFinite(delta) || delta === 0) return;
    const now = new Date().toISOString();
    const next = product.stock_quantity + delta;
    await db.transaction('rw', db.products, db.stock_movements, async () => {
      await db.products.update(product.id, { stock_quantity: next, updated_at: now });
      await db.stock_movements.put({
        id: crypto.randomUUID(),
        product_id: product.id,
        delta,
        reason: 'MANUAL_ADJUSTMENT',
        note: null,
        user_id: user?.userId ?? null,
        created_at: now,
      });
    });
    setAdjustQty('0');
    await reload();
  };

  return (
    <Screen header={<GlassHeader title="Products" backTo="/admin" />}>
      <form className="stack" onSubmit={saveProduct}>
        <p style={text.headline}>{editing ? 'Edit product' : 'Add product'}</p>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField label="Price (GHS)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
        <TextField label="Stock" inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} />
        <TextField label="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        {error ? <FeedbackBanner variant="error" message={error} /> : null}
        <Button title={editing ? 'Save changes' : 'Add product'} type="submit" />
        {editing ? (
          <Button
            title="Cancel edit"
            variant="ghost"
            onClick={() => {
              setEditing(null);
              setName('');
              setPrice('');
              setStock('0');
              setBarcode('');
            }}
          />
        ) : null}
      </form>

      <div className="stack" style={{ marginTop: 24 }}>
        <p style={text.headline}>Catalog ({products.length})</p>
        <TextField label="Stock adjust qty (+/-)" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
        {products.map((p) => (
          <div key={p.id} className="list-row" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={text.body}>
              {p.name} · GHS {p.price} · stock {p.stock_quantity}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button title="Edit" variant="secondary" onClick={() => startEdit(p)} />
              <Button title="Adjust stock" variant="secondary" onClick={() => void adjustStock(p)} />
              <Button
                title="Delete"
                variant="dangerOutline"
                onClick={() => {
                  void db.products.delete(p.id).then(reload);
                }}
              />
            </div>
          </div>
        ))}
      </div>
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

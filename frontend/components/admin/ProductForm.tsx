'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adm, api, Category } from '@/lib/api';
import ImageUploader from './ImageUploader';
import { useAdmin } from './AdminContext';
import { Notice } from './ui';

type VariantRow = { id?: number; name: string; sku: string; price_override: string; stock: string; is_active: boolean };
type BundleRow = { product_id: string; quantity: string };

export default function ProductForm({ product }: { product?: any }) {
  const router = useRouter();
  const { isOwner } = useAdmin();
  const readOnly = !isOwner;

  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [candidates, setCandidates] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price ?? '',
    compare_at_price: product?.compare_at_price ?? '',
    stock: String(product?.stock ?? 0),
    category_id: product?.category_id ? String(product.category_id) : '',
    is_active: product?.is_active ?? true,
    sku: product?.sku || '',
    low_stock_threshold: String(product?.low_stock_threshold ?? 5),
    meta_title: product?.meta_title || '',
    meta_description: product?.meta_description || '',
    is_bundle: product?.is_bundle ?? false,
  });
  const [images, setImages] = useState<string[]>(
    product?.images?.length ? product.images.map((i: any) => i.url) : product?.image_url ? [product.image_url] : []
  );
  const [variants, setVariants] = useState<VariantRow[]>(
    (product?.variants || []).map((v: any) => ({ id: v.id, name: v.name, sku: v.sku || '', price_override: v.price_override ?? '', stock: String(v.stock), is_active: v.is_active }))
  );
  const [bundle, setBundle] = useState<BundleRow[]>((product?.bundle_items || []).map((b: any) => ({ product_id: String(b.product_id), quantity: String(b.quantity) })));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
    adm.get('/api/products/admin/list').then(setCandidates).catch(() => {});
  }, []);

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const cat = await adm.post('/api/categories', { name: newCategory.trim() });
      setCategories((c) => [...c, cat]);
      setForm((f) => ({ ...f, category_id: String(cat.id) }));
      setNewCategory('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const hasVariants = variants.length > 0;
  const variantStock = variants.filter((v) => v.is_active).reduce((s, v) => s + (parseInt(v.stock, 10) || 0), 0);
  const bundleChoices = candidates.filter((c) => !c.is_bundle && !c.variants_count && c.id !== product?.id);

  const updVariant = (i: number, patch: Partial<VariantRow>) => setVariants((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const updBundle = (i: number, patch: Partial<BundleRow>) => setBundle((bs) => bs.map((b, k) => (k === i ? { ...b, ...patch } : b)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const payload = {
      ...form,
      price: parseFloat(String(form.price).replace(',', '.')) || 0,
      compare_at_price: form.compare_at_price ? parseFloat(String(form.compare_at_price).replace(',', '.')) : null,
      stock: parseInt(form.stock, 10) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 0,
      category_id: form.category_id ? parseInt(form.category_id, 10) : null,
      images,
      variants: form.is_bundle ? [] : variants.map((v) => ({
        id: v.id, name: v.name, sku: v.sku, is_active: v.is_active,
        price_override: v.price_override !== '' ? parseFloat(String(v.price_override).replace(',', '.')) : null,
        stock: parseInt(v.stock, 10) || 0,
      })),
      bundle_items: form.is_bundle ? bundle.filter((b) => b.product_id).map((b) => ({ product_id: parseInt(b.product_id, 10), quantity: parseInt(b.quantity, 10) || 1 })) : [],
    };
    try {
      if (product) await adm.put(`/api/products/${product.id}`, payload);
      else await adm.post('/api/products', payload);
      router.push('/admin/produits');
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement");
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      {readOnly && <Notice kind="info">Lecture seule : seul le propriétaire peut modifier les produits.</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <fieldset disabled={readOnly} className="space-y-8 min-w-0">
        <section className="card space-y-4">
          <h2 className="font-medium text-ink">Informations</h2>
          <div>
            <label className="field-label">Nom *</label>
            <input name="name" className="field-input" required maxLength={200} value={form.name} onChange={set} />
          </div>
          <div>
            <label className="field-label">Description</label>
            <textarea name="description" className="field-input" rows={5} maxLength={8000} value={form.description} onChange={set} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Catégorie</label>
              <select name="category_id" className="field-input" value={form.category_id} onChange={set}>
                <option value="">Aucune</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex gap-2 mt-2">
                <input className="field-input !py-1.5" placeholder="Nouvelle catégorie" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
                <button type="button" className="btn-outline btn-sm" onClick={addCategory}>Ajouter</button>
              </div>
            </div>
            <div>
              <label className="field-label">SKU (référence interne, unique)</label>
              <input name="sku" className="field-input" maxLength={80} value={form.sku} onChange={set} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={set} /> Visible sur le site
          </label>
        </section>

        <section className="card space-y-4">
          <h2 className="font-medium text-ink">Images</h2>
          <ImageUploader images={images} onChange={setImages} disabled={readOnly} />
        </section>

        <section className="card space-y-4">
          <h2 className="font-medium text-ink">Prix et stock</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="field-label">Prix (TND) *</label>
              <input name="price" className="field-input" required inputMode="decimal" value={form.price} onChange={set} />
            </div>
            <div>
              <label className="field-label">Prix barré (promo)</label>
              <input name="compare_at_price" className="field-input" inputMode="decimal" value={form.compare_at_price} onChange={set} placeholder="Ancien prix" />
            </div>
            <div>
              <label className="field-label">Alerte stock faible à partir de</label>
              <input name="low_stock_threshold" className="field-input" type="number" min={0} value={form.low_stock_threshold} onChange={set} />
            </div>
          </div>

          {!form.is_bundle && !hasVariants && (
            <div className="max-w-[12rem]">
              <label className="field-label">Stock</label>
              <input name="stock" className="field-input" type="number" min={0} value={form.stock} onChange={set} />
            </div>
          )}
          {hasVariants && <p className="text-sm text-ink/60">Stock total (options actives) : <b>{variantStock}</b></p>}
          {form.is_bundle && <p className="text-sm text-ink/60">Le stock d'un pack dépend du stock de ses produits : il est calculé automatiquement.</p>}
        </section>

        {!form.is_bundle && (
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-ink">Options (format, couleur, taille…)</h2>
              <button type="button" className="btn-outline btn-sm" onClick={() => setVariants((v) => [...v, { name: '', sku: '', price_override: '', stock: '0', is_active: true }])}>+ Ajouter une option</button>
            </div>
            {!hasVariants ? (
              <p className="text-sm text-ink/50">Aucune option : le produit est vendu tel quel. Ajoutez des options si le client doit choisir (ex : « A5 – Terracotta »). Chaque option a son propre stock.</p>
            ) : (
              <div className="space-y-3">
                <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-ink/50">
                  <span className="col-span-4">Nom de l'option</span><span className="col-span-2">SKU</span><span className="col-span-2">Prix (si différent)</span><span className="col-span-2">Stock</span><span className="col-span-2">Actif</span>
                </div>
                {variants.map((v, i) => (
                  <div key={v.id ?? `n${i}`} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                    <input className="field-input col-span-2 md:col-span-4" placeholder="Nom *" required maxLength={120} value={v.name} onChange={(e) => updVariant(i, { name: e.target.value })} />
                    <input className="field-input md:col-span-2" placeholder="SKU" maxLength={80} value={v.sku} onChange={(e) => updVariant(i, { sku: e.target.value })} />
                    <input className="field-input md:col-span-2" placeholder="Prix" inputMode="decimal" value={v.price_override} onChange={(e) => updVariant(i, { price_override: e.target.value })} />
                    <input className="field-input md:col-span-2" type="number" min={0} placeholder="Stock" value={v.stock} onChange={(e) => updVariant(i, { stock: e.target.value })} />
                    <div className="md:col-span-2 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={v.is_active} onChange={(e) => updVariant(i, { is_active: e.target.checked })} /> Actif</label>
                      <button type="button" className="text-clay text-sm" onClick={() => setVariants((vs) => vs.filter((_, k) => k !== i))} aria-label="Supprimer l'option">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!hasVariants && (
          <section className="card space-y-4">
            <label className="flex items-center gap-2 font-medium text-ink">
              <input type="checkbox" name="is_bundle" checked={form.is_bundle} onChange={set} /> Ce produit est un pack
            </label>
            {form.is_bundle && (
              <div className="space-y-3">
                <p className="text-sm text-ink/60">Composez le pack avec des produits existants (sans options). Le stock de chaque composant est décompté à la vente.</p>
                {bundle.map((b, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select className="field-input" value={b.product_id} onChange={(e) => updBundle(i, { product_id: e.target.value })}>
                      <option value="">Choisir un produit…</option>
                      {bundleChoices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input className="field-input !w-20" type="number" min={1} value={b.quantity} onChange={(e) => updBundle(i, { quantity: e.target.value })} aria-label="Quantité" />
                    <button type="button" className="text-clay" onClick={() => setBundle((bs) => bs.filter((_, k) => k !== i))} aria-label="Retirer">✕</button>
                  </div>
                ))}
                <button type="button" className="btn-outline btn-sm" onClick={() => setBundle((bs) => [...bs, { product_id: '', quantity: '1' }])}>+ Ajouter un produit au pack</button>
              </div>
            )}
          </section>
        )}

        <section className="card space-y-4">
          <h2 className="font-medium text-ink">Référencement (Google)</h2>
          <div>
            <label className="field-label">Titre de la page ({form.meta_title.length}/60 conseillés)</label>
            <input name="meta_title" className="field-input" maxLength={160} value={form.meta_title} onChange={set} placeholder={form.name || 'Par défaut : le nom du produit'} />
          </div>
          <div>
            <label className="field-label">Description pour Google ({form.meta_description.length}/160 conseillés)</label>
            <textarea name="meta_description" className="field-input" rows={2} maxLength={320} value={form.meta_description} onChange={set} placeholder="Par défaut : le début de la description" />
          </div>
        </section>
      </fieldset>

      {!readOnly && (
        <div className="flex gap-3">
          <button className="btn-primary" disabled={loading} type="submit">{loading ? 'Enregistrement…' : product ? 'Enregistrer les modifications' : 'Créer le produit'}</button>
          <button type="button" className="btn-outline" onClick={() => router.push('/admin/produits')}>Annuler</button>
        </div>
      )}
    </form>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { adm, api, Category, downloadFile, imageUrl, importProductsCsv } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import { Modal, Notice, confirmAction } from '@/components/admin/ui';
import { tnd } from '@/lib/format';

const BULK_ACTIONS = [
  { value: 'activate', label: 'Rendre visibles' },
  { value: 'deactivate', label: 'Masquer' },
  { value: 'set_category', label: 'Changer de catégorie…', needs: 'category' },
  { value: 'price_percent', label: 'Modifier les prix de … %', needs: 'number' },
  { value: 'price_set', label: 'Fixer le prix à …', needs: 'number' },
  { value: 'stock_set', label: 'Fixer le stock à …', needs: 'number' },
  { value: 'stock_add', label: 'Ajouter / retirer du stock …', needs: 'number' },
  { value: 'delete', label: 'Supprimer' },
];

export default function AdminProductsPage() {
  const { isOwner } = useAdmin();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [action, setAction] = useState('activate');
  const [value, setValue] = useState('');
  const [report, setReport] = useState<any>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    adm
      .get(`/api/products/admin/list${adm.qs({ q: qApplied, category, status })}`)
      .then(setProducts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [qApplied, category, status]);

  useEffect(load, [load]);
  useEffect(() => { api.getCategories().then(setCategories).catch(() => {}); }, []);
  useEffect(() => setSelected([]), [qApplied, category, status]);
  useEffect(() => {
    const t = setTimeout(() => setQApplied(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const ids = products.map((p) => p.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const def = BULK_ACTIONS.find((a) => a.value === action)!;

  const runBulk = async () => {
    setMsg(null);
    if (action === 'delete' && !confirmAction(`Supprimer définitivement ${selected.length} produit(s) ?`)) return;
    if (def.needs && value === '') return setMsg({ kind: 'error', text: 'Renseignez une valeur.' });
    try {
      const r = await adm.post('/api/products/bulk', { ids: selected, action, value: def.needs === 'category' ? (value ? Number(value) : null) : value });
      setMsg({ kind: r.failed?.length ? 'error' : 'success', text: `${r.affected} produit(s) modifié(s).${r.failed?.length ? ` Échecs : ${r.failed.map((f: any) => `#${f.id} (${f.error})`).join(', ')}` : ''}` });
      setSelected([]);
      setValue('');
      load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  const duplicate = async (id: number) => {
    try {
      const r = await adm.post(`/api/products/${id}/duplicate`);
      window.location.href = `/admin/produits/${r.id}`;
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  const remove = async (p: any) => {
    if (!confirmAction(`Supprimer « ${p.name} » ?`)) return;
    try {
      await adm.del(`/api/products/${p.id}`);
      load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    setMsg(null);
    try {
      setReport(await importProductsCsv(file));
      load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const stockLabel = (p: any) => {
    if (p.stock === 0) return <span className="text-clay font-medium">Rupture</span>;
    if (p.stock <= p.low_stock_threshold) return <span className="text-clay">{p.stock} (faible)</span>;
    return <span>{p.stock}</span>;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-2xl text-ink">Produits</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" onClick={() => downloadFile('/api/products/export.csv', 'produits.csv').catch((e) => setMsg({ kind: 'error', text: e.message }))}>Exporter (CSV)</button>
          {isOwner && (
            <>
              <button className="btn-outline btn-sm" onClick={() => fileInput.current?.click()}>Importer (CSV)</button>
              <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(e) => handleImport(e.target.files?.[0])} />
              <Link href="/admin/produits/nouveau" className="btn-primary btn-sm">+ Nouveau produit</Link>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="field-label" htmlFor="q">Recherche</label>
          <input id="q" className="field-input !w-60" placeholder="Nom ou SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="cat">Catégorie</label>
          <select id="cat" className="field-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toutes</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="st">Statut</label>
          <select id="st" className="field-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous</option>
            <option value="active">Visibles</option>
            <option value="inactive">Masqués</option>
            <option value="low">Stock faible</option>
            <option value="out">En rupture</option>
          </select>
        </div>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {isOwner && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-surface border border-line rounded px-4 py-3 mb-4 text-sm">
          <span className="font-medium">{selected.length} sélectionné(s)</span>
          <select className="field-input !w-auto !py-1.5" value={action} onChange={(e) => { setAction(e.target.value); setValue(''); }}>
            {BULK_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          {def.needs === 'category' && (
            <select className="field-input !w-auto !py-1.5" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Aucune catégorie</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {def.needs === 'number' && <input className="field-input !w-28 !py-1.5" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Valeur" />}
          <button className={action === 'delete' ? 'btn-danger' : 'btn-primary btn-sm'} onClick={runBulk}>Appliquer</button>
          {(action === 'stock_set' || action === 'stock_add') && <span className="text-xs text-ink/50">Les produits avec options et les packs sont ignorés.</span>}
        </div>
      )}

      {loading && products.length === 0 ? (
        <p className="text-ink/50">Chargement…</p>
      ) : products.length === 0 ? (
        <p className="text-ink/50">Aucun produit ne correspond.</p>
      ) : (
        <div className={`bg-white border border-line rounded overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm table-admin">
            <thead className="bg-surface text-ink/60">
              <tr>
                {isOwner && <th className="w-8"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : ids)} aria-label="Tout sélectionner" /></th>}
                <th>Produit</th>
                <th>Catégorie</th>
                <th>Prix</th>
                <th>Stock</th>
                <th>Statut</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-surface/50">
                  {isOwner && <td><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.name}`} /></td>}
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-surface flex-shrink-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {p.image_url && <img src={imageUrl(p.image_url)} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div>
                        <Link href={`/admin/produits/${p.id}`} className="text-forest font-medium">{p.name}</Link>
                        <p className="text-xs text-ink/40">
                          {p.sku ? `${p.sku} · ` : ''}{p.is_bundle ? 'Pack' : p.variants_count > 0 ? `${p.variants_count} option(s)` : ''}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-ink/60">{p.category_name || '—'}</td>
                  <td className="whitespace-nowrap">
                    {parseFloat(p.price_min) !== parseFloat(p.price_max) ? `${tnd(p.price_min)} – ${tnd(p.price_max)}` : tnd(p.price)}
                    {p.compare_at_price && parseFloat(p.compare_at_price) > parseFloat(p.price) && <span className="ml-2 text-xs text-clay">promo</span>}
                  </td>
                  <td>{stockLabel(p)}</td>
                  <td>{p.is_active ? <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Visible</span> : <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Masqué</span>}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/admin/produits/${p.id}`} className="text-forest mr-3">{isOwner ? 'Modifier' : 'Voir'}</Link>
                    {isOwner && (
                      <>
                        <button onClick={() => duplicate(p.id)} className="text-ink/60 hover:text-ink mr-3">Dupliquer</button>
                        <button onClick={() => remove(p)} className="text-clay">Supprimer</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink/40 mt-3">{products.length} produit(s)</p>

      {report && (
        <Modal title="Résultat de l'import" onClose={() => setReport(null)}>
          <p className="text-sm mb-3"><b>{report.created}</b> produit(s) créé(s), <b>{report.updated}</b> mis à jour, <b>{report.errors.length}</b> erreur(s).</p>
          {report.errors.length > 0 && (
            <ul className="text-sm text-clay space-y-1 max-h-60 overflow-y-auto">
              {report.errors.map((e: any, i: number) => <li key={i}>Ligne {e.line} : {e.error}</li>)}
            </ul>
          )}
          <p className="text-xs text-ink/50 mt-4">Colonnes reconnues : sku, nom, description, prix, prix_barre, stock, categorie, image_url, actif, seuil_stock, meta_titre, meta_description. Astuce : exportez d'abord vos produits pour obtenir un modèle.</p>
          <button className="btn-primary mt-4" onClick={() => setReport(null)}>Fermer</button>
        </Modal>
      )}
    </div>
  );
}

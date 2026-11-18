'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adm, downloadFile } from '@/lib/api';
import { Pagination, Notice } from '@/components/admin/ui';
import { fmtDate, tnd, waLink } from '@/lib/format';

export default function AdminCustomersPage() {
  const [data, setData] = useState<any>({ customers: [], total: 0, page: 1, pages: 1 });
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [sort, setSort] = useState('recent');
  const [flagged, setFlagged] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = { q: qApplied, sort, blacklisted: flagged ? '1' : '' };

  const load = useCallback(() => {
    setLoading(true);
    adm.get(`/api/customers${adm.qs({ ...filters, page })}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qApplied, sort, flagged, page]);

  useEffect(load, [load]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQApplied(q.trim()); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-2xl text-ink">Clients</h1>
        <button className="btn-outline btn-sm" onClick={() => downloadFile(`/api/customers/export.csv${adm.qs(filters)}`, 'clients.csv').catch((e) => setError(e.message))}>Exporter (CSV)</button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="field-label" htmlFor="q">Recherche</label>
          <input id="q" className="field-input !w-64" placeholder="Nom, email ou téléphone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="sort">Trier par</label>
          <select id="sort" className="field-input" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="recent">Dernière commande</option>
            <option value="spent">Total dépensé</option>
            <option value="orders">Nombre de commandes</option>
            <option value="name">Nom</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={flagged} onChange={(e) => { setFlagged(e.target.checked); setPage(1); }} /> Clients signalés uniquement
        </label>
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      {loading && data.customers.length === 0 ? (
        <p className="text-ink/50">Chargement…</p>
      ) : data.customers.length === 0 ? (
        <p className="text-ink/50">Aucun client.</p>
      ) : (
        <div className={`bg-white border border-line rounded overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm table-admin">
            <thead className="bg-surface text-ink/60">
              <tr><th>Client</th><th>Téléphone</th><th>Gouvernorat</th><th>Commandes</th><th>Total dépensé</th><th>Dernière commande</th></tr>
            </thead>
            <tbody>
              {data.customers.map((c: any) => (
                <tr key={c.id} className="border-t border-line hover:bg-surface/50">
                  <td>
                    <Link href={`/admin/clients/${c.id}`} className="text-forest font-medium">{c.full_name}</Link>
                    {c.is_blacklisted && <span className="ml-2 text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">⚠ signalé</span>}
                    {c.email && <span className="block text-xs text-ink/40">{c.email}</span>}
                  </td>
                  <td>
                    {c.phone}
                    <a href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" className="block text-xs text-forest underline">WhatsApp</a>
                  </td>
                  <td className="text-ink/60">{c.city || '—'}</td>
                  <td>
                    {c.orders_count}
                    {c.lost_count > 0 && <span className="block text-xs text-clay">{c.lost_count} annulée(s)/retournée(s)</span>}
                  </td>
                  <td className="whitespace-nowrap">{tnd(c.total_spent)}</td>
                  <td className="text-ink/60 whitespace-nowrap">{fmtDate(c.last_order_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink/40 mt-3">{data.total} client(s)</p>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </div>
  );
}

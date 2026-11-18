'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adm, downloadFile } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { Pagination, Notice } from '@/components/admin/ui';
import { usePublicSettings } from '@/lib/settings';
import { STATUS_LABELS, STATUS_OPTIONS, fmtDateTime, tnd, waLink } from '@/lib/format';

export default function AdminOrdersPage() {
  const { governorates } = usePublicSettings();
  const [data, setData] = useState<any>({ orders: [], total: 0, page: 1, pages: 1, counts: {} });
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [city, setCity] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState('confirmee');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const filters = { status, q: qApplied, from, to, city };

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    adm
      .get(`/api/orders${adm.qs({ ...filters, page })}`)
      .then((d) => { setData(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qApplied, from, to, city, page]);

  useEffect(load, [load]);
  useEffect(() => setSelected([]), [status, qApplied, from, to, city, page]);

  // Recherche appliquée après une courte pause de frappe
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQApplied(q.trim()); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const reset = () => { setStatus(''); setQ(''); setFrom(''); setTo(''); setCity(''); setPage(1); };
  const allIds: number[] = data.orders.map((o: any) => o.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const applyBulk = async () => {
    setMsg(null);
    try {
      const r = await adm.post('/api/orders/bulk-status', { ids: selected, status: bulkStatus });
      setMsg(r.failed.length
        ? { kind: 'error', text: `${r.done.length} mise(s) à jour. ${r.failed.length} échec(s) : ${r.failed.map((f: any) => `#${f.id} (${f.error})`).join(', ')}` }
        : { kind: 'success', text: `${r.done.length} commande(s) passée(s) en « ${STATUS_LABELS[bulkStatus]} ».` });
      setSelected([]);
      load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  const exportCsv = () => downloadFile(`/api/orders/export.csv${adm.qs(filters)}`, 'commandes.csv').catch((e) => setMsg({ kind: 'error', text: e.message }));
  const printUrl = (type: string) => `/admin/imprimer?type=${type}&ids=${selected.join(',')}`;

  const tabs = [{ value: '', label: 'Toutes', count: Object.values(data.counts as Record<string, number>).reduce((a, b) => a + b, 0) }, ...STATUS_OPTIONS.map((s) => ({ value: s, label: STATUS_LABELS[s], count: data.counts[s] || 0 }))];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display text-2xl text-ink">Commandes</h1>
        <button className="btn-outline btn-sm" onClick={exportCsv}>Exporter en CSV</button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {tabs.map((s) => (
          <button
            key={s.value}
            onClick={() => { setStatus(s.value); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-full border ${status === s.value ? 'bg-ink text-ivory border-ink' : 'border-line text-ink/60 hover:border-ink'}`}
          >
            {s.label} <span className="opacity-60">{s.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="field-label" htmlFor="q">Recherche</label>
          <input id="q" className="field-input !w-64" placeholder="N°, nom ou téléphone" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="from">Du</label>
          <input id="from" type="date" className="field-input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="field-label" htmlFor="to">Au</label>
          <input id="to" type="date" className="field-input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="field-label" htmlFor="city">Gouvernorat</label>
          <select id="city" className="field-input" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }}>
            <option value="">Tous</option>
            {governorates.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        {(status || q || from || to || city) && <button className="text-sm text-ink/50 underline pb-2" onClick={reset}>Réinitialiser</button>}
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-surface border border-line rounded px-4 py-3 mb-4 text-sm">
          <span className="font-medium">{selected.length} sélectionnée(s)</span>
          <select className="field-input !w-auto !py-1.5" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <button className="btn-primary btn-sm" onClick={applyBulk}>Changer le statut</button>
          <span className="text-ink/30">|</span>
          <Link href={printUrl('bon')} target="_blank" className="btn-outline btn-sm">Bons de livraison</Link>
          <Link href={printUrl('etiquette')} target="_blank" className="btn-outline btn-sm">Étiquettes</Link>
        </div>
      )}

      {loading && data.orders.length === 0 ? (
        <p className="text-ink/50">Chargement…</p>
      ) : data.orders.length === 0 ? (
        <p className="text-ink/50">Aucune commande ne correspond.</p>
      ) : (
        <div className={`bg-white border border-line rounded overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm table-admin">
            <thead className="bg-surface text-ink/60">
              <tr>
                <th className="w-8"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : allIds)} aria-label="Tout sélectionner" /></th>
                <th>Commande</th>
                <th>Client</th>
                <th>Gouvernorat</th>
                <th>Total</th>
                <th>Statut</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o: any) => (
                <tr key={o.id} className="border-t border-line hover:bg-surface/50">
                  <td><input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Sélectionner #${o.id}`} /></td>
                  <td>
                    <Link href={`/admin/commandes/${o.id}`} className="text-forest font-medium">#{o.id}</Link>
                    <span className="block text-xs text-ink/40">{o.items_count} article(s)</span>
                  </td>
                  <td>
                    {o.full_name || '—'}
                    {o.customer_blacklisted && <span className="ml-2 text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded" title="Client signalé">⚠ signalé</span>}
                    {o.phone && (
                      <span className="block text-xs text-ink/50">
                        {o.phone} · <a href={waLink(o.phone)} target="_blank" rel="noopener noreferrer" className="text-forest underline">WhatsApp</a>
                      </span>
                    )}
                  </td>
                  <td className="text-ink/60">{o.ship_city || '—'}</td>
                  <td className="whitespace-nowrap">{tnd(o.total)}</td>
                  <td><StatusBadge status={o.status} />{o.tracking_number && <span className="block text-xs text-ink/40 mt-1">Suivi : {o.tracking_number}</span>}
                    {o.carrier_status && <span className="block text-xs text-forest">{o.carrier_status}</span>}</td>
                  <td className="text-ink/60 whitespace-nowrap">{fmtDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink/40 mt-3">{data.total} commande(s)</p>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </div>
  );
}

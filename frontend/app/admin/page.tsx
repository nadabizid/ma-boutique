'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adm } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { BarChart, HBars, Delta } from '@/components/admin/Charts';
import { tnd, fmtDate, STATUS_LABELS } from '@/lib/format';

const PERIODS = [
  { key: 'today', label: "Aujourd'hui" },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
  { key: '90d', label: '90 jours' },
  { key: 'month', label: 'Ce mois' },
  { key: 'custom', label: 'Personnalisé' },
];

export default function AdminDashboard() {
  const [period, setPeriod] = useState('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (period === 'custom' && (!from || !to)) return;
    setLoading(true);
    setError('');
    adm
      .get(`/api/stats/dashboard${adm.qs({ period, from: period === 'custom' ? from : '', to: period === 'custom' ? to : '' })}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period, from, to]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
      <h1 className="font-display text-2xl text-ink">Tableau de bord</h1>
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 text-sm rounded-full border ${period === p.key ? 'bg-ink text-ivory border-ink' : 'border-line text-ink/60 hover:border-ink'}`}
          >
            {p.label}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input type="date" className="field-input !w-auto !py-1.5" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="Du" />
            <input type="date" className="field-input !w-auto !py-1.5" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="Au" />
          </>
        )}
      </div>
    </div>
  );

  if (error) return <div>{header}<p className="text-clay">{error}</p></div>;
  if (!data) return <div>{header}<p className="text-ink/50">{period === 'custom' && (!from || !to) ? 'Choisissez deux dates.' : 'Chargement…'}</p></div>;

  const c = data.current;
  const prev = data.previous;
  const cards = [
    { label: 'CA livré (encaissé)', value: tnd(c.revenue_delivered), note: `${c.by_status.livree?.count || 0} commande(s)` },
    { label: 'CA en cours', value: tnd(c.revenue_in_progress), note: 'en attente, confirmées, expédiées' },
    { label: 'Commandes', value: c.orders, delta: <Delta current={c.orders} previous={prev.orders} />, note: `${c.valid_orders} valides` },
    { label: 'Panier moyen', value: tnd(c.avg_basket), delta: <Delta current={c.avg_basket} previous={prev.avg_basket} /> },
    { label: "Taux d'annulation", value: `${c.cancel_rate} %`, note: `${c.by_status.annulee?.count || 0} annulée(s)` },
    { label: 'Refus à la livraison', value: `${c.return_rate} %`, note: `${c.by_status.retournee?.count || 0} retournée(s)` },
  ];

  const cust = data.customers;
  const custTotal = (cust.new_customers || 0) + (cust.returning_customers || 0);
  const lowCount = data.low_stock.products.length + data.low_stock.variants.length;

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
      {header}
      <p className="text-xs text-ink/50 -mt-5 mb-6">
        Du {fmtDate(data.period.from)} au {fmtDate(data.period.to)} · comparé à la période précédente
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map((k) => (
          <div key={k.label} className="card">
            <p className="text-xs text-ink/50 mb-2">{k.label}</p>
            <p className="font-display text-2xl text-ink flex items-baseline gap-2">{k.value} {k.delta}</p>
            {k.note && <p className="text-xs text-ink/40 mt-1">{k.note}</p>}
          </div>
        ))}
      </div>

      <div className="card mb-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-ink font-medium">Chiffre d'affaires par jour</p>
          <p className="text-xs text-ink/50">Total : {tnd(c.revenue)} (hors annulées et retournées)</p>
        </div>
        <BarChart
          data={data.sales_by_day.map((d: any) => ({ label: d.day.slice(8) + '/' + d.day.slice(5, 7), value: d.revenue, sub: `${d.orders} commande(s)` }))}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <div className="card">
          <p className="text-ink font-medium mb-4">Produits les plus vendus</p>
          {data.top_products.length === 0 ? (
            <p className="text-sm text-ink/50">Aucune vente sur la période.</p>
          ) : (
            <HBars rows={data.top_products.map((p: any) => ({ label: p.name, value: p.units, sub: tnd(p.revenue) }))} format={(n) => `${n} vendu(s)`} />
          )}
        </div>

        <div className="card">
          <p className="text-ink font-medium mb-4">Ventes par gouvernorat</p>
          {data.sales_by_city.length === 0 ? (
            <p className="text-sm text-ink/50">Aucune vente sur la période.</p>
          ) : (
            <HBars rows={data.sales_by_city.map((r: any) => ({ label: r.city, value: r.orders, sub: tnd(r.revenue) }))} format={(n) => `${n} cmd`} />
          )}
        </div>

        <div className="card">
          <p className="text-ink font-medium mb-4">Clients de la période</p>
          {custTotal === 0 ? (
            <p className="text-sm text-ink/50">Aucun client sur la période.</p>
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden mb-3">
                <div className="bg-forest" style={{ width: `${(cust.new_customers / custTotal) * 100}%` }} />
                <div className="bg-brass" style={{ width: `${(cust.returning_customers / custTotal) * 100}%` }} />
              </div>
              <div className="flex justify-between text-sm">
                <span><span className="inline-block w-2.5 h-2.5 bg-forest rounded-full mr-2" />Nouveaux : <b>{cust.new_customers}</b> ({Math.round((cust.new_customers / custTotal) * 100)} %)</span>
                <span><span className="inline-block w-2.5 h-2.5 bg-brass rounded-full mr-2" />Fidèles : <b>{cust.returning_customers}</b> ({Math.round((cust.returning_customers / custTotal) * 100)} %)</span>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <p className="text-ink font-medium mb-4">Commandes par statut</p>
          <ul className="space-y-2 text-sm">
            {Object.keys(STATUS_LABELS).map((s) => (
              <li key={s} className="flex items-center justify-between">
                <StatusBadge status={s} />
                <span className="text-ink/70">{c.by_status[s]?.count || 0} · {tnd(c.by_status[s]?.total || 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-8">
        <div className="card">
          <p className="text-ink font-medium mb-1">Stock faible {lowCount > 0 && <span className="text-clay">({lowCount})</span>}</p>
          <p className="text-xs text-ink/50 mb-4">Seuil réglable sur chaque produit.</p>
          {lowCount === 0 ? (
            <p className="text-sm text-ink/50">Tout est bien approvisionné.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.low_stock.products.map((p: any) => (
                  <tr key={'p' + p.id} className="border-t border-line">
                    <td className="py-2"><Link href={`/admin/produits/${p.id}`} className="text-forest">{p.name}</Link></td>
                    <td className={`py-2 text-right ${p.stock === 0 ? 'text-clay font-medium' : ''}`}>{p.stock === 0 ? 'Rupture' : `${p.stock} restant(s)`}</td>
                  </tr>
                ))}
                {data.low_stock.variants.map((v: any) => (
                  <tr key={'v' + v.id} className="border-t border-line">
                    <td className="py-2"><Link href={`/admin/produits/${v.product_id}`} className="text-forest">{v.name}</Link> <span className="text-ink/50">· {v.variant_name}</span></td>
                    <td className={`py-2 text-right ${v.stock === 0 ? 'text-clay font-medium' : ''}`}>{v.stock === 0 ? 'Rupture' : `${v.stock} restant(s)`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <p className="text-ink font-medium mb-1">Produits sans vente</p>
          <p className="text-xs text-ink/50 mb-4">En stock mais aucune vente directe sur la période.</p>
          {data.dormant_products.length === 0 ? (
            <p className="text-sm text-ink/50">Tous vos produits en stock se sont vendus.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.dormant_products.map((p: any) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2"><Link href={`/admin/produits/${p.id}`} className="text-forest">{p.name}</Link></td>
                    <td className="py-2 text-right text-ink/60">{p.stock} en stock</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-ink font-medium">Dernières commandes</p>
          <Link href="/admin/commandes" className="text-sm text-forest">Voir tout →</Link>
        </div>
        {data.recent_orders.length === 0 ? (
          <p className="text-sm text-ink/50">Aucune commande pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {data.recent_orders.map((o: any) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="py-2"><Link href={`/admin/commandes/${o.id}`} className="text-forest">#{o.id}</Link></td>
                  <td className="py-2">{o.full_name || '—'}</td>
                  <td className="py-2">{tnd(o.total)}</td>
                  <td className="py-2"><StatusBadge status={o.status} /></td>
                  <td className="py-2 text-ink/50 text-right">{fmtDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-ink/40 mt-4">{data.totals.active_products} produits actifs · {data.totals.customers} clients · {data.totals.pending_orders} commande(s) en attente</p>
      </div>
    </div>
  );
}

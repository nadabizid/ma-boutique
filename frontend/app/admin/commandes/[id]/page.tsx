'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adm } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { Notice } from '@/components/admin/ui';
import ColisPlusCard from '@/components/admin/ColisPlusCard';
import { usePublicSettings } from '@/lib/settings';
import { STATUS_LABELS, STATUS_OPTIONS, fmtDateTime, tnd, waLink, telLink } from '@/lib/format';

const KIND_LABEL: Record<string, string> = { created: 'Commande créée', status: 'Statut', tracking: 'Livraison', note: 'Note' };

export default function AdminOrderDetail({ params }: { params: { id: string } }) {
  const { store } = usePublicSettings();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [internal, setInternal] = useState('');

  const load = () =>
    adm.get(`/api/orders/${params.id}`).then((o) => {
      setOrder(o);
      setStatus(o.status);
      setCarrier(o.carrier || '');
      setTracking(o.tracking_number || '');
      setInternal(o.internal_notes || '');
    }).catch((e) => setError(e.message));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.id]);

  if (error) return <p className="text-clay">{error}</p>;
  if (!order) return <p className="text-ink/50">Chargement…</p>;

  const saveStatus = async () => {
    setMsg(null);
    try {
      await adm.put(`/api/orders/${order.id}/status`, { status, note });
      setNote('');
      setMsg({ kind: 'success', text: `Statut mis à jour : ${STATUS_LABELS[status]}.` });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
      setStatus(order.status);
    }
  };

  const saveDetails = async () => {
    setMsg(null);
    try {
      await adm.put(`/api/orders/${order.id}/details`, { carrier, tracking_number: tracking, internal_notes: internal });
      setMsg({ kind: 'success', text: 'Informations enregistrées.' });
      await load();
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  const first = (order.full_name || '').split(' ')[0];
  const wa = {
    confirm: `Bonjour ${first}, c'est ${store.name}. Nous confirmons votre commande #${order.id} d'un montant de ${Number(order.total).toFixed(2)} TND (paiement à la livraison). Livraison à ${order.ship_city || order.customer_city || 'votre adresse'}. Merci !`,
    shipped: `Bonjour ${first}, votre commande #${order.id} est en route 🚚${order.tracking_number ? ` (suivi : ${order.tracking_number}${order.carrier ? ' · ' + order.carrier : ''})` : ''}. Montant à régler à la réception : ${Number(order.total).toFixed(2)} TND. Merci !`,
    reach: `Bonjour ${first}, c'est ${store.name} au sujet de votre commande #${order.id}. Pouvez-vous nous rappeler ou nous répondre ici ? Merci.`,
  };
  const cs = order.customer_stats || { orders_count: 0, delivered: 0, lost: 0 };

  return (
    <div className="max-w-5xl">
      <Link href="/admin/commandes" className="text-sm text-ink/50 hover:text-ink">← Commandes</Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-2xl text-ink">Commande #{order.id}</h1>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/imprimer?type=bon&ids=${order.id}`} target="_blank" className="btn-outline btn-sm">Bon de livraison</Link>
          <Link href={`/admin/imprimer?type=etiquette&ids=${order.id}`} target="_blank" className="btn-outline btn-sm">Étiquette</Link>
        </div>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {order.customer_blacklisted && (
        <Notice kind="error">
          ⚠ <b>Client signalé</b>{order.blacklist_reason ? ` : ${order.blacklist_reason}` : ''}. Pensez à confirmer la commande par téléphone avant d'expédier.
        </Notice>
      )}
      {!order.customer_blacklisted && cs.lost > 0 && cs.lost >= cs.delivered && (
        <Notice kind="info">Ce client a {cs.lost} commande(s) annulée(s) ou retournée(s) pour {cs.delivered} livrée(s) : à confirmer par téléphone.</Notice>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <p className="font-medium text-ink mb-3">Articles</p>
            <table className="w-full text-sm">
              <tbody>
                {order.items.map((i: any) => (
                  <tr key={i.id} className="border-t border-line first:border-0">
                    <td className="py-2">
                      {i.product_id ? <Link href={`/admin/produits/${i.product_id}`} className="text-forest">{i.product_name}</Link> : i.product_name}
                      {i.variant_name && <span className="text-ink/60"> · {i.variant_name}</span>}
                    </td>
                    <td className="py-2 text-ink/60">{tnd(i.unit_price)} × {i.quantity}</td>
                    <td className="py-2 text-right">{tnd(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line mt-3 pt-3 text-sm space-y-1">
              <div className="flex justify-between text-ink/70"><span>Sous-total</span><span>{tnd(order.subtotal)}</span></div>
              {Number(order.discount) > 0 && <div className="flex justify-between text-forest"><span>Remise {order.coupon_code && `(${order.coupon_code})`}</span><span>− {tnd(order.discount)}</span></div>}
              <div className="flex justify-between text-ink/70"><span>Livraison</span><span>{Number(order.shipping_fee) > 0 ? tnd(order.shipping_fee) : 'Offerte / non facturée'}</span></div>
              {order.gift_wrap && <div className="flex justify-between text-ink/70"><span>Emballage cadeau</span><span>{tnd(order.gift_wrap_fee)}</span></div>}
              <div className="flex justify-between font-display text-lg text-ink pt-2"><span>À encaisser à la livraison</span><span>{tnd(order.total)}</span></div>
            </div>
            {order.gift_wrap && (
              <p className="mt-3 text-sm bg-yellow-50 border border-yellow-200 rounded px-3 py-2">🎁 Emballage cadeau{order.gift_message ? ` — message : « ${order.gift_message} »` : ''}</p>
            )}
            {order.notes && <p className="mt-3 text-sm text-ink/70"><b>Note du client :</b> {order.notes}</p>}
          </div>

          <ColisPlusCard order={order} onChanged={load} />

          <div className="card space-y-4">
            <p className="font-medium text-ink">Livraison et suivi</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Transporteur</label>
                <input className="field-input" value={carrier} maxLength={80} onChange={(e) => setCarrier(e.target.value)} placeholder="Ex : Aramex, livreur interne…" />
              </div>
              <div>
                <label className="field-label">Numéro de suivi</label>
                <input className="field-input" value={tracking} maxLength={120} onChange={(e) => setTracking(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="field-label">Note interne (jamais visible par le client)</label>
              <textarea className="field-input" rows={3} maxLength={2000} value={internal} onChange={(e) => setInternal(e.target.value)} />
            </div>
            <button className="btn-primary btn-sm" onClick={saveDetails}>Enregistrer</button>
          </div>

          <div className="card">
            <p className="font-medium text-ink mb-4">Historique</p>
            <ol className="space-y-3 text-sm">
              {[...order.history].reverse().map((h: any) => (
                <li key={h.id} className="flex gap-3">
                  <span className="w-1.5 h-1.5 mt-2 rounded-full bg-forest flex-shrink-0" />
                  <div>
                    <p className="text-ink">
                      {h.kind === 'status' || h.kind === 'created' ? (
                        <>
                          {h.kind === 'created' ? 'Commande créée' : <>{STATUS_LABELS[h.from_status] || h.from_status} → <b>{STATUS_LABELS[h.to_status] || h.to_status}</b></>}
                        </>
                      ) : (
                        KIND_LABEL[h.kind] || h.kind
                      )}
                    </p>
                    {h.message && <p className="text-ink/60">{h.message}</p>}
                    <p className="text-xs text-ink/40">{fmtDateTime(h.created_at)} · {h.admin_name || 'Système'}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-3">
            <p className="font-medium text-ink">Statut</p>
            <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <input className="field-input" placeholder="Note (facultatif)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary w-full" disabled={status === order.status} onClick={saveStatus}>Mettre à jour</button>
            <p className="text-xs text-ink/50">Annulée ou retournée : le stock est remis automatiquement.</p>
          </div>

          <div className="card space-y-2 text-sm">
            <p className="font-medium text-ink mb-1">Client</p>
            <p>
              {order.customer_id ? <Link href={`/admin/clients/${order.customer_id}`} className="text-forest">{order.full_name}</Link> : order.full_name || '—'}
            </p>
            {order.phone && <p className="text-ink/70">{order.phone}</p>}
            {order.email && <p className="text-ink/70">{order.email}</p>}
            <p className="text-ink/70">{order.ship_address}{order.ship_city ? `, ${order.ship_city}` : ''}</p>
            <p className="text-xs text-ink/40">{cs.orders_count} autre(s) commande(s) · {cs.delivered} livrée(s) · {cs.lost} annulée(s)/retournée(s)</p>
            {order.phone && (
              <div className="pt-3 space-y-2">
                <a href={telLink(order.phone)} className="btn-outline btn-sm w-full">📞 Appeler</a>
                <a href={waLink(order.phone, wa.confirm)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm w-full">WhatsApp : confirmation</a>
                <a href={waLink(order.phone, wa.shipped)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm w-full">WhatsApp : colis expédié</a>
                <a href={waLink(order.phone, wa.reach)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm w-full">WhatsApp : client injoignable</a>
              </div>
            )}
          </div>
          <p className="text-xs text-ink/40">Passée le {fmtDateTime(order.created_at)}</p>
        </div>
      </div>
    </div>
  );
}

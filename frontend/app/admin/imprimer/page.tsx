'use client';

import { useEffect, useState } from 'react';
import { adm } from '@/lib/api';
import { usePublicSettings } from '@/lib/settings';
import { tnd, fmtDate } from '@/lib/format';

export default function PrintPage() {
  const { store } = usePublicSettings();
  const [type, setType] = useState<'bon' | 'etiquette'>('bon');
  const [orders, setOrders] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setType(p.get('type') === 'etiquette' ? 'etiquette' : 'bon');
    adm.get(`/api/orders/print?ids=${encodeURIComponent(p.get('ids') || '')}`).then(setOrders).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="p-8 text-clay">{error}</p>;
  if (!orders) return <p className="p-8 text-ink/50">Chargement…</p>;

  return (
    <div className="bg-white min-h-screen">
      <style>{`@page { size: A4; margin: ${type === 'bon' ? '14mm' : '8mm'}; }`}</style>
      <div className="no-print sticky top-0 bg-ivory border-b border-line px-6 py-3 flex items-center gap-3 z-10">
        <button className="btn-primary btn-sm" onClick={() => window.print()}>Imprimer / Enregistrer en PDF</button>
        <button className={`btn-sm px-3 py-1.5 border rounded-sm text-sm ${type === 'bon' ? 'bg-ink text-ivory border-ink' : 'border-line'}`} onClick={() => setType('bon')}>Bons de livraison</button>
        <button className={`btn-sm px-3 py-1.5 border rounded-sm text-sm ${type === 'etiquette' ? 'bg-ink text-ivory border-ink' : 'border-line'}`} onClick={() => setType('etiquette')}>Étiquettes (4 par page)</button>
        <span className="text-sm text-ink/50">{orders.length} commande(s)</span>
      </div>

      {type === 'bon' ? (
        orders.map((o) => (
          <div key={o.id} className="print-page p-10 max-w-3xl mx-auto text-ink text-sm">
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="font-display text-2xl">{store.name}</p>
                {store.phone && <p>{store.phone}</p>}
                {store.address && <p>{store.address}</p>}
              </div>
              <div className="text-right">
                <p className="font-display text-xl">Bon de livraison</p>
                <p>Commande n° <b>{o.id}</b></p>
                <p className="text-ink/60">{fmtDate(o.created_at)}</p>
              </div>
            </div>
            <div className="border border-ink/30 p-4 mb-6">
              <p className="text-xs uppercase text-ink/50 mb-1">Livrer à</p>
              <p className="text-lg font-medium">{o.full_name}</p>
              <p>{o.phone}</p>
              <p>{o.ship_address || ''}{o.ship_city ? `, ${o.ship_city}` : ''}</p>
            </div>
            <table className="w-full mb-6 border-collapse">
              <thead>
                <tr className="border-b-2 border-ink text-left">
                  <th className="py-2">Désignation</th><th className="py-2 text-center w-16">Qté</th><th className="py-2 text-right w-28">Prix unit.</th><th className="py-2 text-right w-28">Total</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((i: any) => (
                  <tr key={i.id} className="border-b border-ink/20">
                    <td className="py-2">
                      {i.product_name}{i.variant_name ? ` — ${i.variant_name}` : ''}
                    </td>
                    <td className="py-2 text-center">{i.quantity}</td>
                    <td className="py-2 text-right">{tnd(i.unit_price)}</td>
                    <td className="py-2 text-right">{tnd(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto w-72 space-y-1">
              <div className="flex justify-between"><span>Sous-total</span><span>{tnd(o.subtotal)}</span></div>
              {Number(o.discount) > 0 && <div className="flex justify-between"><span>Remise</span><span>− {tnd(o.discount)}</span></div>}
              <div className="flex justify-between"><span>Livraison</span><span>{tnd(o.shipping_fee)}</span></div>
              {o.gift_wrap && <div className="flex justify-between"><span>Emballage cadeau</span><span>{tnd(o.gift_wrap_fee)}</span></div>}
              <div className="flex justify-between text-lg font-bold border-t-2 border-ink pt-2 mt-2"><span>À ENCAISSER</span><span>{tnd(o.total)}</span></div>
            </div>
            {o.gift_wrap && <p className="mt-6 border border-dashed border-ink/40 p-3">🎁 Emballage cadeau{o.gift_message ? ` — « ${o.gift_message} »` : ''}</p>}
            {o.notes && <p className="mt-4 text-ink/70">Note du client : {o.notes}</p>}
            <div className="mt-14 flex justify-between text-ink/60">
              <p>Signature du client : ______________________</p>
              <p>Merci pour votre confiance !</p>
            </div>
          </div>
        ))
      ) : (
        <div className="grid grid-cols-2 gap-3 p-3">
          {orders.map((o) => (
            <div key={o.id} className="border-2 border-ink p-4 text-ink break-inside-avoid" style={{ minHeight: '128mm' }}>
              <div className="flex justify-between text-xs mb-3">
                <span>De : <b>{store.name}</b>{store.phone ? ` · ${store.phone}` : ''}</span>
                <span className="font-bold">#{o.id}</span>
              </div>
              <p className="text-xs uppercase text-ink/50">Destinataire</p>
              <p className="text-2xl font-bold leading-tight">{o.full_name}</p>
              <p className="text-2xl font-bold mb-2">{o.phone}</p>
              <p className="text-lg">{o.ship_address}</p>
              <p className="text-xl font-bold mb-4">{o.ship_city}</p>
              <div className="border-t-2 border-ink pt-3">
                <p className="text-xs uppercase text-ink/50">Paiement à la livraison</p>
                <p className="text-3xl font-bold">{tnd(o.total)}</p>
              </div>
              <p className="text-xs text-ink/70 mt-3">{o.items.reduce((s: number, i: any) => s + i.quantity, 0)} article(s) : {o.items.map((i: any) => `${i.quantity}× ${i.product_name}`).join(', ').slice(0, 140)}</p>
              {o.tracking_number && <p className="text-xs mt-2">Suivi : <b>{o.tracking_number}</b>{o.carrier ? ` (${o.carrier})` : ''}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

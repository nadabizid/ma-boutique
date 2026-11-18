'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useCart } from '@/lib/cart';
import { usePublicSettings } from '@/lib/settings';
import { api } from '@/lib/api';
import CartLineThumb from '@/components/CartLineThumb';
import { shippingFor, tnd } from '@/lib/format';

export default function CheckoutPage() {
  const { items, total, clearCart } = useCart();
  const settings = usePublicSettings();
  const router = useRouter();

  const [form, setForm] = useState({ full_name: '', phone: '', email: '', address: '', city: '', notes: '' });
  const [gift, setGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [website, setWebsite] = useState(''); // champ piège anti-robot
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; free_shipping: boolean; message: string } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const baseShipping = form.city
    ? shippingFor({ city: form.city, subtotal: total, rates: settings.shipping.rates, defaultFee: settings.shipping.default_fee, freeThreshold: settings.shipping.free_threshold })
    : null;
  const shippingFee = coupon?.free_shipping ? 0 : baseShipping;
  const discount = coupon ? coupon.discount : 0;
  const giftFee = gift && settings.gift_wrap.enabled ? settings.gift_wrap.price : 0;
  const grandTotal = total - discount + (shippingFee || 0) + giftFee;

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const r = await api.validateCoupon({ code: couponInput.trim(), subtotal: total, phone: form.phone });
      setCoupon(r);
    } catch (err: any) {
      setCoupon(null);
      setCouponError(err.message);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.createOrder({
        ...form,
        items: items.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })),
        coupon_code: coupon ? coupon.code : undefined,
        gift_wrap: gift,
        gift_message: gift ? giftMessage : undefined,
        website,
      });
      // Récapitulatif conservé pour la page de confirmation
      try {
        sessionStorage.setItem('md_last_order', JSON.stringify({ id: result.order_id, total: result.total, items }));
      } catch {}
      clearCart();
      router.push(`/commande/confirmation?id=${result.order_id}&total=${result.total}`);
    } catch (err: any) {
      setError(err.message || 'Impossible de valider la commande');
      if (err.code === 'COUPON_INVALID') setCoupon(null);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <>
        <Header />
        <section className="container-page py-24 text-center">
          <p className="text-ink/50 mb-6">Votre panier est vide.</p>
          <Link href="/produits" className="btn-primary">Voir les produits</Link>
        </section>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <section className="container-page py-16">
        <h1 className="font-display text-3xl text-ink mb-10">Finaliser la commande</h1>

        <form onSubmit={handleSubmit} className="grid md:grid-cols-3 gap-12">
          <div className="md:col-span-2 space-y-5 relative">
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <label className="field-label" htmlFor="full_name">Nom complet *</label>
                <input id="full_name" className="field-input" required minLength={2} maxLength={120} autoComplete="name" value={form.full_name} onChange={set('full_name')} />
              </div>
              <div>
                <label className="field-label" htmlFor="phone">Téléphone *</label>
                <input id="phone" className="field-input" type="tel" required autoComplete="tel" inputMode="tel" placeholder="Ex : 22 345 678" value={form.phone} onChange={set('phone')} />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="email">Email (pour recevoir la confirmation)</label>
              <input id="email" className="field-input" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              <div className="md:col-span-1">
                <label className="field-label" htmlFor="city">Gouvernorat *</label>
                <select id="city" className="field-input" required value={form.city} onChange={set('city')}>
                  <option value="">Choisir…</option>
                  {settings.governorates.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="field-label" htmlFor="address">Adresse complète *</label>
                <input id="address" className="field-input" required minLength={5} maxLength={300} autoComplete="street-address" value={form.address} onChange={set('address')} />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="notes">Note pour la livraison (facultatif)</label>
              <textarea id="notes" className="field-input" rows={3} maxLength={500} value={form.notes} onChange={set('notes')} />
            </div>

            {settings.gift_wrap.enabled && (
              <div className="border border-line bg-white p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={gift} onChange={(e) => setGift(e.target.checked)} />
                  <span>
                    Emballage cadeau <span className="text-ink/60">(+ {tnd(settings.gift_wrap.price)})</span>
                  </span>
                </label>
                {gift && (
                  <div className="mt-3">
                    <label className="field-label" htmlFor="gift_message">Message à joindre (facultatif)</label>
                    <textarea id="gift_message" className="field-input" rows={2} maxLength={300} value={giftMessage} onChange={(e) => setGiftMessage(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            <div className="honeypot" aria-hidden="true">
              <label>Ne pas remplir<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
            </div>

            <p className="text-sm text-ink/60 bg-surface p-4">Paiement à la livraison : vous réglez en espèces à la réception de votre colis.</p>
          </div>

          <div className="bg-surface p-6 h-fit">
            <p className="font-display text-lg text-ink mb-4">Récapitulatif</p>
            <div className="space-y-3 mb-5 text-sm">
              {items.map((i) => (
                <div key={i.key} className="flex items-center gap-3">
                  <div className="w-12 flex-shrink-0">
                    <CartLineThumb item={i} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink truncate">{i.name}</p>
                    <p className="text-ink/50 text-xs">{i.variant_name ? `${i.variant_name} · ` : ''}Qté {i.quantity}</p>
                  </div>
                  <span>{tnd(i.price * i.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-line pt-4 mb-4">
              <div className="flex gap-2">
                <input
                  className="field-input !py-2 uppercase"
                  placeholder="Code promo"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  disabled={!!coupon}
                />
                {coupon ? (
                  <button type="button" className="btn-outline btn-sm" onClick={() => { setCoupon(null); setCouponInput(''); }}>Retirer</button>
                ) : (
                  <button type="button" className="btn-outline btn-sm" disabled={couponLoading} onClick={applyCoupon}>Appliquer</button>
                )}
              </div>
              {coupon && <p className="text-forest text-xs mt-2">{coupon.message}</p>}
              {couponError && <p className="text-clay text-xs mt-2">{couponError}</p>}
            </div>

            <div className="space-y-2 text-sm text-ink/70 border-t border-line pt-4">
              <div className="flex justify-between"><span>Sous-total</span><span>{tnd(total)}</span></div>
              {discount > 0 && <div className="flex justify-between text-forest"><span>Remise</span><span>− {tnd(discount)}</span></div>}
              <div className="flex justify-between">
                <span>Livraison</span>
                <span>{shippingFee === null ? 'Choisissez un gouvernorat' : shippingFee === 0 ? 'Offerte' : tnd(shippingFee)}</span>
              </div>
              {giftFee > 0 && <div className="flex justify-between"><span>Emballage cadeau</span><span>{tnd(giftFee)}</span></div>}
            </div>
            <div className="flex justify-between font-display text-lg text-ink border-t border-line mt-4 pt-4 mb-6">
              <span>Total à payer</span>
              <span>{tnd(grandTotal)}</span>
            </div>

            {error && <p className="text-clay text-sm mb-4">{error}</p>}
            <button className="btn-primary w-full" disabled={loading} type="submit">
              {loading ? 'Envoi en cours…' : 'Confirmer la commande'}
            </button>
          </div>
        </form>
      </section>
      <Footer />
    </>
  );
}

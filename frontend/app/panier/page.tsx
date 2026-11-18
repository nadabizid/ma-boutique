'use client';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useCart } from '@/lib/cart';
import { usePublicSettings } from '@/lib/settings';
import CartLineThumb from '@/components/CartLineThumb';
import { tnd } from '@/lib/format';
import Link from 'next/link';

export default function CartPage() {
  const { items, removeItem, updateQuantity, total } = useCart();
  const { shipping } = usePublicSettings();
  const threshold = shipping.free_threshold;
  const remaining = threshold ? Math.max(threshold - total, 0) : 0;

  return (
    <>
      <Header />
      <section className="container-page py-16">
        <h1 className="font-display text-3xl text-ink mb-10">Votre panier</h1>

        {items.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-ink/50 mb-6">Votre panier est vide.</p>
            <Link href="/produits" className="btn-primary">Découvrir la collection</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-12">
            <div className="md:col-span-2 divide-y divide-line">
              {items.map((item) => (
                <div key={item.key} className="flex items-center gap-4 py-6">
                  <div className="w-16 sm:w-20 flex-shrink-0">
                    <CartLineThumb item={item} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.slug ? (
                      <Link href={`/produits/${item.slug}`} className="font-display text-ink">{item.name}</Link>
                    ) : (
                      <p className="font-display text-ink">{item.name}</p>
                    )}
                    {item.variant_name && <p className="text-sm text-ink/60">{item.variant_name}</p>}
                    <p className="text-sm text-ink/50">{tnd(item.price)}</p>
                  </div>
                  <div className="flex items-center border border-line">
                    <button className="px-2 py-1 text-ink/60" onClick={() => updateQuantity(item.key, item.quantity - 1)} aria-label="Moins">−</button>
                    <span className="px-3">{item.quantity}</span>
                    <button className="px-2 py-1 text-ink/60" onClick={() => updateQuantity(item.key, item.quantity + 1)} aria-label="Plus">+</button>
                  </div>
                  <p className="w-24 text-right text-ink">{tnd(item.price * item.quantity)}</p>
                  <button className="text-ink/40 hover:text-clay text-sm" onClick={() => removeItem(item.key)}>Retirer</button>
                </div>
              ))}
            </div>

            <div className="bg-surface p-6 h-fit">
              {threshold ? (
                <div className="mb-5 text-sm">
                  {remaining > 0 ? (
                    <p className="text-ink/70 mb-2">Plus que <b>{tnd(remaining)}</b> pour la livraison offerte.</p>
                  ) : (
                    <p className="text-forest mb-2">🎉 Livraison offerte !</p>
                  )}
                  <div className="h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-forest" style={{ width: `${Math.min(100, (total / threshold) * 100)}%` }} />
                  </div>
                </div>
              ) : null}
              <div className="flex justify-between mb-2 text-ink/70">
                <span>Sous-total</span>
                <span>{tnd(total)}</span>
              </div>
              <div className="flex justify-between mb-6 text-ink/70 text-sm">
                <span>Livraison</span>
                <span>Calculée selon votre gouvernorat</span>
              </div>
              <Link href="/commande" className="btn-primary w-full">Passer la commande</Link>
            </div>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}

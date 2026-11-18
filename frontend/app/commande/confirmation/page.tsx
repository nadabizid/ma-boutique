'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CartLineThumb from '@/components/CartLineThumb';
import { usePublicSettings } from '@/lib/settings';
import { tnd, waLink } from '@/lib/format';
import type { CartItem } from '@/lib/cart';

function Confirmation() {
  const params = useSearchParams();
  const { store } = usePublicSettings();
  const id = params.get('id');
  const total = params.get('total');
  const [items, setItems] = useState<CartItem[]>([]);

  // Récapitulatif enregistré au moment de la commande (uniquement sur cet appareil)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('md_last_order');
      if (raw) {
        const d = JSON.parse(raw);
        if (String(d.id) === String(id)) setItems(d.items || []);
      }
    } catch {}
  }, [id]);

  return (
    <section className="container-page py-16 md:py-24 text-center max-w-xl">
      <div className="w-14 h-14 rounded-full bg-forest text-ivory flex items-center justify-center mx-auto mb-6 text-2xl">✓</div>
      <h1 className="font-display text-3xl text-ink mb-4">Merci pour votre commande !</h1>
      {id && <p className="text-ink/70 mb-2">Votre commande <b>#{id}</b> a bien été enregistrée.</p>}
      {total && <p className="text-ink/70 mb-6">Montant à régler à la livraison : <b>{tnd(total)}</b></p>}

      {items.length > 0 && (
        <div className="text-left bg-surface p-4 mb-6 space-y-3">
          <p className="font-medium text-ink text-sm">Récapitulatif</p>
          {items.map((i) => (
            <div key={i.key} className="flex items-start gap-3 text-sm">
              <div className="w-14 flex-shrink-0"><CartLineThumb item={i} /></div>
              <div className="flex-1 min-w-0">
                <p className="text-ink">{i.name}{i.variant_name ? ` — ${i.variant_name}` : ''} <span className="text-ink/50">× {i.quantity}</span></p>
              </div>
              <span className="whitespace-nowrap">{tnd(i.price * i.quantity)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-ink/60 text-sm mb-8">Nous vous contacterons très vite par téléphone pour confirmer la commande et la livraison.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/produits" className="btn-primary">Continuer mes achats</Link>
        {store.whatsapp && (
          <a href={waLink(store.whatsapp, `Bonjour, j'ai passé la commande #${id || ''}.`)} target="_blank" rel="noopener noreferrer" className="btn-outline">
            Nous écrire sur WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}

export default function ConfirmationPage() {
  return (
    <>
      <Header />
      <Suspense fallback={null}>
        <Confirmation />
      </Suspense>
      <Footer />
    </>
  );
}

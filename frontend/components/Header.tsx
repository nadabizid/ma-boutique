'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { usePublicSettings } from '@/lib/settings';
import { imageUrl } from '@/lib/api';

export default function Header() {
  const { count } = useCart();
  const { store, announcement } = usePublicSettings();
  const showName = store.show_name || !store.logo_url;

  return (
    <header className="sticky top-0 z-40">
      {announcement.enabled && announcement.text && (
        <div className="bg-forest text-ivory text-center text-xs py-2 px-4">{announcement.text}</div>
      )}
      <div className="border-b border-line bg-ivory">
        <div className="container-page flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 md:h-20 md:py-0">
          {/* Marque : logo + nom, sans lien */}
          <div className="flex items-center gap-3 shrink-0 select-none">
            {store.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl(store.logo_url)} alt={showName ? '' : store.name} className="h-10 w-auto max-w-[9rem] object-contain" />
            )}
            {showName && <span className="font-display text-2xl tracking-tight text-ink">{store.name}</span>}
          </div>

          <nav className="order-3 md:order-none w-full md:w-auto flex items-center gap-6 text-sm text-ink/80">
            <Link href="/" className="hover:text-ink">Accueil</Link>
            <Link href="/produits" className="hover:text-ink">Tous les produits</Link>
            <Link href="/produits?promo=1" className="hover:text-ink">Promotions</Link>
          </nav>

          <Link href="/panier" className="relative text-sm border border-ink/20 px-4 py-2 rounded-full shrink-0">
            Panier
            {count > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs bg-forest text-ivory rounded-full">{count}</span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

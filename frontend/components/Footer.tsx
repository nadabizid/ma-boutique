'use client';

import { usePublicSettings } from '@/lib/settings';
import { waLink } from '@/lib/format';

export default function Footer() {
  const { store } = usePublicSettings();
  return (
    <footer className="border-t border-line mt-24 bg-surface">
      <div className="container-page py-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm text-ink/70">
        <div>
          <p className="font-display text-lg text-ink mb-2">{store.name}</p>
          <p>{store.tagline}</p>
          {(store.instagram || store.facebook) && (
            <p className="mt-3 flex gap-4">
              {store.instagram && <a href={store.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-ink">Instagram</a>}
              {store.facebook && <a href={store.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-ink">Facebook</a>}
            </p>
          )}
        </div>
        <div>
          <p className="text-ink mb-2">Livraison</p>
          <p>Paiement à la livraison, partout en Tunisie.</p>
        </div>
        <div>
          <p className="text-ink mb-2">Contact</p>
          {store.phone && <p>{store.phone}</p>}
          {store.whatsapp && (
            <p>
              <a href={waLink(store.whatsapp)} target="_blank" rel="noopener noreferrer" className="hover:text-ink underline">WhatsApp</a>
            </p>
          )}
          {store.email && <p>{store.email}</p>}
          {store.address && <p>{store.address}</p>}
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-ink/50">
        © {new Date().getFullYear()} {store.name}. Tous droits réservés.
      </div>
    </footer>
  );
}

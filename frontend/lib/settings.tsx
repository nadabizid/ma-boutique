'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api, PublicSettings } from './api';

export const DEFAULT_SETTINGS: PublicSettings = {
  store: { name: 'Ma Boutique', tagline: 'Votre boutique en ligne, livrée partout en Tunisie.', phone: '', whatsapp: '', email: '', address: '', instagram: '', facebook: '', logo_url: '', show_name: true },
  theme: { preset: 'foret', colors: null },
  shipping: { default_fee: 0, free_threshold: null, rates: {} },
  gift_wrap: { enabled: false, price: 0 },
  announcement: { enabled: false, text: '' },
  seo: { site_title: '', site_description: '' },
  governorates: [
    'Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte', 'Béja', 'Jendouba', 'Le Kef', 'Siliana', 'Sousse',
    'Monastir', 'Mahdia', 'Sfax', 'Kairouan', 'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
  ],
};

const Ctx = createContext<PublicSettings>(DEFAULT_SETTINGS);

export function SettingsProvider({ initial, children }: { initial: PublicSettings | null; children: React.ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings>(initial || DEFAULT_SETTINGS);
  useEffect(() => {
    if (!initial) api.getPublicSettings().then(setSettings).catch(() => {});
  }, [initial]);
  return <Ctx.Provider value={settings}>{children}</Ctx.Provider>;
}

export const usePublicSettings = () => useContext(Ctx);

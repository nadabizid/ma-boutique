import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/lib/cart';
import { SettingsProvider } from '@/lib/settings';
import { api, imageUrl } from '@/lib/api';
import { normalizeColors, themeToCss } from '@/lib/theme';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600'],
});

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

async function loadSettings() {
  try {
    return await api.getPublicSettings();
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await loadSettings();
  const name = s?.store.name || 'Ma Boutique';
  const title = s?.seo.site_title || name;
  const description = s?.seo.site_description || s?.store.tagline || 'Boutique en ligne — commandez en quelques clics, paiement à la livraison.';
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s | ${name}` },
    description,
    openGraph: { siteName: name, type: 'website', locale: 'fr_TN', title, description },
    ...(s?.store.logo_url ? { icons: { icon: imageUrl(s.store.logo_url) } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await loadSettings();
  // Couleurs choisies dans l'admin (validées : uniquement des codes #RRGGBB)
  const colors = normalizeColors(settings?.theme?.colors);
  return (
    <html lang="fr">
      <head>{colors && <style dangerouslySetInnerHTML={{ __html: `:root{${themeToCss(colors)}}` }} />}</head>
      <body className={`${fraunces.variable} ${inter.variable} font-body`}>
        <SettingsProvider initial={settings}>
          <CartProvider>{children}</CartProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}

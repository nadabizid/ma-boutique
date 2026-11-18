'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, adm } from '@/lib/api';
import { AdminContext, AdminUser } from '@/components/admin/AdminContext';
import { DEFAULT_COLORS, THEME_KEYS, hexToRgb } from '@/lib/theme';

// L'espace admin garde ses couleurs d'origine, quel que soit le thème choisi pour le site
const ADMIN_VARS = Object.fromEntries(THEME_KEYS.map((k) => [`--c-${k}`, hexToRgb(DEFAULT_COLORS[k]).join(' ')])) as React.CSSProperties;
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={ADMIN_VARS} className="bg-ivory text-ink min-h-screen">{children}</div>
);

const PUBLIC_PAGES = ['/admin/login', '/admin/mot-de-passe-oublie', '/admin/reinitialiser'];

type NavItem = { href: string; label: string; badge?: 'pending_orders' | 'pending_reviews'; owner?: boolean };
const NAV: NavItem[] = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/commandes', label: 'Commandes', badge: 'pending_orders' },
  { href: '/admin/produits', label: 'Produits' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/coupons', label: 'Codes promo' },
  { href: '/admin/avis', label: 'Avis clients', badge: 'pending_reviews' },
  { href: '/admin/livraison', label: 'Livraison (ColisPlus)', owner: true },
  { href: '/admin/parametres', label: 'Paramètres', owner: true },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', owner: true },
  { href: '/admin/journal', label: "Journal d'activité", owner: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [badges, setBadges] = useState<{ pending_orders: number; pending_reviews: number }>({ pending_orders: 0, pending_reviews: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const isPublic = PUBLIC_PAGES.some((p) => pathname.startsWith(p));
  const isPrint = pathname.startsWith('/admin/imprimer');

  const refresh = useCallback(async () => {
    try {
      const r = await api.me();
      setAdmin(r.admin);
    } catch {
      setAdmin(null);
    }
  }, []);

  // Vérifie la session (cookie sécurisé) au chargement
  useEffect(() => {
    if (isPublic) {
      setChecked(true);
      return;
    }
    refresh().finally(() => setChecked(true));
  }, [isPublic, refresh]);

  useEffect(() => {
    if (!checked || isPublic) return;
    if (!admin) router.replace('/admin/login');
    else if (admin.must_change_password && !pathname.startsWith('/admin/compte')) router.replace('/admin/compte');
  }, [checked, admin, isPublic, pathname, router]);

  // Pastilles « à traiter » (rafraîchies chaque minute)
  useEffect(() => {
    if (!admin || admin.must_change_password) return;
    const load = () => adm.get('/api/stats/badges').then(setBadges).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [admin, pathname]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (isPublic) return <Frame>{children}</Frame>;
  if (!checked || !admin) return <Frame><p className="p-8 text-ink/50">Chargement…</p></Frame>;

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    router.push('/admin/login');
  };

  const isOwner = admin.role === 'owner';
  const active = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href));

  if (isPrint) return <Frame><AdminContext.Provider value={{ admin, refresh, isOwner }}>{children}</AdminContext.Provider></Frame>;

  const nav = (
    <>
      <p className="font-display text-xl text-ink px-6 mb-8">Ma Boutique</p>
      <nav className="space-y-1 px-3">
        {NAV.filter((i) => !i.owner || isOwner).map((item) => {
          const n = item.badge ? badges[item.badge] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2 rounded text-sm ${active(item.href) ? 'bg-forest text-ivory' : 'text-ink/70 hover:bg-surface'}`}
            >
              {item.label}
              {n > 0 && <span className="bg-clay text-white text-xs rounded-full min-w-5 h-5 px-1.5 inline-flex items-center justify-center">{n}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );

  return (
    <AdminContext.Provider value={{ admin, refresh, isOwner }}>
      <div style={ADMIN_VARS} className="min-h-screen bg-ivory text-ink md:flex">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-line bg-ivory sticky top-0 z-30 no-print">
          <button onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" className="text-ink text-xl">☰</button>
          <span className="font-display text-ink">Ma Boutique</span>
          <span className="w-6" />
        </header>

        <aside className={`${menuOpen ? 'block' : 'hidden'} md:flex w-full md:w-60 border-r border-line flex-shrink-0 flex-col justify-between py-6 md:py-8 bg-ivory no-print md:sticky md:top-0 md:h-screen md:overflow-y-auto`}>
          <div>{nav}</div>
          <div className="px-6 pt-8 space-y-2 text-sm">
            <p className="text-ink/60 truncate" title={admin.email}>{admin.name} · {isOwner ? 'Propriétaire' : 'Gestionnaire'}</p>
            <Link href="/admin/compte" className="block text-ink/60 hover:text-ink">Mon compte</Link>
            <Link href="/" target="_blank" className="block text-ink/60 hover:text-ink">Voir le site ↗</Link>
            <button onClick={handleLogout} className="text-ink/50 hover:text-clay text-left">Se déconnecter</button>
          </div>
        </aside>

        <main className="flex-1 p-4 md:p-8 overflow-x-auto min-w-0">{children}</main>
      </div>
    </AdminContext.Provider>
  );
}

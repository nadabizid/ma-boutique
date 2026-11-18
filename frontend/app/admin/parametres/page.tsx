'use client';

import { useEffect, useState } from 'react';
import { adm } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import ImageUploader from '@/components/admin/ImageUploader';
import { Notice } from '@/components/admin/ui';
import AppearanceSettings from '@/components/admin/AppearanceSettings';

const TABS = [
  { key: 'store', label: 'Boutique' },
  { key: 'look', label: 'Apparence' },
  { key: 'shipping', label: 'Livraison' },
  { key: 'home', label: "Page d'accueil" },
  { key: 'seo', label: 'SEO et notifications' },
];

const SECTION_HELP: Record<string, string> = {
  nouveautes: 'Derniers produits ajoutés',
  promotions: 'Produits avec un prix barré',
  meilleures_ventes: 'Les plus vendus sur 90 jours',
  categories: 'Liens vers vos catégories',
};

export default function SettingsPage() {
  const { isOwner } = useAdmin();
  const [tab, setTab] = useState('store');
  const [s, setS] = useState<any>(null);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adm.get('/api/settings').then((d) => {
      setS(d);
      setRates(Object.fromEntries(Object.entries(d.shipping_rates || {}).map(([k, v]) => [k, String(v)])));
    }).catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, []);

  if (!isOwner) return <p className="text-clay">Cette page est réservée au propriétaire.</p>;
  if (!s) return <p className="text-ink/50">{msg ? msg.text : 'Chargement…'}</p>;

  const up = (section: string, key: string, value: any) => setS({ ...s, [section]: { ...s[section], [key]: value } });
  const moveSection = (i: number, d: number) => {
    const a = [...s.home_sections];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setS({ ...s, home_sections: a });
  };
  const updSection = (i: number, patch: any) => setS({ ...s, home_sections: s.home_sections.map((x: any, k: number) => (k === i ? { ...x, ...patch } : x)) });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await adm.put('/api/settings', {
        store: s.store,
        theme: s.theme,
        shipping: { default_fee: s.shipping.default_fee, free_threshold: s.shipping.free_threshold === '' ? null : s.shipping.free_threshold },
        gift_wrap: s.gift_wrap,
        announcement: s.announcement,
        hero: s.hero,
        home_sections: s.home_sections,
        seo: s.seo,
        notifications: s.notifications,
        shipping_rates: Object.entries(rates).filter(([, v]) => v !== '').map(([city, fee]) => ({ city, fee: parseFloat(String(fee).replace(',', '.')) })),
      });
      setMsg({ kind: 'success', text: 'Paramètres enregistrés. Le site est mis à jour.' });
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const Input = ({ label, section, k, ...rest }: any) => (
    <div>
      <label className="field-label">{label}</label>
      <input className="field-input" value={s[section][k] ?? ''} onChange={(e) => up(section, k, e.target.value)} {...rest} />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl text-ink mb-6">Paramètres</h1>
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 text-sm rounded-full border ${tab === t.key ? 'bg-ink text-ivory border-ink' : 'border-line text-ink/60 hover:border-ink'}`}>{t.label}</button>
        ))}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {tab === 'store' && (
        <div className="card space-y-4">
          <p className="text-sm text-ink/60">Ces informations apparaissent sur le site, dans le pied de page, les emails et les bons de livraison.</p>
          <Input label="Nom de la boutique" section="store" k="name" maxLength={80} />
          <Input label="Slogan" section="store" k="tagline" maxLength={200} />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Téléphone" section="store" k="phone" />
            <Input label="WhatsApp (bouton de contact)" section="store" k="whatsapp" placeholder="Ex : 22 345 678" />
          </div>
          <Input label="Email de contact" section="store" k="email" type="email" />
          <Input label="Adresse" section="store" k="address" />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Lien Instagram" section="store" k="instagram" placeholder="https://instagram.com/…" />
            <Input label="Lien Facebook" section="store" k="facebook" placeholder="https://facebook.com/…" />
          </div>
        </div>
      )}

      {tab === 'look' && <AppearanceSettings s={s} setS={setS} />}

      {tab === 'shipping' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <p className="font-medium text-ink">Frais de livraison</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Tarif par défaut (TND)</label>
                <input className="field-input" inputMode="decimal" value={s.shipping.default_fee} onChange={(e) => up('shipping', 'default_fee', e.target.value)} />
              </div>
              <div>
                <label className="field-label">Livraison offerte dès (TND, vide = jamais)</label>
                <input className="field-input" inputMode="decimal" value={s.shipping.free_threshold ?? ''} onChange={(e) => up('shipping', 'free_threshold', e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-ink/50">Le seuil s'applique au sous-total des articles (avant remise).</p>
          </div>

          <div className="card space-y-4">
            <p className="font-medium text-ink">Tarif par gouvernorat <span className="text-ink/40 font-normal">(laisser vide = tarif par défaut)</span></p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {s.governorates.map((g: string) => (
                <div key={g}>
                  <label className="field-label">{g}</label>
                  <input className="field-input !py-1.5" inputMode="decimal" value={rates[g] ?? ''} placeholder={String(s.shipping.default_fee || 0)} onChange={(e) => setRates({ ...rates, [g]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>

          <div className="card space-y-4">
            <p className="font-medium text-ink">Emballage cadeau</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.gift_wrap.enabled} onChange={(e) => up('gift_wrap', 'enabled', e.target.checked)} /> Proposer l'emballage cadeau à la commande</label>
            {s.gift_wrap.enabled && (
              <div className="max-w-[12rem]">
                <label className="field-label">Prix (TND)</label>
                <input className="field-input" inputMode="decimal" value={s.gift_wrap.price} onChange={(e) => up('gift_wrap', 'price', e.target.value)} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'home' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <p className="font-medium text-ink">Bandeau d'annonce (tout en haut du site)</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.announcement.enabled} onChange={(e) => up('announcement', 'enabled', e.target.checked)} /> Afficher le bandeau</label>
            <input className="field-input" maxLength={200} placeholder="Ex : Livraison offerte dès 150 TND 🚚" value={s.announcement.text} onChange={(e) => up('announcement', 'text', e.target.value)} />
          </div>

          <div className="card space-y-4">
            <p className="font-medium text-ink">Bannière principale</p>
            <Input label="Petit texte au-dessus du titre" section="hero" k="eyebrow" maxLength={60} />
            <Input label="Titre *" section="hero" k="title" maxLength={160} required />
            <div>
              <label className="field-label">Sous-titre</label>
              <textarea className="field-input" rows={2} maxLength={400} value={s.hero.subtitle} onChange={(e) => up('hero', 'subtitle', e.target.value)} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Texte du bouton" section="hero" k="button_label" maxLength={40} />
              <Input label="Lien du bouton" section="hero" k="button_link" placeholder="/produits ou /produits?promo=1" />
            </div>
            <div>
              <p className="field-label">Image de la bannière</p>
              <ImageUploader images={s.hero.image_url ? [s.hero.image_url] : []} max={1} onChange={(urls) => up('hero', 'image_url', urls[0] || '')} />
            </div>
          </div>

          <div className="card space-y-3">
            <p className="font-medium text-ink">Sections de la page d'accueil</p>
            <p className="text-xs text-ink/50">Activez, renommez et réordonnez les sections affichées sous la bannière.</p>
            {s.home_sections.map((sec: any, i: number) => (
              <div key={sec.key} className="border border-line rounded p-3 grid grid-cols-12 gap-2 items-center">
                <label className="col-span-12 md:col-span-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sec.enabled} onChange={(e) => updSection(i, { enabled: e.target.checked })} />
                  <span><b>{SECTION_HELP[sec.key] ? sec.key.replace('_', ' ') : sec.key}</b></span>
                </label>
                <input className="field-input col-span-8 md:col-span-5 !py-1.5" value={sec.title} maxLength={60} onChange={(e) => updSection(i, { title: e.target.value })} aria-label="Titre de la section" />
                <input className="field-input col-span-4 md:col-span-2 !py-1.5" type="number" min={1} max={24} value={sec.limit} onChange={(e) => updSection(i, { limit: e.target.value })} aria-label="Nombre d'éléments" />
                <div className="col-span-12 md:col-span-2 flex gap-1 justify-end">
                  <button type="button" className="px-2 py-1 border border-line rounded-sm disabled:opacity-30" disabled={i === 0} onClick={() => moveSection(i, -1)} aria-label="Monter">↑</button>
                  <button type="button" className="px-2 py-1 border border-line rounded-sm disabled:opacity-30" disabled={i === s.home_sections.length - 1} onClick={() => moveSection(i, 1)} aria-label="Descendre">↓</button>
                </div>
                <p className="col-span-12 text-xs text-ink/40">{SECTION_HELP[sec.key]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'seo' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <p className="font-medium text-ink">Référencement de la page d'accueil</p>
            <Input label="Titre du site (affiché dans Google)" section="seo" k="site_title" maxLength={70} placeholder={s.store.name} />
            <div>
              <label className="field-label">Description du site ({(s.seo.site_description || '').length}/160 conseillés)</label>
              <textarea className="field-input" rows={2} maxLength={200} value={s.seo.site_description} onChange={(e) => up('seo', 'site_description', e.target.value)} />
            </div>
            <p className="text-xs text-ink/50">Le plan du site (sitemap.xml) et les données produits pour Google sont générés automatiquement.</p>
          </div>

          <div className="card space-y-4">
            <p className="font-medium text-ink">Notifications de commande</p>
            <div className="text-sm space-y-1">
              <p>Email du serveur : {s.env.email_configured ? <span className="text-forest">✓ configuré</span> : <span className="text-clay">non configuré (variables SMTP_* du backend)</span>}</p>
              <p>Alerte Telegram : {s.env.telegram_configured ? <span className="text-forest">✓ configurée</span> : <span className="text-ink/50">non configurée (facultatif)</span>}</p>
            </div>
            <div>
              <label className="field-label">Recevoir les nouvelles commandes par email à</label>
              <input className="field-input" type="email" value={s.notifications.admin_email} onChange={(e) => up('notifications', 'admin_email', e.target.value)} />
              {s.env.notify_email_env && <p className="text-xs text-ink/50 mt-1">Une adresse est déjà définie sur le serveur (NOTIFY_EMAIL) : elle est prioritaire.</p>}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.notifications.new_order_email} onChange={(e) => up('notifications', 'new_order_email', e.target.checked)} /> M'envoyer un email à chaque nouvelle commande</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.notifications.customer_confirmation_email} onChange={(e) => up('notifications', 'customer_confirmation_email', e.target.checked)} /> Envoyer un email de confirmation au client (s'il a renseigné son email)</label>
          </div>
        </div>
      )}

      <div className="mt-8 sticky bottom-4">
        <button className="btn-primary shadow-lg" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button>
      </div>
    </div>
  );
}

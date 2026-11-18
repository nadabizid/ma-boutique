'use client';

import { useCallback, useEffect, useState } from 'react';
import { adm } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import { Pagination, Notice } from '@/components/admin/ui';
import { fmtDateTime } from '@/lib/format';

const ACTIONS: Record<string, string> = {
  login: 'Connexion', login_failed: 'Connexion échouée', login_2fa_failed: 'Code 2FA incorrect', password_changed: 'Mot de passe modifié', password_reset: 'Mot de passe réinitialisé',
  '2fa_enabled': '2FA activée', '2fa_disabled': '2FA désactivée', admin_created: 'Utilisateur créé', admin_updated: 'Utilisateur modifié', admin_deleted: 'Utilisateur supprimé',
  product_created: 'Produit créé', product_updated: 'Produit modifié', product_deleted: 'Produit supprimé', product_duplicated: 'Produit dupliqué', products_bulk: 'Action groupée sur produits', products_imported: 'Import de produits',
  order_status: 'Statut de commande', order_colisplus_sent: 'Colis envoyé à ColisPlus', colisplus_config: 'Réglages ColisPlus', colisplus_simulated: 'Test de notification ColisPlus', order_details: 'Suivi de commande', orders_bulk_status: 'Statuts groupés', orders_exported: 'Export des commandes',
  customer_updated: 'Client modifié', customer_flagged: 'Client signalé', customer_unflagged: 'Signalement retiré', customers_exported: 'Export des clients',
  coupon_created: 'Code promo créé', coupon_updated: 'Code promo modifié', coupon_deleted: 'Code promo supprimé', settings_updated: 'Paramètres modifiés',
  category_created: 'Catégorie créée', category_updated: 'Catégorie renommée', category_deleted: 'Catégorie supprimée',
  review_approved: 'Avis publié', review_rejected: 'Avis refusé', review_pending: 'Avis remis en attente', review_deleted: 'Avis supprimé',
};
const ENTITIES = [
  ['', 'Tout'], ['order', 'Commandes'], ['product', 'Produits'], ['customer', 'Clients'], ['coupon', 'Codes promo'], ['admin', 'Comptes'], ['settings', 'Paramètres'], ['review', 'Avis'],
];

export default function ActivityPage() {
  const { isOwner } = useAdmin();
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>({ items: [], total: 0, page: 1, pages: 1 });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!isOwner) return;
    adm.get(`/api/activity${adm.qs({ entity, page })}`).then(setData).catch((e) => setError(e.message));
  }, [entity, page, isOwner]);
  useEffect(load, [load]);

  if (!isOwner) return <p className="text-clay">Cette page est réservée au propriétaire.</p>;

  const detail = (d: any) => {
    if (!d || !Object.keys(d).length) return '';
    return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  };

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl text-ink mb-2">Journal d'activité</h1>
      <p className="text-sm text-ink/60 mb-6">Qui a fait quoi, et quand. Utile pour comprendre une modification ou repérer une connexion suspecte.</p>
      <div className="flex flex-wrap gap-2 mb-6">
        {ENTITIES.map(([k, l]) => (
          <button key={k} onClick={() => { setEntity(k); setPage(1); }} className={`px-3 py-1.5 text-sm rounded-full border ${entity === k ? 'bg-ink text-ivory border-ink' : 'border-line text-ink/60 hover:border-ink'}`}>{l}</button>
        ))}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="bg-white border border-line rounded overflow-x-auto">
        <table className="w-full text-sm table-admin">
          <thead className="bg-surface text-ink/60"><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={4} className="text-ink/50">Aucune activité.</td></tr>}
            {data.items.map((a: any) => (
              <tr key={a.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap text-ink/60">{fmtDateTime(a.created_at)}</td>
                <td>{a.admin_name || '—'}{a.ip && <span className="block text-xs text-ink/30">{a.ip}</span>}</td>
                <td>{ACTIONS[a.action] || a.action}{a.entity_id && <span className="text-ink/40"> #{a.entity_id}</span>}</td>
                <td className="text-xs text-ink/50 break-words max-w-xs">{detail(a.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink/40 mt-3">{data.total} événement(s)</p>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </div>
  );
}

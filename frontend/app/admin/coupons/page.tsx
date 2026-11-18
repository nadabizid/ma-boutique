'use client';

import { useEffect, useState } from 'react';
import { adm } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import { Modal, Notice, confirmAction } from '@/components/admin/ui';
import { tnd } from '@/lib/format';

const EMPTY = { code: '', type: 'percent', value: '10', min_order: '', max_discount: '', max_uses: '', first_order_only: false, starts_at: '', expires_at: '', is_active: true };
const TYPE_LABEL: Record<string, string> = { percent: 'Pourcentage', fixed: 'Montant fixe', free_shipping: 'Livraison offerte' };

export default function AdminCouponsPage() {
  const { isOwner } = useAdmin();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null); // objet du formulaire (id si modification)
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => adm.get('/api/coupons').then(setCoupons).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const describe = (c: any) =>
    c.type === 'percent' ? `−${Number(c.value)} %${Number(c.max_discount) > 0 ? ` (max ${tnd(c.max_discount)})` : ''}` : c.type === 'fixed' ? `−${tnd(c.value)}` : 'Livraison offerte';

  const state = (c: any) => {
    const today = new Date().toISOString().slice(0, 10);
    if (!c.is_active) return { t: 'Désactivé', cls: 'bg-gray-100 text-gray-600' };
    if (c.expires_at && c.expires_at < today) return { t: 'Expiré', cls: 'bg-red-100 text-red-800' };
    if (c.starts_at && c.starts_at > today) return { t: 'À venir', cls: 'bg-blue-100 text-blue-800' };
    if (c.max_uses !== null && c.used_count >= c.max_uses) return { t: 'Épuisé', cls: 'bg-red-100 text-red-800' };
    return { t: 'Actif', cls: 'bg-green-100 text-green-800' };
  };

  const openEdit = (c: any) =>
    setEditing({
      id: c.id, code: c.code, type: c.type, value: String(Number(c.value)), min_order: Number(c.min_order) ? String(Number(c.min_order)) : '',
      max_discount: c.max_discount ? String(Number(c.max_discount)) : '', max_uses: c.max_uses ?? '', first_order_only: c.first_order_only,
      starts_at: c.starts_at || '', expires_at: c.expires_at || '', is_active: c.is_active,
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const body = {
      ...editing,
      value: parseFloat(String(editing.value).replace(',', '.')) || 0,
      min_order: editing.min_order === '' ? 0 : parseFloat(String(editing.min_order).replace(',', '.')),
      max_discount: editing.max_discount === '' ? null : parseFloat(String(editing.max_discount).replace(',', '.')),
      max_uses: editing.max_uses === '' ? null : parseInt(editing.max_uses, 10),
    };
    try {
      if (editing.id) await adm.put(`/api/coupons/${editing.id}`, body);
      else await adm.post('/api/coupons', body);
      setEditing(null);
      load();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const toggle = async (c: any) => {
    try {
      await adm.put(`/api/coupons/${c.id}`, { ...c, is_active: !c.is_active, value: Number(c.value), min_order: Number(c.min_order), max_discount: c.max_discount ? Number(c.max_discount) : null });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async (c: any) => {
    if (!confirmAction(`Supprimer le code ${c.code} ?`)) return;
    try { await adm.del(`/api/coupons/${c.id}`); load(); } catch (e: any) { setError(e.message); }
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditing({ ...editing, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-ink">Codes promo</h1>
        {isOwner && <button className="btn-primary btn-sm" onClick={() => { setFormError(''); setEditing({ ...EMPTY }); }}>+ Nouveau code</button>}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!isOwner && <Notice kind="info">Lecture seule : seul le propriétaire peut créer ou modifier les codes.</Notice>}

      {loading ? <p className="text-ink/50">Chargement…</p> : coupons.length === 0 ? (
        <p className="text-ink/50">Aucun code promo. Créez-en un pour lancer une offre (ex : BIENVENUE10).</p>
      ) : (
        <div className="bg-white border border-line rounded overflow-x-auto">
          <table className="w-full text-sm table-admin">
            <thead className="bg-surface text-ink/60">
              <tr><th>Code</th><th>Remise</th><th>Conditions</th><th>Utilisations</th><th>Validité</th><th>État</th>{isOwner && <th className="text-right">Actions</th>}</tr>
            </thead>
            <tbody>
              {coupons.map((c) => {
                const s = state(c);
                return (
                  <tr key={c.id} className="border-t border-line">
                    <td className="font-mono font-medium">{c.code}</td>
                    <td>{describe(c)}<span className="block text-xs text-ink/40">{TYPE_LABEL[c.type]}</span></td>
                    <td className="text-xs text-ink/60">
                      {Number(c.min_order) > 0 && <span className="block">Min. {tnd(c.min_order)}</span>}
                      {c.first_order_only && <span className="block">1re commande</span>}
                      {!Number(c.min_order) && !c.first_order_only && '—'}
                    </td>
                    <td>{c.used_count}{c.max_uses !== null ? ` / ${c.max_uses}` : ''}</td>
                    <td className="text-xs text-ink/60">{c.starts_at || c.expires_at ? `${c.starts_at || '…'} → ${c.expires_at || '…'}` : 'Illimitée'}</td>
                    <td><span className={`text-xs px-2 py-1 rounded ${s.cls}`}>{s.t}</span></td>
                    {isOwner && (
                      <td className="text-right whitespace-nowrap">
                        <button className="text-forest mr-3" onClick={() => openEdit(c)}>Modifier</button>
                        <button className="text-ink/60 mr-3" onClick={() => toggle(c)}>{c.is_active ? 'Désactiver' : 'Activer'}</button>
                        <button className="text-clay" onClick={() => remove(c)}>Supprimer</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Modifier le code' : 'Nouveau code promo'} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <Notice kind="error">{formError}</Notice>}
            <div>
              <label className="field-label">Code *</label>
              <input className="field-input uppercase font-mono" required maxLength={40} value={editing.code} onChange={f('code')} placeholder="BIENVENUE10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Type de remise</label>
                <select className="field-input" value={editing.type} onChange={f('type')}>
                  <option value="percent">Pourcentage</option>
                  <option value="fixed">Montant fixe (TND)</option>
                  <option value="free_shipping">Livraison offerte</option>
                </select>
              </div>
              {editing.type !== 'free_shipping' && (
                <div>
                  <label className="field-label">{editing.type === 'percent' ? 'Pourcentage' : 'Montant (TND)'}</label>
                  <input className="field-input" required inputMode="decimal" value={editing.value} onChange={f('value')} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="field-label">Commande minimum (TND)</label><input className="field-input" inputMode="decimal" value={editing.min_order} onChange={f('min_order')} /></div>
              {editing.type === 'percent' && <div><label className="field-label">Remise maximale (TND)</label><input className="field-input" inputMode="decimal" value={editing.max_discount} onChange={f('max_discount')} /></div>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="field-label">Début</label><input type="date" className="field-input" value={editing.starts_at} onChange={f('starts_at')} /></div>
              <div><label className="field-label">Fin (incluse)</label><input type="date" className="field-input" value={editing.expires_at} onChange={f('expires_at')} /></div>
            </div>
            <div><label className="field-label">Nombre d'utilisations maximum (vide = illimité)</label><input className="field-input" type="number" min={1} value={editing.max_uses} onChange={f('max_uses')} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.first_order_only} onChange={f('first_order_only')} /> Réservé à la première commande d'un client</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={f('is_active')} /> Code actif</label>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary" type="submit">Enregistrer</button>
              <button className="btn-outline" type="button" onClick={() => setEditing(null)}>Annuler</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

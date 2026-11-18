'use client';

import { useEffect, useState } from 'react';
import { adm } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import { Modal, Notice, confirmAction } from '@/components/admin/ui';
import { fmtDateTime } from '@/lib/format';

const ROLE_LABEL: Record<string, string> = { owner: 'Propriétaire', manager: 'Gestionnaire de commandes' };

export default function UsersPage() {
  const { admin, isOwner } = useAdmin();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [modal, setModal] = useState<any>(null);
  const [formError, setFormError] = useState('');

  const load = () => adm.get('/api/admins').then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  if (!isOwner) return <p className="text-clay">Cette page est réservée au propriétaire.</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      if (modal.id) {
        await adm.put(`/api/admins/${modal.id}`, { name: modal.name, role: modal.role, is_active: modal.is_active, password: modal.password || undefined, reset_2fa: modal.reset_2fa });
        setMsg(modal.password ? 'Compte modifié. Un nouveau mot de passe temporaire a été défini : communiquez-le à la personne.' : 'Compte modifié.');
      } else {
        await adm.post('/api/admins', { name: modal.name, email: modal.email, role: modal.role, password: modal.password });
        setMsg('Compte créé. La personne devra choisir son propre mot de passe à sa première connexion.');
      }
      setModal(null);
      load();
    } catch (err: any) {
      setFormError(err.message);
    }
  };

  const remove = async (u: any) => {
    if (!confirmAction(`Supprimer le compte de ${u.name} ?`)) return;
    try { await adm.del(`/api/admins/${u.id}`); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl text-ink">Utilisateurs</h1>
        <button className="btn-primary btn-sm" onClick={() => { setFormError(''); setModal({ name: '', email: '', role: 'manager', password: '', is_active: true }); }}>+ Nouvel utilisateur</button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {msg && <Notice kind="success">{msg}</Notice>}

      <div className="card mb-6 text-sm text-ink/70">
        <p><b>Propriétaire</b> : accès complet (produits, paramètres, codes promo, utilisateurs, journal).</p>
        <p><b>Gestionnaire de commandes</b> : commandes, clients, avis et tableau de bord. Produits et codes promo en lecture seule.</p>
      </div>

      <div className="bg-white border border-line rounded overflow-x-auto">
        <table className="w-full text-sm table-admin">
          <thead className="bg-surface text-ink/60"><tr><th>Nom</th><th>Rôle</th><th>Sécurité</th><th>Dernière connexion</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td>{u.name}{u.id === admin?.id && <span className="text-xs text-ink/40"> (vous)</span>}<span className="block text-xs text-ink/40">{u.email}</span></td>
                <td>{ROLE_LABEL[u.role]}{!u.is_active && <span className="block text-xs text-clay">Désactivé</span>}</td>
                <td className="text-xs text-ink/60">{u.totp_enabled ? '2FA activée' : '—'}{u.must_change_password && <span className="block text-clay">Mot de passe à changer</span>}</td>
                <td className="text-ink/60">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Jamais'}</td>
                <td className="text-right whitespace-nowrap">
                  <button className="text-forest mr-3" onClick={() => { setFormError(''); setModal({ ...u, password: '', reset_2fa: false }); }}>Modifier</button>
                  {u.id !== admin?.id && <button className="text-clay" onClick={() => remove(u)}>Supprimer</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.id ? `Modifier ${modal.name}` : 'Nouvel utilisateur'} onClose={() => setModal(null)}>
          <form onSubmit={save} className="space-y-4">
            {formError && <Notice kind="error">{formError}</Notice>}
            <div><label className="field-label">Nom</label><input className="field-input" required value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} /></div>
            {!modal.id && <div><label className="field-label">Email</label><input className="field-input" type="email" required value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} /></div>}
            <div>
              <label className="field-label">Rôle</label>
              <select className="field-input" value={modal.role} disabled={modal.id === admin?.id} onChange={(e) => setModal({ ...modal, role: e.target.value })}>
                <option value="manager">Gestionnaire de commandes</option>
                <option value="owner">Propriétaire</option>
              </select>
            </div>
            <div>
              <label className="field-label">{modal.id ? 'Nouveau mot de passe temporaire (laisser vide pour ne pas changer)' : 'Mot de passe temporaire'}</label>
              <input className="field-input" type="text" autoComplete="off" minLength={10} required={!modal.id} value={modal.password} onChange={(e) => setModal({ ...modal, password: e.target.value })} />
              <p className="text-xs text-ink/50 mt-1">10 caractères minimum, lettres et chiffres. La personne devra le changer à sa première connexion.</p>
            </div>
            {modal.id && modal.id !== admin?.id && (
              <>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modal.is_active} onChange={(e) => setModal({ ...modal, is_active: e.target.checked })} /> Compte actif</label>
                {modal.totp_enabled && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!modal.reset_2fa} onChange={(e) => setModal({ ...modal, reset_2fa: e.target.checked })} /> Réinitialiser la double authentification (téléphone perdu)</label>}
              </>
            )}
            <div className="flex gap-3 pt-2">
              <button className="btn-primary" type="submit">Enregistrer</button>
              <button className="btn-outline" type="button" onClick={() => setModal(null)}>Annuler</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

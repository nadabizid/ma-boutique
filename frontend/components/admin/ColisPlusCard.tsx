'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adm } from '@/lib/api';
import { Modal, Notice } from './ui';
import { useAdmin } from './AdminContext';
import { fmtDateTime, norm, tnd } from '@/lib/format';

type Loc = { gouvernorat: string; delegations: { delegation: string; localites: { localite: string; code_postal: string }[] }[] };

export default function ColisPlusCard({ order, onChanged }: { order: any; onChanged: () => void }) {
  const { isOwner } = useAdmin();
  const [cfg, setCfg] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [locs, setLocs] = useState<Loc[] | null>(null);
  const [locError, setLocError] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [f, setF] = useState<any>({});

  useEffect(() => { adm.get('/api/colisplus/config').then(setCfg).catch(() => setCfg(null)); }, []);

  const sent = order.shipping_provider === 'colisplus' && order.tracking_number;
  const canSend = ['en_attente', 'confirmee', 'expediee'].includes(order.status);

  const openModal = async () => {
    setError('');
    setOpen(true);
    const note = [`#${order.id}`, order.notes, order.gift_wrap ? 'Emballage cadeau — manipuler avec soin' : ''].filter(Boolean).join(' · ');
    setF({
      gouvernorat: '', delegation: '', localite: '', code_postal: '', nbr_colis: 1, marchandise: '',
      remarque: note.slice(0, 250), ouvrir_colis: cfg?.config?.ouvrir_colis || 'non', is_exchange: 'non', mark_shipped: true,
    });
    if (!locs) {
      try {
        const data: Loc[] = await adm.get('/api/colisplus/locations');
        setLocs(data);
        // Présélection du gouvernorat choisi par le client
        const g = data.find((x) => norm(x.gouvernorat) === norm(order.ship_city || ''));
        if (g) setF((p: any) => ({ ...p, gouvernorat: g.gouvernorat, delegation: g.delegations.length === 1 ? g.delegations[0].delegation : '' }));
      } catch (e: any) {
        setLocError(e.message);
      }
    } else {
      const g = locs.find((x) => norm(x.gouvernorat) === norm(order.ship_city || ''));
      if (g) setF((p: any) => ({ ...p, gouvernorat: g.gouvernorat, delegation: g.delegations.length === 1 ? g.delegations[0].delegation : '' }));
    }
  };

  const gov = locs?.find((g) => g.gouvernorat === f.gouvernorat);
  const del = gov?.delegations.find((d) => d.delegation === f.delegation);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      await adm.post(`/api/colisplus/push/${order.id}`, f);
      setOpen(false);
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!cfg) return null;
  const ready = cfg.api_key_set && cfg.config.enabled;

  return (
    <div className="card space-y-3">
      <p className="font-medium text-ink">Transporteur ColisPlus</p>

      {sent ? (
        <div className="text-sm space-y-1">
          <p>Code du colis : <b className="font-mono">{order.tracking_number}</b></p>
          {order.carrier_status && <p>Dernier statut : <b>{order.carrier_status}</b> <span className="text-ink/40">· {fmtDateTime(order.carrier_status_at)}</span></p>}
          {order.shipment_sent_at && <p className="text-xs text-ink/40">Envoyé le {fmtDateTime(order.shipment_sent_at)}</p>}
          <p className="text-xs text-ink/50">Les changements de statut arrivent automatiquement par webhook.</p>
        </div>
      ) : !ready ? (
        <p className="text-sm text-ink/60">
          {!cfg.api_key_set ? "La clé API n'est pas configurée sur le serveur." : "L'intégration est désactivée."}{' '}
          {isOwner && <Link href="/admin/livraison" className="text-forest underline">Configurer</Link>}
        </p>
      ) : canSend ? (
        <>
          <p className="text-sm text-ink/60">Crée le colis chez ColisPlus avec l'adresse et le montant à encaisser ({tnd(order.total)}).</p>
          <button className="btn-primary btn-sm" onClick={openModal}>Envoyer à ColisPlus</button>
        </>
      ) : (
        <p className="text-sm text-ink/50">Cette commande ne peut plus être envoyée (statut actuel : {order.status}).</p>
      )}

      {open && (
        <Modal title="Envoyer à ColisPlus" onClose={() => setOpen(false)}>
          <form onSubmit={send} className="space-y-4">
            {error && <Notice kind="error">{error}</Notice>}
            {locError && <Notice kind="error">{locError}</Notice>}
            <div className="bg-surface rounded p-3 text-sm">
              <p><b>{order.full_name}</b> · {order.phone}</p>
              <p className="text-ink/70">{order.ship_address}{order.ship_city ? `, ${order.ship_city}` : ''}</p>
              <p className="mt-1">À encaisser : <b>{tnd(order.total)}</b></p>
            </div>

            {!locs && !locError ? <p className="text-sm text-ink/50">Chargement des localités ColisPlus…</p> : locs && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Gouvernorat *</label>
                    <select className="field-input" required value={f.gouvernorat} onChange={(e) => setF({ ...f, gouvernorat: e.target.value, delegation: '', localite: '', code_postal: '' })}>
                      <option value="">Choisir…</option>
                      {locs.map((g) => <option key={g.gouvernorat}>{g.gouvernorat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Délégation *</label>
                    <select className="field-input" required value={f.delegation} disabled={!gov} onChange={(e) => setF({ ...f, delegation: e.target.value, localite: '', code_postal: '' })}>
                      <option value="">Choisir…</option>
                      {gov?.delegations.map((d) => <option key={d.delegation}>{d.delegation}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Localité (pour le code postal)</label>
                    <select className="field-input" value={f.localite} disabled={!del} onChange={(e) => {
                      const l = del?.localites.find((x) => x.localite === e.target.value);
                      setF({ ...f, localite: e.target.value, code_postal: l?.code_postal || f.code_postal });
                    }}>
                      <option value="">—</option>
                      {del?.localites.map((l) => <option key={l.localite + l.code_postal} value={l.localite}>{l.localite}{l.code_postal ? ` (${l.code_postal})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Code postal</label>
                    <input className="field-input" maxLength={10} value={f.code_postal} onChange={(e) => setF({ ...f, code_postal: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="field-label">Marchandise (vide = liste des articles)</label>
              <input className="field-input" maxLength={120} value={f.marchandise} onChange={(e) => setF({ ...f, marchandise: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Remarque pour le livreur</label>
              <input className="field-input" maxLength={250} value={f.remarque} onChange={(e) => setF({ ...f, remarque: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="field-label">Nombre de colis</label>
                <input className="field-input" type="number" min={1} max={50} value={f.nbr_colis} onChange={(e) => setF({ ...f, nbr_colis: e.target.value })} />
              </div>
              <div>
                <label className="field-label">Ouvrir le colis</label>
                <select className="field-input" value={f.ouvrir_colis} onChange={(e) => setF({ ...f, ouvrir_colis: e.target.value })}><option value="non">Non</option><option value="oui">Oui</option></select>
              </div>
              <div>
                <label className="field-label">Échange</label>
                <select className="field-input" value={f.is_exchange} onChange={(e) => setF({ ...f, is_exchange: e.target.value })}><option value="non">Non</option><option value="oui">Oui</option></select>
              </div>
            </div>
            {['en_attente', 'confirmee'].includes(order.status) && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mark_shipped} onChange={(e) => setF({ ...f, mark_shipped: e.target.checked })} /> Passer la commande en « Expédiée »</label>
            )}
            <div className="flex gap-3 pt-1">
              <button className="btn-primary" disabled={sending || !locs} type="submit">{sending ? 'Envoi…' : 'Créer le colis'}</button>
              <button className="btn-outline" type="button" onClick={() => setOpen(false)}>Annuler</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

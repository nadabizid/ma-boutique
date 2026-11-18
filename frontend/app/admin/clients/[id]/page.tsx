'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adm } from '@/lib/api';
import StatusBadge from '@/components/StatusBadge';
import { Notice } from '@/components/admin/ui';
import { usePublicSettings } from '@/lib/settings';
import { fmtDate, fmtDateTime, tnd, waLink, telLink } from '@/lib/format';

export default function AdminCustomerDetail({ params }: { params: { id: string } }) {
  const { store, governorates } = usePublicSettings();
  const [c, setC] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = () =>
    adm.get(`/api/customers/${params.id}`).then((d) => {
      setC(d);
      setForm({ full_name: d.full_name, email: d.email || '', address: d.address, city: d.city || '', notes: d.notes || '', is_blacklisted: d.is_blacklisted, blacklist_reason: d.blacklist_reason || '' });
    }).catch((e) => setError(e.message));

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params.id]);

  if (error) return <p className="text-clay">{error}</p>;
  if (!c) return <p className="text-ink/50">Chargement…</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await adm.put(`/api/customers/${c.id}`, form);
      setMsg({ kind: 'success', text: 'Fiche client enregistrée.' });
      await load();
    } catch (err: any) {
      setMsg({ kind: 'error', text: err.message });
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const first = c.full_name.split(' ')[0];
  const lostRate = c.orders_count ? Math.round((c.lost_count / c.orders_count) * 100) : 0;

  return (
    <div className="max-w-5xl">
      <Link href="/admin/clients" className="text-sm text-ink/50 hover:text-ink">← Clients</Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <h1 className="font-display text-2xl text-ink">
          {c.full_name} {c.is_blacklisted && <span className="ml-2 text-sm bg-red-100 text-red-800 px-2 py-1 rounded align-middle">⚠ signalé</span>}
        </h1>
        <div className="flex gap-2">
          <a href={telLink(c.phone)} className="btn-outline btn-sm">📞 Appeler</a>
          <a href={waLink(c.phone, `Bonjour ${first}, c'est ${store.name}. `)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">WhatsApp</a>
        </div>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { l: 'Commandes', v: c.orders_count },
          { l: 'Livrées', v: c.delivered_count },
          { l: 'Annulées / retournées', v: `${c.lost_count} (${lostRate} %)` },
          { l: 'Total dépensé', v: tnd(c.total_spent) },
        ].map((k) => (
          <div key={k.l} className="card"><p className="text-xs text-ink/50 mb-1">{k.l}</p><p className="font-display text-xl text-ink">{k.v}</p></div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <form onSubmit={save} className="lg:col-span-2 card space-y-4">
          <p className="font-medium text-ink">Coordonnées et notes</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className="field-label">Nom</label><input className="field-input" required value={form.full_name} onChange={set('full_name')} /></div>
            <div><label className="field-label">Téléphone (non modifiable)</label><input className="field-input bg-surface" value={c.phone} readOnly /></div>
            <div><label className="field-label">Email</label><input className="field-input" type="email" value={form.email} onChange={set('email')} /></div>
            <div>
              <label className="field-label">Gouvernorat</label>
              <select className="field-input" value={form.city} onChange={set('city')}>
                <option value="">—</option>
                {governorates.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div><label className="field-label">Adresse</label><input className="field-input" required value={form.address} onChange={set('address')} /></div>
          <div><label className="field-label">Notes internes</label><textarea className="field-input" rows={3} maxLength={2000} value={form.notes} onChange={set('notes')} placeholder="Ex : préfère être appelé le soir…" /></div>

          <div className="border border-line rounded p-4 bg-surface/50">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.is_blacklisted} onChange={(e) => setForm({ ...form, is_blacklisted: e.target.checked })} />
              Signaler ce client (refus de colis, faux numéro…)
            </label>
            <p className="text-xs text-ink/50 mt-1">Ses prochaines commandes affichent un avertissement dans l'admin. Elles ne sont pas bloquées.</p>
            {form.is_blacklisted && (
              <input className="field-input mt-3" placeholder="Motif (facultatif)" maxLength={300} value={form.blacklist_reason} onChange={set('blacklist_reason')} />
            )}
          </div>
          <button className="btn-primary" type="submit">Enregistrer</button>
        </form>

        <div className="space-y-6">
          <div className="card">
            <p className="font-medium text-ink mb-3">Adresses utilisées</p>
            {c.addresses.length === 0 ? <p className="text-sm text-ink/50">Aucune.</p> : (
              <ul className="space-y-3 text-sm">
                {c.addresses.map((a: any, i: number) => (
                  <li key={i}>{a.address}{a.city ? `, ${a.city}` : ''}<span className="block text-xs text-ink/40">{a.uses} commande(s) · dernière : {fmtDate(a.last_used)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-ink/40">Client depuis le {fmtDate(c.created_at)}</p>
        </div>
      </div>

      <div className="card mt-6">
        <p className="font-medium text-ink mb-3">Commandes</p>
        {c.orders.length === 0 ? <p className="text-sm text-ink/50">Aucune commande.</p> : (
          <table className="w-full text-sm">
            <tbody>
              {c.orders.map((o: any) => (
                <tr key={o.id} className="border-t border-line first:border-0">
                  <td className="py-2"><Link href={`/admin/commandes/${o.id}`} className="text-forest">#{o.id}</Link></td>
                  <td className="py-2">{tnd(o.total)}</td>
                  <td className="py-2"><StatusBadge status={o.status} /></td>
                  <td className="py-2 text-right text-ink/50">{fmtDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

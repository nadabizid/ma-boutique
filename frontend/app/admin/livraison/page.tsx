'use client';

import { useCallback, useEffect, useState } from 'react';
import { adm, API_URL } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import { Notice, Pagination, confirmAction } from '@/components/admin/ui';
import { fmtDateTime } from '@/lib/format';

const TARGETS = [
  { value: 'expediee', label: 'Expédiée' },
  { value: 'livree', label: 'Livrée' },
  { value: 'retournee', label: 'Retournée / refusée' },
  { value: '', label: 'Ne rien changer (juste enregistrer)' },
];

export default function DeliveryPage() {
  const { isOwner } = useAdmin();
  const [info, setInfo] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [statuses, setStatuses] = useState<any[] | null>(null);
  const [statusError, setStatusError] = useState('');
  const [events, setEvents] = useState<any>({ events: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [sim, setSim] = useState({ code: '', status: '' });
  const [simResult, setSimResult] = useState('');

  useEffect(() => {
    adm.get('/api/colisplus/config').then((d) => { setInfo(d); setCfg(d.config); }).catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, []);

  const loadEvents = useCallback(() => {
    adm.get(`/api/colisplus/events${adm.qs({ page })}`).then(setEvents).catch(() => {});
  }, [page]);
  useEffect(() => { if (isOwner) loadEvents(); }, [isOwner, loadEvents]);

  if (!isOwner) return <p className="text-clay">Cette page est réservée au propriétaire.</p>;
  if (!cfg || !info) return <p className="text-ink/50">{msg ? msg.text : 'Chargement…'}</p>;

  const webhookUrl = `${API_URL}${info.webhook_path}`;
  const setRule = (i: number, patch: any) => setCfg({ ...cfg, rules: cfg.rules.map((r: any, k: number) => (k === i ? { ...r, ...patch } : r)) });

  const save = async () => {
    setMsg(null);
    try {
      await adm.put('/api/colisplus/config', cfg);
      setMsg({ kind: 'success', text: 'Réglages enregistrés.' });
    } catch (e: any) {
      setMsg({ kind: 'error', text: e.message });
    }
  };

  const loadStatuses = async () => {
    setStatusError('');
    try { setStatuses(await adm.get('/api/colisplus/statuses')); } catch (e: any) { setStatusError(e.message); }
  };

  const simulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmAction('Ceci applique réellement le statut à la commande qui porte ce code. Continuer ?')) return;
    try {
      const r = await adm.post('/api/colisplus/simulate', sim);
      setSimResult(r.order_id ? `Commande #${r.order_id} : ${r.outcome}` : r.outcome);
      loadEvents();
    } catch (err: any) {
      setSimResult(err.message);
    }
  };

  const Check = ({ ok, label, help }: { ok: boolean; label: string; help: string }) => (
    <div className="flex items-start gap-3 text-sm">
      <span className={ok ? 'text-forest' : 'text-clay'}>{ok ? '✓' : '✗'}</span>
      <div><p className="text-ink">{label}</p>{!ok && <p className="text-xs text-ink/60">{help}</p>}</div>
    </div>
  );

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="font-display text-2xl text-ink">Livraison — ColisPlus</h1>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <div className="card space-y-4">
        <p className="font-medium text-ink">Connexion</p>
        <Check ok={info.api_key_set} label="Clé d'API (COLISPLUS_API_KEY)" help="Ajoutez-la dans backend/.env puis redémarrez le serveur. Ne la collez jamais dans un message ou dans le code." />
        <Check ok={info.webhook_secret_set} label="Secret du webhook (COLISPLUS_WEBHOOK_SECRET)" help="Sans ce secret, le serveur refuse toutes les notifications de ColisPlus. Choisissez une longue valeur aléatoire dans backend/.env." />
        <div>
          <p className="field-label">URL à renseigner chez ColisPlus (« URL de Réception »)</p>
          <div className="flex gap-2">
            <input className="field-input font-mono text-xs" readOnly value={webhookUrl} onFocus={(e) => e.target.select()} />
            <button className="btn-outline btn-sm" onClick={() => navigator.clipboard?.writeText(webhookUrl)}>Copier</button>
          </div>
          <p className="text-xs text-ink/50 mt-1">Dans « Token de Sécurité » : la même valeur que COLISPLUS_WEBHOOK_SECRET. Cette adresse doit être publique (HTTPS) : elle ne fonctionne pas en local sans tunnel.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Intégration active (bouton « Envoyer à ColisPlus » et traitement des notifications)</label>
        <div className="max-w-xs">
          <label className="field-label">« Ouvrir le colis » par défaut</label>
          <select className="field-input" value={cfg.ouvrir_colis} onChange={(e) => setCfg({ ...cfg, ouvrir_colis: e.target.value })}><option value="non">Non</option><option value="oui">Oui</option></select>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-ink">Règles : statut ColisPlus → statut de la commande</p>
          <button className="btn-outline btn-sm" onClick={loadStatuses}>Voir les statuts de ColisPlus</button>
        </div>
        <p className="text-xs text-ink/50">Quand le statut reçu <b>contient</b> le texte d'une règle (sans tenir compte des accents ni des majuscules), la commande change de statut. La première règle qui correspond s'applique. Une commande ne revient jamais en arrière et n'est jamais annulée automatiquement.</p>
        {statusError && <Notice kind="error">{statusError}</Notice>}
        {statuses && (
          <div className="bg-surface rounded p-3 max-h-60 overflow-y-auto text-sm">
            {statuses.map((s, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-line last:border-0">
                <div><b>{s.statut}</b><p className="text-xs text-ink/60">{s.signification}</p></div>
                <button className="text-forest text-xs whitespace-nowrap" onClick={() => setCfg({ ...cfg, rules: [{ contains: s.statut, status: '' }, ...cfg.rules] })}>+ règle</button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {cfg.rules.map((r: any, i: number) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-12 md:col-span-1 text-xs text-ink/40">si contient</span>
              <input className="field-input col-span-12 md:col-span-5 !py-1.5" value={r.contains} maxLength={80} onChange={(e) => setRule(i, { contains: e.target.value })} />
              <select className="field-input col-span-10 md:col-span-5 !py-1.5" value={r.status} onChange={(e) => setRule(i, { status: e.target.value })}>
                {TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button className="col-span-2 md:col-span-1 text-clay" onClick={() => setCfg({ ...cfg, rules: cfg.rules.filter((_: any, k: number) => k !== i) })} aria-label="Supprimer la règle">✕</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button className="btn-outline btn-sm" onClick={() => setCfg({ ...cfg, rules: [...cfg.rules, { contains: '', status: 'livree' }] })}>+ Ajouter une règle</button>
          <button className="text-sm text-ink/60 underline" onClick={() => confirmAction('Remplacer vos règles par celles proposées par défaut ?') && setCfg({ ...cfg, rules: info.default_rules })}>Règles par défaut</button>
        </div>
        <p className="text-xs text-ink/50">Les règles par défaut sont des suppositions : vérifiez-les avec la liste réelle des statuts ci-dessus.</p>
        <button className="btn-primary" onClick={save}>Enregistrer</button>
      </div>

      <form onSubmit={simulate} className="card space-y-3">
        <p className="font-medium text-ink">Tester une notification</p>
        <p className="text-xs text-ink/50">Simule la réception d'un statut pour un colis déjà envoyé (le statut est réellement appliqué à la commande).</p>
        <div className="grid md:grid-cols-3 gap-3">
          <input className="field-input" required placeholder="Code du colis" value={sim.code} onChange={(e) => setSim({ ...sim, code: e.target.value })} />
          <input className="field-input" required placeholder="Statut (ex : Livré)" value={sim.status} onChange={(e) => setSim({ ...sim, status: e.target.value })} />
          <button className="btn-outline" type="submit">Simuler</button>
        </div>
        {simResult && <p className="text-sm text-ink/70">{simResult}</p>}
      </form>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <p className="font-medium text-ink">Notifications reçues</p>
          <button className="btn-outline btn-sm" onClick={loadEvents}>Actualiser</button>
        </div>
        {events.events.length === 0 ? (
          <p className="text-sm text-ink/50">Aucune notification pour le moment. Elles apparaissent ici dès que ColisPlus change le statut d'un colis.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-admin">
              <thead className="bg-surface text-ink/60"><tr><th>Reçue</th><th>Colis</th><th>Statut</th><th>Résultat</th></tr></thead>
              <tbody>
                {events.events.map((e: any) => (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap text-ink/60">{fmtDateTime(e.received_at)}</td>
                    <td className="font-mono text-xs">{e.code || '—'}{e.order_id && <a href={`/admin/commandes/${e.order_id}`} className="block text-forest">Commande #{e.order_id}</a>}</td>
                    <td>{e.status || '—'}</td>
                    <td className="text-xs text-ink/60">
                      {e.outcome}
                      {e.payload && <details className="mt-1"><summary className="cursor-pointer text-forest">Données reçues</summary><pre className="whitespace-pre-wrap break-all text-[11px] bg-surface p-2 rounded mt-1">{JSON.stringify(e.payload, null, 2)}</pre></details>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={events.page} pages={events.pages} onChange={setPage} />
      </div>
    </div>
  );
}

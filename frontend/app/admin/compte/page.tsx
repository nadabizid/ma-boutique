'use client';

import { useState } from 'react';
import { adm } from '@/lib/api';
import { useAdmin } from '@/components/admin/AdminContext';
import { Notice } from '@/components/admin/ui';

export default function AccountPage() {
  const { admin, refresh } = useAdmin();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string | null } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [tfMsg, setTfMsg] = useState('');
  const [disable, setDisable] = useState({ password: '', code: '' });
  const [showDisable, setShowDisable] = useState(false);

  if (!admin) return null;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return setPwMsg({ ok: false, text: 'Les deux mots de passe ne correspondent pas.' });
    try {
      await adm.put('/api/auth/password', { current_password: pw.current, new_password: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ ok: true, text: 'Mot de passe modifié. Les autres appareils ont été déconnectés.' });
      await refresh();
    } catch (err: any) {
      setPwMsg({ ok: false, text: err.message });
    }
  };

  const startSetup = async () => {
    setTfMsg('');
    try {
      setSetup(await adm.post('/api/auth/2fa/setup'));
    } catch (err: any) {
      setTfMsg(err.message);
    }
  };

  const enable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await adm.post('/api/auth/2fa/enable', { code });
      setRecovery(r.recovery_codes);
      setSetup(null);
      setCode('');
      await refresh();
    } catch (err: any) {
      setTfMsg(err.message);
    }
  };

  const disable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adm.post('/api/auth/2fa/disable', disable);
      setShowDisable(false);
      setDisable({ password: '', code: '' });
      setTfMsg('');
      await refresh();
    } catch (err: any) {
      setTfMsg(err.message);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl text-ink mb-6">Mon compte</h1>
      <p className="text-sm text-ink/60 mb-8">{admin.name} · {admin.email} · {admin.role === 'owner' ? 'Propriétaire' : 'Gestionnaire de commandes'}</p>

      {admin.must_change_password && <Notice kind="info">Pour des raisons de sécurité, choisissez un nouveau mot de passe avant de continuer.</Notice>}

      <form onSubmit={changePassword} className="card mb-8 space-y-4">
        <h2 className="font-medium text-ink">Changer le mot de passe</h2>
        <div>
          <label className="field-label">Mot de passe actuel</label>
          <input className="field-input" type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Nouveau mot de passe</label>
            <input className="field-input" type="password" required minLength={10} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Confirmer</label>
            <input className="field-input" type="password" required minLength={10} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-ink/50">10 caractères minimum, avec des lettres et des chiffres.</p>
        {pwMsg && <p className={`text-sm ${pwMsg.ok ? 'text-forest' : 'text-clay'}`}>{pwMsg.text}</p>}
        <button className="btn-primary" type="submit">Enregistrer</button>
      </form>

      {!admin.must_change_password && (
        <div className="card space-y-4">
          <h2 className="font-medium text-ink">Double authentification</h2>

          {recovery && (
            <Notice kind="success">
              <p className="font-medium mb-2">Activée ! Conservez ces codes de secours en lieu sûr (chacun ne sert qu'une fois) :</p>
              <p className="font-mono text-sm grid grid-cols-2 gap-1">{recovery.map((c) => <span key={c}>{c}</span>)}</p>
            </Notice>
          )}

          {admin.totp_enabled ? (
            <>
              <p className="text-sm text-forest">✓ Activée : un code de votre application est demandé à chaque connexion.</p>
              {!showDisable ? (
                <button className="btn-danger" onClick={() => setShowDisable(true)}>Désactiver</button>
              ) : (
                <form onSubmit={disable2fa} className="space-y-3">
                  <input className="field-input" type="password" placeholder="Mot de passe" required value={disable.password} onChange={(e) => setDisable({ ...disable, password: e.target.value })} />
                  <input className="field-input" placeholder="Code de l'application ou code de secours" required value={disable.code} onChange={(e) => setDisable({ ...disable, code: e.target.value })} />
                  <button className="btn-danger" type="submit">Confirmer la désactivation</button>
                </form>
              )}
            </>
          ) : !setup ? (
            <>
              <p className="text-sm text-ink/60">Ajoutez une protection : en plus du mot de passe, un code à 6 chiffres généré par une application (Google Authenticator, Authy, 2FAS…).</p>
              <button className="btn-outline" onClick={startSetup}>Activer la double authentification</button>
            </>
          ) : (
            <form onSubmit={enable} className="space-y-4">
              <p className="text-sm text-ink/70">1. Scannez ce QR code avec votre application, ou saisissez la clé manuellement.</p>
              {setup.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={setup.qr} alt="QR code" width={180} height={180} />
              )}
              <p className="font-mono text-sm bg-surface p-2 break-all">{setup.secret}</p>
              <p className="text-sm text-ink/70">2. Saisissez le code à 6 chiffres affiché pour confirmer.</p>
              <input className="field-input max-w-[10rem] tracking-widest" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              <div className="flex gap-2">
                <button className="btn-primary" type="submit">Activer</button>
                <button className="btn-outline" type="button" onClick={() => setSetup(null)}>Annuler</button>
              </div>
            </form>
          )}
          {tfMsg && <p className="text-sm text-clay">{tfMsg}</p>}
        </div>
      )}
    </div>
  );
}

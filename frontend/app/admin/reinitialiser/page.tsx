'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setLoading(true);
    setError('');
    try {
      await api.reset(token, password);
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="font-display text-2xl text-ink mb-1">Nouveau mot de passe</h1>
        <p className="text-ink/50 text-sm mb-8">10 caractères minimum, avec des lettres et des chiffres.</p>
        {done ? (
          <>
            <p className="text-forest text-sm mb-6">Mot de passe modifié. Vous pouvez maintenant vous connecter.</p>
            <Link href="/admin/login" className="btn-primary w-full">Se connecter</Link>
          </>
        ) : !token ? (
          <p className="text-clay text-sm">Lien invalide. Refaites une demande de réinitialisation.</p>
        ) : (
          <>
            <div className="space-y-4 mb-6">
              <div>
                <label className="field-label" htmlFor="pw">Nouveau mot de passe</label>
                <input id="pw" className="field-input" type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="pw2">Confirmer</label>
                <input id="pw2" className="field-input" type="password" required minLength={10} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </div>
            {error && <p className="text-clay text-sm mb-4">{error}</p>}
            <button className="btn-primary w-full" disabled={loading} type="submit">{loading ? 'Enregistrement…' : 'Enregistrer'}</button>
          </>
        )}
      </form>
    </div>
  );
}

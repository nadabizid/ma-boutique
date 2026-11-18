'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.forgot(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm">
        <h1 className="font-display text-2xl text-ink mb-1">Mot de passe oublié</h1>
        <p className="text-ink/50 text-sm mb-8">Nous vous envoyons un lien pour en choisir un nouveau.</p>
        {sent ? (
          <>
            <p className="text-forest text-sm mb-6">
              Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé (valable 1 heure).
            </p>
            <Link href="/admin/login" className="btn-outline w-full">Retour à la connexion</Link>
          </>
        ) : (
          <>
            <div className="mb-6">
              <label className="field-label" htmlFor="email">Email du compte</label>
              <input id="email" className="field-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p className="text-clay text-sm mb-4">{error}</p>}
            <button className="btn-primary w-full" disabled={loading} type="submit">{loading ? 'Envoi…' : 'Envoyer le lien'}</button>
            <p className="text-center mt-5 text-sm">
              <Link href="/admin/login" className="text-ink/60 hover:text-ink underline">Retour</Link>
            </p>
          </>
        )}
      </form>
    </div>
  );
}

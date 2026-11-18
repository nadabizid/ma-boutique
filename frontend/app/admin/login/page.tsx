'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const done = (admin: any) => router.push(admin.must_change_password ? '/admin/compte' : '/admin');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (challenge) {
        const r = await api.login2fa(challenge, code);
        done(r.admin);
      } else {
        const r = await api.login(email, password);
        if (r.requires_2fa) setChallenge(r.challenge);
        else done(r.admin);
      }
    } catch (err: any) {
      setError(err.message || 'Connexion impossible');
      if (challenge && err.status === 401 && /expir/i.test(err.message)) setChallenge('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <h1 className="font-display text-2xl text-ink mb-1">Ma Boutique</h1>
        <p className="text-ink/50 text-sm mb-8">Espace administration</p>

        {!challenge ? (
          <div className="space-y-4 mb-6">
            <div>
              <label className="field-label" htmlFor="email">Email</label>
              <input id="email" className="field-input" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="password">Mot de passe</label>
              <input id="password" className="field-input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <label className="field-label" htmlFor="code">Code de vérification</label>
            <input id="code" className="field-input tracking-widest" required autoFocus autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" />
            <p className="text-xs text-ink/50 mt-2">Ouvrez votre application d'authentification, ou saisissez un code de secours.</p>
          </div>
        )}

        {error && <p className="text-clay text-sm mb-4">{error}</p>}

        <button className="btn-primary w-full" disabled={loading} type="submit">
          {loading ? 'Vérification…' : challenge ? 'Valider' : 'Se connecter'}
        </button>
        {!challenge && (
          <p className="text-center mt-5 text-sm">
            <Link href="/admin/mot-de-passe-oublie" className="text-ink/60 hover:text-ink underline">Mot de passe oublié ?</Link>
          </p>
        )}
      </form>
    </div>
  );
}

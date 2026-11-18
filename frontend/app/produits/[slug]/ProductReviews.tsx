'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { Review } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import Stars from '@/components/Stars';

export default function ProductReviews({ productId, reviews, average }: { productId: number; reviews: Review[]; average: number }) {
  const [rating, setRating] = useState(5);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await api.postReview({ product_id: productId, rating, author_name: name, comment, website });
      setStatus({ ok: true, msg: 'Merci ! Votre avis sera publié après validation.' });
      setName('');
      setComment('');
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="container-page py-12 border-t border-line" id="avis">
      <div className="flex items-center gap-3 mb-8">
        <h2 className="font-display text-2xl text-ink">Avis clients</h2>
        {reviews.length > 0 && (
          <span className="flex items-center gap-2 text-sm text-ink/60">
            <Stars value={average} /> {average.toFixed(1)} · {reviews.length} avis
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-12">
        <div className="space-y-6">
          {reviews.length === 0 && <p className="text-ink/50">Aucun avis pour le moment. Soyez le premier à donner le vôtre.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="border-b border-line pb-5">
              <div className="flex items-center gap-3 mb-1">
                <Stars value={r.rating} size={14} />
                <span className="text-sm text-ink">{r.author_name}</span>
                <span className="text-xs text-ink/40">{fmtDate(r.created_at)}</span>
              </div>
              {r.comment && <p className="text-ink/70 text-sm leading-relaxed whitespace-pre-line">{r.comment}</p>}
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4 relative">
          <p className="text-ink font-medium">Donner votre avis</p>
          <div>
            <p className="field-label">Votre note</p>
            <Stars value={rating} onChange={setRating} size={22} />
          </div>
          <div>
            <label className="field-label" htmlFor="rv-name">Votre prénom</label>
            <input id="rv-name" className="field-input" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="rv-comment">Votre commentaire (facultatif)</label>
            <textarea id="rv-comment" className="field-input" rows={4} maxLength={1500} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <div className="honeypot" aria-hidden="true">
            <label>Ne pas remplir<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>
          {status && <p className={`text-sm ${status.ok ? 'text-forest' : 'text-clay'}`}>{status.msg}</p>}
          <button className="btn-outline" disabled={loading} type="submit">{loading ? 'Envoi…' : "Publier l'avis"}</button>
        </form>
      </div>
    </section>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adm } from '@/lib/api';
import Stars from '@/components/Stars';
import { Pagination, Notice, confirmAction } from '@/components/admin/ui';
import { fmtDateTime } from '@/lib/format';

const TABS = [
  { key: 'pending', label: 'À valider' },
  { key: 'approved', label: 'Publiés' },
  { key: 'rejected', label: 'Refusés' },
];

export default function AdminReviewsPage() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>({ reviews: [], counts: {}, pages: 1, page: 1 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adm.get(`/api/reviews/admin${adm.qs({ status, page })}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [status, page]);
  useEffect(load, [load]);

  const act = async (id: number, s: string) => {
    try { await adm.put(`/api/reviews/${id}/status`, { status: s }); load(); } catch (e: any) { setError(e.message); }
  };
  const remove = async (id: number) => {
    if (!confirmAction('Supprimer cet avis définitivement ?')) return;
    try { await adm.del(`/api/reviews/${id}`); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl text-ink mb-6">Avis clients</h1>
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setStatus(t.key); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-full border ${status === t.key ? 'bg-ink text-ivory border-ink' : 'border-line text-ink/60 hover:border-ink'}`}>
            {t.label} <span className="opacity-60">{data.counts?.[t.key] || 0}</span>
          </button>
        ))}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && data.reviews.length === 0 ? <p className="text-ink/50">Chargement…</p> : data.reviews.length === 0 ? (
        <p className="text-ink/50">{status === 'pending' ? 'Aucun avis en attente de validation.' : 'Aucun avis.'}</p>
      ) : (
        <div className="space-y-4">
          {data.reviews.map((r: any) => (
            <div key={r.id} className="card">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <Stars value={r.rating} size={15} />
                <span className="text-sm font-medium text-ink">{r.author_name}</span>
                <span className="text-xs text-ink/40">{fmtDateTime(r.created_at)}</span>
                <Link href={`/admin/produits/${r.product_id}`} className="text-xs text-forest ml-auto">{r.product_name}</Link>
              </div>
              {r.comment ? <p className="text-sm text-ink/70 whitespace-pre-line mb-3">{r.comment}</p> : <p className="text-sm text-ink/40 italic mb-3">Note sans commentaire.</p>}
              <div className="flex gap-2">
                {r.status !== 'approved' && <button className="btn-primary btn-sm" onClick={() => act(r.id, 'approved')}>Publier</button>}
                {r.status !== 'rejected' && <button className="btn-outline btn-sm" onClick={() => act(r.id, 'rejected')}>Refuser</button>}
                <button className="btn-danger" onClick={() => remove(r.id)}>Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </div>
  );
}

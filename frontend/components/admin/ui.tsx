'use client';

import { useEffect } from 'react';

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-6 text-sm">
      <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Précédent</button>
      <span className="text-ink/60">Page {page} / {pages}</span>
      <button className="btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Suivant →</button>
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const cls = kind === 'error' ? 'bg-red-50 text-red-800 border-red-200' : kind === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-yellow-50 text-yellow-900 border-yellow-200';
  return <div className={`border rounded px-4 py-3 text-sm mb-4 ${cls}`}>{children}</div>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 no-print" onClick={onClose}>
      <div className="bg-white rounded max-w-lg w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink text-xl leading-none" aria-label="Fermer">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Boîte de confirmation simple (remplace window.confirm pour les actions sensibles)
export function confirmAction(message: string) {
  return typeof window !== 'undefined' && window.confirm(message);
}

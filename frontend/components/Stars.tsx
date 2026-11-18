'use client';

// Étoiles en lecture seule, ou sélectionnables si onChange est fourni
export default function Stars({ value, onChange, size = 16 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`Note : ${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const star = (
          <svg width={size} height={size} viewBox="0 0 20 20" className={filled ? 'text-brass' : 'text-line'} fill="currentColor" aria-hidden="true">
            <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7L10 1.5z" />
          </svg>
        );
        return onChange ? (
          <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5" aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

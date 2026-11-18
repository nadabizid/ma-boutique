'use client';

import { useRef, useState } from 'react';
import { imageUrl, uploadImage } from '@/lib/api';

type Props = {
  images: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  disabled?: boolean;
  maxSize?: number; // côté le plus long en pixels après réduction
  onFile?: (file: File) => void; // appelé avec le fichier choisi, avant l'envoi
  hint?: string;
  replace?: boolean; // un seul élément : le nouveau remplace l'ancien
};

// Galerie : envoi de plusieurs images, réordonnancement (la première est l'image principale), suppression
export default function ImageUploader({ images, onChange, max = 12, disabled, maxSize, onFile, hint, replace }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setError('');
    const next = replace ? [] : [...images];
    try {
      for (const f of Array.from(files)) {
        if (next.length >= max) { setError(`${max} images maximum.`); break; }
        if (onFile) onFile(f);
        next.push(await uploadImage(f, maxSize));
        onChange([...next]);
        if (replace) break;
      }
    } catch (e: any) {
      setError(e.message || "Échec de l'envoi");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= images.length) return;
    const a = [...images];
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((u, i) => (
          <div key={u} className="w-28">
            <div className="relative w-28 h-28 bg-surface border border-line overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(u)} alt="" className="w-full h-full object-cover" />
              {i === 0 && <span className="absolute top-1 left-1 bg-forest text-ivory text-[10px] px-1.5 py-0.5 rounded-sm">Principale</span>}
            </div>
            {!disabled && (
              <div className="flex justify-between mt-1 text-xs">
                <button type="button" className="px-1.5 py-0.5 border border-line rounded-sm disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Déplacer à gauche">←</button>
                <button type="button" className="px-1.5 py-0.5 text-clay hover:underline" onClick={() => onChange(images.filter((x) => x !== u))}>Retirer</button>
                <button type="button" className="px-1.5 py-0.5 border border-line rounded-sm disabled:opacity-30" disabled={i === images.length - 1} onClick={() => move(i, 1)} aria-label="Déplacer à droite">→</button>
              </div>
            )}
          </div>
        ))}
        {!disabled && (images.length < max || replace) && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="w-28 h-28 border-2 border-dashed border-line text-ink/50 hover:border-forest hover:text-forest text-sm flex flex-col items-center justify-center"
          >
            {busy ? 'Envoi…' : <><span className="text-2xl leading-none">+</span>{replace && images.length ? 'Remplacer' : 'Ajouter'}</>}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
      {error && <p className="text-clay text-sm mt-2">{error}</p>}
      <p className="text-xs text-ink/40 mt-2">{hint || 'JPG, PNG, WebP ou GIF. Les images sont réduites automatiquement (1600 px) pour garder le site rapide.'}</p>
    </div>
  );
}

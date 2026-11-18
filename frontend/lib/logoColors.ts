import { dominantColors } from './theme';

// Lit les couleurs dominantes d'un logo (fichier choisi ou URL déjà en ligne). Tout se passe dans le navigateur.
export async function analyzeLogo(src: File | string) {
  const isFile = typeof src !== 'string';
  const url = isFile ? URL.createObjectURL(src as File) : (src as string);
  try {
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const i = new Image();
      if (!isFile) i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Impossible de lire l'image du logo."));
      i.src = url;
    });
    const scale = Math.min(1, 96 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Analyse impossible sur ce navigateur.');
    ctx.drawImage(img, 0, 0, w, h);
    return dominantColors(ctx.getImageData(0, 0, w, h).data);
  } finally {
    if (isFile) URL.revokeObjectURL(url);
  }
}

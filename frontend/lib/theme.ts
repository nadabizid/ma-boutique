// Thèmes de couleurs du site : palettes prêtes à l'emploi, calcul d'une palette à partir
// d'une couleur, et analyse des couleurs d'un logo. Fonctions pures (aucune dépendance).

export const THEME_KEYS = ['ivory', 'surface', 'ink', 'forest', 'forestDark', 'brass', 'clay', 'line'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export type ThemeColors = Record<ThemeKey, string>;

export const THEME_LABELS: Record<ThemeKey, string> = {
  ivory: 'Fond du site',
  surface: 'Fond des cartes et sections',
  ink: 'Texte',
  forest: 'Couleur principale (boutons)',
  forestDark: 'Couleur principale au survol',
  brass: 'Accent doré (étoiles)',
  clay: 'Accent promo et alertes',
  line: 'Bordures',
};

export const DEFAULT_COLORS: ThemeColors = {
  ivory: '#F7F3EC',
  surface: '#EFE8DB',
  ink: '#26241F',
  forest: '#41523C',
  forestDark: '#2E3A2A',
  brass: '#A8824F',
  clay: '#B5714B',
  line: '#DCD3C2',
};

// ---------- Conversions de couleurs ----------
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
const hsl = (h: number, s: number, l: number) => rgbToHex(...hslToRgb(h, s, l));
const toHsl = (hex: string) => rgbToHsl(...hexToRgb(hex));

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// Rapport de contraste WCAG (4,5 minimum pour un texte lisible)
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Fonce la couleur jusqu'à obtenir le contraste voulu contre le fond
function ensureContrast(h: number, s: number, l: number, bg: string, min: number) {
  let c = hsl(h, s, l);
  while (contrast(c, bg) < min && l > 0.04) {
    l -= 0.01;
    c = hsl(h, s, l);
  }
  return c;
}

// Variables CSS lues par Tailwind : "247 243 236"
export function themeToCss(colors: ThemeColors) {
  return THEME_KEYS.map((k) => `--c-${k}:${hexToRgb(colors[k]).join(' ')};`).join('');
}
export function normalizeColors(c: any): ThemeColors | null {
  if (!c || typeof c !== 'object') return null;
  const out: any = {};
  for (const k of THEME_KEYS) {
    if (!isHex(c[k])) return null;
    out[k] = c[k].toUpperCase();
  }
  return out as ThemeColors;
}

// ---------- Construction d'une palette harmonieuse à partir d'une couleur ----------
export type Mood = 'balanced' | 'soft' | 'bold';

export function buildTheme(primary: string, accent?: string, mood: Mood = 'balanced'): ThemeColors {
  const [h, s0] = toHsl(primary);
  const neutral = s0 < 0.1; // logo noir / gris : on garde des fonds neutres
  const bgS = neutral ? 0.05 : mood === 'bold' ? 0.38 : 0.34;
  const ivoryL = mood === 'soft' ? 0.965 : mood === 'bold' ? 0.93 : 0.95;

  const ivory = hsl(h, bgS, ivoryL);
  const surface = hsl(h, bgS * 0.9, ivoryL - 0.05);
  const line = hsl(h, bgS * 0.65, ivoryL - 0.13);
  const ink = hsl(h, neutral ? 0.04 : 0.14, 0.13);

  const pS = neutral ? s0 : Math.min(Math.max(s0, 0.28), 0.62);
  const baseL = neutral ? 0.16 : mood === 'soft' ? 0.4 : mood === 'bold' ? 0.28 : 0.34;
  const forest = ensureContrast(h, pS, baseL, ivory, 5);
  const [, fs, fl] = toHsl(forest);
  const forestDark = hsl(h, fs, Math.max(fl - 0.07, 0.05));

  const [ah, as] = accent && isHex(accent) ? toHsl(accent) : [(h + 28) % 360, 0.5, 0.45];
  const aS = Math.min(Math.max(as, 0.4), 0.7);
  const clay = ensureContrast(ah, aS, 0.46, ivory, 4.5);
  const brass = ensureContrast((ah + 38) % 360, 0.42, 0.52, ivory, 3);

  return { ivory, surface, ink, forest, forestDark, brass, clay, line };
}

export type Preset = { key: string; name: string; colors: ThemeColors };

export const PRESETS: Preset[] = [
  { key: 'foret', name: 'Forêt (par défaut)', colors: DEFAULT_COLORS },
  { key: 'terracotta', name: 'Terracotta et moutarde', colors: buildTheme('#A8553A', '#C79A2B') },
  { key: 'rose', name: 'Rose poudré', colors: buildTheme('#A0536A', '#B87333', 'soft') },
  { key: 'ocean', name: 'Océan', colors: buildTheme('#25557F', '#2A9D8F') },
  { key: 'lavande', name: 'Lavande', colors: buildTheme('#6A5496', '#C06C84', 'soft') },
  { key: 'bordeaux', name: 'Bordeaux', colors: buildTheme('#7E2F3E', '#C08A3E') },
  { key: 'sauge', name: 'Sauge', colors: buildTheme('#5E7B66', '#B98B5E', 'soft') },
  { key: 'sable', name: 'Sable et brun', colors: buildTheme('#6E5238', '#B07D4B') },
  { key: 'noir-or', name: 'Noir et or', colors: buildTheme('#242424', '#B8893B', 'bold') },
];

// ---------- Couleurs dominantes d'une image (pixels RGBA) ----------
export function dominantColors(data: ArrayLike<number>, max = 3): { colors: string[]; neutral: boolean } {
  const bins = new Map<number, { w: number; r: number; g: number; b: number; h: number }>();
  let opaque = 0, saturated = 0, darkN = 0, dr = 0, dg = 0, db = 0;

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // pixel transparent
    const r = data[i], g = data[i + 1], b = data[i + 2];
    opaque++;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l > 0.94) continue; // fond blanc
    if (s < 0.18 || l < 0.1) {
      if (l < 0.4) { darkN++; dr += r; dg += g; db += b; }
      continue;
    }
    saturated++;
    const w = 1 + s * 2;
    const k = Math.floor(h / 12);
    const e = bins.get(k) || { w: 0, r: 0, g: 0, b: 0, h: 0 };
    e.w += w; e.r += r * w; e.g += g * w; e.b += b * w; e.h += h * w;
    bins.set(k, e);
  }

  if (opaque === 0) return { colors: [], neutral: true };
  if (saturated < opaque * 0.03) {
    return { colors: darkN ? [rgbToHex(dr / darkN, dg / darkN, db / darkN)] : [], neutral: true };
  }

  const picked: { hue: number; hex: string }[] = [];
  for (const e of Array.from(bins.values()).sort((a, b) => b.w - a.w)) {
    const hue = e.h / e.w;
    const hex = rgbToHex(e.r / e.w, e.g / e.w, e.b / e.w);
    // Une couleur est « distincte » si sa teinte ou son rendu diffère nettement des couleurs déjà retenues
    const far = picked.every((p) => {
      const gap = Math.min(Math.abs(p.hue - hue), 360 - Math.abs(p.hue - hue));
      const [r1, g1, b1] = hexToRgb(p.hex), [r2, g2, b2] = hexToRgb(hex);
      return gap > 16 || Math.hypot(r1 - r2, g1 - g2, b1 - b2) > 80;
    });
    if (far) picked.push({ hue, hex });
    if (picked.length >= max) break;
  }
  return { colors: picked.map((p) => p.hex), neutral: false };
}

// ---------- Suggestions de thèmes à partir des couleurs du logo ----------
export type Suggestion = { label: string; description: string; colors: ThemeColors; preset?: string };

const hueGap = (a: string, b: string) => {
  const d = Math.abs(toHsl(a)[0] - toHsl(b)[0]);
  return Math.min(d, 360 - d);
};

export function suggestThemes(logo: { colors: string[]; neutral: boolean }): Suggestion[] {
  const out: Suggestion[] = [];
  const [c1, c2] = logo.colors;
  if (!c1) {
    return PRESETS.filter((p) => ['noir-or', 'sable', 'sauge'].includes(p.key)).map((p) => ({
      label: p.name, description: 'Valeurs sûres pour un logo sobre.', colors: p.colors, preset: p.key,
    }));
  }
  if (logo.neutral) {
    out.push({ label: 'Sobre et élégant', description: 'Fonds neutres, accent doré : met le logo en valeur.', colors: buildTheme(c1, '#B8893B', 'bold') });
    out.push({ label: 'Clair et doux', description: 'Fonds très clairs avec le noir du logo en couleur principale.', colors: buildTheme(c1, '#9C6B4E', 'soft') });
    return out;
  }
  out.push({ label: 'Fidèle à votre logo', description: c2 ? 'Couleur principale du logo + sa deuxième couleur en accent.' : 'La couleur de votre logo en couleur principale.', colors: buildTheme(c1, c2) });
  if (c2) out.push({ label: 'Variante inversée', description: 'La deuxième couleur du logo devient la couleur principale.', colors: buildTheme(c2, c1, 'soft') });
  else out.push({ label: 'Doux et lumineux', description: 'Mêmes teintes, fonds plus clairs.', colors: buildTheme(c1, undefined, 'soft') });
  out.push({ label: 'Contrasté', description: 'Teinte du logo plus profonde avec un accent complémentaire.', colors: buildTheme(c1, hsl((toHsl(c1)[0] + 180) % 360, 0.5, 0.45), 'bold') });

  // Thèmes existants dont la couleur principale est la plus proche du logo
  const near = PRESETS.filter((p) => p.key !== 'foret' && p.key !== 'noir-or')
    .map((p) => ({ p, gap: hueGap(c1, p.colors.forest) }))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 2);
  near.forEach(({ p }) => out.push({ label: p.name, description: 'Thème existant proche de la couleur de votre logo.', colors: p.colors, preset: p.key }));
  return out;
}

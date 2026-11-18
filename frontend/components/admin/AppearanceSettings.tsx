'use client';

import { useState } from 'react';
import { imageUrl } from '@/lib/api';
import { analyzeLogo } from '@/lib/logoColors';
import {
  DEFAULT_COLORS, PRESETS, THEME_KEYS, THEME_LABELS, ThemeColors, ThemeKey, Suggestion,
  contrast, normalizeColors, suggestThemes,
} from '@/lib/theme';
import ImageUploader from './ImageUploader';

type Props = { s: any; setS: (v: any) => void };

function Swatches({ colors }: { colors: ThemeColors }) {
  return (
    <div className="flex h-8 rounded overflow-hidden border border-black/10">
      {(['ivory', 'surface', 'forest', 'clay', 'brass', 'ink'] as ThemeKey[]).map((k) => (
        <span key={k} className="flex-1" style={{ background: colors[k] }} />
      ))}
    </div>
  );
}

// Mini-maquette du site avec les couleurs choisies
function Preview({ colors, logo, name, showName }: { colors: ThemeColors; logo: string; name: string; showName: boolean }) {
  return (
    <div className="rounded border overflow-hidden text-sm" style={{ background: colors.ivory, borderColor: colors.line, color: colors.ink }}>
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: colors.line }}>
        <div className="flex items-center gap-2">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(logo)} alt="" className="h-8 w-auto max-w-[7rem] object-contain" />
          )}
          {(showName || !logo) && <span className="font-display text-lg">{name}</span>}
        </div>
        <span className="px-3 py-1 rounded-full border text-xs" style={{ borderColor: colors.ink + '55' }}>Panier</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-4 items-center">
        <div>
          <p className="text-xs mb-1" style={{ color: colors.clay }}>Bienvenue</p>
          <p className="font-display text-lg leading-tight mb-2">Un titre de page d'accueil</p>
          <span className="inline-block px-3 py-1.5 rounded-sm text-xs" style={{ background: colors.forest, color: colors.ivory }}>Voir le catalogue</span>
        </div>
        <div className="p-3 rounded" style={{ background: colors.surface }}>
          <div className="h-12 rounded mb-2 relative" style={{ background: colors.line }}>
            <span className="absolute top-1 left-1 text-[10px] px-1.5 rounded-sm text-white" style={{ background: colors.clay }}>Promo</span>
          </div>
          <p className="text-xs">Nom du produit</p>
          <p className="text-xs"><span style={{ color: colors.brass }}>★★★★★</span> 29,00 TND</p>
        </div>
      </div>
    </div>
  );
}

export default function AppearanceSettings({ s, setS }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [logoColors, setLogoColors] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [note, setNote] = useState('');

  const colors: ThemeColors = normalizeColors(s.theme?.colors) || DEFAULT_COLORS;
  const preset = s.theme?.preset || 'foret';

  const setTheme = (presetKey: string, c: ThemeColors | null) => setS({ ...s, theme: { preset: presetKey, colors: c } });
  const setStore = (patch: any) => setS({ ...s, store: { ...s.store, ...patch } });

  const analyze = async (src: File | string) => {
    setAnalyzing(true);
    setNote('');
    try {
      const result = await analyzeLogo(src);
      setLogoColors(result.colors);
      setSuggestions(suggestThemes(result));
      if (!result.colors.length) setNote('Logo très sobre : voici des thèmes qui fonctionnent bien avec des logos neutres.');
    } catch (e: any) {
      setNote(e.message || "Analyse impossible. Vous pouvez choisir un thème ci-dessous.");
    } finally {
      setAnalyzing(false);
    }
  };

  const editColor = (k: ThemeKey, v: string) => setTheme('custom', { ...colors, [k]: v.toUpperCase() });

  const warnings: string[] = [];
  if (contrast(colors.ink, colors.ivory) < 7) warnings.push('Le texte est peu lisible sur le fond du site.');
  if (contrast(colors.ivory, colors.forest) < 4.5) warnings.push('Le texte des boutons est peu lisible sur la couleur principale.');
  if (contrast(colors.clay, colors.ivory) < 3) warnings.push("L'accent promo / alertes est trop clair sur le fond.");

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <p className="font-medium text-ink">Logo</p>
        <ImageUploader
          images={s.store.logo_url ? [s.store.logo_url] : []}
          max={1}
          replace
          maxSize={800}
          hint="PNG ou WebP avec fond transparent recommandé. Affiché à gauche de l'en-tête et utilisé comme icône de l'onglet."
          onFile={(f) => analyze(f)}
          onChange={(urls) => {
            setStore({ logo_url: urls[0] || '' });
            if (!urls[0]) { setSuggestions(null); setLogoColors([]); }
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.store.show_name !== false} onChange={(e) => setStore({ show_name: e.target.checked })} />
          Afficher aussi le nom de la boutique à côté du logo
        </label>
        {s.store.logo_url && !suggestions && (
          <button type="button" className="btn-outline btn-sm" disabled={analyzing} onClick={() => analyze(imageUrl(s.store.logo_url))}>
            {analyzing ? 'Analyse…' : '✨ Proposer un thème adapté à ce logo'}
          </button>
        )}
      </div>

      {(suggestions || analyzing || note) && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-ink">✨ Thèmes suggérés pour votre logo</p>
            {logoColors.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-ink/60">
                Couleurs détectées :
                {logoColors.map((c) => <span key={c} className="w-5 h-5 rounded-full border border-black/10" style={{ background: c }} title={c} />)}
              </div>
            )}
          </div>
          {analyzing && <p className="text-sm text-ink/50">Analyse du logo en cours…</p>}
          {note && <p className="text-sm text-ink/60">{note}</p>}
          {suggestions && (
            <div className="grid md:grid-cols-2 gap-4">
              {suggestions.map((sg, i) => (
                <div key={i} className="border border-line rounded p-3 space-y-2">
                  <Swatches colors={sg.colors} />
                  <p className="text-sm font-medium text-ink">{sg.label}</p>
                  <p className="text-xs text-ink/60">{sg.description}</p>
                  <button type="button" className="btn-outline btn-sm" onClick={() => setTheme(sg.preset || 'custom', sg.colors)}>Utiliser ce thème</button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-ink/40">Calculé directement dans votre navigateur à partir des couleurs du logo, avec des contrastes vérifiés pour que tout reste lisible. Rien n'est enregistré tant que vous ne cliquez pas sur « Enregistrer les paramètres ».</p>
        </div>
      )}

      <div className="card space-y-4">
        <p className="font-medium text-ink">Thèmes prêts à l'emploi</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setTheme(p.key, p.key === 'foret' ? null : p.colors)}
              className={`text-left border rounded p-3 space-y-2 ${preset === p.key ? 'border-forest ring-2 ring-forest' : 'border-line hover:border-ink'}`}
            >
              <Swatches colors={p.colors} />
              <p className="text-sm text-ink">{p.name} {preset === p.key && <span className="text-forest">✓</span>}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-medium text-ink">Personnaliser les couleurs {preset === 'custom' && <span className="text-xs text-forest">(thème personnalisé)</span>}</p>
          <button type="button" className="text-sm text-ink/60 underline" onClick={() => setTheme('foret', null)}>Rétablir le thème par défaut</button>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {THEME_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <input type="color" value={colors[k].toLowerCase()} onChange={(e) => editColor(k, e.target.value)} className="w-10 h-10 p-0 border border-line rounded cursor-pointer bg-white" aria-label={THEME_LABELS[k]} />
              <div>
                <p className="text-sm text-ink">{THEME_LABELS[k]}</p>
                <p className="text-xs text-ink/40 font-mono">{colors[k]}</p>
              </div>
            </div>
          ))}
        </div>
        {warnings.map((w) => <p key={w} className="text-sm text-clay">⚠ {w}</p>)}
        <p className="text-xs text-ink/40">L'espace administration garde toujours ses couleurs d'origine, pour rester lisible quel que soit le thème choisi pour le site.</p>
      </div>

      <div className="card space-y-3">
        <p className="font-medium text-ink">Aperçu</p>
        <Preview colors={colors} logo={s.store.logo_url} name={s.store.name} showName={s.store.show_name !== false} />
      </div>
    </div>
  );
}

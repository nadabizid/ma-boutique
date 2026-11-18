'use client';

// Graphiques légers en SVG / CSS (aucune dépendance)

function niceCeil(max: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / exp;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
}

export function BarChart({ data, height = 190, unit = 'TND' }: { data: { label: string; value: number; sub?: string }[]; height?: number; unit?: string }) {
  const W = 700;
  const padL = 44;
  const padB = 22;
  const max = Math.max(...data.map((d) => d.value), 1);
  const niceMax = niceCeil(max);
  const innerW = W - padL;
  const innerH = height - padB - 8;
  const bw = innerW / Math.max(data.length, 1);
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" role="img" aria-label="Chiffre d'affaires par jour">
      {ticks.map((t) => {
        const y = 8 + innerH - (t / niceMax) * innerH;
        return (
          <g key={t}>
            <line x1={padL} x2={W} y1={y} y2={y} stroke="#DCD3C2" strokeDasharray={t === 0 ? '' : '3 3'} />
            <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#6b6656">{Math.round(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = (d.value / niceMax) * innerH;
        const x = padL + i * bw + bw * 0.15;
        return (
          <g key={d.label + i}>
            <rect x={x} y={8 + innerH - h} width={Math.max(bw * 0.7, 1)} height={Math.max(h, d.value > 0 ? 1 : 0)} fill="#41523C" rx="1">
              <title>{`${d.label} : ${d.value.toFixed(2)} ${unit}${d.sub ? ' · ' + d.sub : ''}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + (bw * 0.7) / 2} y={height - 6} textAnchor="middle" fontSize="10" fill="#6b6656">{d.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Barres horizontales : classement (villes, produits…)
export function HBars({ rows, format }: { rows: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between text-sm mb-1 gap-3">
            <span className="text-ink truncate">{r.label}</span>
            <span className="text-ink/60 whitespace-nowrap">{format ? format(r.value) : r.value}{r.sub ? ` · ${r.sub}` : ''}</span>
          </div>
          <div className="h-1.5 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-forest rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Variation par rapport à la période précédente
export function Delta({ current, previous }: { current: number; previous: number }) {
  if (!previous && !current) return null;
  if (!previous) return <span className="text-xs text-ink/40">nouveau</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`text-xs ${up ? 'text-forest' : 'text-clay'}`} title="Par rapport à la période précédente">
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)} %
    </span>
  );
}

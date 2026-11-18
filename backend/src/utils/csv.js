// Export : séparateur ";" + BOM pour une ouverture directe dans Excel (version française)
function neutralize(s) {
  // Protège contre l'injection de formules (=, +, -, @) dans Excel
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cell(v, sep) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : neutralize(String(v));
  if (s.includes('"') || s.includes(sep) || /[\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// columns : [{ key, label }]
function toCsv(rows, columns, sep = ';') {
  const head = columns.map((c) => cell(c.label, sep)).join(sep);
  const lines = rows.map((r) => columns.map((c) => cell(r[c.key], sep)).join(sep));
  return '\uFEFF' + [head, ...lines].join('\r\n') + '\r\n';
}

// Lecture d'un CSV (séparateur détecté : ; , ou tabulation). Retourne un tableau d'objets.
function parseCsv(text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && counts[ch] !== undefined) counts[ch]++;
  }
  const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];

  const rows = [];
  let row = [];
  let field = '';
  inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r, idx) => {
    const o = { _line: idx + 2 };
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    return o;
  });
}

module.exports = { toCsv, parseCsv };

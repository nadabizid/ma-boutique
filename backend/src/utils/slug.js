const crypto = require('crypto');

function slugify(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// table : valeur fixe du code (jamais une entrée utilisateur)
async function uniqueSlug(client, table, base, excludeId = null) {
  const root = slugify(base) || 'produit';
  for (let i = 1; i <= 200; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const params = excludeId ? [candidate, excludeId] : [candidate];
    const r = await client.query(
      `SELECT 1 FROM ${table} WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''} LIMIT 1`,
      params
    );
    if (!r.rows.length) return candidate;
  }
  return `${root}-${crypto.randomBytes(3).toString('hex')}`;
}

module.exports = { slugify, uniqueSlug };

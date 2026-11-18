const express = require('express');
const db = require('../db');
const { requireAdmin, requireOwner } = require('../middleware/auth');
const { wrap, bad, notFound, round2, toInt, cleanStr, cleanNum, safeUrl, likeTerm } = require('../utils/http');
const { uniqueSlug } = require('../utils/slug');
const { toCsv, parseCsv } = require('../utils/csv');
const { logActivity } = require('../utils/activity');
const { removeIfUnreferenced } = require('../utils/storage');
const { STOCK_EXPR, SELECT_COLS, FROM, listProducts, loadChildren } = require('../utils/productSql');
const { syncProductStock } = require('../services/stock');

const router = express.Router();

// ---------- Lecture et validation du formulaire produit ----------
function readPayload(b) {
  const name = cleanStr(b.name, { max: 200, required: true, field: 'Nom' });
  const price = cleanNum(b.price, { min: 0, max: 1e7, required: true, field: 'Prix' });
  let compare = cleanNum(b.compare_at_price, { min: 0, max: 1e7, field: 'Prix barré' });
  if (!compare) compare = null;
  const isBundle = !!b.is_bundle;

  const images = [];
  for (const u of Array.isArray(b.images) ? b.images : []) {
    const url = safeUrl(u);
    if (url && !images.includes(url)) images.push(url);
  }
  if (images.length > 12) throw bad('12 images maximum par produit.');
  if (!Array.isArray(b.images)) {
    const legacy = safeUrl(b.image_url);
    if (legacy) images.push(legacy);
  }

  const variants = [];
  for (const v of Array.isArray(b.variants) ? b.variants : []) {
    variants.push({
      id: toInt(v.id),
      name: cleanStr(v.name, { max: 120, required: true, field: "Nom de l'option" }),
      sku: cleanStr(v.sku, { max: 80 }),
      price_override: cleanNum(v.price_override, { min: 0, max: 1e7, field: "Prix de l'option" }),
      stock: cleanNum(v.stock ?? 0, { min: 0, max: 1e6, int: true, field: 'Stock' }) ?? 0,
      is_active: v.is_active === undefined ? true : !!v.is_active,
    });
  }
  if (variants.length > 60) throw bad('60 options maximum par produit.');

  const bundleItems = [];
  const seen = new Set();
  for (const bi of Array.isArray(b.bundle_items) ? b.bundle_items : []) {
    const pid = toInt(bi.product_id);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    bundleItems.push({ product_id: pid, quantity: cleanNum(bi.quantity ?? 1, { min: 1, max: 99, int: true, field: 'Quantité' }) || 1 });
  }
  if (isBundle && !bundleItems.length) throw bad('Un pack doit contenir au moins un produit.');
  if (isBundle && variants.length) throw bad("Un pack ne peut pas avoir d'options.");

  return {
    name, price, compare,
    description: cleanStr(b.description, { max: 8000 }),
    stock: cleanNum(b.stock ?? 0, { min: 0, max: 1e6, int: true, field: 'Stock' }) ?? 0,
    low_stock_threshold: cleanNum(b.low_stock_threshold ?? 5, { min: 0, max: 1e5, int: true, field: 'Seuil de stock faible' }) ?? 5,
    sku: cleanStr(b.sku, { max: 80 }),
    meta_title: cleanStr(b.meta_title, { max: 160 }),
    meta_description: cleanStr(b.meta_description, { max: 320 }),
    category_id: toInt(b.category_id),
    is_active: b.is_active === undefined ? true : !!b.is_active,
    is_bundle: isBundle, images, variants, bundleItems,
  };
}

async function checkBundleRules(client, productId, p) {
  if (p.is_bundle) {
    const ids = p.bundleItems.map((x) => x.product_id);
    if (productId && ids.includes(productId)) throw bad('Un pack ne peut pas se contenir lui-même.');
    const found = (await client.query('SELECT id, is_bundle FROM products WHERE id = ANY($1::int[])', [ids])).rows;
    if (found.length !== ids.length) throw bad('Un produit du pack est introuvable.');
    if (found.some((f) => f.is_bundle)) throw bad("Un pack ne peut pas contenir d'autres packs.");
    const withVariants = (await client.query('SELECT 1 FROM product_variants WHERE product_id = ANY($1::int[]) LIMIT 1', [ids])).rows;
    if (withVariants.length) throw bad("Un produit avec options ne peut pas être inclus dans un pack.");
    if (productId) {
      const asComponent = (await client.query('SELECT 1 FROM bundle_items WHERE item_product_id = $1 LIMIT 1', [productId])).rows;
      if (asComponent.length) throw bad('Ce produit fait déjà partie d\'un pack : il ne peut pas devenir un pack.');
    }
  } else if (productId && p.variants.length) {
    const asComponent = (await client.query('SELECT 1 FROM bundle_items WHERE item_product_id = $1 LIMIT 1', [productId])).rows;
    if (asComponent.length) throw bad("Ce produit fait partie d'un pack : il ne peut pas avoir d'options.");
  }
}

// Remplace images, options et contenu du pack ; retourne les URL d'images retirées
async function saveChildren(client, productId, p) {
  const oldImgs = (await client.query('SELECT url FROM product_images WHERE product_id = $1', [productId])).rows.map((r) => r.url);
  await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
  for (let i = 0; i < p.images.length; i++) {
    await client.query('INSERT INTO product_images (product_id, url, position) VALUES ($1,$2,$3)', [productId, p.images[i], i]);
  }
  await client.query('UPDATE products SET image_url = $1 WHERE id = $2', [p.images[0] || '', productId]);

  const existing = new Set((await client.query('SELECT id FROM product_variants WHERE product_id = $1', [productId])).rows.map((r) => r.id));
  const keep = [];
  for (let i = 0; i < p.variants.length; i++) {
    const v = p.variants[i];
    if (v.id && existing.has(v.id)) {
      await client.query(
        'UPDATE product_variants SET name=$1, sku=$2, price_override=$3, stock=$4, is_active=$5, position=$6 WHERE id=$7',
        [v.name, v.sku || null, v.price_override, v.stock, v.is_active, i, v.id]
      );
      keep.push(v.id);
    } else {
      const r = await client.query(
        'INSERT INTO product_variants (product_id, name, sku, price_override, stock, is_active, position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [productId, v.name, v.sku || null, v.price_override, v.stock, v.is_active, i]
      );
      keep.push(r.rows[0].id);
    }
  }
  await client.query('DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::int[]))', [productId, keep]);
  await syncProductStock(client, productId);

  // Anciens modèles de couverture (personnalisation retirée) : supprimés avec leurs images
  const removedTplUrls = (await client.query('DELETE FROM product_templates WHERE product_id = $1 RETURNING image_url', [productId])).rows.map((r) => r.image_url);

  await client.query('DELETE FROM bundle_items WHERE bundle_id = $1', [productId]);
  if (p.is_bundle) {
    for (const bi of p.bundleItems) {
      await client.query('INSERT INTO bundle_items (bundle_id, item_product_id, quantity) VALUES ($1,$2,$3)', [productId, bi.product_id, bi.quantity]);
    }
  }
  return [...oldImgs.filter((u) => !p.images.includes(u)), ...removedTplUrls];
}

async function withTx(fn) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---------- Catalogue public ----------
const SORTS = {
  newest: 'p.created_at DESC',
  price_asc: 'p.price ASC, p.id',
  price_desc: 'p.price DESC, p.id',
  name: 'p.name ASC',
  popular: `(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE oi.product_id = p.id AND o.status NOT IN ('annulee','retournee')) DESC, p.created_at DESC`,
};

router.get('/', wrap(async (req, res) => {
  const where = ['p.is_active = TRUE'];
  const params = [];
  if (req.query.category) { params.push(String(req.query.category)); where.push(`c.slug = $${params.length}`); }
  if (req.query.search) {
    params.push(likeTerm(String(req.query.search).slice(0, 100)));
    where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
  }
  if (req.query.promo === '1') where.push('p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price');
  if (req.query.in_stock === '1') where.push(`${STOCK_EXPR} > 0`);
  const rows = await listProducts(db, { where, params, orderBy: SORTS[req.query.sort] || SORTS.newest, limit: Math.min(toInt(req.query.limit, 200), 200) });
  res.json(rows);
}));

// ---------- Administration (avant la route /:slug) ----------
router.get('/admin/list', requireAdmin, wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    params.push(likeTerm(String(req.query.q).slice(0, 100)));
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }
  if (req.query.category) { params.push(toInt(req.query.category, 0)); where.push(`p.category_id = $${params.length}`); }
  const s = req.query.status;
  if (s === 'active') where.push('p.is_active');
  else if (s === 'inactive') where.push('NOT p.is_active');
  else if (s === 'out') where.push(`${STOCK_EXPR} = 0`);
  else if (s === 'low') where.push(`${STOCK_EXPR} > 0 AND ${STOCK_EXPR} <= p.low_stock_threshold`);
  res.json(await listProducts(db, { where, params, orderBy: 'p.created_at DESC, p.id DESC' }));
}));

router.get('/admin/:id', requireAdmin, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const rows = await listProducts(db, { where: ['p.id = $1'], params: [id] });
  if (!rows[0]) throw notFound('Produit introuvable.');
  res.json({ ...rows[0], ...(await loadChildren(db, id)) });
}));

const EXPORT_COLS = [
  { key: 'sku', label: 'sku' }, { key: 'name', label: 'nom' }, { key: 'description', label: 'description' },
  { key: 'price', label: 'prix' }, { key: 'compare_at_price', label: 'prix_barre' }, { key: 'stock', label: 'stock' },
  { key: 'category_name', label: 'categorie' }, { key: 'image_url', label: 'image_url' }, { key: 'active', label: 'actif' },
  { key: 'low_stock_threshold', label: 'seuil_stock' }, { key: 'meta_title', label: 'meta_titre' },
  { key: 'meta_description', label: 'meta_description' }, { key: 'type', label: 'type' },
];

router.get('/export.csv', requireAdmin, wrap(async (req, res) => {
  const rows = (await listProducts(db, { orderBy: 'p.id' })).map((p) => ({
    ...p, active: p.is_active ? 'oui' : 'non',
    type: p.is_bundle ? 'pack' : p.variants_count > 0 ? 'options' : 'simple',
  }));
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="produits.csv"');
  res.send(toCsv(rows, EXPORT_COLS));
}));

// Import : CSV (colonnes de l'export). Mise à jour par SKU (ou par nom), création sinon.
router.post('/import', requireOwner, express.text({ type: ['text/csv', 'text/plain'], limit: '3mb' }), wrap(async (req, res) => {
  if (typeof req.body !== 'string' || !req.body.trim()) throw bad('Fichier CSV vide.');
  const rows = parseCsv(req.body);
  if (!rows.length) throw bad('Aucune ligne à importer.');
  if (rows.length > 2000) throw bad('2000 lignes maximum par import.');

  const pick = (r, ...keys) => { for (const k of keys) if (r[k] !== undefined && r[k] !== '') return r[k]; return ''; };
  const report = { created: 0, updated: 0, errors: [] };
  const catCache = new Map();

  async function categoryId(name) {
    const key = name.toLowerCase();
    if (catCache.has(key)) return catCache.get(key);
    let r = (await db.query('SELECT id FROM categories WHERE LOWER(name) = $1', [key])).rows[0];
    if (!r) r = (await db.query('INSERT INTO categories (name, slug) VALUES ($1,$2) RETURNING id', [name, await uniqueSlug(db, 'categories', name)])).rows[0];
    catCache.set(key, r.id);
    return r.id;
  }

  for (const r of rows) {
    try {
      const name = cleanStr(pick(r, 'nom', 'name'), { max: 200, required: true, field: 'Nom' });
      const sku = cleanStr(pick(r, 'sku'), { max: 80 });
      const price = cleanNum(pick(r, 'prix', 'price'), { min: 0, max: 1e7, required: true, field: 'Prix' });
      const compare = cleanNum(pick(r, 'prix_barre', 'compare_at_price'), { min: 0, max: 1e7, field: 'Prix barré' }) || null;
      const stock = cleanNum(pick(r, 'stock') || 0, { min: 0, max: 1e6, int: true, field: 'Stock' }) ?? 0;
      const low = cleanNum(pick(r, 'seuil_stock', 'low_stock_threshold') || 5, { min: 0, max: 1e5, int: true, field: 'Seuil' }) ?? 5;
      const activeRaw = pick(r, 'actif', 'active', 'is_active').toLowerCase();
      const active = activeRaw === '' ? true : ['oui', 'yes', 'true', '1', 'actif'].includes(activeRaw);
      const catName = pick(r, 'categorie', 'category');
      const catId = catName ? await categoryId(catName.slice(0, 120)) : null;
      const image = safeUrl(pick(r, 'image_url', 'image'));
      const description = pick(r, 'description').slice(0, 8000);
      const metaT = pick(r, 'meta_titre', 'meta_title').slice(0, 160);
      const metaD = pick(r, 'meta_description').slice(0, 320);

      let existing = sku ? (await db.query('SELECT id, is_bundle FROM products WHERE LOWER(sku) = $1', [sku.toLowerCase()])).rows[0] : null;
      if (!existing) existing = (await db.query('SELECT id, is_bundle FROM products WHERE LOWER(name) = $1 ORDER BY id LIMIT 1', [name.toLowerCase()])).rows[0];

      if (existing) {
        const hasVariants = (await db.query('SELECT 1 FROM product_variants WHERE product_id = $1 LIMIT 1', [existing.id])).rows.length > 0;
        await db.query(
          `UPDATE products SET name=$1, description=$2, price=$3, compare_at_price=$4, category_id=$5, is_active=$6,
             low_stock_threshold=$7, meta_title=$8, meta_description=$9, sku=COALESCE(NULLIF($10,''), sku),
             stock = CASE WHEN $11 THEN stock ELSE $12 END, updated_at=NOW() WHERE id=$13`,
          [name, description, price, compare, catId, active, low, metaT, metaD, sku, hasVariants || existing.is_bundle, stock, existing.id]
        );
        if (image) {
          await db.query('UPDATE products SET image_url = $1 WHERE id = $2', [image, existing.id]);
          const has = (await db.query('SELECT 1 FROM product_images WHERE product_id = $1 AND url = $2', [existing.id, image])).rows.length;
          if (!has) {
            await db.query('UPDATE product_images SET position = position + 1 WHERE product_id = $1', [existing.id]);
            await db.query('INSERT INTO product_images (product_id, url, position) VALUES ($1,$2,0)', [existing.id, image]);
          }
        }
        report.updated++;
      } else {
        const slug = await uniqueSlug(db, 'products', name);
        const ins = await db.query(
          `INSERT INTO products (name, slug, description, price, compare_at_price, stock, image_url, category_id, is_active, sku, low_stock_threshold, meta_title, meta_description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [name, slug, description, price, compare, stock, image, catId, active, sku || null, low, metaT, metaD]
        );
        if (image) await db.query('INSERT INTO product_images (product_id, url, position) VALUES ($1,$2,0)', [ins.rows[0].id, image]);
        report.created++;
      }
    } catch (e) {
      const msg = e.code === '23505' ? 'SKU déjà utilisé par un autre produit' : e.message;
      report.errors.push({ line: r._line, error: msg });
    }
  }
  logActivity(req, 'products_imported', 'product', null, { created: report.created, updated: report.updated, errors: report.errors.length });
  res.json(report);
}));

// Actions groupées
router.post('/bulk', requireOwner, wrap(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map((x) => toInt(x)).filter(Boolean))];
  if (!ids.length) throw bad('Sélectionnez au moins un produit.');
  if (ids.length > 500) throw bad('500 produits maximum à la fois.');
  const action = req.body.action;
  const value = req.body.value;
  let affected = 0;
  let failed = [];

  if (action === 'activate' || action === 'deactivate') {
    affected = (await db.query('UPDATE products SET is_active = $1, updated_at = NOW() WHERE id = ANY($2::int[])', [action === 'activate', ids])).rowCount;
  } else if (action === 'set_category') {
    const cat = toInt(value);
    affected = (await db.query('UPDATE products SET category_id = $1, updated_at = NOW() WHERE id = ANY($2::int[])', [cat, ids])).rowCount;
  } else if (action === 'price_percent') {
    const pct = cleanNum(value, { min: -90, max: 500, required: true, field: 'Pourcentage' });
    affected = (await db.query('UPDATE products SET price = ROUND(price * (1 + $1::numeric / 100), 2), updated_at = NOW() WHERE id = ANY($2::int[])', [pct, ids])).rowCount;
    await db.query('UPDATE product_variants SET price_override = ROUND(price_override * (1 + $1::numeric / 100), 2) WHERE product_id = ANY($2::int[]) AND price_override IS NOT NULL', [pct, ids]);
  } else if (action === 'price_set') {
    const price = cleanNum(value, { min: 0, max: 1e7, required: true, field: 'Prix' });
    affected = (await db.query('UPDATE products SET price = $1, updated_at = NOW() WHERE id = ANY($2::int[])', [price, ids])).rowCount;
  } else if (action === 'stock_set' || action === 'stock_add') {
    const n = cleanNum(value, { min: action === 'stock_set' ? 0 : -1e6, max: 1e6, int: true, required: true, field: 'Quantité' });
    // Les produits avec options et les packs sont exclus : leur stock se gère option par option / via leurs composants
    const sql = action === 'stock_set' ? 'stock = $1' : 'stock = GREATEST(stock + $1, 0)';
    affected = (await db.query(
      `UPDATE products SET ${sql}, updated_at = NOW() WHERE id = ANY($2::int[]) AND NOT is_bundle
         AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = products.id)`, [n, ids])).rowCount;
  } else if (action === 'delete') {
    for (const id of ids) {
      try {
        const old = (await db.query('SELECT image_url FROM products WHERE id = $1', [id])).rows[0];
        const imgs = (await db.query(
          `SELECT url FROM product_images WHERE product_id = $1 UNION SELECT image_url FROM product_templates WHERE product_id = $1`, [id])).rows.map((r) => r.url);
        const del = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        if (del.rows[0]) affected++;
        for (const u of new Set([...(old && old.image_url ? [old.image_url] : []), ...imgs])) removeIfUnreferenced(db, u).catch(() => {});
      } catch (e) {
        if (e.code === '23503') failed.push({ id, error: 'Fait partie d\'un pack' });
        else throw e;
      }
    }
  } else {
    throw bad('Action inconnue.');
  }
  logActivity(req, 'products_bulk', 'product', null, { action, value, count: ids.length, affected });
  res.json({ affected, failed });
}));

router.post('/', requireOwner, wrap(async (req, res) => {
  const p = readPayload(req.body || {});
  const id = await withTx(async (client) => {
    await checkBundleRules(client, null, p);
    const slug = await uniqueSlug(client, 'products', p.name);
    const r = await client.query(
      `INSERT INTO products (name, slug, description, price, compare_at_price, stock, image_url, category_id, is_active,
                             sku, low_stock_threshold, meta_title, meta_description, is_bundle)
       VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [p.name, slug, p.description, p.price, p.compare, p.is_bundle ? 0 : p.stock, p.category_id, p.is_active,
       p.sku || null, p.low_stock_threshold, p.meta_title || null, p.meta_description || null, p.is_bundle]
    );
    await saveChildren(client, r.rows[0].id, p);
    return r.rows[0].id;
  });
  logActivity(req, 'product_created', 'product', id, { name: p.name });
  const row = (await listProducts(db, { where: ['p.id = $1'], params: [id] }))[0];
  res.status(201).json({ ...row, ...(await loadChildren(db, id)) });
}));

router.put('/:id', requireOwner, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const p = readPayload(req.body || {});
  const removed = await withTx(async (client) => {
    const cur = (await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('Produit introuvable.');
    await checkBundleRules(client, id, p);
    await client.query(
      `UPDATE products SET name=$1, description=$2, price=$3, compare_at_price=$4, stock=$5, category_id=$6, is_active=$7,
         sku=$8, low_stock_threshold=$9, meta_title=$10, meta_description=$11, is_bundle=$12,
         is_customizable=FALSE, customization=NULL, updated_at=NOW() WHERE id=$13`,
      [p.name, p.description, p.price, p.compare, p.is_bundle ? 0 : p.stock, p.category_id, p.is_active,
       p.sku || null, p.low_stock_threshold, p.meta_title || null, p.meta_description || null, p.is_bundle, id]
    );
    return saveChildren(client, id, p);
  });
  for (const u of removed) removeIfUnreferenced(db, u).catch(() => {});
  logActivity(req, 'product_updated', 'product', id, { name: p.name });
  const row = (await listProducts(db, { where: ['p.id = $1'], params: [id] }))[0];
  res.json({ ...row, ...(await loadChildren(db, id)) });
}));

router.post('/:id/duplicate', requireOwner, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const src = (await db.query('SELECT * FROM products WHERE id = $1', [id])).rows[0];
  if (!src) throw notFound('Produit introuvable.');
  const ch = await loadChildren(db, id);
  const newId = await withTx(async (client) => {
    const name = `${src.name} (copie)`;
    const slug = await uniqueSlug(client, 'products', name);
    // La copie est masquée et sans SKU (le SKU doit rester unique) : à vérifier avant publication
    const r = await client.query(
      `INSERT INTO products (name, slug, description, price, compare_at_price, stock, image_url, category_id, is_active,
                             sku, low_stock_threshold, meta_title, meta_description, is_bundle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,NULL,$9,$10,$11,$12) RETURNING id`,
      [name, slug, src.description, src.price, src.compare_at_price, src.stock, src.image_url, src.category_id,
       src.low_stock_threshold, src.meta_title, src.meta_description, src.is_bundle]
    );
    const nid = r.rows[0].id;
    for (const im of ch.images) await client.query('INSERT INTO product_images (product_id, url, position) VALUES ($1,$2,$3)', [nid, im.url, im.position]);
    for (const v of ch.variants) {
      await client.query(
        'INSERT INTO product_variants (product_id, name, sku, price_override, stock, is_active, position) VALUES ($1,$2,NULL,$3,$4,$5,$6)',
        [nid, v.name, v.price_override, v.stock, v.is_active, v.position]
      );
    }
    for (const bi of ch.bundle_items) await client.query('INSERT INTO bundle_items (bundle_id, item_product_id, quantity) VALUES ($1,$2,$3)', [nid, bi.product_id, bi.quantity]);
    return nid;
  });
  logActivity(req, 'product_duplicated', 'product', newId, { from: id });
  res.status(201).json({ id: newId });
}));

router.delete('/:id', requireOwner, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const cur = (await db.query('SELECT name, image_url FROM products WHERE id = $1', [id])).rows[0];
  if (!cur) throw notFound('Produit introuvable.');
  const imgs = (await db.query(
    `SELECT url FROM product_images WHERE product_id = $1 UNION SELECT image_url FROM product_templates WHERE product_id = $1`, [id])).rows.map((r) => r.url);
  try {
    await db.query('DELETE FROM products WHERE id = $1', [id]);
  } catch (e) {
    if (e.code === '23503') throw bad('Ce produit fait partie d\'un pack : retirez-le du pack avant de le supprimer.');
    throw e;
  }
  for (const u of new Set([cur.image_url, ...imgs])) removeIfUnreferenced(db, u).catch(() => {});
  logActivity(req, 'product_deleted', 'product', id, { name: cur.name });
  res.status(204).end();
}));

// ---------- Fiche produit publique (uniquement les produits actifs) ----------
router.get('/:slug', wrap(async (req, res) => {
  const rows = await listProducts(db, { where: ['p.slug = $1', 'p.is_active = TRUE'], params: [String(req.params.slug)] });
  const p = rows[0];
  if (!p) throw notFound('Produit introuvable.');
  const [children, reviews, related] = await Promise.all([
    loadChildren(db, p.id, { onlyActiveVariants: true }),
    db.query(
      `SELECT id, author_name, rating, comment, created_at FROM product_reviews
        WHERE product_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 30`, [p.id]),
    p.category_id
      ? listProducts(db, { where: ['p.is_active = TRUE', 'p.category_id = $1', 'p.id <> $2'], params: [p.category_id, p.id], limit: 4 })
      : Promise.resolve([]),
  ]);
  res.json({ ...p, ...children, reviews: reviews.rows, related });
}));

module.exports = router;

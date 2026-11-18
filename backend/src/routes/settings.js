const express = require('express');
const db = require('../db');
const { requireAdmin, requireOwner } = require('../middleware/auth');
const { wrap } = require('../utils/http');
const settingsSvc = require('../utils/settings');
const { removeIfUnreferenced } = require('../utils/storage');
const { logActivity } = require('../utils/activity');
const { listProducts } = require('../utils/productSql');

const router = express.Router();

// Paramètres visibles par les visiteurs (nom, contact, livraison, bandeau, SEO)
router.get('/public', wrap(async (req, res) => {
  res.json(await settingsSvc.getPublic(db));
}));

// Contenu de la page d'accueil : bannière + sections activées dans l'admin
router.get('/home', wrap(async (req, res) => {
  const s = await settingsSvc.getAll(db);
  const sections = [];
  for (const sec of s.home_sections) {
    if (!sec.enabled) continue;
    const limit = sec.limit || 8;
    if (sec.key === 'nouveautes') {
      sections.push({ ...sec, products: await listProducts(db, { where: ['p.is_active = TRUE'], orderBy: 'p.created_at DESC', limit }) });
    } else if (sec.key === 'promotions') {
      const products = await listProducts(db, { where: ['p.is_active = TRUE', 'p.compare_at_price IS NOT NULL', 'p.compare_at_price > p.price'], orderBy: 'p.created_at DESC', limit });
      if (products.length) sections.push({ ...sec, products });
    } else if (sec.key === 'meilleures_ventes') {
      const products = await listProducts(db, {
        where: [`p.is_active = TRUE`, `EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status NOT IN ('annulee','retournee') AND o.created_at > NOW() - INTERVAL '90 days')`],
        orderBy: `(SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status NOT IN ('annulee','retournee') AND o.created_at > NOW() - INTERVAL '90 days') DESC`,
        limit,
      });
      if (products.length) sections.push({ ...sec, products });
    } else if (sec.key === 'categories') {
      const cats = (await db.query(
        `SELECT c.id, c.name, c.slug FROM categories c
          WHERE EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id AND p.is_active) ORDER BY c.name LIMIT ${parseInt(limit, 10)}`)).rows;
      if (cats.length) sections.push({ ...sec, categories: cats });
    }
  }
  res.json({ hero: s.hero, sections });
}));

// ----- Administration -----
router.get('/', requireAdmin, wrap(async (req, res) => {
  const [s, rates] = await Promise.all([settingsSvc.getAll(db), settingsSvc.getRates(db)]);
  const { GOVERNORATES } = require('../utils/constants');
  res.json({ ...s, shipping_rates: rates, governorates: GOVERNORATES, env: {
    email_configured: !!process.env.SMTP_HOST, telegram_configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    notify_email_env: !!process.env.NOTIFY_EMAIL,
  } });
}));

router.put('/', requireOwner, wrap(async (req, res) => {
  const { values, rates } = settingsSvc.sanitize(req.body);
  const before = await settingsSvc.getAll(db);
  for (const [k, v] of Object.entries(values)) await settingsSvc.saveKey(db, k, v);
  if (rates) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM shipping_rates');
      for (const r of rates) await client.query('INSERT INTO shipping_rates (city, fee) VALUES ($1,$2)', [r.city, r.fee]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  // Ancienne image de bannière remplacée : suppression du fichier si plus utilisée
  if (values.store && before.store.logo_url && before.store.logo_url !== values.store.logo_url) removeIfUnreferenced(db, before.store.logo_url).catch(() => {});
  if (values.hero && before.hero.image_url && before.hero.image_url !== values.hero.image_url) removeIfUnreferenced(db, before.hero.image_url).catch(() => {});
  logActivity(req, 'settings_updated', 'settings', null, { sections: Object.keys(values).concat(rates ? ['shipping_rates'] : []) });
  res.json({ ok: true });
}));

module.exports = router;

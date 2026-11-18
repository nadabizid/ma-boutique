const express = require('express');
const db = require('../db');
const { requireAdmin, requireOwner } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap, bad, notFound, toInt, cleanStr, cleanNum } = require('../utils/http');
const { normalizePhone } = require('../utils/phone');
const { isYmd, tunisYmd, startOfDayUtc, endOfDayUtc } = require('../utils/dates');
const { logActivity } = require('../utils/activity');
const { evaluateCoupon } = require('../services/coupons');

const router = express.Router();
const validateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: 'Trop d\'essais de codes promo. Réessayez plus tard.' });

// Vérification d'un code depuis le panier / la commande (public)
router.post('/validate', validateLimit, wrap(async (req, res) => {
  const b = req.body || {};
  const subtotal = cleanNum(b.subtotal, { min: 0, max: 1e7, required: true, field: 'Sous-total' });
  const ev = await evaluateCoupon(db, { code: b.code, subtotal, phoneNormalized: normalizePhone(b.phone) });
  res.json({
    code: ev.coupon.code, type: ev.coupon.type, discount: ev.discount, free_shipping: ev.free_shipping,
    message: ev.free_shipping ? 'Livraison offerte !' : `Code appliqué : −${ev.discount.toFixed(2)} TND`,
  });
}));

const out = (r) => ({
  ...r,
  starts_at: r.starts_at ? tunisYmd(new Date(r.starts_at)) : '',
  expires_at: r.expires_at ? tunisYmd(new Date(r.expires_at)) : '',
});

router.get('/', requireAdmin, wrap(async (req, res) => {
  res.json((await db.query('SELECT * FROM coupons ORDER BY is_active DESC, created_at DESC')).rows.map(out));
}));

function readCoupon(b) {
  const code = cleanStr(b.code, { max: 40, required: true, field: 'Code' }).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw bad('Le code doit contenir 3 à 40 lettres, chiffres, tirets ou underscores.');
  if (!['percent', 'fixed', 'free_shipping'].includes(b.type)) throw bad('Type de code invalide.');
  let value = cleanNum(b.value, { min: 0, max: 1e6, field: 'Valeur' }) || 0;
  if (b.type === 'percent' && (value <= 0 || value > 100)) throw bad('Le pourcentage doit être compris entre 1 et 100.');
  if (b.type === 'fixed' && value <= 0) throw bad('Le montant de la remise doit être supérieur à 0.');
  if (b.type === 'free_shipping') value = 0;
  const startsAt = b.starts_at && isYmd(b.starts_at) ? startOfDayUtc(b.starts_at).toISOString() : null;
  const expiresAt = b.expires_at && isYmd(b.expires_at) ? endOfDayUtc(b.expires_at).toISOString() : null;
  if (startsAt && expiresAt && startsAt > expiresAt) throw bad("La date de fin doit être après la date de début.");
  return {
    code, type: b.type, value,
    min_order: cleanNum(b.min_order, { min: 0, max: 1e7, field: 'Commande minimum' }) || 0,
    max_discount: b.type === 'percent' ? cleanNum(b.max_discount, { min: 0, max: 1e7, field: 'Remise maximale' }) || null : null,
    max_uses: cleanNum(b.max_uses, { min: 1, max: 1e7, int: true, field: "Nombre d'utilisations" }),
    first_order_only: !!b.first_order_only,
    starts_at: startsAt, expires_at: expiresAt,
    is_active: b.is_active === undefined ? true : !!b.is_active,
  };
}

router.post('/', requireOwner, wrap(async (req, res) => {
  const c = readCoupon(req.body || {});
  const r = await db.query(
    `INSERT INTO coupons (code, type, value, min_order, max_discount, max_uses, first_order_only, starts_at, expires_at, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [c.code, c.type, c.value, c.min_order, c.max_discount, c.max_uses, c.first_order_only, c.starts_at, c.expires_at, c.is_active]
  );
  logActivity(req, 'coupon_created', 'coupon', r.rows[0].id, { code: c.code });
  res.status(201).json(out(r.rows[0]));
}));

router.put('/:id', requireOwner, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const c = readCoupon(req.body || {});
  const r = await db.query(
    `UPDATE coupons SET code=$1, type=$2, value=$3, min_order=$4, max_discount=$5, max_uses=$6, first_order_only=$7,
        starts_at=$8, expires_at=$9, is_active=$10 WHERE id=$11 RETURNING *`,
    [c.code, c.type, c.value, c.min_order, c.max_discount, c.max_uses, c.first_order_only, c.starts_at, c.expires_at, c.is_active, id]
  );
  if (!r.rows[0]) throw notFound('Code promo introuvable.');
  logActivity(req, 'coupon_updated', 'coupon', id, { code: c.code, is_active: c.is_active });
  res.json(out(r.rows[0]));
}));

router.delete('/:id', requireOwner, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const r = await db.query('DELETE FROM coupons WHERE id = $1 RETURNING code', [id]);
  if (!r.rows[0]) throw notFound('Code promo introuvable.');
  logActivity(req, 'coupon_deleted', 'coupon', id, { code: r.rows[0].code });
  res.status(204).end();
}));

module.exports = router;

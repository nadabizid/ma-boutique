const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap, bad, notFound, toInt, cleanStr, paging, likeTerm } = require('../utils/http');
const { ORDER_STATUSES } = require('../utils/constants');
const { normalizePhone } = require('../utils/phone');
const { isYmd, startOfDayUtc, endOfDayUtc } = require('../utils/dates');
const { toCsv } = require('../utils/csv');
const { logActivity } = require('../utils/activity');
const orderSvc = require('../services/orders');
const { notifyNewOrder } = require('../services/notify');

const router = express.Router();

const createLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'Trop de commandes depuis cette connexion. Réessayez plus tard.' });

// ---------- Commande passée par un client ----------
router.post('/', createLimit, wrap(async (req, res) => {
  const body = req.body || {};
  // Champ piège invisible pour les humains : un robot qui le remplit est ignoré silencieusement
  if (body.website) return res.status(201).json({ order_id: 0, total: 0 });
  const order = await orderSvc.createOrder(body);
  notifyNewOrder(order); // en arrière-plan, sans attendre
  res.status(201).json({
    order_id: order.id, total: order.total, subtotal: order.subtotal,
    shipping_fee: order.shipping_fee, discount: order.discount, gift_wrap_fee: order.gift_wrap_fee,
  });
}));

// ---------- Administration ----------
router.use(requireAdmin);

const BASE_SELECT = `SELECT o.id, o.status, o.total, o.subtotal, o.shipping_fee, o.discount, o.coupon_code, o.gift_wrap, o.gift_wrap_fee,
    o.tracking_number, o.carrier, o.shipping_provider, o.carrier_status, o.carrier_status_at, o.created_at, o.updated_at, o.ship_city, o.ship_address,
    c.id AS customer_id, c.full_name, c.phone, c.is_blacklisted AS customer_blacklisted,
    (SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS items_count`;

function buildFilters(q, { withStatus = true } = {}) {
  const where = [];
  const params = [];
  if (withStatus && q.status && ORDER_STATUSES.includes(q.status)) { params.push(q.status); where.push(`o.status = $${params.length}`); }
  if (q.q) {
    const term = String(q.q).trim().slice(0, 80);
    const asId = /^#?\d{1,9}$/.test(term) ? parseInt(term.replace('#', ''), 10) : null;
    const digits = normalizePhone(term);
    const conds = [];
    params.push(likeTerm(term)); conds.push(`c.full_name ILIKE $${params.length}`);
    if (asId) { params.push(asId); conds.push(`o.id = $${params.length}`); }
    if (digits.length >= 3) { params.push(`%${digits}%`); conds.push(`c.phone_normalized LIKE $${params.length}`); }
    where.push(`(${conds.join(' OR ')})`);
  }
  if (q.from && isYmd(q.from)) { params.push(startOfDayUtc(q.from).toISOString()); where.push(`o.created_at >= $${params.length}`); }
  if (q.to && isYmd(q.to)) { params.push(endOfDayUtc(q.to).toISOString()); where.push(`o.created_at <= $${params.length}`); }
  if (q.city) { params.push(String(q.city)); where.push(`COALESCE(NULLIF(o.ship_city,''), c.city) = $${params.length}`); }
  return { where, params };
}
const whereSql = (w) => (w.length ? 'WHERE ' + w.join(' AND ') : '');
const FROM = 'FROM orders o LEFT JOIN customers c ON c.id = o.customer_id';

router.get('/', wrap(async (req, res) => {
  const { page, limit, offset } = paging(req, { def: 25, max: 100 });
  const f = buildFilters(req.query);
  const [rows, total, counts] = await Promise.all([
    db.query(`${BASE_SELECT} ${FROM} ${whereSql(f.where)} ORDER BY o.created_at DESC, o.id DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
    db.query(`SELECT COUNT(*)::int AS n ${FROM} ${whereSql(f.where)}`, f.params),
    (() => {
      const g = buildFilters(req.query, { withStatus: false });
      return db.query(`SELECT o.status, COUNT(*)::int AS n ${FROM} ${whereSql(g.where)} GROUP BY o.status`, g.params);
    })(),
  ]);
  res.json({
    orders: rows.rows, total: total.rows[0].n, page, pages: Math.max(Math.ceil(total.rows[0].n / limit), 1),
    counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
  });
}));

const EXPORT_COLS = [
  { key: 'id', label: 'Commande' }, { key: 'date', label: 'Date' }, { key: 'status', label: 'Statut' },
  { key: 'full_name', label: 'Client' }, { key: 'phone', label: 'Téléphone' }, { key: 'ship_city', label: 'Gouvernorat' },
  { key: 'ship_address', label: 'Adresse' }, { key: 'subtotal', label: 'Sous-total' }, { key: 'shipping_fee', label: 'Livraison' },
  { key: 'discount', label: 'Remise' }, { key: 'gift_wrap_fee', label: 'Emballage cadeau' }, { key: 'total', label: 'Total' },
  { key: 'coupon_code', label: 'Code promo' }, { key: 'carrier', label: 'Transporteur' }, { key: 'tracking_number', label: 'Suivi' },
  { key: 'items', label: 'Articles' },
];

router.get('/export.csv', wrap(async (req, res) => {
  const f = buildFilters(req.query);
  const rows = (await db.query(
    `${BASE_SELECT},
       (SELECT string_agg(oi.quantity || ' x ' || oi.product_name || COALESCE(' (' || oi.variant_name || ')', ''), ' | ' ORDER BY oi.id)
          FROM order_items oi WHERE oi.order_id = o.id) AS items
     ${FROM} ${whereSql(f.where)} ORDER BY o.created_at DESC, o.id DESC LIMIT 20000`, f.params
  )).rows.map((r) => ({
    ...r, date: new Date(r.created_at.getTime() + 3600000).toISOString().slice(0, 16).replace('T', ' '), // heure de Tunis (UTC+1)
    subtotal: r.subtotal ?? r.total,
  }));
  logActivity(req, 'orders_exported', 'order', null, { rows: rows.length });
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="commandes.csv"');
  res.send(toCsv(rows, EXPORT_COLS));
}));

async function loadOrder(id) {
  const o = (await db.query(
    `SELECT o.*, c.id AS customer_id, c.full_name, c.phone, c.email, c.city AS customer_city,
            c.is_blacklisted AS customer_blacklisted, c.blacklist_reason
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`, [id])).rows[0];
  if (!o) return null;
  const [items, history, stats] = await Promise.all([
    db.query('SELECT id, product_id, product_name, variant_name, unit_price, quantity, subtotal FROM order_items WHERE order_id = $1 ORDER BY id', [id]),
    db.query('SELECT id, kind, from_status, to_status, message, admin_name, created_at FROM order_history WHERE order_id = $1 ORDER BY created_at, id', [id]),
    o.customer_id
      ? db.query(
          `SELECT COUNT(*)::int AS orders_count,
                  COUNT(*) FILTER (WHERE status = 'livree')::int AS delivered,
                  COUNT(*) FILTER (WHERE status IN ('annulee','retournee'))::int AS lost
             FROM orders WHERE customer_id = $1 AND id <> $2`, [o.customer_id, id])
      : Promise.resolve({ rows: [{ orders_count: 0, delivered: 0, lost: 0 }] }),
  ]);
  return { ...o, subtotal: o.subtotal ?? o.total, ship_address: o.ship_address, items: items.rows, history: history.rows, customer_stats: stats.rows[0] };
}

// Impression groupée (bons de livraison / étiquettes) : /print?ids=1,2,3
router.get('/print', wrap(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((x) => toInt(x)).filter(Boolean).slice(0, 100);
  if (!ids.length) throw bad('Aucune commande sélectionnée.');
  const out = [];
  for (const id of ids) { const o = await loadOrder(id); if (o) out.push(o); }
  res.json(out);
}));

router.post('/bulk-status', wrap(async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map((x) => toInt(x)).filter(Boolean))].slice(0, 200);
  if (!ids.length) throw bad('Sélectionnez au moins une commande.');
  const done = [];
  const failed = [];
  for (const id of ids) {
    try { await orderSvc.changeStatus(id, req.body.status, req.admin, req.body.note); done.push(id); }
    catch (e) { failed.push({ id, error: e.message }); }
  }
  logActivity(req, 'orders_bulk_status', 'order', null, { status: req.body.status, done: done.length, failed: failed.length });
  res.json({ done, failed });
}));

router.get('/:id', wrap(async (req, res) => {
  const o = await loadOrder(toInt(req.params.id));
  if (!o) throw notFound('Commande introuvable.');
  res.json(o);
}));

router.put('/:id/status', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const note = cleanStr(req.body && req.body.note, { max: 300 });
  const r = await orderSvc.changeStatus(id, req.body && req.body.status, req.admin, note);
  if (!r.unchanged) logActivity(req, 'order_status', 'order', id, { from: r.from, to: r.status });
  res.json(r);
}));

// Transporteur, numéro de suivi et note interne
router.put('/:id/details', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const b = req.body || {};
  const carrier = cleanStr(b.carrier, { max: 80 });
  const tracking = cleanStr(b.tracking_number, { max: 120 });
  const internal = cleanStr(b.internal_notes, { max: 2000 });
  const cur = (await db.query('SELECT carrier, tracking_number, internal_notes FROM orders WHERE id = $1', [id])).rows[0];
  if (!cur) throw notFound('Commande introuvable.');
  await db.query('UPDATE orders SET carrier = $1, tracking_number = $2, internal_notes = $3, updated_at = NOW() WHERE id = $4', [carrier || null, tracking || null, internal || null, id]);

  const log = (kind, message) => db.query(
    'INSERT INTO order_history (order_id, kind, message, admin_id, admin_name) VALUES ($1,$2,$3,$4,$5)', [id, kind, message, req.admin.id, req.admin.name]);
  if ((cur.carrier || '') !== carrier || (cur.tracking_number || '') !== tracking) {
    await log('tracking', `Transporteur : ${carrier || '—'} · Suivi : ${tracking || '—'}`);
  }
  if ((cur.internal_notes || '') !== internal) await log('note', 'Note interne mise à jour');
  logActivity(req, 'order_details', 'order', id, { carrier, tracking_number: tracking });
  res.json({ ok: true });
}));

module.exports = router;

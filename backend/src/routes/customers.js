const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { wrap, bad, notFound, toInt, cleanStr, paging, likeTerm } = require('../utils/http');
const { normalizePhone } = require('../utils/phone');
const { toCsv } = require('../utils/csv');
const { logActivity } = require('../utils/activity');

const router = express.Router();
router.use(requireAdmin);

// Statistiques par client. Le total dépensé ne compte que les commandes non annulées / non retournées.
const SELECT = `SELECT c.id, c.full_name, c.phone, c.email, c.city, c.address, c.notes, c.is_blacklisted, c.blacklist_reason, c.created_at,
    COUNT(o.id)::int AS orders_count,
    COUNT(o.id) FILTER (WHERE o.status = 'livree')::int AS delivered_count,
    COUNT(o.id) FILTER (WHERE o.status IN ('annulee','retournee'))::int AS lost_count,
    COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('annulee','retournee')), 0) AS total_spent,
    MAX(o.created_at) AS last_order_at
  FROM customers c LEFT JOIN orders o ON o.customer_id = c.id`;

function filters(q) {
  const where = [];
  const params = [];
  if (q.q) {
    const term = String(q.q).trim().slice(0, 80);
    const conds = [];
    params.push(likeTerm(term)); conds.push(`c.full_name ILIKE $${params.length}`);
    params.push(likeTerm(term)); conds.push(`c.email ILIKE $${params.length}`);
    const d = normalizePhone(term);
    if (d.length >= 3) { params.push(`%${d}%`); conds.push(`c.phone_normalized LIKE $${params.length}`); }
    where.push(`(${conds.join(' OR ')})`);
  }
  if (q.blacklisted === '1') where.push('c.is_blacklisted');
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

const SORTS = {
  recent: 'MAX(o.created_at) DESC NULLS LAST, c.id DESC',
  spent: 'total_spent DESC, c.id',
  orders: 'orders_count DESC, c.id',
  name: 'c.full_name ASC',
};

router.get('/', wrap(async (req, res) => {
  const { page, limit, offset } = paging(req, { def: 30, max: 100 });
  const f = filters(req.query);
  const [rows, total] = await Promise.all([
    db.query(`${SELECT} ${f.where} GROUP BY c.id ORDER BY ${SORTS[req.query.sort] || SORTS.recent} LIMIT ${limit} OFFSET ${offset}`, f.params),
    db.query(`SELECT COUNT(*)::int AS n FROM customers c ${f.where}`, f.params),
  ]);
  res.json({ customers: rows.rows, total: total.rows[0].n, page, pages: Math.max(Math.ceil(total.rows[0].n / limit), 1) });
}));

router.get('/export.csv', wrap(async (req, res) => {
  const f = filters(req.query);
  const rows = (await db.query(`${SELECT} ${f.where} GROUP BY c.id ORDER BY c.full_name ASC LIMIT 50000`, f.params)).rows
    .map((r) => ({ ...r, blacklisted: r.is_blacklisted ? 'oui' : 'non' }));
  logActivity(req, 'customers_exported', 'customer', null, { rows: rows.length });
  res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="clients.csv"');
  res.send(toCsv(rows, [
    { key: 'full_name', label: 'Nom' }, { key: 'phone', label: 'Téléphone' }, { key: 'email', label: 'Email' },
    { key: 'city', label: 'Gouvernorat' }, { key: 'address', label: 'Adresse' }, { key: 'orders_count', label: 'Commandes' },
    { key: 'delivered_count', label: 'Livrées' }, { key: 'lost_count', label: 'Annulées / retournées' },
    { key: 'total_spent', label: 'Total dépensé' }, { key: 'blacklisted', label: 'Signalé' }, { key: 'notes', label: 'Notes' },
  ]));
}));

router.get('/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const c = (await db.query(`${SELECT} WHERE c.id = $1 GROUP BY c.id`, [id])).rows[0];
  if (!c) throw notFound('Client introuvable.');
  const [orders, addresses] = await Promise.all([
    db.query('SELECT id, status, total, created_at FROM orders WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100', [id]),
    db.query(
      `SELECT ship_address AS address, ship_city AS city, MAX(created_at) AS last_used, COUNT(*)::int AS uses
         FROM orders WHERE customer_id = $1 AND ship_address IS NOT NULL
        GROUP BY ship_address, ship_city ORDER BY MAX(created_at) DESC LIMIT 10`, [id]),
  ]);
  res.json({ ...c, orders: orders.rows, addresses: addresses.rows });
}));

router.put('/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const b = req.body || {};
  const cur = (await db.query('SELECT * FROM customers WHERE id = $1', [id])).rows[0];
  if (!cur) throw notFound('Client introuvable.');
  const email = b.email !== undefined ? cleanStr(b.email, { max: 150 }) : cur.email || '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Adresse email invalide.');
  const blacklisted = b.is_blacklisted !== undefined ? !!b.is_blacklisted : cur.is_blacklisted;
  const r = await db.query(
    `UPDATE customers SET full_name=$1, email=$2, address=$3, city=$4, notes=$5, is_blacklisted=$6, blacklist_reason=$7, updated_at=NOW()
      WHERE id=$8 RETURNING id`,
    [
      b.full_name !== undefined ? cleanStr(b.full_name, { min: 2, max: 120, required: true, field: 'Nom' }) : cur.full_name,
      email || null,
      b.address !== undefined ? cleanStr(b.address, { max: 300, required: true, field: 'Adresse' }) : cur.address,
      b.city !== undefined ? cleanStr(b.city, { max: 120 }) : cur.city,
      b.notes !== undefined ? cleanStr(b.notes, { max: 2000 }) || null : cur.notes,
      blacklisted,
      blacklisted ? (b.blacklist_reason !== undefined ? cleanStr(b.blacklist_reason, { max: 300 }) : cur.blacklist_reason || '') || null : null,
      id,
    ]
  );
  if (blacklisted !== cur.is_blacklisted) logActivity(req, blacklisted ? 'customer_flagged' : 'customer_unflagged', 'customer', id, {});
  else logActivity(req, 'customer_updated', 'customer', id, {});
  res.json({ id: r.rows[0].id });
}));

module.exports = router;

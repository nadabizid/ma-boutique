const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { wrap, toInt, paging } = require('../utils/http');

const router = express.Router();

router.get('/', requireOwner, wrap(async (req, res) => {
  const { page, limit, offset } = paging(req, { def: 50, max: 200 });
  const where = [];
  const params = [];
  if (req.query.entity) { params.push(String(req.query.entity)); where.push(`entity = $${params.length}`); }
  if (req.query.admin_id) { params.push(toInt(req.query.admin_id, 0)); where.push(`admin_id = $${params.length}`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [rows, total] = await Promise.all([
    db.query(`SELECT id, admin_id, admin_name, action, entity, entity_id, details, ip, created_at FROM activity_log ${w} ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`, params),
    db.query(`SELECT COUNT(*)::int AS n FROM activity_log ${w}`, params),
  ]);
  res.json({ items: rows.rows, total: total.rows[0].n, page, pages: Math.max(Math.ceil(total.rows[0].n / limit), 1) });
}));

module.exports = router;

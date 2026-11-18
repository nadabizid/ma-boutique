const express = require('express');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { wrap, bad, notFound, cleanStr, toInt } = require('../utils/http');
const { uniqueSlug } = require('../utils/slug');
const { logActivity } = require('../utils/activity');

const router = express.Router();

router.get('/', wrap(async (req, res) => {
  const r = await db.query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id AND p.is_active) AS product_count
       FROM categories c ORDER BY c.name ASC`
  );
  res.json(r.rows);
}));

router.post('/', requireOwner, wrap(async (req, res) => {
  const name = cleanStr(req.body && req.body.name, { max: 120, required: true, field: 'Nom' });
  const slug = await uniqueSlug(db, 'categories', name);
  const r = await db.query('INSERT INTO categories (name, slug) VALUES ($1,$2) RETURNING *', [name, slug]);
  logActivity(req, 'category_created', 'category', r.rows[0].id, { name });
  res.status(201).json(r.rows[0]);
}));

router.put('/:id', requireOwner, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const name = cleanStr(req.body && req.body.name, { max: 120, required: true, field: 'Nom' });
  const r = await db.query('UPDATE categories SET name = $1 WHERE id = $2 RETURNING *', [name, id]);
  if (!r.rows[0]) throw notFound('Catégorie introuvable.');
  logActivity(req, 'category_updated', 'category', id, { name });
  res.json(r.rows[0]);
}));

router.delete('/:id', requireOwner, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) throw bad('Identifiant invalide.');
  await db.query('DELETE FROM categories WHERE id = $1', [id]);
  logActivity(req, 'category_deleted', 'category', id, {});
  res.status(204).end();
}));

module.exports = router;

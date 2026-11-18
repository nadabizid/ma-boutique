const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap, bad, notFound, toInt, cleanStr, cleanNum, paging } = require('../utils/http');
const { logActivity } = require('../utils/activity');

const router = express.Router();
const postLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Vous avez déjà envoyé plusieurs avis. Réessayez plus tard.' });

// Dépôt d'un avis (public) : visible seulement après validation par l'équipe
router.post('/', postLimit, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.status(201).json({ ok: true }); // champ piège anti-robot
  const productId = toInt(b.product_id);
  const rating = cleanNum(b.rating, { min: 1, max: 5, int: true, required: true, field: 'Note' });
  const author = cleanStr(b.author_name, { min: 2, max: 80, required: true, field: 'Nom' });
  const comment = cleanStr(b.comment, { max: 1500 });
  const p = (await db.query('SELECT id FROM products WHERE id = $1 AND is_active', [productId])).rows[0];
  if (!p) throw bad('Produit introuvable.');
  await db.query('INSERT INTO product_reviews (product_id, author_name, rating, comment) VALUES ($1,$2,$3,$4)', [productId, author, rating, comment || null]);
  res.status(201).json({ ok: true, message: 'Merci ! Votre avis sera publié après validation.' });
}));

// ----- Modération -----
router.get('/admin', requireAdmin, wrap(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const { page, limit, offset } = paging(req, { def: 25, max: 100 });
  const [rows, total] = await Promise.all([
    db.query(
      `SELECT r.id, r.rating, r.comment, r.author_name, r.status, r.created_at, p.id AS product_id, p.name AS product_name
         FROM product_reviews r JOIN products p ON p.id = r.product_id
        WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT ${limit} OFFSET ${offset}`, [status]),
    db.query('SELECT status, COUNT(*)::int AS n FROM product_reviews GROUP BY status'),
  ]);
  const counts = Object.fromEntries(total.rows.map((r) => [r.status, r.n]));
  const n = counts[status] || 0;
  res.json({ reviews: rows.rows, counts, total: n, page, pages: Math.max(Math.ceil(n / limit), 1) });
}));

router.put('/:id/status', requireAdmin, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const status = req.body && req.body.status;
  if (!['pending', 'approved', 'rejected'].includes(status)) throw bad('Statut invalide.');
  const r = await db.query('UPDATE product_reviews SET status = $1 WHERE id = $2 RETURNING id', [status, id]);
  if (!r.rows[0]) throw notFound('Avis introuvable.');
  logActivity(req, 'review_' + status, 'review', id, {});
  res.json({ ok: true });
}));

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  await db.query('DELETE FROM product_reviews WHERE id = $1', [id]);
  logActivity(req, 'review_deleted', 'review', id, {});
  res.status(204).end();
}));

module.exports = router;

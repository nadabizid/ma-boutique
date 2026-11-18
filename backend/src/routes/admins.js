const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireOwner } = require('../middleware/auth');
const { wrap, bad, notFound, cleanStr, toInt } = require('../utils/http');
const { ROLES } = require('../utils/constants');
const { logActivity } = require('../utils/activity');
const { checkPassword } = require('./auth');

const router = express.Router();
router.use(requireOwner);

const COLS = 'id, email, name, role, is_active, totp_enabled, must_change_password, last_login_at, created_at';

async function activeOwnersCount(excludeId = null) {
  const r = await db.query("SELECT COUNT(*)::int AS n FROM admins WHERE role = 'owner' AND is_active AND ($1::int IS NULL OR id <> $1)", [excludeId]);
  return r.rows[0].n;
}

router.get('/', wrap(async (req, res) => {
  res.json((await db.query(`SELECT ${COLS} FROM admins ORDER BY id`)).rows);
}));

router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const name = cleanStr(b.name, { max: 120, required: true, field: 'Nom' });
  const email = cleanStr(b.email, { max: 200, required: true, field: 'Email' }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Email invalide.');
  if (!ROLES.includes(b.role)) throw bad('Rôle invalide.');
  checkPassword(b.password, { email });
  const hash = await bcrypt.hash(String(b.password), 10);
  // Le nouveau compte devra choisir son propre mot de passe à la première connexion
  const r = await db.query(
    `INSERT INTO admins (email, password_hash, name, role, must_change_password) VALUES ($1,$2,$3,$4,TRUE) RETURNING ${COLS}`,
    [email, hash, name, b.role]
  );
  logActivity(req, 'admin_created', 'admin', r.rows[0].id, { email, role: b.role });
  res.status(201).json(r.rows[0]);
}));

router.put('/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const cur = (await db.query('SELECT * FROM admins WHERE id = $1', [id])).rows[0];
  if (!cur) throw notFound('Compte introuvable.');
  const b = req.body || {};

  const name = b.name !== undefined ? cleanStr(b.name, { max: 120, required: true, field: 'Nom' }) : cur.name;
  const role = b.role !== undefined ? b.role : cur.role;
  const isActive = b.is_active !== undefined ? !!b.is_active : cur.is_active;
  if (!ROLES.includes(role)) throw bad('Rôle invalide.');

  const losesOwner = cur.role === 'owner' && cur.is_active && (role !== 'owner' || !isActive);
  if (losesOwner && (await activeOwnersCount(id)) === 0) throw bad('Il doit rester au moins un propriétaire actif.');
  if (id === req.admin.id && (!isActive || role !== cur.role)) throw bad('Vous ne pouvez pas modifier votre propre rôle ou désactiver votre compte.');

  let hash = cur.password_hash;
  let mustChange = cur.must_change_password;
  let bump = role !== cur.role || isActive !== cur.is_active;
  if (b.password) {
    checkPassword(b.password, { email: cur.email });
    hash = await bcrypt.hash(String(b.password), 10);
    mustChange = id !== req.admin.id; // mot de passe provisoire : à changer à la prochaine connexion
    bump = true;
  }
  const resetTotp = !!b.reset_2fa;
  if (resetTotp) bump = true;

  const r = await db.query(
    `UPDATE admins SET name=$1, role=$2, is_active=$3, password_hash=$4, must_change_password=$5,
        token_version = token_version + $6,
        totp_enabled = CASE WHEN $7 THEN FALSE ELSE totp_enabled END,
        totp_secret = CASE WHEN $7 THEN NULL ELSE totp_secret END,
        recovery_codes = CASE WHEN $7 THEN '[]'::jsonb ELSE recovery_codes END
      WHERE id = $8 RETURNING ${COLS}`,
    [name, role, isActive, hash, mustChange, bump ? 1 : 0, resetTotp, id]
  );
  logActivity(req, 'admin_updated', 'admin', id, { role, is_active: isActive, password_reset: !!b.password, reset_2fa: resetTotp });
  res.json(r.rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = toInt(req.params.id);
  if (id === req.admin.id) throw bad('Vous ne pouvez pas supprimer votre propre compte.');
  const cur = (await db.query('SELECT email, role, is_active FROM admins WHERE id = $1', [id])).rows[0];
  if (!cur) throw notFound('Compte introuvable.');
  if (cur.role === 'owner' && cur.is_active && (await activeOwnersCount(id)) === 0) throw bad('Il doit rester au moins un propriétaire actif.');
  await db.query('DELETE FROM admins WHERE id = $1', [id]);
  logActivity(req, 'admin_deleted', 'admin', id, { email: cur.email });
  res.status(204).end();
}));

module.exports = router;

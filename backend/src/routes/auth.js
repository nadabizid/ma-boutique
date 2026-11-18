const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { requireSession, issueSession, clearSession } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap, AppError, bad, cleanStr } = require('../utils/http');
const { encrypt, decrypt, sha256 } = require('../utils/crypto');
const totp = require('../utils/totp');
const { logActivity } = require('../utils/activity');
const { sendMail, mailerConfigured } = require('../services/notify');
const settingsSvc = require('../utils/settings');

const router = express.Router();

const loginIpLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' });
const loginEmailLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 8,
  keyFn: (req) => 'e:' + String((req.body && req.body.email) || '').toLowerCase(),
  message: 'Trop de tentatives pour ce compte. Réessayez dans quelques minutes.',
});
const twoFaLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Trop de tentatives. Réessayez dans quelques minutes.' });
const forgotLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Trop de demandes. Réessayez plus tard.' });

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);
const publicAdmin = (a) => ({ id: a.id, email: a.email, name: a.name, role: a.role, totp_enabled: a.totp_enabled, must_change_password: a.must_change_password });

function checkPassword(pw, { email } = {}) {
  const p = String(pw || '');
  if (p.length < 10) throw bad('Le mot de passe doit contenir au moins 10 caractères.');
  if (p.length > 200) throw bad('Mot de passe trop long.');
  if (/^(admin123|password|motdepasse)/i.test(p) || (email && p.toLowerCase() === String(email).toLowerCase())) throw bad('Mot de passe trop facile à deviner.');
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw bad('Le mot de passe doit contenir des lettres et des chiffres.');
}

function newRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () => {
    const h = crypto.randomBytes(5).toString('hex');
    return `${h.slice(0, 5)}-${h.slice(5)}`;
  });
  return { codes, hashes: codes.map((c) => sha256(c)) };
}

// Vérifie un code 2FA (application) ou un code de secours (usage unique). Retourne true/false.
async function checkSecondFactor(admin, code) {
  const c = String(code || '').trim();
  if (/^\d{3}\s?\d{3}$/.test(c)) return totp.verifyTotp(decrypt(admin.totp_secret), c);
  const h = sha256(c.toLowerCase());
  const list = Array.isArray(admin.recovery_codes) ? admin.recovery_codes : [];
  if (!list.includes(h)) return false;
  await db.query('UPDATE admins SET recovery_codes = $1::jsonb WHERE id = $2', [JSON.stringify(list.filter((x) => x !== h)), admin.id]);
  return true;
}

async function finishLogin(req, res, admin) {
  await db.query('UPDATE admins SET last_login_at = NOW() WHERE id = $1', [admin.id]);
  issueSession(res, admin);
  logActivity({ admin, ip: req.ip }, 'login', 'admin', admin.id, {});
  res.json({ admin: publicAdmin(admin) });
}

router.post('/login', loginIpLimit, loginEmailLimit, wrap(async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  if (!email || !password) throw bad('Email et mot de passe requis.');

  const admin = (await db.query('SELECT * FROM admins WHERE LOWER(email) = $1', [email])).rows[0];
  const ok = await bcrypt.compare(password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok || !admin.is_active) {
    logActivity({ admin: admin || null, ip: req.ip }, 'login_failed', 'admin', admin ? admin.id : null, { email });
    throw new AppError(401, 'Email ou mot de passe incorrect.');
  }
  if (admin.totp_enabled) {
    const challenge = jwt.sign({ id: admin.id, purpose: '2fa' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    return res.json({ requires_2fa: true, challenge });
  }
  await finishLogin(req, res, admin);
}));

router.post('/login/2fa', twoFaLimit, wrap(async (req, res) => {
  let payload;
  try { payload = jwt.verify(String((req.body && req.body.challenge) || ''), process.env.JWT_SECRET); } catch { throw new AppError(401, 'Session de vérification expirée. Reconnectez-vous.'); }
  if (payload.purpose !== '2fa') throw new AppError(401, 'Session de vérification invalide.');
  const admin = (await db.query('SELECT * FROM admins WHERE id = $1', [payload.id])).rows[0];
  if (!admin || !admin.is_active || !admin.totp_enabled) throw new AppError(401, 'Compte indisponible.');
  if (!(await checkSecondFactor(admin, req.body.code))) {
    logActivity({ admin, ip: req.ip }, 'login_2fa_failed', 'admin', admin.id, {});
    throw new AppError(401, 'Code incorrect.');
  }
  await finishLogin(req, res, admin);
}));

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireSession, (req, res) => res.json({ admin: publicAdmin(req.admin) }));

router.put('/password', requireSession, wrap(async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const admin = (await db.query('SELECT * FROM admins WHERE id = $1', [req.admin.id])).rows[0];
  if (!(await bcrypt.compare(String(current_password || ''), admin.password_hash))) throw bad('Mot de passe actuel incorrect.');
  checkPassword(new_password, { email: admin.email });
  if (String(new_password) === String(current_password)) throw bad("Le nouveau mot de passe doit être différent de l'ancien.");
  const hash = await bcrypt.hash(String(new_password), 10);
  const upd = (await db.query(
    'UPDATE admins SET password_hash = $1, must_change_password = FALSE, token_version = token_version + 1 WHERE id = $2 RETURNING *',
    [hash, admin.id]
  )).rows[0];
  issueSession(res, upd); // les autres sessions sont déconnectées
  logActivity(req, 'password_changed', 'admin', admin.id, {});
  res.json({ admin: publicAdmin(upd) });
}));

// ----- Mot de passe oublié -----
router.post('/forgot', forgotLimit, wrap(async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const admin = email ? (await db.query('SELECT id, email, name FROM admins WHERE LOWER(email) = $1 AND is_active', [email])).rows[0] : null;
  if (admin) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.query("INSERT INTO password_resets (admin_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')", [admin.id, sha256(token)]);
    const base = (process.env.FRONTEND_URL || String(process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')[0]).replace(/\/$/, '');
    const link = `${base}/admin/reinitialiser?token=${token}`;
    if (mailerConfigured()) {
      sendMail({
        to: admin.email,
        subject: 'Réinitialisation de votre mot de passe',
        text: `Bonjour ${admin.name},\n\nPour choisir un nouveau mot de passe (lien valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      }).catch((e) => console.error('Email de réinitialisation :', e.message));
    } else {
      // Pas d'email configuré : le lien est affiché dans les logs du serveur (pm2 logs)
      console.log(`[Réinitialisation du mot de passe] ${admin.email} → ${link}`);
    }
  }
  // Même réponse que le compte existe ou non
  res.json({ ok: true });
}));

router.post('/reset', twoFaLimit, wrap(async (req, res) => {
  const token = String((req.body && req.body.token) || '');
  checkPassword(req.body && req.body.password);
  const r = (await db.query(
    'SELECT id, admin_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()', [sha256(token)]
  )).rows[0];
  if (!r) throw bad('Lien invalide ou expiré. Refaites une demande.');
  const hash = await bcrypt.hash(String(req.body.password), 10);
  await db.query('UPDATE admins SET password_hash = $1, must_change_password = FALSE, token_version = token_version + 1 WHERE id = $2', [hash, r.admin_id]);
  await db.query('UPDATE password_resets SET used_at = NOW() WHERE admin_id = $1 AND used_at IS NULL', [r.admin_id]);
  logActivity({ admin: { id: r.admin_id }, ip: req.ip }, 'password_reset', 'admin', r.admin_id, {});
  res.json({ ok: true });
}));

// ----- Double authentification (application d'authentification) -----
router.post('/2fa/setup', requireSession, wrap(async (req, res) => {
  const admin = (await db.query('SELECT email, totp_enabled FROM admins WHERE id = $1', [req.admin.id])).rows[0];
  if (admin.totp_enabled) throw bad('La double authentification est déjà activée.');
  const secret = totp.generateSecret();
  await db.query('UPDATE admins SET totp_secret = $1 WHERE id = $2', [encrypt(secret), req.admin.id]);
  const store = (await settingsSvc.getAll(db)).store.name || 'Ma Boutique';
  const uri = totp.otpauthUri({ secret, account: admin.email, issuer: store });
  let qr = null;
  try { qr = await require('qrcode').toDataURL(uri, { margin: 1, width: 220 }); } catch { /* module qrcode absent : saisie manuelle de la clé */ }
  res.json({ secret, uri, qr });
}));

router.post('/2fa/enable', requireSession, twoFaLimit, wrap(async (req, res) => {
  const admin = (await db.query('SELECT totp_secret, totp_enabled FROM admins WHERE id = $1', [req.admin.id])).rows[0];
  if (admin.totp_enabled) throw bad('La double authentification est déjà activée.');
  if (!admin.totp_secret) throw bad("Lancez d'abord la configuration.");
  if (!totp.verifyTotp(decrypt(admin.totp_secret), req.body && req.body.code)) throw bad('Code incorrect. Vérifiez l\'heure de votre téléphone.');
  const { codes, hashes } = newRecoveryCodes();
  await db.query('UPDATE admins SET totp_enabled = TRUE, recovery_codes = $1::jsonb WHERE id = $2', [JSON.stringify(hashes), req.admin.id]);
  logActivity(req, '2fa_enabled', 'admin', req.admin.id, {});
  res.json({ ok: true, recovery_codes: codes });
}));

router.post('/2fa/disable', requireSession, twoFaLimit, wrap(async (req, res) => {
  const admin = (await db.query('SELECT * FROM admins WHERE id = $1', [req.admin.id])).rows[0];
  if (!admin.totp_enabled) throw bad("La double authentification n'est pas activée.");
  if (!(await bcrypt.compare(String((req.body && req.body.password) || ''), admin.password_hash))) throw bad('Mot de passe incorrect.');
  if (!(await checkSecondFactor(admin, req.body.code))) throw bad('Code incorrect.');
  await db.query("UPDATE admins SET totp_enabled = FALSE, totp_secret = NULL, recovery_codes = '[]'::jsonb WHERE id = $1", [admin.id]);
  logActivity(req, '2fa_disabled', 'admin', admin.id, {});
  res.json({ ok: true });
}));

module.exports = router;
module.exports.checkPassword = checkPassword;

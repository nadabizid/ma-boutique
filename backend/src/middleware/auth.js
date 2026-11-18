const jwt = require('jsonwebtoken');
const db = require('../db');

const COOKIE = 'md_session';
const SESSION_HOURS = 12;

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (!k) return;
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  });
  return out;
}

function cookieOptions() {
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  const secureEnv = process.env.COOKIE_SECURE;
  const secure = secureEnv ? secureEnv === 'true' : process.env.NODE_ENV === 'production';
  return { httpOnly: true, secure: secure || sameSite === 'none', sameSite, path: '/', maxAge: SESSION_HOURS * 3600 * 1000 };
}

function issueSession(res, admin) {
  const token = jwt.sign(
    { id: admin.id, tv: admin.token_version, purpose: 'session' },
    process.env.JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` }
  );
  res.cookie(COOKIE, token, cookieOptions());
}

function clearSession(res) {
  const o = cookieOptions();
  delete o.maxAge;
  res.clearCookie(COOKIE, o);
}

async function loadAdmin(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { return null; }
  if (payload.purpose !== 'session') return null;
  const r = await db.query(
    'SELECT id, email, name, role, is_active, token_version, must_change_password, totp_enabled FROM admins WHERE id = $1',
    [payload.id]
  );
  const a = r.rows[0];
  // Le compte doit exister, être actif et la session ne doit pas avoir été révoquée
  if (!a || !a.is_active || a.token_version !== payload.tv) return null;
  return a;
}

// Protection CSRF : les requêtes qui modifient des données doivent porter cet en-tête personnalisé,
// ce qu'un autre site ne peut pas ajouter sans autorisation CORS.
function csrfOk(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  return req.headers['x-requested-with'] === 'XMLHttpRequest';
}

function guard({ allowMustChange = false } = {}) {
  return async (req, res, next) => {
    try {
      if (!csrfOk(req)) return res.status(403).json({ error: 'Requête refusée.', code: 'CSRF' });
      const a = await loadAdmin(req);
      if (!a) return res.status(401).json({ error: 'Session invalide ou expirée.', code: 'UNAUTHENTICATED' });
      if (a.must_change_password && !allowMustChange) {
        return res.status(403).json({ error: 'Vous devez changer votre mot de passe.', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
      req.admin = a;
      next();
    } catch (e) {
      next(e);
    }
  };
}

const requireAdmin = guard();
const requireSession = guard({ allowMustChange: true });
const ownerOnly = (req, res, next) =>
  req.admin.role === 'owner' ? next() : res.status(403).json({ error: 'Action réservée au propriétaire.', code: 'FORBIDDEN' });
const requireOwner = [requireAdmin, ownerOnly];

module.exports = { requireAdmin, requireSession, requireOwner, issueSession, clearSession, parseCookies, csrfOk };

class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (message, code) => new AppError(400, message, code);
const notFound = (message = 'Introuvable') => new AppError(404, message, 'NOT_FOUND');

// Transmet les erreurs des routes async au gestionnaire d'erreurs Express
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function toInt(v, def = null) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function cleanStr(v, { max = 255, min = 0, field = 'Champ', required = false } = {}) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (!s) {
    if (required) throw bad(`${field} requis`);
    return '';
  }
  if (s.length < min) throw bad(`${field} trop court`);
  if (s.length > max) throw bad(`${field} trop long (${max} caractères max)`);
  return s;
}

function cleanNum(v, { min = null, max = null, field = 'Valeur', required = false, int = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${field} requis`);
    return null;
  }
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n)) throw bad(`${field} invalide`);
  if (int && !Number.isInteger(n)) throw bad(`${field} doit être un nombre entier`);
  if (min !== null && n < min) throw bad(`${field} doit être supérieur ou égal à ${min}`);
  if (max !== null && n > max) throw bad(`${field} doit être inférieur ou égal à ${max}`);
  return n;
}

// URL d'image ou de lien : uniquement /chemin local ou http(s)
function safeUrl(v, max = 500) {
  const s = String(v || '').trim();
  if (!s || s.length > max) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

function paging(req, { def = 25, max = 100 } = {}) {
  const limit = Math.min(Math.max(toInt(req.query.limit, def), 1), max);
  const page = Math.max(toInt(req.query.page, 1), 1);
  return { page, limit, offset: (page - 1) * limit };
}

// Échappe % et _ pour un ILIKE
const likeTerm = (s) => `%${String(s).replace(/[\\%_]/g, (m) => '\\' + m)}%`;

module.exports = { AppError, bad, notFound, wrap, round2, toInt, cleanStr, cleanNum, safeUrl, paging, likeTerm };

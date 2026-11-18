// Limiteur de requêtes en mémoire (suffisant pour un seul serveur)
function rateLimit({ windowMs, max, keyFn = (req) => req.ip, message = 'Trop de requêtes. Réessayez plus tard.' }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.min(windowMs, 60000));
  timer.unref();

  const mw = (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) {
      e = { count: 0, reset: now + windowMs };
      hits.set(key, e);
    }
    e.count++;
    if (e.count > max) {
      res.set('Retry-After', String(Math.ceil((e.reset - now) / 1000)));
      return res.status(429).json({ error: message, code: 'RATE_LIMITED' });
    }
    next();
  };
  mw.reset = (key) => hits.delete(key);
  return mw;
}

module.exports = { rateLimit };

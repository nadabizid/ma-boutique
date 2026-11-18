require('dotenv').config();
const express = require('express');
const cors = require('cors');

const isProd = process.env.NODE_ENV === 'production';

// --- Vérifications de démarrage ---
const secret = process.env.JWT_SECRET || '';
if (!secret || secret === 'change_this_secret_before_deploy' || secret.length < 32) {
  if (isProd) {
    console.error('JWT_SECRET manquant ou trop faible (32 caractères minimum). Démarrage refusé.');
    process.exit(1);
  }
  console.warn('⚠️  JWT_SECRET faible : acceptable en développement, à corriger avant la mise en ligne.');
  if (!secret) process.env.JWT_SECRET = 'dev-only-secret-' + 'x'.repeat(32);
}

const { useCloudinary, UPLOAD_DIR } = require('./utils/storage');
const { AppError } = require('./utils/http');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? parseInt(process.env.TRUST_PROXY, 10) : process.env.TRUST_PROXY);

// --- CORS : uniquement le(s) site(s) autorisé(s), cookies acceptés ---
const origins = (process.env.CORS_ORIGIN || (isProd ? '' : 'http://localhost:3000')).split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
if (isProd && !origins.length) console.warn('⚠️  CORS_ORIGIN non défini : aucun site ne pourra appeler l\'API.');
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

// Images envoyées depuis l'admin : servies par le serveur seulement sans Cloudinary (développement local)
if (!useCloudinary) {
  app.use('/uploads', express.static(UPLOAD_DIR, {
    maxAge: '30d', immutable: true, index: false, dotfiles: 'deny',
    setHeaders: (res) => res.set('Cross-Origin-Resource-Policy', 'cross-origin'),
  }));
} else if (isProd) {
  console.log('Images : stockage Cloudinary.');
}

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Aide au réglage de TRUST_PROXY : affiche l'IP vue par l'API et, derrière Netlify, la valeur conseillée
// (Netlify indique la vraie IP du visiteur dans l'en-tête x-nf-client-connection-ip).
app.get('/api/ip', (req, res) => {
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  chain.push(req.socket.remoteAddress || '');
  const real = String(req.headers['x-nf-client-connection-ip'] || '').trim();
  const idx = real ? chain.lastIndexOf(real) : -1;
  res.json({
    ip_vue_par_l_api: req.ip,
    trust_proxy_actuel: process.env.TRUST_PROXY || '(non défini)',
    trust_proxy_conseille: idx >= 0 ? chain.length - 1 - idx : null,
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admins', require('./routes/admins'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/colisplus', require('./routes/colisplus'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/activity', require('./routes/activity'));

app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));

// --- Gestion des erreurs : messages clairs pour l'utilisateur, détails seulement dans les logs ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Requête invalide.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Fichier ou requête trop volumineux.' });
  if (err.code === '23505') {
    const c = String(err.constraint || '');
    const msg = c.includes('sku') ? 'Ce SKU est déjà utilisé.' : c.includes('coupons_code') ? 'Ce code promo existe déjà.' : c.includes('email') ? 'Cet email est déjà utilisé.' : 'Cette valeur existe déjà.';
    return res.status(409).json({ error: msg });
  }
  if (err.code === '23503') return res.status(409).json({ error: 'Cet élément est lié à d\'autres données.' });
  if (err.code === '40P01') return res.status(503).json({ error: 'Le serveur est très sollicité, réessayez.' });
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API Ma Boutique démarrée sur le port ${PORT}`));

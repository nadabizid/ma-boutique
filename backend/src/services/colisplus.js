// Intégration du transporteur ColisPlus : création de colis (API) et réception des statuts (webhook).
const crypto = require('crypto');
const db = require('../db');
const orderSvc = require('./orders');
const settingsSvc = require('../utils/settings');
const { AppError, bad, notFound, round2 } = require('../utils/http');
const { normalizePhone } = require('../utils/phone');

const baseUrl = () => (process.env.COLISPLUS_BASE_URL || 'https://colisplus-tn.com/index.php/api_shipper').replace(/\/$/, '');
const apiKey = () => process.env.COLISPLUS_API_KEY || '';
const webhookSecret = () => process.env.COLISPLUS_WEBHOOK_SECRET || '';

// ---------- Règles de correspondance statut ColisPlus -> statut de la commande ----------
// Texte comparé sans accents ni majuscules ; la première règle qui correspond l'emporte.
// statut vide = on enregistre l'information sans changer la commande.
const DEFAULT_RULES = [
  { contains: 'non livre', status: '' },
  { contains: 'echec', status: '' },
  { contains: 'en cours de livraison', status: 'expediee' },
  { contains: 'retour', status: 'retournee' },
  { contains: 'refus', status: 'retournee' },
  { contains: 'livre', status: 'livree' },
  { contains: 'ramass', status: 'expediee' },
  { contains: 'enleve', status: 'expediee' },
  { contains: 'transit', status: 'expediee' },
  { contains: 'entrepot', status: 'expediee' },
  { contains: 'affect', status: 'expediee' },
  { contains: 'expedi', status: 'expediee' },
];
const RULE_TARGETS = ['expediee', 'livree', 'retournee', ''];

// Transitions autorisées depuis le transporteur (jamais de retour en arrière, jamais d'annulation automatique)
const ALLOWED = {
  en_attente: ['expediee', 'livree', 'retournee'],
  confirmee: ['expediee', 'livree', 'retournee'],
  expediee: ['livree', 'retournee'],
};

const normalizeText = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function mapStatus(raw, rules) {
  const t = normalizeText(raw);
  if (!t) return null;
  for (const r of rules || DEFAULT_RULES) {
    const needle = normalizeText(r.contains);
    if (needle && t.includes(needle)) return r.status || null;
  }
  return null;
}

async function getConfig(client = db) {
  const r = await client.query("SELECT value FROM settings WHERE key = 'colisplus'");
  const v = (r.rows[0] && r.rows[0].value) || {};
  return {
    enabled: !!v.enabled,
    ouvrir_colis: v.ouvrir_colis === 'oui' ? 'oui' : 'non',
    rules: Array.isArray(v.rules) && v.rules.length ? v.rules : DEFAULT_RULES,
  };
}

function sanitizeConfig(b) {
  const rules = [];
  for (const r of Array.isArray(b && b.rules) ? b.rules.slice(0, 40) : []) {
    const contains = String((r && r.contains) || '').trim();
    const status = String((r && r.status) || '');
    if (!contains) continue;
    if (contains.length > 80) throw bad('Texte de règle trop long.');
    if (!RULE_TARGETS.includes(status)) throw bad('Statut de règle invalide.');
    rules.push({ contains, status });
  }
  return { enabled: !!(b && b.enabled), ouvrir_colis: b && b.ouvrir_colis === 'oui' ? 'oui' : 'non', rules: rules.length ? rules : DEFAULT_RULES };
}

// ---------- Appels à l'API ColisPlus ----------
async function callApi(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    if (e && e.name === 'TimeoutError') {
      throw new AppError(504, "ColisPlus ne répond pas (délai dépassé). Avant de renvoyer, vérifiez dans votre espace ColisPlus que le colis n'a pas été créé, pour éviter un doublon.", 'CARRIER_TIMEOUT');
    }
    throw new AppError(502, 'Impossible de joindre ColisPlus. Vérifiez la connexion du serveur.', 'CARRIER_UNREACHABLE');
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* réponse non JSON */ }
  return { status: res.status, ok: res.ok, data, text };
}

function carrierMessage(r) {
  const d = r.data;
  if (d) {
    const m = d.message || d.error || (Array.isArray(d.errors) ? d.errors.join(', ') : d.errors);
    if (m) return String(m).slice(0, 300);
  }
  return `Réponse inattendue de ColisPlus (HTTP ${r.status}).`;
}

// Référentiel des localités : mis en cache 12 h, regroupé gouvernorat > délégation > localité
let locCache = { at: 0, data: null };
function groupLocations(rows) {
  const gov = new Map();
  for (const r of rows) {
    if (!r || !r.gouvernorat) continue;
    if (!gov.has(r.gouvernorat)) gov.set(r.gouvernorat, new Map());
    const del = gov.get(r.gouvernorat);
    const dName = r.delegation || r.gouvernorat;
    if (!del.has(dName)) del.set(dName, []);
    del.get(dName).push({ localite: r.localite || '', code_postal: r.code_postal || '' });
  }
  return [...gov.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'fr'))
    .map(([gouvernorat, dels]) => ({
      gouvernorat,
      delegations: [...dels.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([delegation, localites]) => ({ delegation, localites })),
    }));
}

async function getLocations() {
  if (locCache.data && Date.now() - locCache.at < 12 * 3600 * 1000) return locCache.data;
  const r = await callApi('/get_locations');
  if (!r.ok || !r.data || !Array.isArray(r.data.data)) throw new AppError(502, `Référentiel des localités indisponible. ${carrierMessage(r)}`);
  locCache = { at: Date.now(), data: groupLocations(r.data.data) };
  return locCache.data;
}

async function getStatuses() {
  const r = await callApi('/get_status');
  if (!r.ok || !r.data || !Array.isArray(r.data.data)) throw new AppError(502, `Dictionnaire des statuts indisponible. ${carrierMessage(r)}`);
  return r.data.data;
}

// ---------- Création d'un colis ----------
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function buildPushBody({ order, items, opts, key }) {
  const summary = items.map((i) => `${i.quantity}x ${i.product_name}${i.variant_name ? ` (${i.variant_name})` : ''}`).join(', ');
  const body = {
    api_key: key,
    dest_nom: clip(order.full_name, 100),
    dest_telephone: normalizePhone(order.phone),
    dest_adresse: clip(order.ship_address, 250),
    dest_gouvernorat: opts.gouvernorat,
    dest_delegation: opts.delegation,
    montant_cod: Number(round2(order.total).toFixed(3)),
    marchandise: clip(opts.marchandise || summary, 120),
    remarque: clip(opts.remarque, 250),
    nbr_colis: opts.nbr_colis || 1,
    ouvrir_colis: opts.ouvrir_colis === 'oui' ? 'oui' : 'non',
    is_exchange: opts.is_exchange === 'oui' ? 'oui' : 'non',
  };
  if (opts.code_postal) body.code_postal = clip(opts.code_postal, 10);
  return body;
}

async function pushOrder(orderId, opts, admin) {
  const key = apiKey();
  if (!key) throw new AppError(503, 'Clé API ColisPlus non configurée : ajoutez COLISPLUS_API_KEY dans backend/.env puis redémarrez le serveur.', 'NOT_CONFIGURED');
  const cfg = await getConfig();
  if (!cfg.enabled) throw bad("L'intégration ColisPlus est désactivée (Admin → Livraison).");

  const o = (await db.query(
    `SELECT o.*, c.full_name, c.phone FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`, [orderId])).rows[0];
  if (!o) throw notFound('Commande introuvable.');
  if (['annulee', 'retournee', 'livree'].includes(o.status)) throw bad(`Cette commande est « ${o.status} » : elle ne peut plus être envoyée au transporteur.`);
  if (o.shipping_provider === 'colisplus' && o.tracking_number && !opts.force) {
    throw new AppError(409, `Cette commande est déjà chez ColisPlus (code ${o.tracking_number}).`, 'ALREADY_SENT');
  }
  if (!opts.gouvernorat || !opts.delegation) throw bad('Choisissez le gouvernorat et la délégation de livraison.');
  const phone = normalizePhone(o.phone);
  if (!/^\d{8}$/.test(phone)) throw bad(`Numéro de téléphone « ${o.phone} » : ColisPlus attend 8 chiffres. Corrigez la fiche client avant l'envoi.`);
  if (!o.ship_address) throw bad('Adresse de livraison manquante.');

  const items = (await db.query('SELECT product_name, variant_name, quantity FROM order_items WHERE order_id = $1 ORDER BY id', [orderId])).rows;
  const body = buildPushBody({ order: o, items, opts, key });
  const r = await callApi('/pushorder', { method: 'POST', body });

  const code = r.data && r.data.code_a_barre ? String(r.data.code_a_barre) : '';
  if (!(r.ok && r.data && r.data.success !== false && code)) {
    throw new AppError(502, `ColisPlus a refusé le colis : ${carrierMessage(r)}`, 'CARRIER_REJECTED');
  }

  await db.query(
    `UPDATE orders SET tracking_number = $1, carrier = 'ColisPlus', shipping_provider = 'colisplus', shipment_sent_at = NOW(),
            carrier_status = 'Colis créé', carrier_status_at = NOW(), updated_at = NOW() WHERE id = $2`, [code, orderId]);
  await db.query(
    "INSERT INTO order_history (order_id, kind, message, admin_id, admin_name) VALUES ($1,'tracking',$2,$3,$4)",
    [orderId, `Envoyé à ColisPlus — code ${code} (${opts.gouvernorat} / ${opts.delegation})`, admin ? admin.id : null, admin ? admin.name : null]
  );
  if (opts.mark_shipped !== false && ['en_attente', 'confirmee'].includes(o.status)) {
    await orderSvc.changeStatus(orderId, 'expediee', admin, 'Colis remis à ColisPlus');
  }
  return { code_a_barre: code };
}

// ---------- Réception des statuts (webhook) ----------
const pick = (o, keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && String(o[k]).trim() !== '') return String(o[k]).trim();
  return '';
};

// Le format exact dépend de ColisPlus : on accepte un objet, un tableau, ou un objet { data: ... }
function extractEvents(payload) {
  const inner = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const list = Array.isArray(inner) ? inner : Array.isArray(payload && payload.colis) ? payload.colis : [inner];
  return list
    .filter((x) => x && typeof x === 'object')
    .slice(0, 50)
    .map((o) => ({
      code: pick(o, ['code_a_barre', 'barcode', 'code', 'tracking_number', 'tracking', 'numero', 'colis_id', 'reference']),
      status: pick(o, ['statut', 'status', 'etat', 'state', 'new_status', 'statut_actuel']),
      note: pick(o, ['commentaire', 'comment', 'motif', 'message', 'remarque']),
    }));
}

function tokenOk(received, expected) {
  if (!expected || !received) return false;
  const a = crypto.createHash('sha256').update(String(received)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

async function processEvent(ev, cfg) {
  if (!ev.code) return { outcome: 'ignoré : code du colis absent' };
  const o = (await db.query(
    'SELECT id, status, carrier_status FROM orders WHERE tracking_number = $1 ORDER BY id DESC LIMIT 1', [ev.code])).rows[0];
  if (!o) return { outcome: 'ignoré : aucune commande avec ce code' };
  if (!ev.status) return { order_id: o.id, outcome: 'ignoré : statut absent' };

  const repeated = o.carrier_status === ev.status.slice(0, 200);
  await db.query('UPDATE orders SET carrier_status = $1, carrier_status_at = NOW(), updated_at = NOW() WHERE id = $2', [ev.status.slice(0, 200), o.id]);

  const target = mapStatus(ev.status, cfg.rules);
  const label = `ColisPlus : ${ev.status}${ev.note ? ` (${ev.note})` : ''}`;
  if (target && (ALLOWED[o.status] || []).includes(target)) {
    try {
      await orderSvc.changeStatus(o.id, target, { id: null, name: 'ColisPlus' }, label.slice(0, 300));
      return { order_id: o.id, outcome: `commande passée en « ${target} »` };
    } catch (e) {
      return { order_id: o.id, outcome: `échec du changement de statut : ${e.message}` };
    }
  }
  if (!repeated) {
    await db.query("INSERT INTO order_history (order_id, kind, message, admin_name) VALUES ($1,'tracking',$2,'ColisPlus')", [o.id, label.slice(0, 500)]);
  }
  return {
    order_id: o.id,
    outcome: target ? `statut enregistré (commande « ${o.status} » : pas de changement)` : 'statut enregistré (aucune règle de changement)',
  };
}

async function logEvent(ev, result, payload) {
  await db.query(
    'INSERT INTO webhook_events (provider, code, status, order_id, outcome, payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',
    ['colisplus', ev.code ? ev.code.slice(0, 120) : null, ev.status ? ev.status.slice(0, 200) : null, result.order_id || null, result.outcome, JSON.stringify(payload ?? null).slice(0, 20000)]
  ).catch((e) => console.error('Journal webhook :', e.message));
  if (Math.random() < 0.02) db.query("DELETE FROM webhook_events WHERE received_at < NOW() - INTERVAL '90 days'").catch(() => {});
}

module.exports = {
  DEFAULT_RULES, RULE_TARGETS, apiKey, webhookSecret, normalizeText, mapStatus, getConfig, sanitizeConfig, groupLocations,
  getLocations, getStatuses, buildPushBody, pushOrder, extractEvents, tokenOk, processEvent, logEvent,
};

const express = require('express');
const db = require('../db');
const { requireAdmin, requireOwner } = require('../middleware/auth');
const { wrap, bad, toInt, cleanStr, cleanNum, paging } = require('../utils/http');
const settingsSvc = require('../utils/settings');
const { logActivity } = require('../utils/activity');
const cp = require('../services/colisplus');

const router = express.Router();

router.get('/config', requireAdmin, wrap(async (req, res) => {
  res.json({
    api_key_set: !!cp.apiKey(),
    webhook_secret_set: !!cp.webhookSecret(),
    webhook_path: '/api/webhooks/colisplus',
    config: await cp.getConfig(),
    default_rules: cp.DEFAULT_RULES,
  });
}));

router.put('/config', requireOwner, wrap(async (req, res) => {
  const cfg = cp.sanitizeConfig(req.body);
  await settingsSvc.saveKey(db, 'colisplus', cfg);
  logActivity(req, 'colisplus_config', 'settings', null, { enabled: cfg.enabled, rules: cfg.rules.length });
  res.json({ ok: true, config: cfg });
}));

router.get('/locations', requireAdmin, wrap(async (req, res) => res.json(await cp.getLocations())));
router.get('/statuses', requireAdmin, wrap(async (req, res) => res.json(await cp.getStatuses())));

// Envoi d'une commande à ColisPlus
router.post('/push/:id', requireAdmin, wrap(async (req, res) => {
  const id = toInt(req.params.id);
  const b = req.body || {};
  const opts = {
    gouvernorat: cleanStr(b.gouvernorat, { max: 100, required: true, field: 'Gouvernorat' }),
    delegation: cleanStr(b.delegation, { max: 100, required: true, field: 'Délégation' }),
    code_postal: cleanStr(b.code_postal, { max: 10 }),
    marchandise: cleanStr(b.marchandise, { max: 120 }),
    remarque: cleanStr(b.remarque, { max: 250 }),
    nbr_colis: cleanNum(b.nbr_colis ?? 1, { min: 1, max: 50, int: true, field: 'Nombre de colis' }) || 1,
    ouvrir_colis: b.ouvrir_colis === 'oui' ? 'oui' : 'non',
    is_exchange: b.is_exchange === 'oui' ? 'oui' : 'non',
    mark_shipped: b.mark_shipped !== false,
    force: !!b.force,
  };
  const r = await cp.pushOrder(id, opts, req.admin);
  logActivity(req, 'order_colisplus_sent', 'order', id, { code: r.code_a_barre });
  res.status(201).json(r);
}));

// Historique des notifications reçues
router.get('/events', requireOwner, wrap(async (req, res) => {
  const { page, limit, offset } = paging(req, { def: 30, max: 100 });
  const [rows, total] = await Promise.all([
    db.query(`SELECT id, code, status, order_id, outcome, payload, received_at FROM webhook_events
               WHERE provider = 'colisplus' ORDER BY received_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`),
    db.query("SELECT COUNT(*)::int AS n FROM webhook_events WHERE provider = 'colisplus'"),
  ]);
  res.json({ events: rows.rows, total: total.rows[0].n, page, pages: Math.max(Math.ceil(total.rows[0].n / limit), 1) });
}));

// Test d'une notification (sans attendre un vrai colis) : applique réellement le statut à la commande
router.post('/simulate', requireOwner, wrap(async (req, res) => {
  const code = cleanStr(req.body && req.body.code, { max: 120, required: true, field: 'Code du colis' });
  const status = cleanStr(req.body && req.body.status, { max: 200, required: true, field: 'Statut' });
  const cfg = await cp.getConfig();
  const ev = { code, status, note: '' };
  const result = await cp.processEvent(ev, cfg);
  await cp.logEvent(ev, { ...result, outcome: `TEST — ${result.outcome}` }, { simulated: true, code, status });
  logActivity(req, 'colisplus_simulated', 'order', result.order_id || null, { code, status, outcome: result.outcome });
  res.json(result);
}));

module.exports = router;

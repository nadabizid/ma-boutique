const express = require('express');
const { rateLimit } = require('../middleware/rateLimit');
const { wrap } = require('../utils/http');
const cp = require('../services/colisplus');

const router = express.Router();
const limit = rateLimit({ windowMs: 60 * 1000, max: 300, message: 'Trop de notifications.' });

// Notifications de statut envoyées par ColisPlus. Le jeton secret est obligatoire.
router.post('/colisplus', limit, express.urlencoded({ extended: false, limit: '200kb' }), wrap(async (req, res) => {
  const secret = cp.webhookSecret();
  if (!secret) return res.status(503).json({ success: false, error: 'Webhook non configuré (COLISPLUS_WEBHOOK_SECRET).' });
  if (!cp.tokenOk(req.headers['x-webhook-token'], secret)) {
    await cp.logEvent({ code: '', status: '' }, { outcome: 'REFUSÉ : jeton de sécurité invalide' }, null);
    return res.status(401).json({ success: false, error: 'Jeton invalide.' });
  }

  const cfg = await cp.getConfig();
  const events = cp.extractEvents(req.body);
  const results = [];
  for (const ev of events) {
    const result = cfg.enabled ? await cp.processEvent(ev, cfg) : { outcome: 'ignoré : intégration désactivée' };
    await cp.logEvent(ev, result, req.body);
    results.push(result.outcome);
  }
  if (!events.length) await cp.logEvent({ code: '', status: '' }, { outcome: 'ignoré : corps vide ou illisible' }, req.body);
  res.json({ success: true, processed: events.length });
}));

module.exports = router;

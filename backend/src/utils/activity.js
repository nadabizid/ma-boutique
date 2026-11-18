const db = require('../db');

// Journal d'activité : ne bloque jamais l'action en cours
function logActivity(req, action, entity, entityId, details) {
  const a = req.admin || {};
  db.query(
    'INSERT INTO activity_log (admin_id, admin_name, action, entity, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)',
    [a.id || null, a.name || null, action, entity || null, entityId != null ? String(entityId) : null, JSON.stringify(details || {}), req.ip || null]
  ).catch((e) => console.error('Journal d\'activité :', e.message));
}

module.exports = { logActivity };

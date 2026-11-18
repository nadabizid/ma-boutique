const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { wrap, bad, round2 } = require('../utils/http');
const { tunisYmd, isYmd, addDays, diffDays } = require('../utils/dates');
const { TZ } = require('../utils/constants');

const router = express.Router();
router.use(requireAdmin);

const LOST = `('annulee','retournee')`;
// Période : jours calendaires en heure de Tunis ($1 = début, $2 = fin, inclus)
const RANGE = `o.created_at >= (($1::date)::timestamp AT TIME ZONE '${TZ}') AT TIME ZONE 'UTC'
  AND o.created_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}') AT TIME ZONE 'UTC'`;
const LOCAL_DAY = `((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')::date`;

function resolvePeriod(q) {
  const today = tunisYmd();
  let from;
  let to = today;
  switch (q.period) {
    case 'today': from = today; break;
    case '7d': from = addDays(today, -6); break;
    case '90d': from = addDays(today, -89); break;
    case 'month': from = today.slice(0, 8) + '01'; break;
    case 'custom':
      if (!isYmd(q.from) || !isYmd(q.to)) throw bad('Dates invalides.');
      from = q.from; to = q.to;
      break;
    default: from = addDays(today, -29);
  }
  if (diffDays(from, to) < 0) throw bad('La date de début doit précéder la date de fin.');
  if (diffDays(from, to) > 366) throw bad('Période trop longue (366 jours maximum).');
  return { from, to };
}

async function summary(from, to) {
  const r = await db.query(
    `SELECT o.status, COUNT(*)::int AS count, COALESCE(SUM(o.total), 0) AS total FROM orders o WHERE ${RANGE} GROUP BY o.status`, [from, to]);
  const by = Object.fromEntries(r.rows.map((x) => [x.status, { count: x.count, total: parseFloat(x.total) }]));
  const get = (s) => by[s] || { count: 0, total: 0 };
  const orders = Object.values(by).reduce((a, x) => a + x.count, 0);
  const valid = ['en_attente', 'confirmee', 'expediee', 'livree'].reduce((a, s) => a + get(s).count, 0);
  const validRevenue = ['en_attente', 'confirmee', 'expediee', 'livree'].reduce((a, s) => a + get(s).total, 0);
  const delivered = get('livree');
  const inProgress = ['en_attente', 'confirmee', 'expediee'].reduce((a, s) => ({ count: a.count + get(s).count, total: a.total + get(s).total }), { count: 0, total: 0 });
  return {
    by_status: by,
    orders,
    valid_orders: valid,
    revenue: round2(validRevenue),                       // CA hors annulées / retournées
    revenue_delivered: round2(delivered.total),          // CA encaissé (livré)
    revenue_in_progress: round2(inProgress.total),       // CA en cours (pas encore livré)
    revenue_lost: round2(get('annulee').total + get('retournee').total),
    avg_basket: valid ? round2(validRevenue / valid) : 0,
    cancel_rate: orders ? round2((get('annulee').count / orders) * 100) : 0,
    // Refus à la livraison : colis retournés / colis arrivés à destination (livrés + retournés)
    return_rate: get('livree').count + get('retournee').count ? round2((get('retournee').count / (get('livree').count + get('retournee').count)) * 100) : 0,
  };
}

router.get('/dashboard', wrap(async (req, res) => {
  const { from, to } = resolvePeriod(req.query);
  const days = diffDays(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  const [cur, prev, daily, top, dormant, cities, cust, lowProducts, lowVariants, recent, totals] = await Promise.all([
    summary(from, to),
    summary(prevFrom, prevTo),
    db.query(
      `SELECT TO_CHAR(${LOCAL_DAY}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders,
              COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ${LOST}), 0) AS revenue
         FROM orders o WHERE ${RANGE} GROUP BY 1 ORDER BY 1`, [from, to]),
    db.query(
      `SELECT oi.product_id, MAX(oi.product_name) AS name, SUM(oi.quantity)::int AS units, COALESCE(SUM(oi.subtotal), 0) AS revenue
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE ${RANGE} AND o.status NOT IN ${LOST} AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id ORDER BY units DESC, revenue DESC LIMIT 10`, [from, to]),
    db.query(
      `SELECT p.id, p.name, p.stock FROM products p
        WHERE p.is_active AND NOT p.is_bundle AND p.stock > 0
          AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                           WHERE oi.product_id = p.id AND ${RANGE} AND o.status NOT IN ${LOST})
        ORDER BY p.stock DESC, p.id LIMIT 10`, [from, to]),
    db.query(
      `SELECT COALESCE(NULLIF(o.ship_city, ''), c.city, 'Inconnue') AS city, COUNT(*)::int AS orders, COALESCE(SUM(o.total), 0) AS revenue
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        WHERE ${RANGE} AND o.status NOT IN ${LOST} GROUP BY 1 ORDER BY orders DESC, revenue DESC LIMIT 10`, [from, to]),
    db.query(
      `SELECT COUNT(*) FILTER (WHERE t.first_order >= (($1::date)::timestamp AT TIME ZONE '${TZ}') AT TIME ZONE 'UTC')::int AS new_customers,
              COUNT(*) FILTER (WHERE t.first_order < (($1::date)::timestamp AT TIME ZONE '${TZ}') AT TIME ZONE 'UTC')::int AS returning_customers
         FROM (SELECT o.customer_id,
                      (SELECT MIN(o2.created_at) FROM orders o2 WHERE o2.customer_id = o.customer_id AND o2.status NOT IN ${LOST}) AS first_order
                 FROM orders o WHERE ${RANGE} AND o.customer_id IS NOT NULL AND o.status NOT IN ${LOST}
                GROUP BY o.customer_id) t`, [from, to]),
    db.query(
      `SELECT p.id, p.name, p.stock, p.low_stock_threshold FROM products p
        WHERE p.is_active AND NOT p.is_bundle AND p.stock <= p.low_stock_threshold
          AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id)
        ORDER BY p.stock, p.id LIMIT 15`),
    db.query(
      `SELECT v.id, p.id AS product_id, p.name, v.name AS variant_name, v.stock FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.is_active AND p.is_active AND v.stock <= p.low_stock_threshold ORDER BY v.stock, v.id LIMIT 15`),
    db.query(
      `SELECT o.id, o.status, o.total, o.created_at, c.full_name FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        ORDER BY o.created_at DESC, o.id DESC LIMIT 8`),
    db.query(
      `SELECT (SELECT COUNT(*)::int FROM products WHERE is_active) AS active_products,
              (SELECT COUNT(*)::int FROM customers) AS customers,
              (SELECT COUNT(*)::int FROM orders WHERE status = 'en_attente') AS pending_orders`),
  ]);

  // Jours sans commande : on les remplit à zéro pour un graphique continu
  const map = new Map(daily.rows.map((r) => [r.day, r]));
  const sales_by_day = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    const r = map.get(d);
    sales_by_day.push({ day: d, orders: r ? r.orders : 0, revenue: r ? parseFloat(r.revenue) : 0 });
  }

  res.json({
    period: { from, to, days, previous_from: prevFrom, previous_to: prevTo },
    current: cur,
    previous: { revenue: prev.revenue, orders: prev.orders, avg_basket: prev.avg_basket },
    sales_by_day,
    top_products: top.rows.map((r) => ({ ...r, revenue: parseFloat(r.revenue) })),
    dormant_products: dormant.rows,
    sales_by_city: cities.rows.map((r) => ({ ...r, revenue: parseFloat(r.revenue) })),
    customers: cust.rows[0],
    low_stock: { products: lowProducts.rows, variants: lowVariants.rows },
    recent_orders: recent.rows,
    totals: totals.rows[0],
  });
}));

// Pastilles du menu : commandes à traiter et avis à modérer
router.get('/badges', wrap(async (req, res) => {
  const r = await db.query(
    `SELECT (SELECT COUNT(*)::int FROM orders WHERE status = 'en_attente') AS pending_orders,
            (SELECT COUNT(*)::int FROM product_reviews WHERE status = 'pending') AS pending_reviews`);
  res.json(r.rows[0]);
}));

module.exports = router;

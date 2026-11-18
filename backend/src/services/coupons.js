const { bad } = require('../utils/http');
const { couponAmount } = require('../utils/pricing');

// Vérifie qu'un code promo est utilisable et calcule la remise. Lève une erreur lisible sinon.
async function evaluateCoupon(client, { code, subtotal, phoneNormalized }) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) throw bad('Saisissez un code promo.');
  const row = (await client.query('SELECT * FROM coupons WHERE UPPER(code) = $1', [c])).rows[0];
  if (!row || !row.is_active) throw bad('Code promo invalide.', 'COUPON_INVALID');

  const now = new Date();
  if (row.starts_at && new Date(row.starts_at) > now) throw bad("Ce code promo n'est pas encore actif.", 'COUPON_INVALID');
  if (row.expires_at && new Date(row.expires_at) < now) throw bad('Ce code promo a expiré.', 'COUPON_INVALID');
  if (row.max_uses !== null && row.used_count >= row.max_uses) throw bad("Ce code promo n'est plus disponible.", 'COUPON_INVALID');
  const min = parseFloat(row.min_order || 0);
  if (subtotal < min) throw bad(`Ce code est valable à partir de ${min.toFixed(2)} TND d'achats.`, 'COUPON_INVALID');

  if (row.first_order_only) {
    if (!phoneNormalized) throw bad('Renseignez votre numéro de téléphone pour utiliser ce code.', 'PHONE_REQUIRED');
    const prev = await client.query(
      `SELECT 1 FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE c.phone_normalized = $1 AND o.status NOT IN ('annulee', 'retournee') LIMIT 1`,
      [phoneNormalized]
    );
    if (prev.rows.length) throw bad('Ce code est réservé à une première commande.', 'COUPON_INVALID');
  }

  const { discount, free_shipping } = couponAmount(row, subtotal);
  return { coupon: row, discount, free_shipping };
}

module.exports = { evaluateCoupon };

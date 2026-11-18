const { round2 } = require('./http');

// Frais de livraison : tarif du gouvernorat sinon tarif par défaut ; gratuit au-dessus du seuil
function shippingFor({ city, subtotal, rates = {}, defaultFee = 0, freeThreshold = null }) {
  const threshold = Number(freeThreshold);
  if (threshold > 0 && subtotal >= threshold) return 0;
  const fee = Object.prototype.hasOwnProperty.call(rates, city) ? rates[city] : defaultFee;
  return round2(Number(fee) || 0);
}

// Montant de la remise d'un code promo (lignes de la table coupons)
function couponAmount(coupon, subtotal) {
  const value = Number(coupon.value) || 0;
  if (coupon.type === 'free_shipping') return { discount: 0, free_shipping: true };
  let discount = coupon.type === 'percent' ? (subtotal * value) / 100 : value;
  const cap = Number(coupon.max_discount);
  if (coupon.type === 'percent' && cap > 0) discount = Math.min(discount, cap);
  discount = Math.min(discount, subtotal);
  return { discount: round2(Math.max(discount, 0)), free_shipping: false };
}

module.exports = { shippingFor, couponAmount };

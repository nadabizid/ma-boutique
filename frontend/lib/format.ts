export const tnd = (n: number | string | null | undefined) => `${(Number(n) || 0).toFixed(2)} TND`;

const TZ = 'Africa/Tunis';
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

// Numéro tunisien à 8 chiffres -> indicatif 216
export function intlPhone(raw: string) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '216' + d;
  return d;
}
export const waLink = (phone: string, text = '') => `https://wa.me/${intlPhone(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const telLink = (phone: string) => `tel:+${intlPhone(phone)}`;

// Frais de livraison (même règle que le serveur, qui recalcule de toute façon)
export function shippingFor(opts: { city: string; subtotal: number; rates: Record<string, number>; defaultFee: number; freeThreshold: number | null }) {
  if (opts.freeThreshold && opts.freeThreshold > 0 && opts.subtotal >= opts.freeThreshold) return 0;
  const fee = Object.prototype.hasOwnProperty.call(opts.rates, opts.city) ? opts.rates[opts.city] : opts.defaultFee;
  return Math.round((Number(fee) || 0) * 100) / 100;
}

export const STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  expediee: 'Expédiée',
  livree: 'Livrée',
  annulee: 'Annulée',
  retournee: 'Retournée / refusée',
};
export const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

// Texte comparable : sans accents, en minuscules
export const norm = (s: string) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

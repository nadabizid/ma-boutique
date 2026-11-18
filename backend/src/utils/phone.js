// Numéro tunisien : chiffres uniquement, sans indicatif 216
function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('216') && d.length === 11) d = d.slice(3);
  return d;
}
module.exports = { normalizePhone };

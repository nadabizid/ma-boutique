const ORDER_STATUSES = ['en_attente', 'confirmee', 'expediee', 'livree', 'annulee', 'retournee'];
// Statuts pour lesquels la commande ne compte plus (stock remis, CA exclu)
const INACTIVE_STATUSES = ['annulee', 'retournee'];
const ROLES = ['owner', 'manager'];
const GOVERNORATES = [
  'Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Zaghouan', 'Bizerte', 'Béja',
  'Jendouba', 'Le Kef', 'Siliana', 'Sousse', 'Monastir', 'Mahdia', 'Sfax', 'Kairouan',
  'Kasserine', 'Sidi Bouzid', 'Gabès', 'Médenine', 'Tataouine', 'Gafsa', 'Tozeur', 'Kébili',
];
const HOME_SECTION_KEYS = ['nouveautes', 'promotions', 'meilleures_ventes', 'categories'];
const TZ = 'Africa/Tunis';

module.exports = { ORDER_STATUSES, INACTIVE_STATUSES, ROLES, GOVERNORATES, HOME_SECTION_KEYS, TZ };

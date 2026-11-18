const { GOVERNORATES, HOME_SECTION_KEYS } = require('./constants');
const { bad, cleanStr, cleanNum, safeUrl } = require('./http');

const DEFAULTS = {
  store: { name: 'Ma Boutique', tagline: 'Votre boutique en ligne, livrée partout en Tunisie.', phone: '', whatsapp: '', email: '', address: '', instagram: '', facebook: '', logo_url: '', show_name: true },
  theme: { preset: 'foret', colors: null },
  shipping: { default_fee: 0, free_threshold: null },
  gift_wrap: { enabled: false, price: 0 },
  announcement: { enabled: false, text: '' },
  hero: {
    eyebrow: 'Bienvenue',
    title: 'Des produits soigneusement sélectionnés, livrés chez vous.',
    subtitle: 'Parcourez notre catalogue et commandez en toute simplicité. Livraison partout en Tunisie, paiement à la réception.',
    button_label: 'Voir le catalogue',
    button_link: '/produits',
    image_url: '',
  },
  home_sections: [
    { key: 'nouveautes', title: 'Nouveautés', enabled: true, limit: 8 },
    { key: 'promotions', title: 'Promotions', enabled: false, limit: 4 },
    { key: 'meilleures_ventes', title: 'Meilleures ventes', enabled: false, limit: 4 },
    { key: 'categories', title: 'Nos catégories', enabled: false, limit: 8 },
  ],
  seo: { site_title: '', site_description: '' },
  notifications: { admin_email: '', new_order_email: true, customer_confirmation_email: true },
};

const THEME_KEYS = ['ivory', 'surface', 'ink', 'forest', 'forestDark', 'brass', 'clay', 'line'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

async function getAll(client) {
  const rows = (await client.query('SELECT key, value FROM settings')).rows;
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = {};
  for (const [k, def] of Object.entries(DEFAULTS)) {
    out[k] = isObj(def) ? { ...def, ...(isObj(stored[k]) ? stored[k] : {}) } : Array.isArray(stored[k]) ? stored[k] : def;
  }
  return out;
}

async function getRates(client) {
  const rows = (await client.query('SELECT city, fee FROM shipping_rates ORDER BY city')).rows;
  return Object.fromEntries(rows.map((r) => [r.city, parseFloat(r.fee)]));
}

// Partie visible par les visiteurs du site
async function getPublic(client) {
  const [s, rates] = await Promise.all([getAll(client), getRates(client)]);
  return {
    store: s.store,
    theme: { preset: s.theme.preset, colors: s.theme.colors },
    shipping: { default_fee: Number(s.shipping.default_fee) || 0, free_threshold: Number(s.shipping.free_threshold) > 0 ? Number(s.shipping.free_threshold) : null, rates },
    gift_wrap: { enabled: !!s.gift_wrap.enabled, price: Number(s.gift_wrap.price) || 0 },
    announcement: s.announcement.enabled && s.announcement.text ? s.announcement : { enabled: false, text: '' },
    seo: s.seo,
    governorates: GOVERNORATES,
  };
}

async function saveKey(client, key, value) {
  await client.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

const flag = (v) => v === true || v === 'true';

// Valide et nettoie le corps d'une requête de modification des paramètres
function sanitize(body) {
  const out = {};
  const b = body || {};
  if (isObj(b.store)) {
    const s = b.store;
    out.store = {
      name: cleanStr(s.name, { max: 80, required: true, field: 'Nom de la boutique' }),
      tagline: cleanStr(s.tagline, { max: 200 }),
      phone: cleanStr(s.phone, { max: 30 }),
      whatsapp: cleanStr(s.whatsapp, { max: 30 }),
      email: cleanStr(s.email, { max: 120 }),
      address: cleanStr(s.address, { max: 200 }),
      instagram: safeUrl(s.instagram, 200),
      facebook: safeUrl(s.facebook, 200),
      logo_url: safeUrl(s.logo_url),
      show_name: s.show_name === undefined ? true : flag(s.show_name),
    };
  }
  if (isObj(b.theme)) {
    const preset = cleanStr(b.theme.preset, { max: 30 }) || 'custom';
    if (!/^[a-z0-9_-]+$/.test(preset)) throw bad('Thème invalide.');
    let colors = null;
    if (b.theme.colors) {
      colors = {};
      for (const k of THEME_KEYS) {
        const v = b.theme.colors[k];
        if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) throw bad('Une couleur du thème est invalide.');
        colors[k] = v.toUpperCase();
      }
    }
    out.theme = { preset, colors };
  }
  if (isObj(b.shipping)) {
    const ft = cleanNum(b.shipping.free_threshold, { min: 0, max: 1e7, field: 'Seuil de livraison gratuite' });
    out.shipping = {
      default_fee: cleanNum(b.shipping.default_fee, { min: 0, max: 1000, field: 'Frais de livraison' }) || 0,
      free_threshold: ft && ft > 0 ? ft : null,
    };
  }
  if (isObj(b.gift_wrap)) {
    out.gift_wrap = { enabled: flag(b.gift_wrap.enabled), price: cleanNum(b.gift_wrap.price, { min: 0, max: 1000, field: 'Prix emballage cadeau' }) || 0 };
  }
  if (isObj(b.announcement)) {
    out.announcement = { enabled: flag(b.announcement.enabled), text: cleanStr(b.announcement.text, { max: 200 }) };
  }
  if (isObj(b.hero)) {
    const h = b.hero;
    const link = String(h.button_link || '').trim();
    out.hero = {
      eyebrow: cleanStr(h.eyebrow, { max: 60 }),
      title: cleanStr(h.title, { max: 160, required: true, field: 'Titre de la bannière' }),
      subtitle: cleanStr(h.subtitle, { max: 400 }),
      button_label: cleanStr(h.button_label, { max: 40 }),
      button_link: link ? safeUrl(link, 300) || '/produits' : '/produits',
      image_url: safeUrl(h.image_url),
    };
  }
  if (Array.isArray(b.home_sections)) {
    const seen = new Set();
    out.home_sections = [];
    for (const s of b.home_sections) {
      if (!s || !HOME_SECTION_KEYS.includes(s.key) || seen.has(s.key)) continue;
      seen.add(s.key);
      out.home_sections.push({
        key: s.key,
        title: cleanStr(s.title, { max: 60 }) || s.key,
        enabled: flag(s.enabled),
        limit: cleanNum(s.limit, { min: 1, max: 24, int: true }) || 8,
      });
    }
  }
  if (isObj(b.seo)) {
    out.seo = { site_title: cleanStr(b.seo.site_title, { max: 70 }), site_description: cleanStr(b.seo.site_description, { max: 200 }) };
  }
  if (isObj(b.notifications)) {
    const email = cleanStr(b.notifications.admin_email, { max: 120 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Email de notification invalide');
    out.notifications = { admin_email: email, new_order_email: flag(b.notifications.new_order_email), customer_confirmation_email: flag(b.notifications.customer_confirmation_email) };
  }
  let rates;
  if (Array.isArray(b.shipping_rates)) {
    rates = [];
    const seen = new Set();
    for (const r of b.shipping_rates) {
      const city = GOVERNORATES.find((g) => g === r.city);
      const fee = cleanNum(r.fee, { min: 0, max: 1000, field: 'Tarif de livraison' });
      if (!city || fee === null || seen.has(city)) continue;
      seen.add(city);
      rates.push({ city, fee });
    }
  }
  return { values: out, rates };
}

module.exports = { DEFAULTS, getAll, getRates, getPublic, saveKey, sanitize };

const db = require('../db');
const { AppError, bad, notFound, round2, cleanStr } = require('../utils/http');
const { normalizePhone } = require('../utils/phone');
const { GOVERNORATES, INACTIVE_STATUSES, ORDER_STATUSES } = require('../utils/constants');
const { shippingFor } = require('../utils/pricing');
const settingsSvc = require('../utils/settings');
const stock = require('./stock');
const { evaluateCoupon } = require('./coupons');

// Fusionne les lignes identiques (même produit + même option)
function mergeItems(items) {
  if (!Array.isArray(items) || !items.length) throw bad('Votre panier est vide.');
  if (items.length > 50) throw bad('Panier trop volumineux.');
  const map = new Map();
  for (const it of items) {
    const product_id = parseInt(it && it.product_id, 10);
    const variant_id = it && it.variant_id ? parseInt(it.variant_id, 10) : null;
    const quantity = parseInt(it && it.quantity, 10);
    if (!Number.isInteger(product_id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw bad('Panier invalide.');
    const key = `${product_id}:${variant_id || 0}`;
    const prev = map.get(key);
    map.set(key, { product_id, variant_id, quantity: Math.min((prev ? prev.quantity : 0) + quantity, 99) });
  }
  return [...map.values()];
}

async function createOrder(input) {
  const full_name = cleanStr(input.full_name, { min: 2, max: 120, required: true, field: 'Nom' });
  const phone = cleanStr(input.phone, { max: 30, required: true, field: 'Téléphone' });
  const phoneN = normalizePhone(phone);
  if (phoneN.length < 8 || phoneN.length > 15) throw bad('Numéro de téléphone invalide.');
  const email = cleanStr(input.email, { max: 150 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad('Adresse email invalide.');
  const address = cleanStr(input.address, { min: 5, max: 300, required: true, field: 'Adresse' });
  const city = GOVERNORATES.find((g) => g.toLowerCase() === String(input.city || '').trim().toLowerCase());
  if (!city) throw bad('Veuillez choisir un gouvernorat.');
  const notes = cleanStr(input.notes, { max: 500 });
  const giftMessage = cleanStr(input.gift_message, { max: 300 });
  const items = mergeItems(input.items);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Articles, prix (toujours ceux de la base) et stock à décrémenter
    const lines = [];
    for (const it of items) {
      const p = (await client.query('SELECT id, name, price, is_bundle, is_active FROM products WHERE id = $1', [it.product_id])).rows[0];
      if (!p || !p.is_active) throw bad("Un produit de votre panier n'est plus disponible.", 'PRODUCT_UNAVAILABLE');
      const variants = (await client.query('SELECT id, name, price_override, is_active FROM product_variants WHERE product_id = $1', [p.id])).rows;
      let unit = parseFloat(p.price);
      let variantId = null;
      let variantName = null;
      const entries = [];
      if (variants.length) {
        const v = variants.find((x) => x.id === it.variant_id);
        if (!v || !v.is_active) throw bad(`Choisissez une option valide pour « ${p.name} ».`, 'VARIANT_REQUIRED');
        variantId = v.id;
        variantName = v.name;
        if (v.price_override !== null) unit = parseFloat(v.price_override);
        entries.push({ product_id: p.id, variant_id: v.id, qty: it.quantity, label: `${p.name} — ${v.name}` });
      } else if (p.is_bundle) {
        const comps = (await client.query(
          `SELECT bi.item_product_id, bi.quantity, cp.name FROM bundle_items bi
             JOIN products cp ON cp.id = bi.item_product_id WHERE bi.bundle_id = $1`, [p.id])).rows;
        if (!comps.length) throw bad(`Le pack « ${p.name} » est indisponible.`, 'PRODUCT_UNAVAILABLE');
        for (const c of comps) entries.push({ product_id: c.item_product_id, variant_id: null, qty: c.quantity * it.quantity, label: c.name });
      } else {
        entries.push({ product_id: p.id, variant_id: null, qty: it.quantity, label: p.name });
      }
      unit = round2(unit);
      lines.push({
        product_id: p.id, name: p.name, variant_id: variantId, variant_name: variantName,
        unit_price: unit, quantity: it.quantity, subtotal: round2(unit * it.quantity), entries,
      });
    }
    await stock.deduct(client, lines.flatMap((l) => l.entries));

    // 2. Totaux : sous-total, livraison, remise, emballage cadeau
    const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0));
    const st = await settingsSvc.getAll(client);
    const rates = await settingsSvc.getRates(client);
    let shippingFee = shippingFor({ city, subtotal, rates, defaultFee: st.shipping.default_fee, freeThreshold: st.shipping.free_threshold });

    let discount = 0;
    let couponRow = null;
    if (input.coupon_code) {
      const ev = await evaluateCoupon(client, { code: input.coupon_code, subtotal, phoneNormalized: phoneN });
      couponRow = ev.coupon;
      discount = ev.discount;
      if (ev.free_shipping) shippingFee = 0;
      const upd = await client.query(
        'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1 AND (max_uses IS NULL OR used_count < max_uses) RETURNING id',
        [couponRow.id]
      );
      if (!upd.rows[0]) throw bad("Ce code promo n'est plus disponible.", 'COUPON_INVALID');
    }

    const wantsGift = !!input.gift_wrap && st.gift_wrap.enabled;
    const giftFee = wantsGift ? round2(st.gift_wrap.price) : 0;
    const total = round2(subtotal - discount + shippingFee + giftFee);

    // 3. Client : retrouvé par son numéro (plus de doublons)
    const cust = (await client.query(
      `INSERT INTO customers (full_name, phone, phone_normalized, email, address, city)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (phone_normalized) DO UPDATE SET
         full_name = EXCLUDED.full_name, phone = EXCLUDED.phone,
         email = COALESCE(EXCLUDED.email, customers.email),
         address = EXCLUDED.address, city = EXCLUDED.city, updated_at = NOW()
       RETURNING id, is_blacklisted`,
      [full_name, phone, phoneN, email || null, address, city]
    )).rows[0];

    // 4. Commande, articles, historique
    const order = (await client.query(
      `INSERT INTO orders (customer_id, status, payment_method, total, notes, ship_address, ship_city, subtotal,
                           shipping_fee, discount, coupon_code, coupon_id, gift_wrap, gift_wrap_fee, gift_message)
       VALUES ($1,'en_attente','cod',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [cust.id, total, notes || null, address, city, subtotal, shippingFee, discount,
       couponRow ? couponRow.code : null, couponRow ? couponRow.id : null, wantsGift, giftFee, wantsGift ? giftMessage || null : null]
    )).rows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, variant_id, variant_name, stock_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [order.id, l.product_id, l.name, l.unit_price, l.quantity, l.subtotal, l.variant_id, l.variant_name,
         JSON.stringify(l.entries.map(({ product_id, variant_id, qty }) => ({ product_id, variant_id, qty })))]
      );
    }
    await client.query(
      "INSERT INTO order_history (order_id, kind, to_status, message, admin_name) VALUES ($1,'created','en_attente','Commande passée sur le site','Client')",
      [order.id]
    );
    await client.query('COMMIT');

    return {
      id: order.id, full_name, phone, email, city, total, subtotal, shipping_fee: shippingFee, discount,
      gift_wrap_fee: giftFee, lines, flagged: cust.is_blacklisted,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Lignes de stock à remettre / reprendre pour une commande
async function stockEntriesFor(client, orderId) {
  const rows = (await client.query(
    'SELECT product_id, variant_id, quantity, product_name, stock_snapshot FROM order_items WHERE order_id = $1', [orderId]
  )).rows;
  const out = [];
  for (const r of rows) {
    if (Array.isArray(r.stock_snapshot) && r.stock_snapshot.length) {
      for (const e of r.stock_snapshot) out.push({ ...e, label: r.product_name });
    } else if (r.product_id) {
      out.push({ product_id: r.product_id, variant_id: r.variant_id, qty: r.quantity, label: r.product_name });
    }
  }
  return out;
}

async function changeStatus(orderId, newStatus, admin, note) {
  if (!ORDER_STATUSES.includes(newStatus)) throw bad('Statut invalide.');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const o = (await client.query('SELECT id, status, stock_restored, coupon_id FROM orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
    if (!o) throw notFound('Commande introuvable.');
    if (o.status === newStatus) {
      await client.query('ROLLBACK');
      return { id: o.id, status: o.status, unchanged: true };
    }

    const wasInactive = INACTIVE_STATUSES.includes(o.status);
    const willBeInactive = INACTIVE_STATUSES.includes(newStatus);
    let restored = o.stock_restored;

    if (!wasInactive && willBeInactive && !o.stock_restored) {
      await stock.restore(client, await stockEntriesFor(client, orderId));
      if (o.coupon_id) await client.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = $1', [o.coupon_id]);
      restored = true;
    } else if (wasInactive && !willBeInactive && o.stock_restored) {
      // Réactivation d'une commande annulée : on reprend le stock (si disponible)
      await stock.deduct(client, await stockEntriesFor(client, orderId));
      if (o.coupon_id) await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [o.coupon_id]);
      restored = false;
    }

    await client.query('UPDATE orders SET status = $1, stock_restored = $2, updated_at = NOW() WHERE id = $3', [newStatus, restored, orderId]);
    await client.query(
      "INSERT INTO order_history (order_id, kind, from_status, to_status, message, admin_id, admin_name) VALUES ($1,'status',$2,$3,$4,$5,$6)",
      [orderId, o.status, newStatus, note || null, admin ? admin.id : null, admin ? admin.name : null]
    );
    await client.query('COMMIT');
    return { id: o.id, status: newStatus, from: o.status };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createOrder, changeStatus };

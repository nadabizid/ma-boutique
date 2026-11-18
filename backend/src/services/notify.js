// Notifications de commande : email et Telegram. Tout est optionnel et ne bloque jamais une commande.
const settingsSvc = require('../utils/settings');
const db = require('../db');

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* module absent : emails désactivés */ }

let transporter = null;
function mailer() {
  if (!nodemailer || !process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `${Number(n).toFixed(2)} TND`;

async function sendMail({ to, subject, html, text }) {
  const t = mailer();
  if (!t) return false;
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, text });
  return true;
}

async function sendTelegram(text) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!token || !chat) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}`);
}

function itemsText(lines) {
  return lines.map((l) => `${l.quantity} × ${l.name}${l.variant_name ? ` (${l.variant_name})` : ''}`).join('\n');
}

// order : résumé renvoyé par createOrder
async function notifyNewOrder(order) {
  try {
    const s = await settingsSvc.getAll(db);
    const store = s.store.name;
    const summary =
      `Nouvelle commande #${order.id}\n${order.full_name} — ${order.phone}\n${order.city}\n\n${itemsText(order.lines)}\n\n` +
      `Total à encaisser : ${money(order.total)}` + (order.flagged ? '\n⚠️ Client signalé (refus de colis précédents)' : '');

    await sendTelegram(summary).catch((e) => console.error('Notification Telegram :', e.message));

    const adminTo = process.env.NOTIFY_EMAIL || s.notifications.admin_email;
    if (adminTo && s.notifications.new_order_email) {
      await sendMail({ to: adminTo, subject: `[${store}] Nouvelle commande #${order.id} — ${money(order.total)}`, text: summary })
        .catch((e) => console.error('Email admin :', e.message));
    }

    if (order.email && s.notifications.customer_confirmation_email) {
      const rows = order.lines
        .map((l) => `<tr><td>${esc(l.name)}${l.variant_name ? ` (${esc(l.variant_name)})` : ''}</td><td align="center">${l.quantity}</td><td align="right">${money(l.subtotal)}</td></tr>`)
        .join('');
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px">
        <h2>Merci pour votre commande, ${esc(order.full_name)} !</h2>
        <p>Votre commande <b>#${order.id}</b> a bien été enregistrée. Nous vous contacterons pour organiser la livraison.</p>
        <table width="100%" cellpadding="6" style="border-collapse:collapse;border-top:1px solid #ddd">${rows}</table>
        <p>Livraison : ${money(order.shipping_fee)}${order.discount > 0 ? ` · Remise : −${money(order.discount)}` : ''}${order.gift_wrap_fee > 0 ? ` · Emballage cadeau : ${money(order.gift_wrap_fee)}` : ''}</p>
        <p><b>Total à payer à la livraison : ${money(order.total)}</b></p>
        <p style="color:#777">${esc(store)}${s.store.phone ? ' · ' + esc(s.store.phone) : ''}</p></div>`;
      await sendMail({ to: order.email, subject: `Votre commande #${order.id} — ${store}`, html })
        .catch((e) => console.error('Email client :', e.message));
    }
  } catch (e) {
    console.error('Notifications de commande :', e.message);
  }
}

module.exports = { notifyNewOrder, sendMail, mailerConfigured: () => !!mailer() };

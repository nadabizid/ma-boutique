const { AppError } = require('../utils/http');

class StockError extends AppError {
  constructor(label, left) {
    super(409, `Stock insuffisant pour « ${label} »${left > 0 ? ` (il en reste ${left}).` : ' (rupture de stock).'}`, 'OUT_OF_STOCK');
  }
}

// Pour un produit avec options, le stock du produit = somme du stock des options actives
async function syncProductStock(client, productId) {
  await client.query(
    `UPDATE products
        SET stock = COALESCE((SELECT SUM(stock) FROM product_variants WHERE product_id = $1 AND is_active), 0),
            updated_at = NOW()
      WHERE id = $1 AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = $1)`,
    [productId]
  );
}

const sortEntries = (entries) =>
  [...entries].sort((a, b) => a.product_id - b.product_id || (a.variant_id || 0) - (b.variant_id || 0));

// entries : [{ product_id, variant_id|null, qty, label }]
// Décrément atomique : échoue si le stock est insuffisant (pas de survente, même en cas de commandes simultanées)
async function deduct(client, entries) {
  for (const e of sortEntries(entries)) {
    if (e.variant_id) {
      const r = await client.query(
        'UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND product_id = $3 AND is_active AND stock >= $1 RETURNING id',
        [e.qty, e.variant_id, e.product_id]
      );
      if (!r.rows[0]) {
        const cur = await client.query('SELECT stock FROM product_variants WHERE id = $1', [e.variant_id]);
        throw new StockError(e.label || 'Produit', cur.rows[0] ? cur.rows[0].stock : 0);
      }
      await syncProductStock(client, e.product_id);
    } else {
      const r = await client.query(
        'UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND stock >= $1 RETURNING id',
        [e.qty, e.product_id]
      );
      if (!r.rows[0]) {
        const cur = await client.query('SELECT stock FROM products WHERE id = $1', [e.product_id]);
        throw new StockError(e.label || 'Produit', cur.rows[0] ? cur.rows[0].stock : 0);
      }
    }
  }
}

// Remise en stock (annulation / retour). Tolérant : un produit supprimé entre-temps est simplement ignoré.
async function restore(client, entries) {
  for (const e of sortEntries(entries)) {
    if (e.variant_id) {
      await client.query('UPDATE product_variants SET stock = stock + $1 WHERE id = $2', [e.qty, e.variant_id]);
      await syncProductStock(client, e.product_id);
    } else {
      await client.query('UPDATE products SET stock = stock + $1, updated_at = NOW() WHERE id = $2', [e.qty, e.product_id]);
    }
  }
}

module.exports = { StockError, deduct, restore, syncProductStock };

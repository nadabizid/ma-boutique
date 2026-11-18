// Stock affiché : pour un pack, nombre de packs complets possibles avec le stock des composants
const STOCK_EXPR = `(CASE WHEN p.is_bundle THEN COALESCE((
    SELECT MIN(FLOOR(cp.stock::numeric / GREATEST(bi.quantity, 1)))::int
    FROM bundle_items bi JOIN products cp ON cp.id = bi.item_product_id
    WHERE bi.bundle_id = p.id), 0) ELSE p.stock END)`;

const SELECT_COLS = `p.id, p.name, p.slug, p.description, p.price, p.compare_at_price, p.image_url,
  p.category_id, p.is_active, p.is_bundle, p.sku, p.low_stock_threshold, p.meta_title, p.meta_description,
  p.created_at, p.updated_at,
  ${STOCK_EXPR} AS stock,
  c.name AS category_name, c.slug AS category_slug,
  EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active) AS has_variants,
  (SELECT COUNT(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variants_count,
  COALESCE((SELECT MIN(COALESCE(v.price_override, p.price)) FROM product_variants v WHERE v.product_id = p.id AND v.is_active), p.price) AS price_min,
  COALESCE((SELECT MAX(COALESCE(v.price_override, p.price)) FROM product_variants v WHERE v.product_id = p.id AND v.is_active), p.price) AS price_max,
  (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM product_reviews r WHERE r.product_id = p.id AND r.status = 'approved') AS avg_rating,
  (SELECT COUNT(*)::int FROM product_reviews r WHERE r.product_id = p.id AND r.status = 'approved') AS reviews_count`;

const FROM = 'FROM products p LEFT JOIN categories c ON c.id = p.category_id';

async function listProducts(client, { where = [], params = [], orderBy = 'p.created_at DESC', limit = null } = {}) {
  const sql = `SELECT ${SELECT_COLS} ${FROM}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}${limit ? ` LIMIT ${parseInt(limit, 10)}` : ''}`;
  return (await client.query(sql, params)).rows;
}

// Images, options et contenu du pack d'un produit
async function loadChildren(client, productId, { onlyActiveVariants = false } = {}) {
  const [images, variants, bundle] = await Promise.all([
    client.query('SELECT id, url, position FROM product_images WHERE product_id = $1 ORDER BY position, id', [productId]),
    client.query(
      `SELECT id, name, sku, price_override, stock, is_active, position FROM product_variants
       WHERE product_id = $1 ${onlyActiveVariants ? 'AND is_active' : ''} ORDER BY position, id`,
      [productId]
    ),
    client.query(
      `SELECT bi.item_product_id AS product_id, bi.quantity, cp.name, cp.slug, cp.image_url
       FROM bundle_items bi JOIN products cp ON cp.id = bi.item_product_id
       WHERE bi.bundle_id = $1 ORDER BY bi.id`,
      [productId]
    ),
  ]);
  return { images: images.rows, variants: variants.rows, bundle_items: bundle.rows };
}

module.exports = { STOCK_EXPR, SELECT_COLS, FROM, listProducts, loadChildren };

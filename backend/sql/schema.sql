-- Schéma Ma Boutique v2
-- Idempotent : peut être relancé sans risque sur une base existante (npm run migrate).

-- ---------- Administrateurs ----------
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'owner';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS recovery_codes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash);

-- ---------- Catalogue ----------
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL,
  compare_at_price NUMERIC(10,2),
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(80);
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title VARCHAR(160);
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description VARCHAR(320);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products (LOWER(sku)) WHERE sku IS NOT NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id, position);

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  sku VARCHAR(80),
  price_override NUMERIC(10,2),
  stock INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id, position);

CREATE TABLE IF NOT EXISTS bundle_items (
  id SERIAL PRIMARY KEY,
  bundle_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  UNIQUE (bundle_id, item_product_id)
);

CREATE TABLE IF NOT EXISTS product_reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  author_name VARCHAR(80) NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON product_reviews(status, created_at);

-- Produits personnalisables : le client ne choisit que la couverture extérieure
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_customizable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS customization JSONB;

CREATE TABLE IF NOT EXISTS product_templates (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_product_templates_product ON product_templates(product_id, position);

-- Images envoyées par les clients (fichiers stockés hors du dossier public)
CREATE TABLE IF NOT EXISTS customer_uploads (
  name VARCHAR(80) PRIMARY KEY,
  mime VARCHAR(30) NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  product_id INTEGER,
  order_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_uploads_pending ON customer_uploads(created_at) WHERE order_id IS NULL;

-- ---------- Clients ----------
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  address TEXT NOT NULL,
  city VARCHAR(120),
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS blacklist_reason TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ---------- Codes promo ----------
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(60) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('percent', 'fixed', 'free_shipping')),
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(10,2),
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  first_order_only BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMP,
  expires_at TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code ON coupons (UPPER(code));

-- ---------- Commandes ----------
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'en_attente', -- en_attente, confirmee, expediee, livree, annulee, retournee
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cod',
  total NUMERIC(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_city VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(60);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_wrap BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_wrap_fee NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier VARCHAR(80);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INTEGER NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL
);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name VARCHAR(120);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS stock_snapshot JSONB;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customization JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_orders_custom ON orders(is_custom) WHERE is_custom;

CREATE TABLE IF NOT EXISTS order_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30),
  message TEXT,
  admin_id INTEGER,
  admin_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_history(order_id, created_at);

-- Transporteur (ColisPlus) : colis créé via l'API, dernier statut reçu par webhook
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_provider VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_sent_at TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_status VARCHAR(200);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS carrier_status_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number);

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  provider VARCHAR(30) NOT NULL,
  code VARCHAR(120),
  status VARCHAR(200),
  order_id INTEGER,
  outcome TEXT,
  payload JSONB,
  received_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at DESC);

-- ---------- Paramètres, livraison, journal ----------
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(60) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  city VARCHAR(120) PRIMARY KEY,
  fee NUMERIC(10,2) NOT NULL CHECK (fee >= 0)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id INTEGER,
  admin_name VARCHAR(255),
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40),
  entity_id VARCHAR(40),
  details JSONB,
  ip VARCHAR(60),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);

-- ---------- Reprise des données existantes ----------
-- Images : l'ancienne image principale devient la première image de la galerie
INSERT INTO product_images (product_id, url, position)
SELECT p.id, p.image_url, 0 FROM products p
WHERE p.image_url IS NOT NULL AND p.image_url <> ''
  AND NOT EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id);

-- Commandes : adresse de livraison et sous-total d'origine
UPDATE orders o SET ship_address = c.address, ship_city = c.city
FROM customers c WHERE o.customer_id = c.id AND o.ship_address IS NULL;
UPDATE orders SET subtotal = total WHERE subtotal IS NULL;

-- Clients : numéro normalisé (chiffres uniquement, sans +216)
UPDATE customers SET phone_normalized = CASE
    WHEN regexp_replace(phone, '\D', '', 'g') ~ '^(00)?216[0-9]{8}$' THEN right(regexp_replace(phone, '\D', '', 'g'), 8)
    ELSE regexp_replace(phone, '\D', '', 'g')
  END
WHERE phone_normalized IS NULL;
UPDATE customers SET phone_normalized = 'legacy-' || id WHERE phone_normalized = '';

-- Clients : fusion des doublons (même téléphone) en conservant l'historique des commandes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT phone_normalized, MIN(id) AS keep_id FROM customers GROUP BY phone_normalized HAVING COUNT(*) > 1 LOOP
    UPDATE customers k SET full_name = l.full_name, email = COALESCE(l.email, k.email), address = l.address, city = l.city
    FROM (SELECT * FROM customers WHERE phone_normalized = r.phone_normalized ORDER BY id DESC LIMIT 1) l
    WHERE k.id = r.keep_id AND l.id <> k.id;
    UPDATE orders SET customer_id = r.keep_id
      WHERE customer_id IN (SELECT id FROM customers WHERE phone_normalized = r.phone_normalized AND id <> r.keep_id);
    DELETE FROM customers WHERE phone_normalized = r.phone_normalized AND id <> r.keep_id;
  END LOOP;
END $$;

ALTER TABLE customers ALTER COLUMN phone_normalized SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_norm ON customers (phone_normalized);

-- ---------- Index ----------
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

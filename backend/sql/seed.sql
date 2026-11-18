-- Données de démonstration (exemples génériques à remplacer par tes vrais produits)
-- Mot de passe admin par défaut : admin123 (le site impose de le changer à la première connexion)
INSERT INTO admins (email, password_hash, name, role, must_change_password)
VALUES ('admin@maboutique.tn', '$2a$10$.o9claCZHomOC6VVYSBAlOvOtrbkgCDwuBFRq5vmR.P6GYLc5LeE2', 'Admin', 'owner', TRUE)
ON CONFLICT (email) DO NOTHING;

INSERT INTO categories (name, slug) VALUES
  ('Catégorie 1', 'categorie-1'),
  ('Catégorie 2', 'categorie-2'),
  ('Catégorie 3', 'categorie-3')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (name, slug, description, price, compare_at_price, stock, image_url, category_id, is_active)
VALUES
  ('Produit exemple 1', 'produit-exemple-1', 'Description du produit exemple 1. À remplacer.', 89.00, 99.00, 12, '', 1, true),
  ('Produit exemple 2', 'produit-exemple-2', 'Description du produit exemple 2. À remplacer.', 145.00, NULL, 30, '', 2, true),
  ('Produit exemple 3', 'produit-exemple-3', 'Description du produit exemple 3. À remplacer.', 32.00, NULL, 8, '', 3, true),
  ('Produit exemple 4', 'produit-exemple-4', 'Description du produit exemple 4. À remplacer.', 19.00, 22.00, 20, '', 1, true)
ON CONFLICT (slug) DO NOTHING;

-- Réglages de livraison de démonstration (modifiables dans Admin > Paramètres)
INSERT INTO settings (key, value) VALUES
  ('shipping', '{"default_fee": 7, "free_threshold": 150}'),
  ('gift_wrap', '{"enabled": true, "price": 3}')
ON CONFLICT (key) DO NOTHING;

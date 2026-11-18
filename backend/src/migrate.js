const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, '../sql/schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schéma appliqué avec succès.');

  const seedPath = path.join(__dirname, '../sql/seed.sql');
  if (process.argv.includes('--seed') && fs.existsSync(seedPath)) {
    const seed = fs.readFileSync(seedPath, 'utf8');
    await pool.query(seed);
    console.log('Données de démonstration insérées.');
  }

  // La personnalisation a été retirée du site : les anciens produits personnalisables redeviennent normaux
  await pool.query('UPDATE products SET is_customizable = FALSE WHERE is_customizable');

  await createFirstAdmin();
  await pool.end();
}

// Premier compte admin créé automatiquement à partir des variables ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME,
// uniquement s'il n'existe encore aucun compte (utile sur un hébergeur sans accès en ligne de commande).
async function createFirstAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return;
  const n = (await pool.query('SELECT COUNT(*)::int AS n FROM admins')).rows[0].n;
  if (n > 0) {
    console.log('Compte admin déjà existant : ADMIN_EMAIL / ADMIN_PASSWORD ignorés (tu peux les supprimer).');
    return;
  }
  const bcrypt = require('bcryptjs');
  const { checkPassword } = require('./routes/auth');
  checkPassword(password, { email });
  await pool.query(
    "INSERT INTO admins (email, password_hash, name, role) VALUES ($1, $2, $3, 'owner')",
    [email, await bcrypt.hash(password, 10), String(process.env.ADMIN_NAME || 'Admin').slice(0, 100)]
  );
  console.log(`Premier compte admin créé : ${email}`);
}

run().catch((err) => {
  console.error('Erreur de migration :', err.status ? err.message : err);
  process.exit(1);
});

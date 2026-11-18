// Outil en ligne de commande pour gérer les comptes admin (accès serveur requis)
//   npm run admin -- create  email@exemple.tn "Nom" "MotDePasse" [owner|manager]
//   npm run admin -- password email@exemple.tn "NouveauMotDePasse"
//   npm run admin -- disable-2fa email@exemple.tn
//   npm run admin -- list
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { checkPassword } = require('./routes/auth');

async function main() {
  const [cmd, a, b, c, d] = process.argv.slice(2);
  if (cmd === 'list') {
    const r = await pool.query('SELECT id, email, name, role, is_active, totp_enabled FROM admins ORDER BY id');
    console.table(r.rows);
  } else if (cmd === 'create') {
    if (!a || !b || !c) throw new Error('Usage : create email "Nom" "MotDePasse" [owner|manager]');
    checkPassword(c, { email: a });
    const role = d === 'manager' ? 'manager' : 'owner';
    const hash = await bcrypt.hash(c, 10);
    await pool.query(
      `INSERT INTO admins (email, password_hash, name, role) VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role,
         is_active = TRUE, must_change_password = FALSE, token_version = admins.token_version + 1`,
      [a.toLowerCase(), hash, b, role]
    );
    console.log(`Compte ${role} prêt : ${a}`);
  } else if (cmd === 'password') {
    if (!a || !b) throw new Error('Usage : password email "NouveauMotDePasse"');
    checkPassword(b, { email: a });
    const r = await pool.query(
      'UPDATE admins SET password_hash = $1, must_change_password = FALSE, is_active = TRUE, token_version = token_version + 1 WHERE LOWER(email) = $2',
      [await bcrypt.hash(b, 10), a.toLowerCase()]
    );
    console.log(r.rowCount ? 'Mot de passe modifié.' : 'Aucun compte avec cet email.');
  } else if (cmd === 'disable-2fa') {
    if (!a) throw new Error('Usage : disable-2fa email');
    const r = await pool.query(
      "UPDATE admins SET totp_enabled = FALSE, totp_secret = NULL, recovery_codes = '[]'::jsonb, token_version = token_version + 1 WHERE LOWER(email) = $1", [a.toLowerCase()]
    );
    console.log(r.rowCount ? 'Double authentification désactivée.' : 'Aucun compte avec cet email.');
  } else {
    console.log('Commandes : list | create | password | disable-2fa');
  }
  await pool.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });

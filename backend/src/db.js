const { Pool, types } = require('pg');
require('dotenv').config();

// Les colonnes "timestamp" (sans fuseau) sont stockées en UTC : on les relit comme telles.
types.setTypeParser(1114, (s) => new Date(s.replace(' ', 'T') + 'Z'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'UTC'").catch(() => {});
});
// Une connexion inactive peut être coupée par la base (ex. Neon qui se met en veille) :
// on l'oublie simplement, le pool en ouvrira une nouvelle à la prochaine requête.
pool.on('error', (err) => {
  console.warn('Connexion à la base fermée :', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

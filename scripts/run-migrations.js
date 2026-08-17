// scripts/run-migrations.js
// Applique automatiquement les fichiers SQL du dossier migrations/ qui n'ont pas
// encore été joués sur cette base, dans l'ordre alphabétique des noms de fichiers.
// Garde la trace des migrations déjà appliquées dans la table `_migrations_history`
// pour ne jamais rejouer deux fois le même fichier.
//
// Usage : npm run migrate   (depuis la racine de pares-backend, sur le serveur)

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const c = {
  reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
};

async function main() {
  console.log(`${c.cyan}Connexion à la base "${env.DB_NAME}" sur ${env.DB_HOST}:${env.DB_PORT}...${c.reset}`);

  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: true, // requis : certaines migrations contiennent plusieurs instructions
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`_migrations_history\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [rows] = await connection.query('SELECT filename FROM `_migrations_history`');
    const already = new Set(rows.map(r => r.filename));

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log(`${c.yellow}Dossier migrations/ introuvable — rien à faire.${c.reset}`);
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const pending = files.filter(f => !already.has(f));

    console.log(`${files.length} fichier(s) de migration trouvé(s) — ${already.size} déjà appliqué(s), ${pending.length} en attente.\n`);

    if (pending.length === 0) {
      console.log(`${c.green}✔ Base de données déjà à jour, rien à appliquer.${c.reset}`);
      return;
    }

    for (const filename of pending) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      process.stdout.write(`→ Application de ${filename}... `);
      try {
        await connection.query(sql);
        await connection.query(
          'INSERT INTO `_migrations_history` (filename) VALUES (?)',
          [filename]
        );
        console.log(`${c.green}OK${c.reset}`);
      } catch (err) {
        console.log(`${c.red}ÉCHEC${c.reset}`);
        console.error(`${c.red}Erreur dans ${filename} : ${err.message}${c.reset}`);
        console.error(`${c.yellow}Arrêt — corrigez le problème puis relancez le script (les migrations déjà appliquées ne seront pas rejouées).${c.reset}`);
        process.exitCode = 1;
        return;
      }
    }

    console.log(`\n${c.green}✔ ${pending.length} migration(s) appliquée(s) avec succès.${c.reset}`);
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error(`${c.red}Erreur inattendue : ${err.message}${c.reset}`);
  process.exitCode = 1;
});

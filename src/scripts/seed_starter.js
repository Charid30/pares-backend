// src/scripts/seed_starter.js
// Crée uniquement le compte super administrateur initial.
// Usage : node src/scripts/seed_starter.js

require('dotenv').config();
const { sequelize } = require('../config/database');
const { User, Agent, Role, Service, UserAgent } = require('../models');

const USERNAME  = process.env.ADMIN_USERNAME         || 'Admin';
const PASSWORD  = process.env.ADMIN_INITIAL_PASSWORD;
const NOM       = process.env.ADMIN_NOM              || 'OUATTARA';
const PRENOM    = process.env.ADMIN_PRENOM           || 'Salifou';
const EMAIL     = process.env.ADMIN_EMAIL            || 'osalifou@sonabhy.bf';
const MATRICULE = process.env.ADMIN_MATRICULE        || 'ADMIN001';

if (!PASSWORD) {
  console.error('❌  ADMIN_INITIAL_PASSWORD est requis dans le fichier .env');
  process.exit(1);
}

const run = async () => {
  try {
    await sequelize.authenticate();

    // ── 1. Rôle ADMIN ──────────────────────────────────────────────────────
    const [adminRole] = await Role.findOrCreate({
      where:    { accronyme: 'ADMIN' },
      defaults: { accronyme: 'ADMIN', description: 'Administrateur système', del: 0 },
    });

    // ── 2. Vérifier qu'aucun admin n'existe déjà ───────────────────────────
    const existing = await User.findOne({
      include: [{ model: Role, as: 'role', where: { accronyme: 'ADMIN' } }],
    });
    if (existing) {
      console.log(`ℹ️  Un super administrateur existe déjà (username: ${existing.username})`);
      process.exit(0);
    }

    // ── 3. Service de rattachement (requis par FK agents) ──────────────────
    const [service] = await Service.findOrCreate({
      where:    { accronyme: 'DSI' },
      defaults: { accronyme: 'DSI', description: "Direction des Systèmes d'Information", del: 0 },
    });

    // ── 4. Compte utilisateur ──────────────────────────────────────────────
    // Le hook beforeCreate du modèle User gère le hashage automatiquement
    const user = await User.create({
      username:    USERNAME,
      password:    PASSWORD,
      role_idrole: adminRole.idrole,
      del: 0,
    });

    // ── 5. Profil agent ────────────────────────────────────────────────────
    const agent = await Agent.create({
      nom:               NOM,
      prenom:            PRENOM,
      email:             EMAIL,
      matricule:         MATRICULE,
      service_idservice: service.idservice,
      createdBy:         'seed_starter',
      createdDate:       new Date(),
      del: 0,
    });

    // ── 6. Liaison user ↔ agent ────────────────────────────────────────────
    await UserAgent.create({
      users_idusers:    user.idusers,
      agents_idagents:  agent.idagents,
    });

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   Super administrateur créé avec succès  ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Username  : ${USERNAME.padEnd(28)}║`);
    console.log(`║  Mot passe : ${PASSWORD.padEnd(28)}║`);
    console.log(`║  Nom       : ${(PRENOM + ' ' + NOM).padEnd(28)}║`);
    console.log(`║  Email     : ${EMAIL.padEnd(28)}║`);
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  ⚠️  Changez le mot de passe dès la      ║');
    console.log('║     première connexion.                  ║');
    console.log('╚══════════════════════════════════════════╝\n');

    process.exit(0);
  } catch (err) {
    console.error('❌  Erreur :', err.message);
    process.exit(1);
  }
};

run();

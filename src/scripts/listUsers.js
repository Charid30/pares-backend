// src/scripts/listUsers.js - Liste tous les utilisateurs
const { sequelize } = require('../config/database');
const { User, Role, Agent } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();

    const users = await User.findAll({
      where: { del: 0 },
      include: [
        { model: Role, as: 'role' },
        { model: Agent, as: 'agents', through: { attributes: [] } }
      ]
    });

    console.log('\n=== UTILISATEURS ===\n');
    for (const u of users) {
      console.log(`ID: ${u.idusers}`);
      console.log(`Username: ${u.username}`);
      console.log(`Role: ${u.role?.accronyme || 'N/A'} (ID: ${u.role_idrole})`);
      console.log(`Agents associés: ${u.agents?.length || 0}`);
      if (u.agents && u.agents.length > 0) {
        for (const a of u.agents) {
          console.log(`  - Agent: ${a.prenom} ${a.nom} (${a.matricule})`);
        }
      }
      console.log('---');
    }

    process.exit(0);
  } catch (e) {
    console.error('Erreur:', e.message);
    process.exit(1);
  }
})();

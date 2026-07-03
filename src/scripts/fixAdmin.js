// src/scripts/fixAdmin.js - Répare l'admin john_doe en lui ajoutant un agent
const { sequelize } = require('../config/database');
const { User, Agent, Role, Service, UserAgent } = require('../models');

(async () => {
  try {
    console.log('🔄 Connexion à la base de données...');
    await sequelize.authenticate();

    // Trouver john_doe
    const adminUser = await User.findOne({
      where: { username: 'john_doe', del: 0 },
      include: [
        { model: Role, as: 'role' },
        { model: Agent, as: 'agents', through: { attributes: [] } }
      ]
    });

    if (!adminUser) {
      console.log('❌ Utilisateur john_doe non trouvé');
      process.exit(1);
    }

    console.log(`✅ Utilisateur trouvé: ${adminUser.username} (Role: ${adminUser.role?.accronyme})`);

    // Vérifier s'il a déjà un agent
    if (adminUser.agents && adminUser.agents.length > 0) {
      console.log('ℹ️ L\'utilisateur a déjà un agent associé');
      process.exit(0);
    }

    // Récupérer ou créer un service
    let service = await Service.findOne({ where: { del: 0 } });
    if (!service) {
      console.log('🔄 Création du service DSI...');
      service = await Service.create({
        accronyme: 'DSI',
        description: 'Direction des Systèmes d\'Information',
        del: 0,
      });
    }
    console.log(`✅ Service: ${service.accronyme}`);

    // Créer un agent pour john_doe
    console.log('🔄 Création de l\'agent pour john_doe...');
    const agent = await Agent.create({
      nom: 'DOE',
      prenom: 'John',
      matricule: 'ADMIN-001',
      service_idservice: service.idservice,
      createdBy: 'system',
      createdDate: new Date(),
      del: 0,
    });
    console.log('✅ Agent créé');

    // Lier l'agent à l'utilisateur
    console.log('🔄 Liaison utilisateur-agent...');
    await UserAgent.create({
      users_idusers: adminUser.idusers,
      agents_idagents: agent.idagents,
    });
    console.log('✅ Liaison créée');

    console.log('\n========================================');
    console.log('✅ Admin john_doe réparé avec succès !');
    console.log('========================================');
    console.log('📧 Username: john_doe');
    console.log('🔑 Utilisez votre mot de passe habituel');
    console.log('========================================\n');

    process.exit(0);
  } catch (e) {
    console.error('❌ Erreur:', e.message);
    console.error(e);
    process.exit(1);
  }
})();

// src/scripts/seedAdmin.js - Script pour créer un administrateur initial
const { sequelize } = require('../config/database');
const { User, Agent, Role, Service, UserAgent } = require('../models');

const seedAdmin = async () => {
  try {
    console.log('🔄 Connexion à la base de données...');
    await sequelize.authenticate();
    console.log('✅ Connexion réussie');

    // Vérifier si le rôle ADMIN existe
    let adminRole = await Role.findOne({ where: { accronyme: 'ADMIN' } });
    if (!adminRole) {
      console.log('🔄 Création du rôle ADMIN...');
      adminRole = await Role.create({
        accronyme: 'ADMIN',
        description: 'Administrateur système',
        del: 0,
      });
      console.log('✅ Rôle ADMIN créé');
    } else {
      console.log('ℹ️ Rôle ADMIN existe déjà');
    }

    // Vérifier si un service existe
    let defaultService = await Service.findOne({ where: { del: 0 } });
    if (!defaultService) {
      console.log('🔄 Création du service par défaut...');
      defaultService = await Service.create({
        accronyme: 'DSI',
        description: 'Direction des Systèmes d\'Information',
        del: 0,
      });
      console.log('✅ Service DSI créé');
    } else {
      console.log(`ℹ️ Service existant trouvé: ${defaultService.accronyme}`);
    }

    // Vérifier si un utilisateur admin existe déjà
    const existingAdmin = await User.findOne({
      include: [{
        model: Role,
        as: 'role',
        where: { accronyme: 'ADMIN' }
      }]
    });

    if (existingAdmin) {
      console.log('ℹ️ Un administrateur existe déjà');
      console.log(`   Username: ${existingAdmin.username}`);
      process.exit(0);
    }

    // Créer l'utilisateur admin
    console.log('🔄 Création de l\'utilisateur admin...');
    const adminUser = await User.create({
      username: 'admin',
      password: process.env.ADMIN_INITIAL_PASSWORD || (() => { throw new Error('ADMIN_INITIAL_PASSWORD non défini dans .env'); })(), // Sera hashé automatiquement par le hook
      role_idrole: adminRole.idrole,
      del: 0,
    });
    console.log('✅ Utilisateur admin créé');

    // Créer l'agent admin
    console.log('🔄 Création de l\'agent admin...');
    const adminAgent = await Agent.create({
      nom: 'ADMIN',
      prenom: 'System',
      matricule: 'ADMIN001',
      service_idservice: defaultService.idservice,
      createdBy: 'system',
      createdDate: new Date(),
      del: 0,
    });
    console.log('✅ Agent admin créé');

    // Lier l'utilisateur à l'agent
    console.log('🔄 Liaison utilisateur-agent...');
    await UserAgent.create({
      users_idusers: adminUser.idusers,
      agents_idagents: adminAgent.idagents,
    });
    console.log('✅ Liaison créée');

    console.log('\n========================================');
    console.log('✅ Administrateur créé avec succès !');
    console.log('========================================');
    console.log('📧 Username: admin');
    console.log('🔑 Password: admin123');
    console.log('⚠️  Changez ce mot de passe après la première connexion !');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error);
    process.exit(1);
  }
};

seedAdmin();

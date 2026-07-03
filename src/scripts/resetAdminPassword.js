// src/scripts/resetAdminPassword.js - Reset le mot de passe admin
const { sequelize } = require('../config/database');
const { User, Role } = require('../models');

(async () => {
  try {
    console.log('🔄 Connexion à la base de données...');
    await sequelize.authenticate();

    // Trouver john_doe
    const adminUser = await User.findOne({
      where: { username: 'john_doe', del: 0 },
      include: [{ model: Role, as: 'role' }]
    });

    if (!adminUser) {
      console.log('❌ Utilisateur john_doe non trouvé');
      process.exit(1);
    }

    console.log(`✅ Utilisateur trouvé: ${adminUser.username} (Role: ${adminUser.role?.accronyme})`);

    // Mettre à jour le mot de passe
    console.log('🔄 Mise à jour du mot de passe...');
    const newPassword = process.env.ADMIN_RESET_PASSWORD;
    if (!newPassword) {
      console.error('❌ ADMIN_RESET_PASSWORD non défini dans .env');
      process.exit(1);
    }
    adminUser.password = newPassword; // Sera hashé automatiquement par le hook beforeUpdate
    await adminUser.save();

    console.log('\n========================================');
    console.log('✅ Mot de passe mis à jour !');
    console.log('========================================');
    console.log('📧 Username: john_doe');
    console.log('🔑 Mot de passe: (valeur de ADMIN_RESET_PASSWORD)');
    console.log('========================================\n');

    process.exit(0);
  } catch (e) {
    console.error('❌ Erreur:', e.message);
    console.error(e);
    process.exit(1);
  }
})();

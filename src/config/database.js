// src/config/database.js
const { Sequelize } = require('sequelize');
const env = require('./env');

// En test (npm test → Jest force NODE_ENV=test), on utilise SQLite en mémoire
// au lieu de MySQL : pas d'installation à faire, pas de risque de toucher la
// vraie base, et une base fraîche à chaque lancement de la suite.
const sequelize = env.NODE_ENV === 'test'
  ? new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
      define: {
        timestamps: true,
        underscored: false,
        freezeTableName: true,
      },
    })
  : new Sequelize(
      env.DB_NAME,
      env.DB_USER,
      env.DB_PASSWORD,
      {
        host: env.DB_HOST,
        port: env.DB_PORT,
        dialect: 'mysql',
        logging: env.NODE_ENV === 'development' ? console.log : false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
        define: {
          timestamps: true,
          underscored: false,
          freezeTableName: true,
        },
      }
    );
// Tester la connexion
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Connexion à la base de données réussie !');
  } catch (error) {
    console.error('Erreur de connexion à la base de données:', error.message);
    process.exit(1);
  }
};
module.exports = { sequelize, testConnection };
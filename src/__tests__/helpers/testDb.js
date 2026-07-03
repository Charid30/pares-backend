// src/__tests__/helpers/testDb.js
// Helper pour les tests d'intégration : recrée le schéma complet (tous les modèles
// enregistrés sur l'instance Sequelize) dans la base SQLite en mémoire utilisée
// quand NODE_ENV=test (voir src/config/database.js).
const { sequelize } = require('../../config/database');

/**
 * Recrée toutes les tables vides — à appeler dans un beforeEach pour isoler chaque test.
 *
 * Supprime temporairement l'avertissement Sequelize "SQLite does not support TEXT with
 * options" : certains modèles utilisent TEXT('long') (= LONGTEXT en MySQL, légitime en
 * prod), que SQLite ne supporte pas nativement — Sequelize le signale à chaque sync()
 * mais retombe correctement sur un TEXT classique, donc rien à corriger ici, juste du bruit.
 */
const resetDb = async () => {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('does not support TEXT with options')) return;
    originalWarn(...args);
  };
  try {
    await sequelize.sync({ force: true });
  } finally {
    console.warn = originalWarn;
  }
};

module.exports = { sequelize, resetDb };

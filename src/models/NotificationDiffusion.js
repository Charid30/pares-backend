// src/models/NotificationDiffusion.js
// Historique des notifications envoyées volontairement par l'admin (push + cloche).
// Table créée par migrations/migration_prod_notification_diffusion.sql
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('NotificationDiffusion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  titre: { type: DataTypes.STRING(100), allowNull: false },
  message: { type: DataTypes.STRING(500), allowNull: false },
  cible: { type: DataTypes.STRING(20), allowNull: false }, // CANDIDATS | AGENTS | TOUS
  // Agents : ids des directions ciblées (JSON), null = toutes
  directions: { type: DataTypes.STRING(500), allowNull: true },
  nbDestinataires: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nbAppareils: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nbPushReussis: { type: DataTypes.INTEGER, allowNull: true },
  nbPushEchecs: { type: DataTypes.INTEGER, allowNull: true },
  envoyeParId: { type: DataTypes.INTEGER, allowNull: true },
  envoyePar: { type: DataTypes.STRING(255), allowNull: false },
  createdDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'notification_diffusion',
  timestamps: false,
});

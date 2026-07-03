// src/models/AuditLog.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('audit_log', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // Qui a agi
  agent_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // null si action système (cron)
  },
  agent_nom: {
    type: DataTypes.STRING(150),
    allowNull: true, // snapshot du nom au moment de l'action
  },
  // Quoi
  action: {
    type: DataTypes.STRING(60),
    allowNull: false,
    // Ex: STAGE_ACCEPTE, STAGE_REJETE, AGENT_CREE, RAPPORT_VALIDE, ...
  },
  module: {
    type: DataTypes.STRING(30),
    allowNull: false,
    // Ex: STAGE, RECRUTEMENT, OFFRE, AIDE, AUDIENCE, AGENT
  },
  // Sur quoi
  entity_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Détails contextuels (motif, date, etc.)
  details: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  // Adresse IP de l'appelant
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
}, {
  timestamps: true,
  updatedAt: false, // Pas de updatedAt — un log est immuable
  tableName: 'audit_log',
  indexes: [
    { fields: ['module'] },
    { fields: ['action'] },
    { fields: ['agent_id'] },
    { fields: ['createdAt'] },
    { fields: ['entity_id'] },
  ],
});

module.exports = AuditLog;

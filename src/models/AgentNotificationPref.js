// src/models/AgentNotificationPref.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AgentNotificationPref = sequelize.define('agent_notification_prefs', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    agent_idagents: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    notificationType: {
      type: DataTypes.ENUM('STAGE', 'RECRUTEMENT', 'OFFRE', 'AIDE', 'AUDIENCE'),
      allowNull: false,
    },
    enabled: {
      type: DataTypes.TINYINT,
      defaultValue: 1,
    },
  }, {
    tableName: 'agent_notification_prefs',
    timestamps: false,
  });

  return AgentNotificationPref;
};

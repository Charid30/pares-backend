// src/models/PushSubscription.js
// Abonnements Web Push (notifications navigateur) — un utilisateur peut avoir
// plusieurs abonnements (un par appareil/navigateur).
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PushSubscription = sequelize.define('push_subscriptions', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    recipient_type: {
      type: DataTypes.ENUM('AGENT', 'CANDIDAT'),
      allowNull: false,
    },
    recipient_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    endpoint: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
    },
    p256dh: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    auth: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  }, {
    tableName: 'push_subscriptions',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['recipient_type', 'recipient_id'] },
    ],
  });

  return PushSubscription;
};

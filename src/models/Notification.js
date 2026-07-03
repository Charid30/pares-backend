// src/models/Notification.js
// Notifications in-app (cloche/pastille) pour agents et candidats
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('notifications', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // Destinataire
    recipient_type: {
      type: DataTypes.ENUM('AGENT', 'CANDIDAT'),
      allowNull: false,
    },
    recipient_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Nature de la notification
    type: {
      type: DataTypes.STRING(60),
      allowNull: false,
      // Ex: NOUVEAU_STAGE, STAGE_ACCEPTE, NOUVELLE_OFFRE, OFFRE_VALIDEE ...
    },
    titre: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Lien de navigation (ex: /dashboard/candidat/stages)
    link: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    // Lu ou non
    read: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'notifications',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { fields: ['recipient_type', 'recipient_id'] },
      { fields: ['read'] },
      { fields: ['createdAt'] },
    ],
  });

  return Notification;
};

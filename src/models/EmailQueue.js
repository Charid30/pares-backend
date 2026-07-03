// src/models/EmailQueue.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('EmailQueue', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Destinataire et contenu
    to_email:     { type: DataTypes.STRING(255), allowNull: false },
    subject:      { type: DataTypes.STRING(500), allowNull: false },
    html:         { type: DataTypes.TEXT('long'), allowNull: true  }, // null une fois envoyé
    text_content: { type: DataTypes.TEXT,         allowNull: true  },

    // Suivi
    queued_date:  { type: DataTypes.DATEONLY, allowNull: false }, // date de mise en file / envoi
    status: {
      type: DataTypes.ENUM('PENDING', 'SENT', 'FAILED'),
      defaultValue: 'PENDING',
    },
    attempts:      { type: DataTypes.INTEGER, defaultValue: 0 },
    error_message: { type: DataTypes.TEXT,    allowNull: true  },
    processed_at:  { type: DataTypes.DATE,    allowNull: true  },
  }, {
    tableName:  'email_queue',
    timestamps: true,  // createdAt / updatedAt gérés par Sequelize
  });
};

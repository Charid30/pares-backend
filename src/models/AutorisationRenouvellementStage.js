// src/models/AutorisationRenouvellementStage.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AutorisationRenouvellementStage = sequelize.define('autorisation_renouvellement_stage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    stage_idstage: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    autorisePar: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'ID de l\'agent (admin) ayant accordé l\'autorisation',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Date d\'expiration de l\'autorisation (now + 7 jours)',
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      comment: 'Date à laquelle le candidat a soumis la demande — null = non encore utilisée',
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'autorisation_renouvellement_stage',
    timestamps: true,
    createdAt: 'createdDate',
    updatedAt: 'lastmodifiedDate',
  });

  return AutorisationRenouvellementStage;
};

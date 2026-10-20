// src/models/AutorisationRapportStage.js
// Autorisation accordée par l'administration pour que le candidat puisse soumettre son
// rapport de stage avant la fin du dernier stage de la chaîne (stage + renouvellements).
// Même principe que AutorisationRenouvellementStage. Portée par le stage racine de la chaîne.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AutorisationRapportStage = sequelize.define('autorisation_rapport_stage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    stage_idstage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Stage racine de la chaîne (demande de stage initiale)',
    },
    autorisePar: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID de l\'agent ayant accordé l\'autorisation',
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
      comment: 'Date de soumission du rapport — null = non encore utilisée',
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'autorisation_rapport_stage',
    timestamps: true,
    createdAt: 'createdDate',
    updatedAt: 'lastmodifiedDate',
  });

  return AutorisationRapportStage;
};

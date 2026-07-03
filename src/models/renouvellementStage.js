// src/models/renouvellementStage.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RenouvellementStage = sequelize.define('renouvellement_stage', {
    idrenouvellement: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    stage_actuel_idstage: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    stage_nouveau_idstage: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    lettreMotivationRenouvellement: {
      type: DataTypes.BLOB('medium'),
    },
    lettreMotivationRenouvellement_filename: {
      type: DataTypes.STRING(255),
    },
    lettreMotivationRenouvellement_size: {
      type: DataTypes.INTEGER,
    },
    lettreMotivationRenouvellement_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    conventionStageEnCours: {
      type: DataTypes.BLOB('medium'),
    },
    conventionStageEnCours_filename: {
      type: DataTypes.STRING(255),
    },
    conventionStageEnCours_size: {
      type: DataTypes.INTEGER,
    },
    conventionStageEnCours_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    dureeDemandee: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'En mois',
    },
    statusRenouvellement: {
      type: DataTypes.ENUM('EN_ATTENTE', 'ACCEPTE', 'REJETE'),
      defaultValue: 'EN_ATTENTE',
    },
    motifRefus: {
      type: DataTypes.TEXT,
    },
    dateRenouvellement: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'renouvellement_stage',
    timestamps: false,
  });

  return RenouvellementStage;
};
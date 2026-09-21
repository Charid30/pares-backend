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
      type: DataTypes.ENUM('EN_ATTENTE', 'PROGRAMMATION_EN_COURS', 'ACCEPTE', 'REJETE'),
      defaultValue: 'EN_ATTENTE',
    },
    motifRefus: {
      type: DataTypes.TEXT,
    },
    dateRenouvellement: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lettreNonConforme: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
      comment: '1 si la lettre de motivation a été signalée non conforme lors du rejet',
    },
    conventionNonConforme: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
      comment: '1 si la convention de stage a été signalée non conforme lors du rejet',
    },
    resoumis: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
      comment: '1 si ce renouvellement a été re-soumis après un rejet — seul l\'admin peut le traiter',
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
// src/models/rapportStage.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RapportStage = sequelize.define('rapport_stage', {
    idrapport: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    stage_idstage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    titreRapport: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    natureRapport: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    rapportPdf: {
      type: DataTypes.BLOB('medium'),
      allowNull: false,
    },
    rapportPdf_filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    rapportPdf_size: {
      type: DataTypes.INTEGER,
    },
    rapportPdf_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    statusRapport: {
      type: DataTypes.ENUM('SOUMIS', 'EN_EVALUATION', 'VALIDE', 'REFUSE'),
      defaultValue: 'SOUMIS',
    },
    noteRapport: {
      type: DataTypes.DECIMAL(4, 2),
      comment: 'Note sur 20',
    },
    commentaireEvaluateur: {
      type: DataTypes.TEXT,
    },
    motifRefus: {
      type: DataTypes.TEXT,
    },
    evaluePar: {
      type: DataTypes.STRING(100),
    },
    dateEvaluation: {
      type: DataTypes.DATE,
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    createdBy: {
      type: DataTypes.STRING(100),
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'rapport_stage',
    timestamps: false,
  });

  return RapportStage;
};
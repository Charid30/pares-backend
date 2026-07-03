// src/models/candidatureAide.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CandidatureAide = sequelize.define('candidature_aide', {
    idcandidature: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    aides_idaide: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    candidats_idcandidats: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    cnib: {
      type: DataTypes.BLOB('medium'),
    },
    cnib_filename: {
      type: DataTypes.STRING(255),
    },
    cnib_size: {
      type: DataTypes.INTEGER,
    },
    cnib_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    demandeCandidature: {
      type: DataTypes.BLOB('medium'),
    },
    demandeCandidature_filename: {
      type: DataTypes.STRING(255),
    },
    demandeCandidature_size: {
      type: DataTypes.INTEGER,
    },
    demandeCandidature_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    autresDocuments: {
      type: DataTypes.JSON,
    },
    statusCandidature: {
      type: DataTypes.ENUM('SOUMISE', 'EN_EXAMEN', 'VALIDEE', 'REJETEE'),
      defaultValue: 'SOUMISE',
    },
    motifRefus: {
      type: DataTypes.TEXT,
    },
    commentaireAgent: {
      type: DataTypes.TEXT,
    },
    evaluePar: {
      type: DataTypes.STRING(100),
    },
    dateEvaluation: {
      type: DataTypes.DATE,
    },
    dateCandidature: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'candidature_aide',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['aides_idaide', 'candidats_idcandidats'],
        name: 'unique_candidature_aide'
      }
    ],
  });

  return CandidatureAide;
};
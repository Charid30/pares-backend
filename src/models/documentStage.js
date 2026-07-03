// src/models/documentStage.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DocumentStage = sequelize.define('document_stage', {
    iddocument: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    stage_idstage: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    rapport_idrapport: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    agents_idagents: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    typeDocument: {
      type: DataTypes.ENUM('CONVENTION', 'ATTESTATION'),
      allowNull: false,
    },
    document: {
      type: DataTypes.BLOB('medium'),
    },
    document_filename: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    document_size: {
      type: DataTypes.INTEGER,
    },
    document_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    numeroAttestation: {
      type: DataTypes.STRING(100),
      unique: true,
    },
    emetteurNom: {
      type: DataTypes.STRING(255),
    },
    emetteurFonction: {
      type: DataTypes.STRING(255),
    },
    dateEmission: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    dateExpiration: {
      type: DataTypes.DATEONLY,
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'document_stage',
    timestamps: false,
  });

  return DocumentStage;
};
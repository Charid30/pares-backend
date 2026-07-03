// src/models/DemandeModificationStage.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DemandeModificationStage = sequelize.define('demande_modification_stage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    stage_idstage: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    candidat_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('SUSPENSION', 'ANNULATION'),
      allowNull: false,
    },
    motif: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    // Date de début de la suspension / annulation souhaitée par le candidat
    dateDebut: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    // Pièce justificative (fichier joint)
    justification_filename: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    justification_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    // Lettre manuscrite (fichier joint)
    lettreManuscrite_filename: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    lettreManuscrite_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('EN_ATTENTE', 'APPROUVEE', 'REJETEE'),
      allowNull: false,
      defaultValue: 'EN_ATTENTE',
    },
    reponse_drh: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    processedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    processedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'demande_modification_stage',
    timestamps: false,
  });

  return DemandeModificationStage;
};

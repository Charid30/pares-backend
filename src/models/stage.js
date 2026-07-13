// src/models/stage.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Stage = sequelize.define('stage', {
    idstage: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    candidats_idcandidats: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    stage_parent_idstage: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    typeStage: {
      type: DataTypes.ENUM('SOUTENANCE', 'PERFECTIONNEMENT'),
      allowNull: false,
    },
    typeEtablissement: {
      type: DataTypes.ENUM('PUBLIC', 'PRIVE'),
      allowNull: false,
      defaultValue: 'PRIVE',
      comment: 'Type d\'université fréquentée par le candidat',
    },
    niveau: {
      type: DataTypes.ENUM('CAP', 'BEPC', 'BEP', 'BAC', 'LICENCE', 'MASTER', 'DOCTORAT'),
      allowNull: true,
    },
    dernierDiplome: {
      type: DataTypes.BLOB('medium'),
      allowNull: true,
      comment: 'Fichier PDF du dernier diplome - Obligatoire si PERFECTIONNEMENT et établissement PRIVE',
    },
    dernierDiplome_filename: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    dernierDiplome_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    dernierDiplome_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    domaineStage: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Texte libre saisi par le candidat (ex: Développement web, Comptabilité...)',
    },
    direction_iddirection: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    service_idservice: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'FK vers service — service dans lequel le candidat souhaite effectuer son stage',
    },
    cv: {
      type: DataTypes.BLOB('medium'),
    },
    cv_filename: {
      type: DataTypes.STRING(255),
    },
    cv_size: {
      type: DataTypes.INTEGER,
    },
    cv_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
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
    casierJudiciaire: {
      type: DataTypes.BLOB('medium'),
    },
    casierJudiciaire_filename: {
      type: DataTypes.STRING(255),
    },
    casierJudiciaire_size: {
      type: DataTypes.INTEGER,
    },
    casierJudiciaire_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    lettreMotivation: {
      type: DataTypes.BLOB('medium'),
    },
    lettreMotivation_filename: {
      type: DataTypes.STRING(255),
    },
    lettreMotivation_size: {
      type: DataTypes.INTEGER,
    },
    lettreMotivation_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    lettreRecommandation: {
      type: DataTypes.BLOB('medium'),
    },
    lettreRecommandation_filename: {
      type: DataTypes.STRING(255),
    },
    lettreRecommandation_size: {
      type: DataTypes.INTEGER,
    },
    lettreRecommandation_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    dureeStage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'En mois — durée effective du stage (mise à jour avec la durée accordée lors de l\'acceptation)',
    },
    dureeStageSouhaitee: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'En mois — durée initialement demandée par le candidat à la création, conservée même après acceptation',
    },
    dateDebutSouhaitee: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    dateDebutEffective: {
      type: DataTypes.DATEONLY,
    },
    dateFinEffective: {
      type: DataTypes.DATEONLY,
    },
    statusStage: {
      type: DataTypes.ENUM('EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS', 'ACCEPTE', 'REJETE', 'EN_COURS', 'TERMINE', 'EXPIRE', 'RAPPORT_SOUMIS', 'SUSPENDU', 'ANNULE'),
      defaultValue: 'EN_ATTENTE',
    },
    motifRefus: {
      type: DataTypes.TEXT,
    },
    documentsRejetes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Liste JSON des clés de documents non conformes signalées lors d\'un rejet (ex: ["cv","dernierDiplome"]) — le candidat doit les remplacer avant de resoumettre',
    },
    estRenouvellement: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastmodifiedDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'stage',
    timestamps: false,
  });

  return Stage;
};
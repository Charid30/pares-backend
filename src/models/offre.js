// src/models/offre.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Offre = sequelize.define('offres', {
    idoffres: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    creePar: {
      type: DataTypes.ENUM('ADMIN', 'CANDIDAT'),
      allowNull: false,
    },
    candidats_idcandidats: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    agents_idagents: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    typeOffre: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    titre: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
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
    demandeOffre: {
      type: DataTypes.BLOB('medium'),
    },
    demandeOffre_filename: {
      type: DataTypes.STRING(255),
    },
    demandeOffre_size: {
      type: DataTypes.INTEGER,
    },
    demandeOffre_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    conditionsRequises: {
      type: DataTypes.TEXT,
    },
    documentsRequis: {
      type: DataTypes.JSON,
    },
    dateDebut: {
      type: DataTypes.DATEONLY,
    },
    dateFin: {
      type: DataTypes.DATEONLY,
    },
    nombreCandidaturesMax: {
      type: DataTypes.INTEGER,
    },
    nombreCandidaturesActuelles: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    statusOffre: {
      type: DataTypes.ENUM('BROUILLON', 'EN_ATTENTE', 'EN_TRAITEMENT', 'VALIDEE', 'REJETEE', 'ACTIVE', 'CLOTUREE'),
      defaultValue: 'EN_ATTENTE',
    },
    motifRefus: {
      type: DataTypes.TEXT,
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastModifiedDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    direction_iddirection: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'offres',
    timestamps: false,
    validate: {
      checkCreateur() {
        if (this.creePar === 'CANDIDAT' && !this.candidats_idcandidats) {
          throw new Error('Une offre créée par un candidat doit avoir candidats_idcandidats');
        }
        if (this.creePar === 'ADMIN' && !this.agents_idagents) {
          throw new Error('Une offre créée par un admin doit avoir agents_idagents');
        }
      }
    }
  });

  return Offre;
};
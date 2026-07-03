// src/models/aide.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Aide = sequelize.define('aides', {
    idaide: {
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
    typeAide: {
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
    demandeAide: {
      type: DataTypes.BLOB('medium'),
    },
    demandeAide_filename: {
      type: DataTypes.STRING(255),
    },
    demandeAide_size: {
      type: DataTypes.INTEGER,
    },
    demandeAide_path: {
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
    nombreBeneficiairesMax: {
      type: DataTypes.INTEGER,
    },
    nombreBeneficiairesActuels: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    statusAide: {
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
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'aides',
    timestamps: false,
    validate: {
      checkCreateur() {
        if (this.creePar === 'CANDIDAT' && !this.candidats_idcandidats) {
          throw new Error('Une aide créée par un candidat doit avoir candidats_idcandidats');
        }
        if (this.creePar === 'ADMIN' && !this.agents_idagents) {
          throw new Error('Une aide créée par un admin doit avoir agents_idagents');
        }
      }
    }
  });

  return Aide;
};
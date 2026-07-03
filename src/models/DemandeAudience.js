// src/models/DemandeAudience.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DemandeAudience = sequelize.define('demande_audience', {
    iddemande: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    candidats_idcandidats: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    modeSoumission: {
      type: DataTypes.ENUM('FICHIER', 'FORMULAIRE'),
      allowNull: false,
    },

    // ── Mode FICHIER ──────────────────────────────────────────
    fichier: {
      type: DataTypes.BLOB('medium'),
      allowNull: true,
    },
    fichier_filename: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    fichier_size: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    fichier_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },

    // ── Mode FORMULAIRE (fiche message) ───────────────────────
    pourM: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Nom du responsable SONABHY destinataire',
    },
    pendant: {
      type: DataTypes.ENUM('ABSENCE', 'PRESENCE'),
      allowNull: true,
    },
    contact: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    actionCochee: {
      type: DataTypes.ENUM('A_TELEPHONER', 'EST_PASSE', 'RAPPELLERA', 'DEMANDE_RAPPEL', 'VEUT_VOIR', 'URGENT'),
      allowNull: true,
      comment: 'Action sélectionnée (radio unique)',
    },
    motif: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // ── Affectation administrative ────────────────────────────
    direction_iddirection: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: 'Direction SONABHY à laquelle la demande est affectée (admin)',
    },

    // ── Commun aux deux modes ─────────────────────────────────
    dateAudience: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    heureAudience: {
      type: DataTypes.TIME,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('EN_ATTENTE', 'ACCEPTE', 'REJETE', 'ANNULE'),
      allowNull: false,
      defaultValue: 'EN_ATTENTE',
    },
    commentaireAdmin: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Commentaire laissé par l\'administrateur lors du traitement',
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
    tableName: 'demande_audience',
    timestamps: false,
    validate: {
      checkModeSoumission() {
        if (this.modeSoumission === 'FICHIER' && !this.fichier_filename) {
          throw new Error('Un fichier est requis pour le mode FICHIER');
        }
        if (this.modeSoumission === 'FORMULAIRE' && !this.pourM) {
          throw new Error('Le destinataire (Pour M.) est requis pour le mode FORMULAIRE');
        }
      },
    },
  });

  return DemandeAudience;
};

// src/models/candidat.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Candidat = sequelize.define('candidats', {
    idcandidats: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    users_idusers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    nom: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    prenom: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    genre: {
      type: DataTypes.ENUM('HOMME', 'FEMME'),
      allowNull: true,
      defaultValue: null,
      comment: 'Genre du candidat — NULL = non renseigné (ancien compte)',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    telephone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    nip: {
      type: DataTypes.CHAR(17),
      allowNull: true, // NULL pour les candidats antérieurs à l'ajout du champ
      unique: true,
      comment: 'Numéro NIP — 17 chiffres de la CNIB',
    },
    ifu: {
      type: DataTypes.CHAR(9),
      allowNull: true,
      unique: true,
      comment: 'Identifiant Financier Unique — 8 chiffres + 1 lettre',
    },
    recipisse: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Numéro de récépissé — alternative à l\'IFU pour les structures non immatriculées',
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastmodifiedDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    deletedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'candidats',
    timestamps: false,
  });

  return Candidat;
};
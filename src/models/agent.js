// src/models/agent.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Agent = sequelize.define('agents', {
    idagents: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    service_idservice: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    direction_iddirection: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    nom: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    prenom: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    matricule: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    createdBy: {
      type: DataTypes.STRING(255),
    },
    lastModifiedBy: {
      type: DataTypes.STRING(255),
    },
    lastModifiedDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    deletedBy: {
      type: DataTypes.STRING(255),
    },
    deletedDate: {
      type: DataTypes.DATE,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
    actif: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Compte désactivé temporairement par un admin (distinct de la suppression) — bloque la connexion',
    },
  }, {
    tableName: 'agents',
    timestamps: false,
  });

  return Agent;
};
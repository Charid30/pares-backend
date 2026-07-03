// src/models/CandidatOffre.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CandidatOffre = sequelize.define('candidats_offres', {
    candidats_idcandidats: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    offres_idoffres: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
  }, {
    tableName: 'candidats_offres',
    timestamps: false,
  });

  return CandidatOffre;
};
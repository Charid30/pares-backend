// src/models/RateLimitEntry.js
// Stocke les compteurs de rate-limiting en base de données.
// Remplace le store mémoire (volatile au redémarrage) d'express-rate-limit.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RateLimitEntry = sequelize.define('rate_limit_entries', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    hits: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    reset_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: 'rate_limit_entries',
    timestamps: false,
    indexes: [
      { fields: ['reset_time'] },
    ],
  });

  return RateLimitEntry;
};

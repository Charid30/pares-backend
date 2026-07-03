// src/models/directionService.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DirectionService = sequelize.define('direction_service', {
    direction_iddirection: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    service_idservice: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
  }, {
    tableName: 'direction_service',
    timestamps: false,
  });

  return DirectionService;
};
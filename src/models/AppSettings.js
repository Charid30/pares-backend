// src/models/AppSettings.js
// Table unique stockant les paramètres de l'application en JSON
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AppSettings = sequelize.define('app_settings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    updatedBy: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  }, {
    tableName: 'app_settings',
    timestamps: true, // createdAt / updatedAt auto
  });

  return AppSettings;
};

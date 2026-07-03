// src/models/direction.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Direction = sequelize.define('direction', {
    iddirection: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nom: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    accronyme: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING(255),
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
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
  }, {
    tableName: 'direction',
    timestamps: false,
  });

  return Direction;
};
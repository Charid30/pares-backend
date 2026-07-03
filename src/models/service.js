// src/models/service.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Service = sequelize.define('service', {
    idservice: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accronyme: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    createdDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    createdBy: {
      type: DataTypes.STRING(255),
    },
    lastmodifiedDate: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    lastmodifiedBy: {
      type: DataTypes.STRING(255),
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
    tableName: 'service',
    timestamps: false,
  });

  return Service;
};
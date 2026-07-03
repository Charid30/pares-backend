// src/models/permission.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Permission = sequelize.define('permissions', {
    idpermission: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    role_idrole: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    module: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
  }, {
    tableName: 'permissions',
    timestamps: false,
  });

  return Permission;
};
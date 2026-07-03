// src/models/userAgent.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserAgent = sequelize.define('users_agents', {
    users_idusers: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    agents_idagents: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
  }, {
    tableName: 'users_agents',
    timestamps: false,
  });

  return UserAgent;
};
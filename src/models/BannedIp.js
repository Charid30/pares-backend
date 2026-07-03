// src/models/BannedIp.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BannedIp = sequelize.define('banned_ip', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: false,
    unique: true,
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  last_pattern: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  banned_until: {
    type: DataTypes.DATE,
    allowNull: true, // null = suspect mais pas encore banni
  },
}, {
  timestamps: true,
  tableName: 'banned_ips',
  indexes: [
    { fields: ['ip_address'] },
    { fields: ['banned_until'] },
  ],
});

module.exports = BannedIp;

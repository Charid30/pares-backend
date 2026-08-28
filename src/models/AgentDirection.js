// src/models/AgentDirection.js — table de jointure agents ↔ directions (N:M)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('agents_directions', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    agent_idagents: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    direction_iddirection: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  }, {
    tableName: 'agents_directions',
    timestamps: false,
  });
};

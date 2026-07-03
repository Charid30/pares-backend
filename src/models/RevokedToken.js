// src/models/RevokedToken.js
// Stocke les hashes SHA-256 des tokens JWT révoqués (déconnexion explicite).
// Persiste les révocations même après redémarrage du serveur.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RevokedToken = sequelize.define('revoked_tokens', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    token_hash: {
      type: DataTypes.STRING(64), // SHA-256 hex = 64 chars
      allowNull: false,
      unique: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: 'revoked_tokens',
    timestamps: false,
  });

  return RevokedToken;
};

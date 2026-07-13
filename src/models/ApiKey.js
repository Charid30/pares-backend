// src/models/ApiKey.js
// Clés API pour la communication avec des applications externes.
// La clé en clair n'est JAMAIS stockée : seul son hash SHA-256 est conservé.
// Le préfixe (pares_xxxxxxxx) est gardé en clair pour identification dans l'UI admin.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApiKey = sequelize.define('api_key', {
    idapikey: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    nomApplication: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    keyHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    keyPrefix: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },
    // LECTURE = GET uniquement | ECRITURE = POST/PUT/DELETE uniquement | LECTURE_ECRITURE = tout
    scope: {
      type: DataTypes.ENUM('LECTURE', 'ECRITURE', 'LECTURE_ECRITURE'),
      allowNull: false,
      defaultValue: 'LECTURE',
    },
    actif: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true, // null = pas d'expiration
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdBy: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    del: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
    },
  }, {
    tableName: 'api_keys',
    timestamps: true,
    indexes: [
      { fields: ['keyHash'] },
      { fields: ['actif'] },
    ],
  });

  return ApiKey;
};

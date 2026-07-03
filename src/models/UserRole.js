// src/models/UserRole.js
// Table de liaison users_roles : rôles ADDITIONNELS d'un utilisateur.
// Le rôle principal reste porté par users.role_idrole.
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserRole = sequelize.define('users_roles', {
    users_idusers: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
    role_idrole: {
      type: DataTypes.INTEGER,
      primaryKey: true,
    },
  }, {
    tableName: 'users_roles',
    timestamps: false,
  });

  return UserRole;
};

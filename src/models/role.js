// src/models/role.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Role = sequelize.define('role', {
    idrole: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accronyme: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
    lectureGlobale: {
      // Rôle "sous-admin" : lecture seule, mais sans filtrage par direction sur
      // les modules où il a la permission Consulter. Forcé à n'avoir aucune
      // permission d'action (Créer/Modifier/Approuver/Valider) côté UI et service.
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  }, {
    tableName: 'role',
    timestamps: false,
  });

  return Role;
};
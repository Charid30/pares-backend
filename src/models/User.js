// src/models/user.js
const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('users', {
    idusers: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role_idrole: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    del: {
      type: DataTypes.TINYINT,
      defaultValue: 0,
    },
    lastUsernameChange: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
      comment: 'Date de la dernière modification du nom d\'utilisateur (cooldown 25 jours)',
    },
  }, {
    tableName: 'users',
    timestamps: false,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
    },
  });

  // Méthode pour comparer les mots de passe
  User.prototype.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  };

  // Masquer le mot de passe dans les réponses JSON
  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.password;
    return values;
  };

  return User;
};
// src/utils/jwt.util.js
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Générer un token JWT
 * @param {object} payload
 * @param {string} [expiresIn] - Durée optionnelle (ex: '24h'). Utilise JWT_EXPIRES_IN par défaut.
 */
const generateToken = (payload, expiresIn) => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: expiresIn || env.JWT_EXPIRES_IN,
  });
};

/**
 * Vérifier un token JWT
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Décoder un token sans vérification
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

module.exports = { generateToken, verifyToken, decodeToken };
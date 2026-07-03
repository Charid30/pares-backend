// src/config/env.js
// quiet: en test, on n'a pas besoin des messages "tip" de dotenv — surtout que
// Jest exécute ce require() une fois par fichier de test, ce qui les répète autant
// de fois qu'il y a de suites.
require('dotenv').config({ quiet: process.env.NODE_ENV === 'test' });

// JWT_SECRET obligatoire : arrêt immédiat si absent
if (!process.env.JWT_SECRET) {
  console.error('\x1b[31m%s\x1b[0m', 'ERREUR CRITIQUE : JWT_SECRET non défini. Ajoutez JWT_SECRET dans votre fichier .env et redémarrez.');
  process.exit(1);
}

module.exports = {
  // Configuration Serveur
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || 5000,

  // Configuration Base de données
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || 3306,
  DB_NAME: process.env.DB_NAME || 'pares_db',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',

  // Configuration JWT
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',

  // Configuration Application
  APP_NAME: process.env.APP_NAME || 'PARES',
  APP_URL: process.env.NODE_ENV === 'production'
    ? (process.env.PROD_APP_URL      || 'https://portail.sonabhy.bf')
    : (process.env.APP_URL           || 'http://localhost:5000'),

  FRONTEND_URL: process.env.NODE_ENV === 'production'
    ? (process.env.PROD_FRONTEND_URL || 'https://portail.sonabhy.bf')
    : (process.env.FRONTEND_URL      || 'http://localhost:4200'),
};
// src/config/logger.js
// Logger structuré (Winston) — remplace les console.error/console.log épars pour
// les erreurs serveur. Écrit en JSON dans des fichiers tournants (logs/) afin de
// pouvoir diagnostiquer un incident en prod sans dépendre d'un service externe.
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

const env = require('./env');

const logsDir = path.join(__dirname, '..', '..', 'logs');

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports = [
  // Toutes les erreurs (et seulement les erreurs), conservées 30 jours
  new winston.transports.DailyRotateFile({
    dirname: logsDir,
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxFiles: '30d',
    maxSize: '20m',
  }),
  // Tout le reste (info, warn, ...), conservé 14 jours — utile pour le contexte
  // autour d'une erreur (quelle requête juste avant, etc.)
  new winston.transports.DailyRotateFile({
    dirname: logsDir,
    filename: 'combined-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    maxSize: '20m',
  }),
];

// En dev, on garde aussi une sortie console lisible (pas de JSON brut dans le terminal)
if (env.NODE_ENV !== 'production') {
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, stack }) =>
        `${timestamp} ${level}: ${stack || message}`)
    ),
  }));
}

const logger = winston.createLogger({
  level: 'info',
  format: baseFormat,
  transports,
  // Évite que le process crash silencieusement si l'écriture d'un transport échoue
  exitOnError: false,
});

module.exports = logger;

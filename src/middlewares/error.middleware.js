// src/middlewares/error.middleware.js
const logger = require('../config/logger');

/**
 * Middleware de gestion des erreurs 404
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route non trouvée - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Middleware de gestion globale des erreurs
 */
const errorHandler = (err, req, res, next) => {
  // Erreurs multer (taille, type) → 400 explicite
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Le fichier est trop volumineux (maximum 5 Mo)' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ success: false, message: 'Champ de fichier inattendu' });
  }
  if (err.message && err.message.includes('fichiers PDF')) {
    return res.status(400).json({ success: false, message: err.message });
  }

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // Logger côté serveur uniquement, jamais renvoyé au client
  if (process.env.NODE_ENV !== 'test') {
    logger.error(err.message, {
      stack: err.stack,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      ip: req.ip,
      userId: req.user?.agentId || req.user?.candidatId || null,
    });
  }

  // Ne jamais exposer la stack trace au client
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Une erreur interne est survenue.' : err.message,
  });
};

module.exports = { notFound, errorHandler };
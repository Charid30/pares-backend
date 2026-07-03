// src/middlewares/validate.middleware.js

/**
 * Middleware de validation avec Joi
 * @param {Object} schema - Schéma Joi de validation
 * @returns {Function} Middleware Express
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors,
      });
    }

    // Remplacer req.body par les données validées
    req.body = value;
    next();
  };
};

module.exports = validate;
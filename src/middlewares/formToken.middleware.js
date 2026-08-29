const { consume } = require('../utils/formTokenStore');

module.exports = (req, res, next) => {
  const token = req.body?.formToken;
  if (!consume(token)) {
    return res.status(403).json({
      success: false,
      message: 'Token de formulaire invalide ou expiré. Veuillez recharger la page.'
    });
  }
  next();
};

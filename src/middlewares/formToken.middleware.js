// src/middlewares/formToken.middleware.js
// Jeton de formulaire d'inscription (voir utils/formTokenStore). Placé APRÈS la validation des données : une
// erreur de saisie ne consomme pas le jeton, le candidat corrige et renvoie sans recharger la page.
const { verifier, consommer } = require('../utils/formTokenStore');

const MESSAGES = {
  ABSENT:       'Formulaire incomplet. Veuillez recharger la page.',
  INCONNU:      'Le formulaire a expiré. Veuillez réessayer.',
  EXPIRE:       'Le formulaire a expiré. Veuillez réessayer.',
  AUTRE_CLIENT: 'Le formulaire n\'a pas été ouvert depuis ce navigateur. Veuillez recharger la page.',
  TROP_RAPIDE:  'Envoi trop rapide. Veuillez patienter quelques secondes puis réessayer.',
};

module.exports = (req, res, next) => {
  const token = req.body?.formToken;
  const resultat = verifier(token, { ip: req.ip, userAgent: req.get('user-agent') });
  if (!resultat.ok) {
    return res.status(403).json({
      success: false,
      code: `FORM_TOKEN_${resultat.raison}`,
      message: MESSAGES[resultat.raison],
      ...(resultat.attenteSecondes ? { retryAfter: resultat.attenteSecondes } : {}),
    });
  }
  consommer(token);
  next();
};

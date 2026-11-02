// src/middlewares/turnstile.middleware.js
// Captcha Cloudflare Turnstile de l'inscription : le serveur fait vérifier le jeton du widget par Cloudflare, donc un
// appel direct à l'API sans passer par la page est refusé. Inactif tant que les deux clés ne sont pas dans le .env.
// Placé APRÈS le jeton de formulaire : le jeton Turnstile est à usage unique, il n'est dépensé que si tout le reste
// est accepté et le renvoi automatique du formulaire peut le réutiliser.
// Si Cloudflare est injoignable, l'inscription passe (panne journalisée) : une panne ne doit pas bloquer les candidats.
const env = require('../config/env');

const URL_VERIFICATION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const DELAI_MAX_MS = 5000;
// Ces codes viennent de notre configuration ou de Cloudflare, pas du candidat
const ERREURS_HORS_CANDIDAT = ['missing-input-secret', 'invalid-input-secret', 'internal-error'];

const MESSAGE_REFUS = 'La vérification anti-robot a échoué. Veuillez la refaire puis renvoyer le formulaire.';

const turnstileActif = () => Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

/** Clé publique transmise au formulaire avec le jeton de formulaire ; null = pas de widget. */
const cleSiteTurnstile = () => (turnstileActif() ? env.TURNSTILE_SITE_KEY : null);

const refuser = (res) => res.status(403).json({ success: false, code: 'TURNSTILE_REFUSE', message: MESSAGE_REFUS });

const verifierTurnstile = async (req, res, next) => {
  if (!turnstileActif()) return next();

  const jeton = req.body?.turnstileToken;
  if (!jeton) return refuser(res);

  let resultat;
  try {
    const reponse = await fetch(URL_VERIFICATION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: jeton, remoteip: req.ip }),
      signal: AbortSignal.timeout(DELAI_MAX_MS),
    });
    resultat = await reponse.json();
  } catch (erreur) {
    console.error(`[Turnstile] Cloudflare injoignable, inscription laissée passer : ${erreur.message}`);
    return next();
  }

  if (resultat.success) return next();

  const codes = resultat['error-codes'] || [];
  if (codes.some((code) => ERREURS_HORS_CANDIDAT.includes(code))) {
    console.error(`[Turnstile] Vérification impossible, inscription laissée passer : ${codes.join(', ')}`);
    return next();
  }
  return refuser(res);
};

module.exports = verifierTurnstile;
module.exports.cleSiteTurnstile = cleSiteTurnstile;

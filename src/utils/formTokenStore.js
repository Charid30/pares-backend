// src/utils/formTokenStore.js
// Jeton de formulaire d'inscription (anti-robot) : à usage unique, valable 15 min, lié au client (IP + navigateur)
// qui l'a demandé, et refusé si le formulaire revient trop vite (un script envoie instantanément ; un humain met
// plusieurs dizaines de secondes à remplir le formulaire en plusieurs étapes).
const crypto = require('crypto');

const TOKEN_TTL_MS = 15 * 60 * 1000;      // 15 minutes
const DELAI_MINIMUM_MS = 15 * 1000;       // envoi refusé moins de 15 s après l'obtention du jeton
const store = new Map(); // token -> { expiresAt, emisLe, client }

// Nettoyage des tokens expirés toutes les minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, { expiresAt }] of store) {
    if (now > expiresAt) store.delete(token);
  }
}, 60 * 1000).unref();

/** Empreinte du client : adresse IP + navigateur (pas de donnée personnelle stockée en clair). */
const empreinte = ({ ip, userAgent } = {}) =>
  crypto.createHash('sha256').update(`${ip || ''}|${userAgent || ''}`).digest('hex');

function generate(client) {
  const token = crypto.randomBytes(32).toString('hex');
  const maintenant = Date.now();
  store.set(token, { expiresAt: maintenant + TOKEN_TTL_MS, emisLe: maintenant, client: empreinte(client) });
  return token;
}

/**
 * Vérifie le jeton sans le consommer.
 * @returns {{ ok: true } | { ok: false, raison: 'ABSENT'|'INCONNU'|'EXPIRE'|'AUTRE_CLIENT'|'TROP_RAPIDE', attenteSecondes?: number }}
 */
function verifier(token, client) {
  if (!token) return { ok: false, raison: 'ABSENT' };
  const entree = store.get(token);
  if (!entree) return { ok: false, raison: 'INCONNU' };                 // inconnu ou déjà utilisé
  const maintenant = Date.now();
  if (maintenant > entree.expiresAt) {
    store.delete(token);
    return { ok: false, raison: 'EXPIRE' };
  }
  if (entree.client !== empreinte(client)) {
    store.delete(token);                                                 // jeton volé ou rejoué ailleurs
    return { ok: false, raison: 'AUTRE_CLIENT' };
  }
  const ecoule = maintenant - entree.emisLe;
  if (ecoule < DELAI_MINIMUM_MS) {                                       // le jeton reste valable : réessayer plus tard
    return { ok: false, raison: 'TROP_RAPIDE', attenteSecondes: Math.ceil((DELAI_MINIMUM_MS - ecoule) / 1000) };
  }
  return { ok: true };
}

/** Consomme le jeton (usage unique) après une vérification réussie. */
function consommer(token) {
  store.delete(token);
}

module.exports = { generate, verifier, consommer, TOKEN_TTL_MS, DELAI_MINIMUM_MS };

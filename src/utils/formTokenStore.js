const crypto = require('crypto');

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const store = new Map(); // token -> expiresAt

// Nettoyage des tokens expirés toutes les minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of store) {
    if (now > expiresAt) store.delete(token);
  }
}, 60 * 1000);

function generate() {
  const token = crypto.randomBytes(32).toString('hex');
  store.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function consume(token) {
  if (!token) return false;
  const expiresAt = store.get(token);
  if (!expiresAt) return false;       // inconnu ou déjà utilisé
  if (Date.now() > expiresAt) {       // expiré
    store.delete(token);
    return false;
  }
  store.delete(token);                // one-time : consommé
  return true;
}

module.exports = { generate, consume };

// src/utils/tokenBlacklist.js
// Blacklist persistante en base de données (table revoked_tokens).
// Stocke un hash SHA-256 du token (jamais le token brut).
// Couche mémoire en plus : les tokens récemment révoqués restent bloqués même si la DB est down.
const crypto = require('crypto');
const { Op } = require('sequelize');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// ── Cache mémoire ─────────────────────────────────────────────────────────────
// Map<tokenHash, expiryTimestamp> — filet de sécurité si la DB est indisponible
const memoryCache = new Map();

// Nettoyage périodique du cache mémoire (toutes les 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [hash, expiry] of memoryCache.entries()) {
    if (expiry < now) memoryCache.delete(hash);
  }
}, 10 * 60 * 1000).unref(); // .unref() pour ne pas bloquer la fermeture du process

// ── Helpers ───────────────────────────────────────────────────────────────────
const getTokenExpiry = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return new Date(Date.now() + 3600000);
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 3600000);
  } catch {
    return new Date(Date.now() + 3600000); // fallback 1h
  }
};

// ── addToBlacklist ────────────────────────────────────────────────────────────
// Écrit dans le cache mémoire EN PREMIER (protection immédiate),
// puis persiste en DB (fire-and-forget non bloquant).
const addToBlacklist = async (token) => {
  const tokenHash = hashToken(token);
  const expiresAt = getTokenExpiry(token);

  // 1) Mémoire — immédiat, résistant aux pannes DB
  memoryCache.set(tokenHash, expiresAt.getTime());

  // 2) DB — persistance entre redémarrages (best-effort)
  try {
    const { RevokedToken } = require('../models');
    await RevokedToken.upsert({ token_hash: tokenHash, expires_at: expiresAt });
    // Nettoyage des tokens expirés (fire-and-forget)
    RevokedToken.destroy({ where: { expires_at: { [Op.lt]: new Date() } } }).catch(() => {});
  } catch (err) {
    // DB down : le cache mémoire garantit quand même le blocage
    console.error('❌ Erreur blacklist token (DB) — token bloqué en mémoire :', err.message);
  }
};

// ── isBlacklisted ─────────────────────────────────────────────────────────────
// Vérifie mémoire d'abord (rapide), puis DB.
// Si la DB est down, seuls les tokens présents en mémoire sont bloqués.
// Les tokens non vus depuis le démarrage du serveur ne sont pas en mémoire,
// mais ils sont rares (redémarrage serveur ≠ déconnexion active).
const isBlacklisted = async (token) => {
  const tokenHash = hashToken(token);

  // 1) Vérification mémoire (fast-path + fallback DB-down)
  const memExpiry = memoryCache.get(tokenHash);
  if (memExpiry !== undefined) {
    if (memExpiry > Date.now()) return true;
    memoryCache.delete(tokenHash); // expiré → nettoyer
  }

  // 2) Vérification DB (source de vérité)
  try {
    const { RevokedToken } = require('../models');
    const found = await RevokedToken.findOne({
      where: { token_hash: tokenHash, expires_at: { [Op.gt]: new Date() } },
      attributes: ['id', 'expires_at'],
    });
    if (found) {
      // Synchroniser en mémoire pour les prochains checks
      memoryCache.set(tokenHash, new Date(found.expires_at).getTime());
      return true;
    }
    return false;
  } catch (err) {
    // DB down : on se fie uniquement au cache mémoire
    console.error('❌ Erreur vérification blacklist (DB) — fallback mémoire :', err.message);
    return false; // fail-open uniquement pour les tokens inconnus du cache mémoire
  }
};

module.exports = { addToBlacklist, isBlacklisted };

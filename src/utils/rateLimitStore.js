// src/utils/rateLimitStore.js
// Store MySQL pour express-rate-limit — remplace le store en mémoire (volatile).
// Chaque compteur est identifié par la clé IP/route et expire après windowMs.
const { Op } = require('sequelize');

class MySQLRateLimitStore {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000;
    // Nettoyage périodique des entrées expirées (toutes les 10 min)
    setInterval(() => this._cleanup(), 10 * 60 * 1000).unref();
  }

  // Appelé par express-rate-limit lors de l'initialisation du middleware
  init(options) {
    if (options.windowMs) this.windowMs = options.windowMs;
  }

  async increment(key) {
    const { RateLimitEntry } = require('../models');
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);

    try {
      // Tenter d'insérer une nouvelle entrée
      const [entry, created] = await RateLimitEntry.findOrCreate({
        where: { key },
        defaults: { key, hits: 1, reset_time: resetTime },
      });

      if (!created) {
        if (entry.reset_time <= now) {
          // Fenêtre expirée → réinitialiser le compteur
          await entry.update({ hits: 1, reset_time: resetTime });
          return { totalHits: 1, resetTime };
        }
        // Incrémenter le compteur
        await entry.increment('hits');
        await entry.reload();
        return { totalHits: entry.hits, resetTime: entry.reset_time };
      }

      return { totalHits: 1, resetTime };
    } catch (err) {
      // En cas d'erreur DB, autoriser la requête (fail-open pour éviter un lock-out)
      console.error('❌ RateLimitStore.increment:', err.message);
      return { totalHits: 1, resetTime };
    }
  }

  async decrement(key) {
    try {
      const { RateLimitEntry } = require('../models');
      await RateLimitEntry.decrement('hits', { where: { key, hits: { [Op.gt]: 0 } } });
    } catch (err) {
      console.error('❌ RateLimitStore.decrement:', err.message);
    }
  }

  async resetKey(key) {
    try {
      const { RateLimitEntry } = require('../models');
      await RateLimitEntry.destroy({ where: { key } });
    } catch (err) {
      console.error('❌ RateLimitStore.resetKey:', err.message);
    }
  }

  async _cleanup() {
    try {
      const { RateLimitEntry } = require('../models');
      await RateLimitEntry.destroy({ where: { reset_time: { [Op.lt]: new Date() } } });
    } catch (err) {
      // silencieux — nettoyage best-effort
    }
  }
}

module.exports = MySQLRateLimitStore;

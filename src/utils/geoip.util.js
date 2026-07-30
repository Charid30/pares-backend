// src/utils/geoip.util.js
// Géolocalisation d'IP à partir d'une base locale (aucun appel réseau externe) —
// fonctionne même si le pare-feu bloque les connexions sortantes vers des API tierces.
const geoip = require('geoip-lite');

// Noms de pays lisibles pour les codes ISO les plus fréquents (extensible au besoin)
const COUNTRY_NAMES = {
  BF: 'Burkina Faso', FR: 'France', US: 'États-Unis', GB: 'Royaume-Uni',
  DE: 'Allemagne', CI: 'Côte d\'Ivoire', SN: 'Sénégal', ML: 'Mali',
  NE: 'Niger', TG: 'Togo', BJ: 'Bénin', GH: 'Ghana', NG: 'Nigeria',
  CN: 'Chine', RU: 'Russie', IN: 'Inde', BR: 'Brésil', CA: 'Canada',
  NL: 'Pays-Bas', SG: 'Singapour', VN: 'Vietnam', UA: 'Ukraine',
};

/**
 * Résout les infos de géolocalisation d'une IP (pays, ville, coordonnées).
 * Retourne null pour les IP locales/privées (127.0.0.1, 192.168.x.x, ::1...)
 * ou si l'IP est absente de la base.
 */
const locateIp = (ip) => {
  if (!ip || ip === 'unknown') return null;

  // Normaliser les IPv4 mappées en IPv6 (ex: ::ffff:192.168.1.1)
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  const result = geoip.lookup(cleanIp);
  if (!result) return null;

  return {
    country: result.country || null,
    countryName: COUNTRY_NAMES[result.country] || result.country || null,
    region: result.region || null,
    city: result.city || null,
    ll: result.ll || null, // [latitude, longitude]
  };
};

module.exports = { locateIp };

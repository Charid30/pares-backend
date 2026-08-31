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
// Extrait un libellé de région à partir du fuseau horaire quand le pays est absent
// ex: "America/New_York" → "Amérique", "Europe/Paris" → "Europe", etc.
const TIMEZONE_REGION = {
  Africa: 'Afrique', America: 'Amérique', Antarctica: 'Antarctique',
  Arctic: 'Arctique', Asia: 'Asie', Atlantic: 'Atlantique',
  Australia: 'Australie/Pacifique', Europe: 'Europe', Indian: 'Océan Indien',
  Pacific: 'Pacifique',
};

const regionFromTimezone = (tz) => {
  if (!tz) return null;
  const continent = tz.split('/')[0];
  return TIMEZONE_REGION[continent] || null;
};

const locateIp = (ip) => {
  if (!ip || ip === 'unknown') return null;

  // Normaliser les IPv4 mappées en IPv6 (ex: ::ffff:192.168.1.1)
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  const result = geoip.lookup(cleanIp);
  if (!result) return null;

  const country = result.country || null;
  return {
    country,
    countryName: country ? (COUNTRY_NAMES[country] || country) : null,
    region: result.region || null,
    city: result.city || null,
    ll: result.ll || null,
    // Fuseau horaire utilisé comme repli quand le pays est absent (IPs cloud/datacenter)
    timezoneRegion: !country ? regionFromTimezone(result.timezone) : null,
  };
};

module.exports = { locateIp };

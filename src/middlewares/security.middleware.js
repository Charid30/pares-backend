// src/middlewares/security.middleware.js
// Détecte les tentatives d'injection (SQL, XSS, path traversal, commandes)
// et bannit l'IP pour 72h après 5 tentatives.

const BannedIp = require('../models/BannedIp');
const AuditLog = require('../models/AuditLog');

const BAN_THRESHOLD = 2;
const BAN_DURATION_MS = 72 * 60 * 60 * 1000; // 72 heures

// Patterns d'injection à détecter
const INJECTION_PATTERNS = [
  // SQL injection
  { regex: /(\bUNION\b.+\bSELECT\b|\bSELECT\b.+\bFROM\b|\bINSERT\b.+\bINTO\b|\bDROP\b.+\b(TABLE|DATABASE)\b|\bDELETE\b.+\bFROM\b|\bUPDATE\b.+\bSET\b)/i, label: 'SQL_KEYWORD' },
  { regex: /('|")\s*(OR|AND)\s*('|"|\d)/i,                                                                                                                     label: 'SQL_OR_AND' },
  { regex: /(--|#|\/\*|\*\/)\s*(DROP|SELECT|INSERT|UPDATE|DELETE|UNION)/i,                                                                                      label: 'SQL_COMMENT' },
  { regex: /;\s*(DROP|SELECT|INSERT|UPDATE|DELETE|EXEC|EXECUTE)\b/i,                                                                                            label: 'SQL_STACKED' },
  { regex: /\b(xp_cmdshell|sp_executesql|EXEC\s*\(|EXECUTE\s*\(|CAST\s*\(|CONVERT\s*\()\b/i,                                                                  label: 'SQL_FUNC' },
  { regex: /'\s*=\s*'|1\s*=\s*1|1\s*=\s*'1/i,                                                                                                                 label: 'SQL_TAUTOLOGY' },

  // XSS
  { regex: /<\s*script[\s>]/i,          label: 'XSS_SCRIPT' },
  { regex: /javascript\s*:/i,           label: 'XSS_JAVASCRIPT' },
  { regex: /on(error|load|click|mouseover|focus|blur|submit|input|change)\s*=/i, label: 'XSS_EVENT' },
  { regex: /<\s*(iframe|object|embed|applet|form)[^>]*>/i,                        label: 'XSS_TAG' },
  { regex: /document\.(cookie|write|location)|window\.location/i,                label: 'XSS_DOM' },
  { regex: /eval\s*\(|setTimeout\s*\(|setInterval\s*\(/i,                        label: 'XSS_EVAL' },

  // Path traversal
  { regex: /(\.\.[\/\\]){2,}/,                  label: 'PATH_TRAVERSAL' },
  { regex: /%2e%2e[%2f%5c]/i,                   label: 'PATH_TRAVERSAL_ENCODED' },
  { regex: /\/(etc\/passwd|proc\/self|windows\/system32)/i, label: 'PATH_SENSITIVE' },

  // Injection de commandes
  { regex: /[;&|`]\s*(ls|cat|rm|wget|curl|bash|sh|python|perl|nc|ncat)\b/i, label: 'CMD_INJECTION' },
  { regex: /\$\((.*)\)|\`(.*)\`/,                                            label: 'CMD_SUBSHELL' },
];

// Extraire l'IP réelle — on utilise req.ip qu'Express résout via trust proxy
// (app.set('trust proxy', 1) dans app.js).
// Ne jamais lire x-forwarded-for directement : c'est contrôlable par l'attaquant.
function getIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Analyser récursivement un objet/chaîne pour détecter des patterns
function detectInValue(value) {
  if (typeof value === 'string') {
    for (const { regex, label } of INJECTION_PATTERNS) {
      if (regex.test(value)) return label;
    }
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      const found = detectInValue(v);
      if (found) return found;
    }
  }
  return null;
}

// Enregistrer la tentative en base (async, non bloquant)
async function recordAttempt(ip, pattern, req) {
  try {
    const [record, created] = await BannedIp.findOrCreate({
      where: { ip_address: ip },
      defaults: { attempts: 1, last_pattern: pattern, banned_until: null },
    });

    if (!created) {
      record.attempts += 1;
      record.last_pattern = pattern;

      if (record.attempts >= BAN_THRESHOLD) {
        record.banned_until = new Date(Date.now() + BAN_DURATION_MS);
      }

      await record.save();
    }

    await AuditLog.create({
      agent_id:   null,
      agent_nom:  null,
      action:     record.attempts >= BAN_THRESHOLD ? 'IP_BANNIE' : 'INJECTION_TENTATIVE',
      module:     'SECURITE',
      entity_id:  null,
      details: {
        ip,
        pattern,
        attempts:  record.attempts,
        path:      req.originalUrl,
        method:    req.method,
        bannedUntil: record.banned_until ?? null,
      },
      ip_address: ip,
    });
  } catch (err) {
    console.error('[Security] Erreur enregistrement tentative:', err.message);
  }
}

// Middleware principal
const securityMiddleware = async (req, res, next) => {
  const ip = getIp(req);

  // 1. Vérifier si l'IP est bannie
  try {
    const banned = await BannedIp.findOne({ where: { ip_address: ip } });
    if (banned?.banned_until && new Date(banned.banned_until) > new Date()) {
      const heuresRestantes = Math.ceil((new Date(banned.banned_until) - Date.now()) / 3600000);
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Votre adresse IP est bannie pour ${heuresRestantes}h suite à des tentatives d'attaque.`,
      });
    }
  } catch (err) {
    console.error('[Security] Erreur vérification ban:', err.message);
  }

  // 2. Analyser le contenu de la requête
  const sources = [req.body, req.params, req.query];
  for (const source of sources) {
    if (!source) continue;
    const pattern = detectInValue(source);
    if (pattern) {
      recordAttempt(ip, pattern, req); // async, ne bloque pas la réponse
      return res.status(400).json({
        success: false,
        message: 'Requête refusée : contenu suspect détecté.',
      });
    }
  }

  next();
};

module.exports = securityMiddleware;

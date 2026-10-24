// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middlewares/error.middleware');
const securityMiddleware = require('./middlewares/security.middleware');
const MySQLRateLimitStore = require('./utils/rateLimitStore');

// Créer l'application Express
const app = express();
const { version: APP_VERSION } = require('../package.json');

// Trust proxy : Express résout req.ip depuis X-Forwarded-For uniquement si
// la requête vient d'un vrai proxy (1 niveau). Sans ça, req.ip = IP du proxy,
// et le security middleware utilise X-Forwarded-For brut (spoofable).
app.set('trust proxy', 1);

// =====================================================
// RATE LIMITING
// =====================================================

// Chaque limiteur a son propre compteur (préfixe) dans le store MySQL commun — persiste les redémarrages.

// Limite générale : 300 requêtes par 15 minutes par IP (hors routes d'authentification)
const generalWindowMs = 15 * 60 * 1000;
const AUTH_ROUTES = ['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password'];

const generalLimiter = rateLimit({
  windowMs: generalWindowMs,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MySQLRateLimitStore({ windowMs: generalWindowMs, prefix: 'general:' }),
  skip: (req) => AUTH_ROUTES.some(r => req.path === r || req.originalUrl.startsWith(r)),
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer dans 15 minutes.'
  }
});

// Anti brute-force des routes d'authentification : un compteur par route et par IP, et seuls les
// ÉCHECS comptent (une connexion réussie ne consomme rien). Complète le verrouillage du compte
// après 5 mots de passe erronés (auth.service.js). En développement : limite élevée pour les tests.
const authWindowMs = 15 * 60 * 1000;
const limiteurAuth = (prefix, max, message) => rateLimit({
  windowMs: authWindowMs,
  max: env.NODE_ENV === 'development' ? 500 : max,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: new MySQLRateLimitStore({ windowMs: authWindowMs, prefix }),
  message: { success: false, message },
});
const loginLimiter = limiteurAuth('login:', 20, 'Trop de tentatives de connexion échouées depuis cette adresse, veuillez réessayer dans 15 minutes.');
const registerLimiter = limiteurAuth('register:', 10, "Trop de tentatives d'inscription, veuillez réessayer dans 15 minutes.");
const resetPasswordLimiter = limiteurAuth('reset:', 10, 'Trop de tentatives, veuillez réessayer dans 15 minutes.');

// Limite souple pour forgot-password : le cooldown de 240s métier est déjà en place,
// ce limiter sert uniquement d'anti-abus réseau (ex: scripts automatisés)
const forgotPasswordWindowMs = 60 * 60 * 1000; // 1 heure
const forgotPasswordLimiter = rateLimit({
  windowMs: forgotPasswordWindowMs,
  max: env.NODE_ENV === 'development' ? 500 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new MySQLRateLimitStore({ windowMs: forgotPasswordWindowMs, prefix: 'forgot:' }),
  message: {
    success: false,
    message: 'Trop de demandes de réinitialisation. Veuillez réessayer dans 1 heure.'
  }
});

// =====================================================
// CORS — origines autorisées uniquement
// =====================================================
const allowedOrigins = [
  'http://localhost:4200',           // Développement local Angular
  'http://localhost',                // Déployé sur XAMPP port 80
  'http://localhost:80',             // Déployé sur XAMPP port 80 (explicite)
  env.FRONTEND_URL,                  // URL principale (depuis .env)
  'https://portail.sonabhy.bf',      // Portail SONABHY
  'https://www.portail.sonabhy.bf',      // Portail SONABHY
  'http://192.168.1.66:4200',
].filter(Boolean);

// En développement : accepter tout le sous-réseau local (192.168.x.x / 172.x.x.x / 10.x.x.x)
const localNetworkRegex = /^http:\/\/(172\.20\.\d+\.\d+|172\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;

const corsOptions = {
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (Postman, apps mobiles natives).
    // Risque accepté : toute requête serveur-à-serveur ou curl peut contourner le CORS.
    // Atténué par l'authentification JWT obligatoire sur toutes les routes protégées.
    if (!origin) {
      return callback(null, true);
    }
    // Origines explicitement autorisées
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // En développement : autoriser tout le réseau local
    if (env.NODE_ENV === 'development' && localNetworkRegex.test(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origine non autorisée par CORS : ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Set-Cookie'],
};

// =====================================================
//                  MIDDLEWARES GLOBAUX
// =====================================================

// Sécurité HTTP headers (XSS, clickjacking, MIME sniffing, etc.)
// CSP personnalisé pour Angular (self uniquement — pas d'inline scripts en prod)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"], // Angular injecte des styles inline via ViewEncapsulation
      imgSrc:         ["'self'", "data:", "blob:"],  // data: pour avatars base64, blob: pour aperçus fichiers
      fontSrc:        ["'self'", "data:"],
      connectSrc:     ["'self'"],                    // Tous les appels API restent sur le même domaine
      objectSrc:      ["'none'"],                    // Interdit Flash/plugins (obsolète et dangereux)
      frameAncestors: ["'none'"],                    // Bloque le clickjacking (équivalent X-Frame-Options: DENY)
      baseUri:        ["'self'"],                    // Bloque les injections <base href>
      formAction:     ["'self'"],                    // Bloque les soumissions de formulaire vers des tiers
      upgradeInsecureRequests: [],                   // Force HTTPS en production
    },
  },
  // HSTS : forcer HTTPS pendant 1 an (navigateurs mémorisent)
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
  },
}));

// CORS restreint
app.use(cors(corsOptions));

// Limite taille des requêtes JSON (50kb suffit pour une API sans upload)
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));

// Sanitisation des inputs : supprime les clés contenant $ ou . (injection NoSQL/opérateurs)
// Express 5 : req.query est un getter en lecture seule → on sanitise body et params uniquement
app.use((req, res, next) => {
  if (req.body)   req.body   = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  next();
});

// Protection contre HTTP Parameter Pollution (ex: ?sort=asc&sort=desc)
app.use(hpp());

// Logging
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Appliquer le rate limiter général sur toutes les routes /api
app.use('/api', generalLimiter);

// Appliquer le rate limiter strict sur les routes d'authentification
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/auth/reset-password', resetPasswordLimiter);
// Limiter dédié pour forgot-password (plus souple — cooldown 240s déjà géré côté métier)
app.use('/api/auth/forgot-password', forgotPasswordLimiter);

// Route de test
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: `Bienvenue sur l'API ${env.APP_NAME}`,
    version: APP_VERSION,
    environment: env.NODE_ENV,
  });
});

// Détection d'injections + bannissement IP (72h après 5 tentatives)
app.use('/api', securityMiddleware);

// Routes API
app.use('/api', require('./routes'));

// Middleware 404
app.use(notFound);

// Middleware de gestion des erreurs
app.use(errorHandler);

module.exports = app;
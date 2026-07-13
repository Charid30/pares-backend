// src/routes/external.routes.js
// API externe v1 — consommée par des applications tierces via clé API.
// Authentification : header X-API-Key. Le scope de la clé détermine les droits :
//   LECTURE          → GET uniquement
//   ECRITURE         → POST/PUT/DELETE uniquement
//   LECTURE_ECRITURE → tout
const express = require('express');
const router = express.Router();
const externalController = require('../controllers/external.controller');
const { authenticateApiKey, checkScope } = require('../middlewares/apiKey.middleware');

// Toutes les routes externes exigent une clé API valide + scope adapté à la méthode
router.use(authenticateApiKey);
router.use(checkScope);

// ── Lecture ──────────────────────────────────────────────────
router.get('/v1/stages', externalController.getStages);
router.get('/v1/offres', externalController.getOffres);
router.get('/v1/aides', externalController.getAides);
router.get('/v1/audiences', externalController.getAudiences);
router.get('/v1/stats', externalController.getStats);

// ── Écriture ─────────────────────────────────────────────────
// Les endpoints d'écriture seront ajoutés ici selon les besoins des applications
// partenaires. Le middleware checkScope exige déjà le scope ECRITURE pour toute
// méthode POST/PUT/DELETE déclarée sous ce routeur.

module.exports = router;

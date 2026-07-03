// routes/candidat.routes.js - ADAPTÉ À VOTRE MIDDLEWARE
const express = require('express');
const router = express.Router();
const multer = require('multer');
const candidatController = require('../controllers/candidat.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Configuration multer pour les fichiers (max 1 Mo par fichier, PDF uniquement)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1 * 1024 * 1024, // 1 Mo max par fichier (appliqué individuellement)
  },
  fileFilter: (req, file, cb) => {
    // Accepter uniquement les fichiers PDF
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont autorisés'), false);
    }
  },
});

// Toutes ces routes nécessitent une authentification ET le rôle CANDIDAT
router.use(authenticate);
router.use(authorize('CANDIDAT'));

/**
 * GET /api/candidat/profil
 * Récupérer le profil complet du candidat
 */
router.get('/profil', candidatController.getProfil);

/**
 * PUT /api/candidat/profil
 * Mettre à jour le profil du candidat
 */
router.put('/profil', candidatController.updateProfil);

/**
 * GET /api/candidat/documents
 * Récupérer les documents du candidat (ancienne route)
 */
router.get('/documents', candidatController.getDocuments);

/**
 * POST /api/candidat/documents
 * Uploader un document
 */
router.post('/documents', candidatController.uploadDocument);

/**
 * GET /api/candidat/stages-rapports
 * Récupérer les stages avec leurs rapports et attestations
 */
router.get('/stages-rapports', candidatController.getStagesRapports);

/**
 * GET /api/candidat/attestations/:id/download
 * Télécharger une attestation de stage
 */
router.get('/attestations/:id/download', candidatController.downloadAttestation);

/**
 * GET /api/candidat/mes-demandes-stage
 * Récupérer les demandes de stage du candidat
 */
router.get('/mes-demandes-stage', candidatController.getMesDemandesStage);

/**
 * POST /api/candidat/demande-stage
 * Soumettre une demande de stage
 * Body: FormData avec typeStage, domaineStage, dureeStage, dateDebutSouhaitee, niveau
 * Files: cv, cnib, casierJudiciaire, lettreMotivation, lettreRecommandation (si soutenance), dernierDiplome (si perfectionnement)
 */
router.post(
  '/demande-stage',
  upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'cnib', maxCount: 1 },
    { name: 'casierJudiciaire', maxCount: 1 },
    { name: 'lettreMotivation', maxCount: 1 },
    { name: 'lettreRecommandation', maxCount: 1 },
    { name: 'dernierDiplome', maxCount: 1 },
  ]),
  candidatController.soumettreDemandeStage
);

/**
 * GET /api/candidat/stages/:id/rapport
 * Récupérer le rapport d'un stage
 */
router.get('/stages/:id/rapport', candidatController.getRapportStage);

/**
 * POST /api/candidat/stages/:id/rapport
 * Soumettre un rapport de stage
 * Body: FormData avec titreRapport, natureRapport (optionnel)
 * File: rapportPdf (PDF uniquement, max 5MB pour les rapports)
 */
const uploadRapport = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max pour les rapports
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont autorisés'), false);
    }
  },
});

router.post(
  '/stages/:id/rapport',
  uploadRapport.single('rapportPdf'),
  candidatController.soumettreRapportStage
);

/**
 * GET /api/candidat/stages/:id/convention-renouvellement
 * Récupérer les infos de convention pour le modal de renouvellement
 */
router.get('/stages/:id/convention-renouvellement', candidatController.getConventionPourRenouvellement);

/**
 * POST /api/candidat/stages/:id/renouvellement
 * Demander le renouvellement d'un stage (disponible 2 semaines avant la fin)
 * Body: FormData avec dureeDemandee + fichier lettreRenouvellement (PDF, max 5 Mo)
 */
router.post(
  '/stages/:id/renouvellement',
  uploadRapport.single('lettreRenouvellement'),
  candidatController.demanderRenouvellement
);

module.exports = router;
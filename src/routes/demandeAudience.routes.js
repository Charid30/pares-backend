// src/routes/demandeAudience.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const { authenticate, authorize, authorizeModule, authorizeAction } = require('../middlewares/auth.middleware');
const { validatePdfFiles } = require('../middlewares/validateFiles.middleware');
const demandeAudienceController = require('../controllers/demandeAudience.controller');

// Multer — stockage en mémoire, PDF uniquement, 5 Mo max
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 Mo
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
    }
  },
});

// ─────────────────────────────────────────────────────────────
// ROUTES CANDIDAT
// ─────────────────────────────────────────────────────────────

// POST /api/demandes-audience/candidat — soumettre une demande
router.post(
  '/candidat',
  authenticate,
  authorize(['CANDIDAT']),
  upload.single('fichier'),
  validatePdfFiles,
  demandeAudienceController.createDemande
);

// GET /api/demandes-audience/mes-demandes — lister ses demandes
router.get(
  '/mes-demandes',
  authenticate,
  authorize(['CANDIDAT']),
  demandeAudienceController.getMesDemandes
);

// PUT /api/demandes-audience/:id/annuler — annuler une demande
router.put(
  '/:id/annuler',
  authenticate,
  authorize(['CANDIDAT']),
  demandeAudienceController.annulerDemande
);

// ─────────────────────────────────────────────────────────────
// ROUTES ADMIN / AGENTS
// ─────────────────────────────────────────────────────────────

// GET /api/demandes-audience — toutes les demandes
router.get(
  '/',
  authenticate,
  authorizeModule('DEMANDE_AUDIENCE'),
  demandeAudienceController.getAllDemandes
);

// PUT /api/demandes-audience/:id — affecter une direction
// Requiert la permission MODIFIER sur DEMANDE_AUDIENCE (cohérent avec l'affectation des stages)
router.put(
  '/:id',
  authenticate,
  authorizeAction('DEMANDE_AUDIENCE', 'MODIFIER'),
  demandeAudienceController.updateDemande
);

// PUT /api/demandes-audience/:id/transferer — transférer vers une autre direction
router.put(
  '/:id/transferer',
  authenticate,
  authorizeAction('DEMANDE_AUDIENCE', 'TRANSFERER'),
  demandeAudienceController.transfererDemande
);

// PUT /api/demandes-audience/:id/statut — accepter ou rejeter
router.put(
  '/:id/statut',
  authenticate,
  authorizeModule('DEMANDE_AUDIENCE'),
  demandeAudienceController.updateStatut
);

// GET /api/demandes-audience/:id/fichier — télécharger le fichier joint
router.get(
  '/:id/fichier',
  authenticate,
  authorizeModule('DEMANDE_AUDIENCE'),
  demandeAudienceController.getFichier
);

// GET /api/demandes-audience/export — exporter en CSV
router.get(
  '/export',
  authenticate,
  authorizeModule('DEMANDE_AUDIENCE'),
  demandeAudienceController.exportAudiences
);

// GET /api/demandes-audience/export/pdf — rapport PDF avec statistiques
router.get(
  '/export/pdf',
  authenticate,
  authorizeModule('DEMANDE_AUDIENCE'),
  demandeAudienceController.exportAudiencesPDF
);

module.exports = router;

// src/routes/aide.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const aideController = require('../controllers/aide.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate, authorize, authorizeModule, authorizeAction } = require('../middlewares/auth.middleware');
const { validatePdfFiles } = require('../middlewares/validateFiles.middleware');
const {
  createAideCandidatSchema,
  createAideAdminSchema,
  updateAideSchema,
  evaluateAideSchema,
  createCandidatureAideSchema,
  evaluateCandidatureAideSchema,
} = require('../validators/aide.validator');

// Configuration de multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
    }
  },
});

// =====================================================
// ROUTES AIDES
// =====================================================

/**
 * @route   POST /api/aides/candidat
 * @desc    Créer une aide (par candidat)
 * @access  Private (CANDIDAT)
 */
router.post(
  '/candidat',
  authenticate,
  authorize(['CANDIDAT']),
  upload.fields([
    { name: 'cnib', maxCount: 1 },
    { name: 'demandeAide', maxCount: 1 },
  ]),
  validatePdfFiles,
  validate(createAideCandidatSchema),
  aideController.createAideByCandidat
);

/**
 * @route   POST /api/aides/admin
 * @desc    Créer une aide (par admin)
 * @access  Private (ADMIN ou permission AIDE)
 */
router.post(
  '/admin',
  authenticate,
  authorizeAction('AIDE', 'CREER'),
  validate(createAideAdminSchema),
  aideController.createAideByAdmin
);

/**
 * @route   GET /api/aides
 * @desc    Obtenir toutes les aides
 * @access  Private (ADMIN ou permission AIDE ou permission AIDE)
 */
router.get(
  '/',
  authenticate,
  authorizeModule('AIDE'),
  aideController.getAllAides
);

/**
 * @route   GET /api/aides/actives
 * @desc    Obtenir les aides actives (pour candidatures)
 * @access  Private (CANDIDAT)
 */
router.get(
  '/actives',
  authenticate,
  authorize(['CANDIDAT']),
  aideController.getAidesActivesAdmin
);

/**
 * @route   GET /api/aides/mes-aides
 * @desc    Obtenir les aides créées par le candidat connecté
 * @access  Private (CANDIDAT)
 */
router.get(
  '/mes-aides',
  authenticate,
  authorize(['CANDIDAT']),
  aideController.getMesAides
);

/**
 * @route   GET /api/aides/export
 * @desc    Exporter toutes les aides en CSV
 * @access  Private (permission AIDE)
 * NOTE: doit être avant /:id pour éviter le conflit de route
 */
router.get(
  '/export',
  authenticate,
  authorizeModule('AIDE'),
  aideController.exportAides
);

router.get(
  '/export/pdf',
  authenticate,
  authorizeModule('AIDE'),
  aideController.exportAidesPDF
);

/**
 * @route   GET /api/aides/:id
 * @desc    Obtenir une aide par ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  aideController.getAideById
);

/**
 * @route   GET /api/aides/:id/fichier/:type
 * @desc    Télécharger un fichier joint à une aide (type: cnib | demandeAide)
 * @access  Private (ADMIN ou permission AIDE)
 */
router.get(
  '/:id/fichier/:type',
  authenticate,
  authorizeModule('AIDE'),
  aideController.getFichierAide
);

/**
 * @route   PUT /api/aides/:id
 * @desc    Mettre à jour une aide
 * @access  Private (permission AIDE)
 */
router.put(
  '/:id',
  authenticate,
  authorizeAction('AIDE', 'MODIFIER'),
  validate(updateAideSchema),
  aideController.updateAide
);

/**
 * @route   PUT /api/aides/:id/evaluer
 * @desc    Évaluer une aide créée par un candidat
 * @access  Private (permission AIDE)
 */
router.put(
  '/:id/evaluer',
  authenticate,
  authorizeModule('AIDE'),
  validate(evaluateAideSchema),
  aideController.evaluateAide
);

/**
 * @route   DELETE /api/aides/:id
 * @desc    Supprimer une aide
 * @access  Private (ADMIN)
 */
router.delete(
  '/:id',
  authenticate,
  authorizeAction('AIDE', 'SUPPRIMER'),
  aideController.deleteAide
);

// =====================================================
// ROUTES CANDIDATURES
// =====================================================

/**
 * @route   POST /api/aides/candidatures
 * @desc    Créer une candidature à une aide
 * @access  Private (CANDIDAT)
 */
router.post(
  '/candidatures',
  authenticate,
  authorize(['CANDIDAT']),
  upload.fields([
    { name: 'cnib', maxCount: 1 },
    { name: 'demandeCandidature', maxCount: 1 },
  ]),
  validatePdfFiles,
  validate(createCandidatureAideSchema),
  aideController.createCandidatureAide
);

/**
 * @route   GET /api/aides/mes-candidatures
 * @desc    Obtenir les candidatures du candidat connecté
 * @access  Private (CANDIDAT)
 */
router.get(
  '/mes-candidatures',
  authenticate,
  authorize(['CANDIDAT']),
  aideController.getMesCandidatures
);

/**
 * @route   GET /api/aides/candidatures/:id
 * @desc    Obtenir une candidature par ID
 * @access  Private
 */
router.get(
  '/candidatures/:id',
  authenticate,
  aideController.getCandidatureById
);

/**
 * @route   PUT /api/aides/candidatures/:id/evaluer
 * @desc    Évaluer une candidature
 * @access  Private (ADMIN ou permission AIDE)
 */
router.put(
  '/candidatures/:id/evaluer',
  authenticate,
  authorizeModule('AIDE'),
  validate(evaluateCandidatureAideSchema),
  aideController.evaluateCandidature
);

/**
 * @route   GET /api/aides/:aideId/candidatures
 * @desc    Obtenir les candidatures d'une aide
 * @access  Private (permission AIDE)
 */
router.get(
  '/:aideId/candidatures',
  authenticate,
  authorizeModule('AIDE'),
  aideController.getCandidaturesByAide
);

module.exports = router;

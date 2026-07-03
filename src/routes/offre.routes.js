// src/routes/offre.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const offreController = require('../controllers/offre.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate, authorize, authorizeModule, authorizeAction } = require('../middlewares/auth.middleware');
const { validatePdfFiles } = require('../middlewares/validateFiles.middleware');
const {
  createOffreCandidatSchema,
  createOffreAdminSchema,
  updateOffreSchema,
  evaluateOffreSchema,
  createCandidatureOffreSchema,
  evaluateCandidatureOffreSchema,
} = require('../validators/offre.validator');

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
// ROUTES OFFRES
// =====================================================

/**
 * @route   POST /api/offres/candidat
 * @desc    Créer une offre (par candidat)
 * @access  Private (CANDIDAT)
 */
router.post(
  '/candidat',
  authenticate,
  authorize(['CANDIDAT']),
  upload.fields([
    { name: 'cnib', maxCount: 1 },
    { name: 'demandeOffre', maxCount: 1 },
  ]),
  validatePdfFiles,
  validate(createOffreCandidatSchema),
  offreController.createOffreByCandidat
);

/**
 * @route   POST /api/offres/admin
 * @desc    Créer une offre (par admin)
 * @access  Private (ADMIN ou permission OFFRE)
 */
router.post(
  '/admin',
  authenticate,
  authorizeAction('OFFRE', 'CREER'),
  validate(createOffreAdminSchema),
  offreController.createOffreByAdmin
);

/**
 * @route   GET /api/offres
 * @desc    Obtenir toutes les offres
 * @access  Private (ADMIN ou permission OFFRE)
 */
router.get(
  '/',
  authenticate,
  authorizeModule('OFFRE'),
  offreController.getAllOffres
);

/**
 * @route   GET /api/offres/actives
 * @desc    Obtenir les offres actives (pour candidatures)
 * @access  Private (CANDIDAT)
 */
router.get(
  '/actives',
  authenticate,
  authorize(['CANDIDAT']),
  offreController.getOffresActivesAdmin
);

/**
 * @route   GET /api/offres/mes-offres
 * @desc    Obtenir les offres créées par le candidat connecté
 * @access  Private (CANDIDAT)
 */
router.get(
  '/mes-offres',
  authenticate,
  authorize(['CANDIDAT']),
  offreController.getMesOffres
);

/**
 * @route   GET /api/offres/export
 * @desc    Exporter toutes les offres en CSV
 * @access  Private (permission OFFRE)
 * NOTE: doit être avant /:id pour éviter le conflit de route
 */
router.get(
  '/export',
  authenticate,
  authorizeModule('OFFRE'),
  offreController.exportOffres
);

router.get(
  '/export/pdf',
  authenticate,
  authorizeModule('OFFRE'),
  offreController.exportOffresPDF
);

/**
 * @route   GET /api/offres/:id
 * @desc    Obtenir une offre par ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  offreController.getOffreById
);

/**
 * @route   GET /api/offres/:id/fichier/:type
 * @desc    Télécharger un fichier joint à une offre (type: cnib | demandeOffre)
 * @access  Private (ADMIN ou permission OFFRE)
 */
router.get(
  '/:id/fichier/:type',
  authenticate,
  authorizeModule('OFFRE'),
  offreController.getFichierOffre
);

/**
 * @route   PUT /api/offres/:id
 * @desc    Mettre à jour une offre
 * @access  Private (ADMIN ou permission OFFRE)
 */
router.put(
  '/:id',
  authenticate,
  authorizeAction('OFFRE', 'MODIFIER'),
  validate(updateOffreSchema),
  offreController.updateOffre
);

/**
 * @route   PUT /api/offres/:id/evaluer
 * @desc    Évaluer une offre créée par un candidat
 * @access  Private (permission OFFRE)
 */
router.put(
  '/:id/evaluer',
  authenticate,
  authorizeModule('OFFRE'),
  validate(evaluateOffreSchema),
  offreController.evaluateOffre
);

/**
 * @route   PUT /api/offres/:id/transferer
 * @desc    Transférer une offre vers une autre direction
 * @access  Private (permission OFFRE:TRANSFERER)
 */
router.put(
  '/:id/transferer',
  authenticate,
  authorizeAction('OFFRE', 'TRANSFERER'),
  offreController.transfererOffre
);

/**
 * @route   DELETE /api/offres/:id
 * @desc    Supprimer une offre
 * @access  Private (ADMIN)
 */
router.delete(
  '/:id',
  authenticate,
  authorizeAction('OFFRE', 'SUPPRIMER'),
  offreController.deleteOffre
);

// =====================================================
// ROUTES CANDIDATURES
// =====================================================

/**
 * @route   POST /api/offres/candidatures
 * @desc    Créer une candidature à une offre
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
  validate(createCandidatureOffreSchema),
  offreController.createCandidatureOffre
);

/**
 * @route   GET /api/offres/mes-candidatures
 * @desc    Obtenir les candidatures du candidat connecté
 * @access  Private (CANDIDAT)
 */
router.get(
  '/mes-candidatures',
  authenticate,
  authorize(['CANDIDAT']),
  offreController.getMesCandidatures
);

/**
 * @route   GET /api/offres/candidatures/:id
 * @desc    Obtenir une candidature par ID
 * @access  Private
 */
router.get(
  '/candidatures/:id',
  authenticate,
  offreController.getCandidatureById
);

/**
 * @route   PUT /api/offres/candidatures/:id/evaluer
 * @desc    Évaluer une candidature
 * @access  Private (ADMIN ou permission OFFRE)
 */
router.put(
  '/candidatures/:id/evaluer',
  authenticate,
  authorizeModule('OFFRE'),
  validate(evaluateCandidatureOffreSchema),
  offreController.evaluateCandidature
);

/**
 * @route   GET /api/offres/:offreId/candidatures
 * @desc    Obtenir les candidatures d'une offre
 * @access  Private (permission OFFRE)
 */
router.get(
  '/:offreId/candidatures',
  authenticate,
  authorizeModule('OFFRE'),
  offreController.getCandidaturesByOffre
);

module.exports = router;

// src/routes/stage.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const stageController = require('../controllers/stage.controller');
const validate = require('../middlewares/validate.middleware');
const { authenticate, authorize, authorizeModule, authorizeAction, authorizeAnyAction } = require('../middlewares/auth.middleware');
const paginationMiddleware = require('../middlewares/pagination.middleware');
const { validatePdfFiles } = require('../middlewares/validateFiles.middleware');
const {
  createStageSchema,
  updateStatusStageSchema,
  updateStageSchema,
  transfererStageSchema,
  createRenouvellementSchema,
  evaluateRenouvellementSchema,
  createRapportSchema,
  evaluateRapportSchema,
  createDocumentStageSchema,
  createDemandeModificationSchema,
  evaluerDemandeModificationSchema,
  approuverStageSchema,
} = require('../validators/stage.validator');

// Configuration de multer pour l'upload de fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1 Mo max
  },
  fileFilter: (req, file, cb) => {
    // Accepter uniquement les PDF
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
    }
  },
});

// Upload pour les demandes de modification : PDF uniquement (demande manuscrite scannée)
const uploadModif = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 Mo max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
    }
  },
});

// Upload pour les rapports de stage : 5 Mo max (document multi-pages)
const uploadRapport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'), false);
    }
  },
});

// =====================================================
// ROUTES STAGES (routes fixes en premier)
// =====================================================

/**
 * @route   POST /api/stages
 * @desc    Créer une demande de stage
 * @access  Private (CANDIDAT)
 */
router.post(
  '/',
  authenticate,
  authorize(['CANDIDAT']),
  upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'cnib', maxCount: 1 },
    { name: 'casierJudiciaire', maxCount: 1 },
    { name: 'lettreMotivation', maxCount: 1 },
    { name: 'lettreRecommandation', maxCount: 1 },
    { name: 'dernierDiplome', maxCount: 1 },
  ]),
  validatePdfFiles,
  validate(createStageSchema),
  stageController.createStage
);

/**
 * @route   GET /api/stages/stats
 * @desc    Obtenir les statistiques des stages
 * @access  Private (ADMIN ou permission STAGE)
 */
router.get(
  '/stats',
  authenticate,
  authorizeModule('STAGE'),
  stageController.getStagesStats
);

/**
 * @route   GET /api/stages/domaines
 * @desc    Obtenir les domaines distincts présents dans les stages
 * @access  Private (ADMIN ou permission STAGE)
 */
router.get(
  '/domaines',
  authenticate,
  authorizeModule('STAGE'),
  stageController.getDomainesDistincts
);

/**
 * @route   GET /api/stages/suivi
 * @desc    Récupérer la liste des stages EN_COURS avec durée cumulée (onglet suivi)
 * @access  Private (ADMIN ou permission STAGE ou permission SUIVI_STAGE)
 */
router.get(
  '/suivi',
  authenticate,
  authorizeModule('SUIVI_STAGE'),
  stageController.getStagesSuivi
);

/**
 * @route   POST /api/stages/check-status
 * @desc    Declencher manuellement la verification des statuts des stages
 * @access  Private (ADMIN)
 */
router.post(
  '/check-status',
  authenticate,
  authorize(['ADMIN']),
  stageController.checkAndUpdateStatuses
);

/**
 * @route   GET /api/stages/mes-stages
 * @desc    Obtenir les stages du candidat connecté
 * @access  Private (CANDIDAT)
 */
router.get(
  '/mes-stages',
  authenticate,
  authorize(['CANDIDAT']),
  stageController.getMesStages
);

// =====================================================
// ROUTES RAPPORTS (AVANT /:id pour éviter les conflits)
// =====================================================

/**
 * @route   POST /api/stages/rapports
 * @desc    Créer un rapport de stage
 * @access  Private (CANDIDAT)
 */
router.post(
  '/rapports',
  authenticate,
  authorize(['CANDIDAT']),
  uploadRapport.single('rapportPdf'),
  validatePdfFiles,
  validate(createRapportSchema),
  stageController.createRapport
);

/**
 * @route   GET /api/stages/rapports
 * @desc    Obtenir tous les rapports
 * @access  Private (ADMIN ou permission STAGE)
 */
router.get(
  '/rapports',
  authenticate,
  authorizeModule('STAGE'),
  stageController.getAllRapports
);

/**
 * @route   GET /api/stages/rapports/:id
 * @desc    Obtenir un rapport par ID
 * @access  Private
 */
router.get(
  '/rapports/:id',
  authenticate,
  stageController.getRapportById
);

/**
 * @route   PUT /api/stages/rapports/:id/evaluer
 * @desc    Évaluer un rapport (VALIDER ou REJETER)
 * @access  Private — permission VALIDER ou REJETER sur STAGE requise (même permission que
 *          pour accepter/rejeter un stage — la portée direction/globale est vérifiée
 *          ensuite au niveau du contrôleur/service, voir assertAgentOwnsDirection)
 */
router.put(
  '/rapports/:id/evaluer',
  authenticate,
  authorizeAnyAction('STAGE', ['VALIDER', 'REJETER']),
  validate(evaluateRapportSchema),
  stageController.evaluateRapport
);

/**
 * @route   GET /api/stages/rapports/:id/download
 * @desc    Télécharger le PDF d'un rapport
 * @access  Private
 */
router.get(
  '/rapports/:id/download',
  authenticate,
  stageController.downloadRapport
);

// =====================================================
// ROUTES RENOUVELLEMENTS (AVANT /:id pour éviter les conflits)
// =====================================================

/**
 * @route   POST /api/stages/renouvellements
 * @desc    Créer une demande de renouvellement
 * @access  Private (CANDIDAT)
 */
router.post(
  '/renouvellements',
  authenticate,
  authorize(['CANDIDAT']),
  upload.fields([
    { name: 'lettreMotivationRenouvellement', maxCount: 1 },
    { name: 'conventionStageEnCours', maxCount: 1 },
  ]),
  validatePdfFiles,
  validate(createRenouvellementSchema),
  stageController.createRenouvellement
);

/**
 * @route   GET /api/stages/renouvellements
 * @desc    Obtenir tous les renouvellements
 * @access  Private (ADMIN ou permission STAGE)
 */
router.get(
  '/renouvellements',
  authenticate,
  authorizeModule('STAGE'),
  stageController.getAllRenouvellements
);

/**
 * @route   GET /api/stages/renouvellements/:id/lettre
 * @desc    Télécharger la lettre de demande de renouvellement (soumise par le candidat)
 * @access  Private (ADMIN ou permission STAGE)
 */
router.get(
  '/renouvellements/:id/lettre',
  authenticate,
  authorizeModule('STAGE'),
  stageController.downloadLettreRenouvellement
);

/**
 * @route   GET /api/stages/renouvellements/:id/convention
 */
router.get(
  '/renouvellements/:id/convention',
  authenticate,
  authorizeModule('STAGE'),
  stageController.downloadConventionRenouvellement
);

/**
 * @route   PUT /api/stages/renouvellements/:id/evaluer
 * @desc    Évaluer une demande de renouvellement (VALIDER ou REJETER)
 * @access  Private — permission VALIDER ou REJETER sur STAGE requise
 */
router.put(
  '/renouvellements/:id/evaluer',
  authenticate,
  authorizeAnyAction('STAGE', ['VALIDER', 'REJETER']),
  validate(evaluateRenouvellementSchema),
  stageController.evaluateRenouvellement
);

// =====================================================
// ROUTES DOCUMENTS (AVANT /:id pour éviter les conflits)
// =====================================================

/**
 * @route   POST /api/stages/documents
 * @desc    Créer un document de stage (convention ou attestation)
 * @access  Private — permission CREER sur STAGE requise
 */
router.post(
  '/documents',
  authenticate,
  authorizeAction('STAGE', 'CREER'),
  upload.single('document'),
  validatePdfFiles,
  validate(createDocumentStageSchema),
  stageController.createDocumentStage
);

/**
 * @route   GET /api/stages/documents/:id
 * @desc    Obtenir un document de stage par ID
 * @access  Private
 */
router.get(
  '/documents/:id',
  authenticate,
  stageController.getDocumentStageById
);

/**
 * @route   GET /api/stages/documents/:id/download
 * @desc    Télécharger un document de stage
 * @access  Private
 */
router.get(
  '/documents/:id/download',
  authenticate,
  stageController.downloadDocumentStage
);

// =====================================================
// ROUTES DEMANDES DE MODIFICATION (AVANT /:id pour éviter les conflits)
// =====================================================

/**
 * @route   GET /api/stages/demandes-modification
 * @desc    Obtenir toutes les demandes de modification (suspension / annulation)
 * @access  Private (module SUSPENSION_STAGE)
 */
router.get(
  '/demandes-modification',
  authenticate,
  authorizeModule('SUSPENSION_STAGE'),
  stageController.getAllDemandesModification
);

/**
 * @route   PUT /api/stages/demandes-modification/:id/evaluer
 * @desc    Évaluer une demande de modification (approuver ou rejeter)
 * @access  Private — permission VALIDER ou REJETER sur SUSPENSION_STAGE
 */
router.put(
  '/demandes-modification/:id/evaluer',
  authenticate,
  authorizeAnyAction('SUSPENSION_STAGE', ['VALIDER', 'REJETER']),
  validate(evaluerDemandeModificationSchema),
  stageController.evaluerDemandeModification
);

// =====================================================
// ROUTES STAGES AVEC LISTE (EN DERNIER AVANT /:id)
// =====================================================

/**
 * @route   GET /api/stages/directions
 * @desc    Liste des directions (donnée de référence : formulaire candidat, affectation stage/audience)
 * @access  Private (tout utilisateur authentifié — données non sensibles)
 */
router.get('/directions', authenticate, async (req, res) => {
  try {
    const { Direction, Service } = require('../models');
    const dirs = await Direction.findAll({
      where: { del: 0 },
      attributes: ['iddirection', 'nom', 'accronyme'],
      include: [{
        model: Service,
        as: 'services',
        attributes: ['idservice', 'accronyme', 'description'],
        where: { del: 0 },
        required: false,
        through: { attributes: [] },
      }],
      order: [['nom', 'ASC']],   // tri simple — l'ordre des services n'est pas critique ici
    });
    return res.json({ success: true, data: dirs });
  } catch (err) {
    console.error('GET /stages/directions error:', err);
    return res.status(500).json({ success: false, message: 'Erreur lors du chargement des directions' });
  }
});

/**
 * @route   GET /api/stages/export
 * @desc    Exporter les stages en CSV (filtres: statusStage, typeStage)
 * @access  Private (ADMIN, agents avec module STAGE)
 */
router.get(
  '/export',
  authenticate,
  authorizeModule('STAGE'),
  stageController.exportStages
);

router.get(
  '/export/pdf',
  authenticate,
  authorizeModule('STAGE'),
  stageController.exportStagesPDF
);

/**
 * @route   GET /api/stages
 * @desc    Obtenir tous les stages
 * @access  Private (ADMIN ou permission STAGE)
 */
router.get(
  '/',
  authenticate,
  authorizeModule('STAGE'),
  paginationMiddleware(['createdDate', 'dateDebut', 'dateFin', 'statusStage']),
  stageController.getAllStages
);

// =====================================================
// ROUTES STAGES AVEC PARAMETRE :id (TOUJOURS EN DERNIER)
// =====================================================

/**
 * @route   GET /api/stages/:id
 * @desc    Obtenir un stage par ID
 * @access  Private
 */
router.get(
  '/:id',
  authenticate,
  stageController.getStageById
);

/**
 * @route   PUT /api/stages/:id/approuver
 * @desc    Approuver un stage (EN_ATTENTE → PROGRAMMATION_EN_COURS)
 * @access  Private — permission APPROUVER sur STAGE requise
 */
router.put(
  '/:id/approuver',
  authenticate,
  authorizeAction('STAGE', 'APPROUVER'),
  validate(approuverStageSchema),
  stageController.approuverStage
);

/**
 * @route   PUT /api/stages/:id/autoriser-renouvellement
 * @desc    Accorder une autorisation de 7 jours pour renouveler un stage TERMINE ou EXPIRE
 * @access  Private — ADMIN ou lectureGlobale + permission VALIDER sur STAGE
 */
router.put(
  '/:id/autoriser-renouvellement',
  authenticate,
  authorizeAction('STAGE', 'VALIDER'),
  stageController.autoriserRenouvellement
);

/**
 * @route   POST /api/stages/:id/demandes-modification
 * @desc    Soumettre une demande de modification (suspension ou annulation)
 * @access  Private (CANDIDAT)
 */
router.post(
  '/:id/demandes-modification',
  authenticate,
  authorize(['CANDIDAT']),
  uploadModif.fields([
    { name: 'lettreManuscrite', maxCount: 1 },
  ]),
  validate(createDemandeModificationSchema),
  stageController.createDemandeModification
);

/**
 * @route   PUT /api/stages/demandes-modification/:id/annuler
 * @desc    Annuler sa propre demande de modification, tant qu'elle est EN_ATTENTE
 * @access  Private (CANDIDAT)
 */
router.put(
  '/demandes-modification/:id/annuler',
  authenticate,
  authorize(['CANDIDAT']),
  stageController.annulerDemandeModification
);

/**
 * @route   GET /api/stages/demandes-modification/:id/justification
 * @desc    Télécharger la pièce justificative d'une demande de modification
 * @access  Private (module SUSPENSION_STAGE)
 */
router.get(
  '/demandes-modification/:id/justification',
  authenticate,
  authorizeModule('SUSPENSION_STAGE'),
  stageController.getDemandeModificationFichier('justification')
);

/**
 * @route   GET /api/stages/demandes-modification/:id/lettre
 * @desc    Télécharger la lettre manuscrite d'une demande de modification
 * @access  Private (module SUSPENSION_STAGE)
 */
router.get(
  '/demandes-modification/:id/lettre',
  authenticate,
  authorizeModule('SUSPENSION_STAGE'),
  stageController.getDemandeModificationFichier('lettreManuscrite')
);

/**
 * @route   PUT /api/stages/:id/statut
 * @desc    Mettre à jour le statut d'un stage (accepter ou rejeter)
 * @access  Private — permission VALIDER ou REJETER sur STAGE requise
 */
router.put(
  '/:id/statut',
  authenticate,
  authorizeAnyAction('STAGE', ['VALIDER', 'REJETER']),
  upload.single('conventionStage'),
  validatePdfFiles,
  validate(updateStatusStageSchema),
  stageController.updateStatusStage
);

/**
 * @route   PUT /api/stages/:id/transferer
 * @desc    Transférer un stage vers une autre direction
 * @access  Private — permission TRANSFERER sur STAGE requise
 */
router.put(
  '/:id/transferer',
  authenticate,
  authorizeAction('STAGE', 'TRANSFERER'),
  validate(transfererStageSchema),
  stageController.transfererStage
);

/**
 * @route   GET /api/stages/:id/documents/print-all
 * @desc    Fusionner tous les documents du dossier en un seul PDF pour impression
 * @access  Private — DOIT être déclaré AVANT /:id/documents/:type
 */
router.get(
  '/:id/documents/print-all',
  authenticate,
  authorizeModule('STAGE'),
  stageController.printAllStageDocuments
);

/**
 * @route   GET /api/stages/:id/documents/:type
 * @desc    Télécharger un document de stage (cv, cnib, casierJudiciaire, lettreMotivation, lettreRecommandation)
 * @access  Private
 */
router.get(
  '/:id/documents/:type',
  authenticate,
  stageController.downloadStageDocument
);

/**
 * @route   PUT /api/stages/:id/documents/:type
 * @desc    Remplacer un document signalé comme non conforme (uniquement si le stage est REJETE)
 * @access  Private (CANDIDAT — propriétaire du stage)
 */
router.put(
  '/:id/documents/:type',
  authenticate,
  authorize(['CANDIDAT']),
  upload.single('document'),
  validatePdfFiles,
  stageController.remplacerDocumentStage
);

/**
 * @route   PUT /api/stages/:id/exiger-document
 * @desc    Exiger le remplacement d'un ou plusieurs documents sans rejeter la demande
 * @access  Private (AGENT — direction propriétaire du stage)
 */
router.put(
  '/:id/exiger-document',
  authenticate,
  authorizeAnyAction('STAGE', ['VALIDER', 'REJETER']),
  stageController.exigerDocuments
);

/**
 * @route   PUT /api/stages/:id/resoumettre
 * @desc    Resoumettre une demande rejetée après remplacement des documents non conformes
 * @access  Private (CANDIDAT — propriétaire du stage)
 */
router.put(
  '/:id/resoumettre',
  authenticate,
  authorize(['CANDIDAT']),
  stageController.resoumettreStage
);

/**
 * @route   GET /api/stages/:id/convention
 * @desc    Télécharger la convention de stage (depuis document_stage)
 * @access  Private
 */
router.get(
  '/:id/convention',
  authenticate,
  stageController.downloadConventionStage
);

/**
 * @route   PUT /api/stages/:id
 * @desc    Modifier un stage (dates effectives, commentaire)
 * @access  Private — permission MODIFIER sur STAGE requise
 */
router.put(
  '/:id',
  authenticate,
  authorizeAction('STAGE', 'MODIFIER'),
  validate(updateStageSchema),
  stageController.updateStage
);

/**
 * @route   DELETE /api/stages/:id
 * @desc    Supprimer un stage (soft delete)
 * @access  Private — permission SUPPRIMER sur STAGE requise
 */
router.delete(
  '/:id',
  authenticate,
  authorizeAction('STAGE', 'SUPPRIMER'),
  stageController.deleteStage
);

module.exports = router;

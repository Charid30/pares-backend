// src/routes/admin-candidat.routes.js - Routes Admin pour gestion des candidats
const express = require('express');
const router = express.Router();
const adminCandidatController = require('../controllers/admin-candidat.controller');
const { authenticate, authorize, authorizeModule, authorizeAction } = require('../middlewares/auth.middleware');
const paginationMiddleware = require('../middlewares/pagination.middleware');

// Routes statistiques et export (avant :id pour éviter conflit)
router.get('/stats', authenticate, authorizeModule('CANDIDATS'), adminCandidatController.getCandidatsStats);
router.get('/export', authenticate, authorizeModule('CANDIDATS'), adminCandidatController.exportCandidats);

// Routes CRUD
// CONSULTER : avoir n'importe quelle permission sur CANDIDATS suffit pour lire
router.get('/', authenticate, authorizeModule('CANDIDATS'), paginationMiddleware(['createdDate', 'nom', 'prenom', 'email']), adminCandidatController.getCandidats);
router.get('/:id', authenticate, authorizeModule('CANDIDATS'), adminCandidatController.getCandidatById);
// CREER, MODIFIER, SUPPRIMER : actions spécifiques requises
router.post('/', authenticate, authorizeAction('CANDIDATS', 'CREER'), adminCandidatController.createCandidat);
router.put('/:id/reset-password', authenticate, authorizeAction('CANDIDATS', 'MODIFIER'), adminCandidatController.resetCandidatPassword);
router.put('/:id', authenticate, authorizeAction('CANDIDATS', 'MODIFIER'), adminCandidatController.updateCandidat);
router.delete('/:id', authenticate, authorizeAction('CANDIDATS', 'SUPPRIMER'), adminCandidatController.deleteCandidat);

module.exports = router;

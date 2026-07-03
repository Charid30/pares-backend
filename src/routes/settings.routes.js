// src/routes/settings.routes.js
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Toutes les routes nécessitent authentification
router.use(authenticate);

// Paramètres app (ADMIN uniquement)
router.get('/',  authorize('ADMIN'), settingsController.getSettings);
router.put('/',  authorize('ADMIN'), settingsController.saveSettings);

// Changement de mot de passe (tout utilisateur connecté)
router.put('/change-password', settingsController.changePassword);

// Notification broadcast (ADMIN uniquement)
router.post('/notify', authorize('ADMIN'), settingsController.broadcastNotification);

// Liste des agents pour le routage (ADMIN uniquement)
router.get('/agents', authorize('ADMIN'), settingsController.getAgentsForRoutage);

module.exports = router;

// src/routes/diffusion.routes.js
// Notifications push envoyées volontairement par l'admin — réservé au rôle ADMIN.
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const ctrl = require('../controllers/diffusion.controller');

router.get('/',        authenticate, authorize('ADMIN'), ctrl.historique);
router.post('/apercu', authenticate, authorize('ADMIN'), ctrl.apercu);
router.post('/',       authenticate, authorize('ADMIN'), ctrl.envoyer);

module.exports = router;

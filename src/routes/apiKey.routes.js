// src/routes/apiKey.routes.js
// Gestion des clés API — réservée à l'ADMIN
const express = require('express');
const router = express.Router();
const apiKeyController = require('../controllers/apiKey.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/', apiKeyController.getAllKeys);
router.post('/', apiKeyController.createKey);
router.put('/:id', apiKeyController.updateKey);
router.post('/:id/regenerer', apiKeyController.regenerateKey);
router.delete('/:id', apiKeyController.deleteKey);

module.exports = router;

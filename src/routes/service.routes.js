// src/routes/service.routes.js - Routes de gestion des services
const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/service.controller');
const { authenticate, authorize, authorizeModule, authorizeAction } = require('../middlewares/auth.middleware');

// Stats (avant /:id)
router.get('/stats', authenticate, authorizeModule('SERVICES'), serviceController.getStats);

// CRUD services
router.get('/',    authenticate, authorizeModule('SERVICES'),              serviceController.getServices);
router.get('/:id', authenticate, authorizeModule('SERVICES'),              serviceController.getServiceById);
router.post('/',   authenticate, authorizeAction('SERVICES', 'CREER'),     serviceController.createService);
router.put('/:id', authenticate, authorizeAction('SERVICES', 'MODIFIER'),  serviceController.updateService);
router.delete('/:id', authenticate, authorizeAction('SERVICES', 'SUPPRIMER'), serviceController.deleteService);

module.exports = router;

// src/routes/audit.routes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const auditController = require('../controllers/audit.controller');

// Toutes les routes nécessitent d'être ADMIN
router.get('/meta', authenticate, authorize('ADMIN'), auditController.getMeta);
router.get('/',     authenticate, authorize('ADMIN'), auditController.getAuditLogs);

module.exports = router;

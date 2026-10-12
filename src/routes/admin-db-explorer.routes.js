// src/routes/admin-db-explorer.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/admin-db-explorer.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

// GET  /api/admin/db-explorer/tables  - liste des tables
router.get('/tables', ctrl.getTables);

// POST /api/admin/db-explorer/query   - exécuter une requête SELECT
router.post('/query', ctrl.executeQuery);

module.exports = router;

// src/routes/dashboard.routes.js - Routes pour le dashboard admin
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Routes réservées à l'ADMIN — les agents à rôle personnalisé ont /api/agent-dashboard
router.get('/',                authenticate, authorize('ADMIN'), dashboardController.getDashboardData);
router.get('/main-stats',      authenticate, authorize('ADMIN'), dashboardController.getMainStats);
router.get('/secondary-stats', authenticate, authorize('ADMIN'), dashboardController.getSecondaryStats);
router.get('/activities',      authenticate, authorize('ADMIN'), dashboardController.getRecentActivities);
router.get('/pending',         authenticate, authorize('ADMIN'), dashboardController.getPendingItems);

module.exports = router;

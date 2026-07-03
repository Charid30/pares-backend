// src/routes/admin-dashboard.routes.js
const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/admin-dashboard.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Toutes les routes nécessitent une authentification admin
router.use(authenticate);
router.use(authorize('ADMIN', 'SUPER_ADMIN'));

// GET /api/admin/dashboard/badges - Badges du menu
router.get('/badges', adminDashboardController.getMenuBadges);

// GET /api/admin/dashboard/stats - Statistiques complètes
router.get('/stats', adminDashboardController.getDashboardStats);

// GET /api/admin/dashboard/recent-activities - Activités récentes (cloche)
router.get('/recent-activities', adminDashboardController.getRecentActivities);

module.exports = router;

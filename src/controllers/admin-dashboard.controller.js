// src/controllers/admin-dashboard.controller.js
const adminDashboardService = require('../services/admin-dashboard.service');
const dashboardService = require('../services/dashboard.service');
const { success, error } = require('../utils/response.util');

/**
 * GET /api/admin/dashboard/badges
 * Récupérer les badges du menu (compteurs d'actions en attente)
 */
const getMenuBadges = async (req, res) => {
  try {
    const badges = await adminDashboardService.getMenuBadges();
    return success(res, badges, 'Badges récupérés');
  } catch (err) {
    console.error('Erreur getMenuBadges:', err.message);
    return error(res, err.message || 'Erreur lors de la récupération des badges', 500);
  }
};

/**
 * GET /api/admin/dashboard/stats
 * Récupérer les statistiques complètes du dashboard
 */
const getDashboardStats = async (req, res) => {
  try {
    const stats = await adminDashboardService.getDashboardStats();
    return success(res, stats, 'Statistiques récupérées');
  } catch (err) {
    console.error('Erreur getDashboardStats:', err.message);
    return error(res, err.message || 'Erreur lors de la récupération des statistiques', 500);
  }
};

/**
 * GET /api/admin/dashboard/recent-activities
 * Activités récentes (≤ 3 jours) pour la cloche admin
 */
const getRecentActivities = async (req, res) => {
  try {
    const activities = await dashboardService.getRecentActivities(20);
    return success(res, activities, 'Activités récentes récupérées');
  } catch (err) {
    console.error('Erreur getRecentActivities:', err.message);
    return error(res, err.message || 'Erreur lors de la récupération des activités', 500);
  }
};

module.exports = {
  getMenuBadges,
  getDashboardStats,
  getRecentActivities,
};

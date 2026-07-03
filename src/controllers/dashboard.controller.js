// src/controllers/dashboard.controller.js - Contrôleur pour le dashboard admin
const dashboardService = require('../services/dashboard.service');
const { success, error } = require('../utils/response.util');

/**
 * Récupérer toutes les données du dashboard
 */
const getDashboardData = async (req, res, next) => {
  try {
    const data = await dashboardService.getDashboardData();
    return success(res, data, 'Données du dashboard récupérées avec succès');
  } catch (err) {
    console.error('Erreur dashboard:', err);
    next(err);
  }
};

/**
 * Récupérer uniquement les statistiques principales
 */
const getMainStats = async (req, res, next) => {
  try {
    const stats = await dashboardService.getMainStats();
    return success(res, stats, 'Statistiques principales récupérées');
  } catch (err) {
    next(err);
  }
};

/**
 * Récupérer les statistiques secondaires
 */
const getSecondaryStats = async (req, res, next) => {
  try {
    const stats = await dashboardService.getSecondaryStats();
    return success(res, stats, 'Statistiques secondaires récupérées');
  } catch (err) {
    next(err);
  }
};

/**
 * Récupérer les activités récentes
 */
const getRecentActivities = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 200);
    const days  = Math.min(parseInt(req.query.days)  || 3,  90);
    const activities = await dashboardService.getRecentActivities(limit, days);
    return success(res, activities, 'Activités récentes récupérées');
  } catch (err) {
    next(err);
  }
};

/**
 * Récupérer les éléments en attente
 */
const getPendingItems = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const items = await dashboardService.getPendingItems(limit);
    return success(res, items, 'Éléments en attente récupérés');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboardData,
  getMainStats,
  getSecondaryStats,
  getRecentActivities,
  getPendingItems
};

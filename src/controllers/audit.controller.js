// src/controllers/audit.controller.js
const auditService = require('../services/audit.service');
const { success, error } = require('../utils/response.util');

/**
 * GET /api/admin/audit
 * Liste paginée des logs d'audit avec filtres.
 * Accès : ADMIN uniquement
 */
const getAuditLogs = async (req, res) => {
  try {
    const result = await auditService.getAuditLogs(req.query);
    // Séparer les données du payload de pagination pour correspondre à l'interface Angular
    res.json({
      success: true,
      data: result.items,
      pagination: {
        total:      result.total,
        page:       result.page,
        limit:      parseInt(req.query.limit) || 20,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * GET /api/admin/audit/meta
 * Retourne les listes de modules et actions disponibles pour les filtres.
 */
const getMeta = async (req, res) => {
  try {
    const [modules, actions] = await Promise.all([
      auditService.getModules(),
      auditService.getActions(),
    ]);
    return success(res, { modules, actions }, 'Méta-données audit');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { getAuditLogs, getMeta };

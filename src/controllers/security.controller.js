// src/controllers/security.controller.js
const securityService = require('../services/security.service');
const { success, error } = require('../utils/response.util');

const getBannedIps = async (req, res) => {
  try {
    const ips = await securityService.getBannedIps();
    return success(res, ips, 'IPs bannies récupérées');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getStats = async (req, res) => {
  try {
    const stats = await securityService.getSecurityStats();
    return success(res, stats, 'Statistiques sécurité');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const unbanIp = async (req, res) => {
  try {
    const record = await securityService.unbanIp(req.params.id);
    return success(res, record, 'IP débannie avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const deleteIp = async (req, res) => {
  try {
    await securityService.deleteIp(req.params.id);
    return success(res, null, 'Entrée supprimée');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

module.exports = { getBannedIps, getStats, unbanIp, deleteIp };

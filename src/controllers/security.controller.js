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

const banPermanently = async (req, res) => {
  try {
    const record = await securityService.banPermanently(req.params.id);
    return success(res, record, 'IP bannie définitivement');
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

const getLogsForIp = async (req, res) => {
  try {
    const logs = await securityService.getLogsForIp(req.params.ip);
    return success(res, logs, 'Historique récupéré');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const findUserByIp = async (req, res) => {
  try {
    const user = await securityService.findUserByIp(req.params.ip);
    return success(res, user, user ? 'Compte trouvé' : 'Aucun compte associé à cette IP');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const banManually = async (req, res) => {
  try {
    const { ip_address, permanent, durationHours, reason } = req.body;
    const record = await securityService.banManually(ip_address, { permanent, durationHours, reason });
    return success(res, record, 'IP bannie manuellement avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = { getBannedIps, getStats, unbanIp, banPermanently, deleteIp, getLogsForIp, findUserByIp, banManually };

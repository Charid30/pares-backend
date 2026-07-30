// src/services/security.service.js
const { Op } = require('sequelize');
const BannedIp = require('../models/BannedIp');
const AuditLog = require('../models/AuditLog');
const { locateIp } = require('../utils/geoip.util');

const getBannedIps = async () => {
  const rows = await BannedIp.findAll({
    order: [['updatedAt', 'DESC']],
  });
  // Géolocalisation calculée à la volée (base locale) — s'applique donc
  // automatiquement à toutes les entrées déjà existantes en base, sans migration.
  return rows.map((row) => {
    const json = row.toJSON();
    json.geo = locateIp(json.ip_address);
    return json;
  });
};

const getSecurityStats = async () => {
  const now = new Date();

  const [activeBans, totalSuspects, totalAttempts, recentLogs] = await Promise.all([
    BannedIp.count({ where: { [Op.or]: [{ banned_until: { [Op.gt]: now } }, { permanent: true }] } }),
    BannedIp.count({ where: { banned_until: null, permanent: false } }),
    BannedIp.sum('attempts'),
    AuditLog.findAll({
      where: { module: 'SECURITE' },
      order: [['createdAt', 'DESC']],
      limit: 20,
    }),
  ]);

  const recentLogsWithGeo = recentLogs.map((log) => {
    const json = log.toJSON();
    json.geo = locateIp(json.ip_address);
    return json;
  });

  return { activeBans, totalSuspects, totalAttempts: totalAttempts || 0, recentLogs: recentLogsWithGeo };
};

const unbanIp = async (id) => {
  const record = await BannedIp.findByPk(id);
  if (!record) throw new Error('IP introuvable');
  record.banned_until = null;
  record.permanent = false;
  record.attempts = 0;
  await record.save();
  return record;
};

/**
 * Transforme un bannissement temporaire (ou une IP simplement suspecte) en
 * bannissement définitif — décision manuelle de l'administrateur.
 */
const banPermanently = async (id) => {
  const record = await BannedIp.findByPk(id);
  if (!record) throw new Error('IP introuvable');
  record.permanent = true;
  record.banned_until = null; // plus besoin d'une échéance : le flag permanent prime
  await record.save();
  return record;
};

const deleteIp = async (id) => {
  const record = await BannedIp.findByPk(id);
  if (!record) throw new Error('IP introuvable');
  await record.destroy();
};

module.exports = { getBannedIps, getSecurityStats, unbanIp, banPermanently, deleteIp };

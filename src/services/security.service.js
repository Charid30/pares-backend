// src/services/security.service.js
const { Op } = require('sequelize');
const BannedIp = require('../models/BannedIp');
const AuditLog = require('../models/AuditLog');

const getBannedIps = async () => {
  return BannedIp.findAll({
    order: [['updatedAt', 'DESC']],
  });
};

const getSecurityStats = async () => {
  const now = new Date();

  const [activeBans, totalSuspects, totalAttempts, recentLogs] = await Promise.all([
    BannedIp.count({ where: { banned_until: { [Op.gt]: now } } }),
    BannedIp.count({ where: { banned_until: null } }),
    BannedIp.sum('attempts'),
    AuditLog.findAll({
      where: { module: 'SECURITE' },
      order: [['createdAt', 'DESC']],
      limit: 20,
    }),
  ]);

  return { activeBans, totalSuspects, totalAttempts: totalAttempts || 0, recentLogs };
};

const unbanIp = async (id) => {
  const record = await BannedIp.findByPk(id);
  if (!record) throw new Error('IP introuvable');
  record.banned_until = null;
  record.attempts = 0;
  await record.save();
  return record;
};

const deleteIp = async (id) => {
  const record = await BannedIp.findByPk(id);
  if (!record) throw new Error('IP introuvable');
  await record.destroy();
};

module.exports = { getBannedIps, getSecurityStats, unbanIp, deleteIp };

// src/services/security.service.js
const { Op } = require('sequelize');
const BannedIp = require('../models/BannedIp');
const AuditLog = require('../models/AuditLog');
const { User, Candidat, Agent, Role } = require('../models');
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

/**
 * Historique des tentatives/alertes enregistrées pour une IP donnée
 * (requêtes suspectes détectées : chemin, méthode, motif, extrait de la valeur incriminée).
 */
const getLogsForIp = async (ip) => {
  const logs = await AuditLog.findAll({
    where: { module: 'SECURITE', ip_address: ip },
    order: [['createdAt', 'DESC']],
    limit: 100,
  });
  return logs.map((log) => {
    const json = log.toJSON();
    json.geo = locateIp(json.ip_address);
    return json;
  });
};

/**
 * Recherche un compte utilisateur enregistré s'étant déjà connecté depuis cette IP,
 * pour permettre à l'administrateur de vérifier son profil avant/après un bannissement.
 */
const findUserByIp = async (ip) => {
  const user = await User.findOne({
    where: { last_login_ip: ip },
    attributes: ['idusers', 'username', 'last_login_ip', 'last_login_at'],
    include: [
      { model: Role, as: 'role', attributes: ['idrole', 'accronyme', 'description'] },
      { model: Candidat, as: 'candidat', attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'] },
      {
        model: Agent,
        as: 'agents',
        attributes: ['idagents', 'nom', 'prenom', 'email', 'matricule', 'actif'],
        through: { attributes: [] },
      },
    ],
  });
  return user;
};

/**
 * Bannissement manuel d'une IP décidé par l'administrateur, indépendamment de toute
 * détection automatique (ex. IP suspecte relevée hors de l'application).
 */
const banManually = async (ipAddress, { permanent = false, durationHours = 72, reason = null } = {}) => {
  if (!ipAddress || !ipAddress.trim()) throw new Error('Adresse IP requise');
  const ip = ipAddress.trim();

  const [record] = await BannedIp.findOrCreate({
    where: { ip_address: ip },
    defaults: { attempts: 0, last_pattern: reason || 'MANUEL', banned_until: null },
  });

  record.last_pattern = reason || record.last_pattern || 'MANUEL';
  if (permanent) {
    record.permanent = true;
    record.banned_until = null;
  } else {
    record.permanent = false;
    record.banned_until = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  }
  await record.save();

  await AuditLog.create({
    agent_id: null,
    agent_nom: null,
    action: 'IP_BANNIE_MANUELLEMENT',
    module: 'SECURITE',
    entity_id: null,
    details: { ip, reason, permanent, durationHours: permanent ? null : durationHours },
    ip_address: ip,
  });

  return record;
};

module.exports = { getBannedIps, getSecurityStats, unbanIp, banPermanently, deleteIp, getLogsForIp, findUserByIp, banManually };

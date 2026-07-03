// src/controllers/offre.controller.js
const offreService = require('../services/offre.service');
const { success, error } = require('../utils/response.util');
const auditService = require('../services/audit.service');
const fileStorage = require('../utils/fileStorage.util');
const { Agent, Role, Permission } = require('../models');
const { Op } = require('sequelize');

const getUserRoles = (user) =>
  (Array.isArray(user.roles) && user.roles.length) ? user.roles : (user.role ? [user.role] : []);

const hasGlobalReadAccess = async (user) => {
  const roles = getUserRoles(user);
  if (roles.includes('ADMIN')) return true;
  const roleIds = Array.isArray(user.roleIds) ? user.roleIds : (user.roleId ? [user.roleId] : []);
  if (!roleIds.length) return false;
  const count = await Role.count({
    where: { idrole: { [Op.in]: roleIds }, lectureGlobale: true, del: 0 },
    include: [{ model: Permission, as: 'permissions', where: { module: 'OFFRE', action: 'CONSULTER', del: 0 }, required: true }],
  });
  return count > 0;
};

const resolveAgentDirection = async (agentId) => {
  if (!agentId) return null;
  const agent = await Agent.findOne({ where: { idagents: agentId, del: 0 }, attributes: ['direction_iddirection'] });
  return agent?.direction_iddirection ?? null;
};

// =====================================================
// OFFRES
// =====================================================

/**
 * Créer une offre (par candidat)
 * POST /api/offres/candidat
 */
const createOffreByCandidat = async (req, res) => {
  try {
    const offre = await offreService.createOffreByCandidat(
      req.user.candidatId,
      req.body,
      req.files
    );
    return success(res, offre, 'Offre créée avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Créer une offre (par admin)
 * POST /api/offres/admin
 */
const createOffreByAdmin = async (req, res) => {
  try {
    const offre = await offreService.createOffreByAdmin(req.user.id, req.body);
    return success(res, offre, 'Offre créée avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir toutes les offres
 * GET /api/offres
 */
const getAllOffres = async (req, res) => {
  try {
    const globalAccess = await hasGlobalReadAccess(req.user);
    const directionId = globalAccess ? null : await resolveAgentDirection(req.user.agentId);
    const offres = await offreService.getAllOffres(req.query, directionId);
    return success(res, offres, 'Offres récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir les offres actives créées par admin (pour candidatures)
 * GET /api/offres/actives
 */
const getOffresActivesAdmin = async (req, res) => {
  try {
    const offres = await offreService.getOffresActivesAdmin();
    return success(res, offres, 'Offres actives récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir les offres créées par le candidat connecté (paginées)
 * GET /api/offres/mes-offres?page=1&limit=10
 */
const getMesOffres = async (req, res) => {
  try {
    const result = await offreService.getOffresByCandidat(req.user.candidatId, req.query);
    return res.json({ success: true, message: 'Vos offres récupérées avec succès', ...result });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir une offre par ID
 * GET /api/offres/:id
 */
const getOffreById = async (req, res) => {
  try {
    const offre = await offreService.getOffreById(req.params.id);
    return success(res, offre, 'Offre récupérée avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Mettre à jour une offre
 * PUT /api/offres/:id
 */
const updateOffre = async (req, res) => {
  try {
    const offre = await offreService.updateOffre(req.params.id, req.body);
    return success(res, offre, 'Offre mise à jour avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Évaluer une offre créée par un candidat
 * PUT /api/offres/:id/evaluer
 */
const evaluateOffre = async (req, res) => {
  try {
    const offre = await offreService.evaluateOffre(req.params.id, req.body);
    const statusOffre = req.body.statusOffre || req.body.statut;
    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   statusOffre === 'VALIDEE' ? 'OFFRE_VALIDEE' : 'OFFRE_REJETEE',
      module:   'OFFRE',
      entityId: parseInt(req.params.id),
      details:  { statusOffre, motifRefus: req.body.motifRefus || null },
      ip: req.ip,
    });
    return success(res, offre, 'Offre évaluée avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Supprimer une offre
 * DELETE /api/offres/:id
 */
const deleteOffre = async (req, res) => {
  try {
    const result = await offreService.deleteOffre(req.params.id);
    return success(res, result, 'Offre supprimée avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Télécharger un fichier joint à une offre
 * GET /api/offres/:id/fichier/:type  (type: cnib | demandeOffre)
 */
const getFichierOffre = async (req, res) => {
  try {
    const { id, type } = req.params;
    const offre = await offreService.getOffreById(id);

    const colonnesValides = ['cnib', 'demandeOffre'];
    if (!colonnesValides.includes(type)) {
      return res.status(400).json({ success: false, message: 'Type de fichier invalide' });
    }

    const pathField = `${type}_path`;
    if (!offre[type] && !offre[pathField]) {
      return res.status(404).json({ success: false, message: 'Fichier non trouvé' });
    }

    const buffer = fileStorage.readFile(offre[pathField], offre[type]);
    const filename = offre[`${type}_filename`] || `${type}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

// =====================================================
// CANDIDATURES
// =====================================================

/**
 * Créer une candidature à une offre
 * POST /api/offres/candidatures
 */
const createCandidatureOffre = async (req, res) => {
  try {
    const candidature = await offreService.createCandidatureOffre(
      req.user.candidatId,
      req.body.offres_idoffres,
      req.files
    );
    return success(res, candidature, 'Candidature soumise avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir les candidatures du candidat connecté
 * GET /api/offres/mes-candidatures
 */
const getMesCandidatures = async (req, res) => {
  try {
    const candidatures = await offreService.getCandidaturesByCandidat(req.user.candidatId);
    return success(res, candidatures, 'Candidatures récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir une candidature par ID
 * GET /api/offres/candidatures/:id
 */
const getCandidatureById = async (req, res) => {
  try {
    const candidature = await offreService.getCandidatureById(req.params.id);
    return success(res, candidature, 'Candidature récupérée avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Évaluer une candidature
 * PUT /api/offres/candidatures/:id/evaluer
 */
const evaluateCandidature = async (req, res) => {
  try {
    const candidature = await offreService.evaluateCandidature(
      req.params.id,
      req.body,
      req.user.username
    );
    return success(res, candidature, 'Candidature évaluée avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir les candidatures d'une offre
 * GET /api/offres/:offreId/candidatures
 */
const getCandidaturesByOffre = async (req, res) => {
  try {
    const candidatures = await offreService.getCandidaturesByOffre(req.params.offreId);
    return success(res, candidatures, 'Candidatures récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/offres/export
// Admin / Agents — exporter toutes les offres en CSV
// ─────────────────────────────────────────────────────────────
const exportOffres = async (req, res) => {
  try {
    const { Offre, Candidat, Agent } = require('../models');
    const offres = await Offre.findAll({
      where: { del: 0 },
      include: [
        { model: Candidat, as: 'candidatCreateur', attributes: ['nom', 'prenom', 'email'], required: false },
        { model: Agent,    as: 'agentCreateur',    attributes: ['nom', 'prenom'],          required: false },
      ],
      attributes: ['idoffres', 'typeOffre', 'titre', 'creePar', 'statusOffre', 'nombreCandidaturesMax', 'nombreCandidaturesActuelles', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const statusLabels = { ACTIVE: 'Active', FERMEE: 'Fermée', EXPIREE: 'Expirée', ARCHIVEE: 'Archivée' };

    const headers = ['N°', 'Type', 'Titre', 'Créé par', 'Auteur', 'Statut', 'Candidatures (max)', 'Candidatures reçues', 'Date création'];
    const rows = offres.map((o, i) => {
      const auteur = o.creePar === 'CANDIDAT'
        ? `${o.candidatCreateur?.prenom || ''} ${o.candidatCreateur?.nom || ''}`.trim()
        : `${o.agentCreateur?.prenom || ''} ${o.agentCreateur?.nom || ''}`.trim();
      return [
        i + 1,
        o.typeOffre  || '',
        o.titre      || '',
        o.creePar    || '',
        auteur,
        statusLabels[o.statusOffre] || o.statusOffre || '',
        o.nombreCandidaturesMax       ?? '',
        o.nombreCandidaturesActuelles ?? 0,
        fmt(o.createdAt),
      ];
    });

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\r\n');
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="offres_${today}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('[Offre] exportOffres:', err.message);
    return require('../utils/response.util').error(res, err.message || 'Erreur export CSV', 500);
  }
};

const exportOffresPDF = async (req, res) => {
  try {
    const { Offre, Candidat, Agent, Direction } = require('../models');
    const { genererRapportPDF, calcParMois, calcParStatut, calcParDirection } = require('../services/pdf.service');

    const offres = await Offre.findAll({
      where: { del: 0 },
      include: [
        { model: Candidat,  as: 'candidatCreateur', attributes: ['nom', 'prenom', 'email'], required: false },
        { model: Agent,     as: 'agentCreateur',    attributes: ['nom', 'prenom'],          required: false },
        { model: Direction, as: 'direction',         attributes: ['nom', 'accronyme'],       required: false },
      ],
      order: [['createdAt', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const total      = offres.length;
    const enAttente  = offres.filter(o => o.statusOffre === 'EN_ATTENTE').length;
    const validees   = offres.filter(o => o.statusOffre === 'VALIDEE').length;
    const rejetees   = offres.filter(o => o.statusOffre === 'REJETEE').length;

    const pdf = await genererRapportPDF({
      titre:        'Rapport des Offres Commerciales',
      module:       'OFFRES',
      statsCards: [
        { label: 'Total offres',  val: total,     color: '#0f172a' },
        { label: 'En attente',    val: enAttente, color: '#f59e0b' },
        { label: 'Validées',      val: validees,  color: '#16a34a' },
        { label: 'Rejetées',      val: rejetees,  color: '#dc2626' },
      ],
      parStatut:    calcParStatut(offres, 'statusOffre'),
      parDirection: calcParDirection(offres),
      parMois:      calcParMois(offres, 'createdAt'),
      colonnes: [
        { label: 'N°',         key: 'num',        width: 28 },
        { label: 'Type',       key: 'typeOffre',  width: 70 },
        { label: 'Titre',      key: 'titre',      width: 120 },
        { label: 'Auteur',     key: 'auteur',     width: 90 },
        { label: 'Créé par',   key: 'creePar',    width: 55 },
        { label: 'Statut',     key: 'statusOffre',width: 70 },
        { label: 'Date',       key: 'date',       width: 50 },
      ],
      lignes: offres.map((o, i) => {
        const auteur = o.creePar === 'CANDIDAT'
          ? `${o.candidatCreateur?.prenom || ''} ${o.candidatCreateur?.nom || ''}`.trim()
          : `${o.agentCreateur?.prenom || ''} ${o.agentCreateur?.nom || ''}`.trim();
        return { num: i + 1, typeOffre: o.typeOffre || '', titre: o.titre || '', auteur, creePar: o.creePar || '', statusOffre: o.statusOffre, date: fmt(o.createdAt) };
      }),
    });

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport_offres_${today}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    console.error('[Offre] exportOffresPDF:', err.message);
    return require('../utils/response.util').error(res, err.message || 'Erreur export PDF', 500);
  }
};

const transfererOffre = async (req, res) => {
  try {
    const offreId = parseInt(req.params.id);
    const { direction_iddirection } = req.body;
    if (!direction_iddirection) return error(res, 'La direction cible est requise', 400);
    const offre = await offreService.transfererOffre(offreId, direction_iddirection);
    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   'OFFRE_TRANSFEREE',
      module:   'OFFRE',
      entityId: offreId,
      details:  { direction_iddirection },
      ip: req.ip,
    });
    return success(res, offre, 'Offre transférée avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = {
  // Offres
  createOffreByCandidat,
  createOffreByAdmin,
  getAllOffres,
  getOffresActivesAdmin,
  getMesOffres,
  getOffreById,
  updateOffre,
  evaluateOffre,
  exportOffres,
  exportOffresPDF,
  deleteOffre,
  getFichierOffre,
  transfererOffre,

  // Candidatures
  createCandidatureOffre,
  getMesCandidatures,
  getCandidatureById,
  evaluateCandidature,
  getCandidaturesByOffre,
};
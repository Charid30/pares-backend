// src/controllers/aide.controller.js
const aideService = require('../services/aide.service');
const { success, error } = require('../utils/response.util');
const auditService = require('../services/audit.service');
const fileStorage = require('../utils/fileStorage.util');

// =====================================================
// AIDES
// =====================================================

/**
 * Créer une aide (par candidat)
 * POST /api/aides/candidat
 */
const createAideByCandidat = async (req, res) => {
  try {
    const aide = await aideService.createAideByCandidat(
      req.user.candidatId,
      req.body,
      req.files
    );
    return success(res, aide, 'Demande d\'aide créée avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Créer une aide (par admin)
 * POST /api/aides/admin
 */
const createAideByAdmin = async (req, res) => {
  try {
    const aide = await aideService.createAideByAdmin(req.user.id, req.body);
    return success(res, aide, 'Programme d\'aide créé avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir toutes les aides
 * GET /api/aides
 */
const getAllAides = async (req, res) => {
  try {
    const aides = await aideService.getAllAides(req.query);
    return success(res, aides, 'Aides récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir les aides actives créées par admin (pour candidatures)
 * GET /api/aides/actives
 */
const getAidesActivesAdmin = async (req, res) => {
  try {
    const aides = await aideService.getAidesActivesAdmin();
    return success(res, aides, 'Aides actives récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir les aides créées par le candidat connecté (paginées)
 * GET /api/aides/mes-aides?page=1&limit=10
 */
const getMesAides = async (req, res) => {
  try {
    const result = await aideService.getAidesByCandidat(req.user.candidatId, req.query);
    return res.json({ success: true, message: 'Vos demandes d\'aide récupérées avec succès', ...result });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir une aide par ID
 * GET /api/aides/:id
 */
const getAideById = async (req, res) => {
  try {
    const aide = await aideService.getAideById(req.params.id);
    return success(res, aide, 'Aide récupérée avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Mettre à jour une aide
 * PUT /api/aides/:id
 */
const updateAide = async (req, res) => {
  try {
    const aide = await aideService.updateAide(req.params.id, req.body);
    return success(res, aide, 'Aide mise à jour avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Évaluer une aide créée par un candidat
 * PUT /api/aides/:id/evaluer
 */
const evaluateAide = async (req, res) => {
  try {
    const aide = await aideService.evaluateAide(req.params.id, req.body);
    const statusAide = req.body.statusAide || req.body.statut;
    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   statusAide === 'VALIDEE' ? 'AIDE_VALIDEE' : 'AIDE_REJETEE',
      module:   'AIDE',
      entityId: parseInt(req.params.id),
      details:  { statusAide, motifRefus: req.body.motifRefus || null },
      ip: req.ip,
    });
    return success(res, aide, 'Aide évaluée avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Supprimer une aide
 * DELETE /api/aides/:id
 */
const deleteAide = async (req, res) => {
  try {
    const result = await aideService.deleteAide(req.params.id);
    return success(res, result, 'Aide supprimée avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Télécharger un fichier joint à une aide
 * GET /api/aides/:id/fichier/:type  (type: cnib | demandeAide)
 */
const getFichierAide = async (req, res) => {
  try {
    const { id, type } = req.params;
    const aide = await aideService.getAideById(id);

    const colonnesValides = ['cnib', 'demandeAide'];
    if (!colonnesValides.includes(type)) {
      return res.status(400).json({ success: false, message: 'Type de fichier invalide' });
    }

    const pathField = `${type}_path`;
    if (!aide[type] && !aide[pathField]) {
      return res.status(404).json({ success: false, message: 'Fichier non trouvé' });
    }

    const buffer = fileStorage.readFile(aide[pathField], aide[type]);
    const filename = aide[`${type}_filename`] || `${type}.pdf`;

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
 * Créer une candidature à une aide
 * POST /api/aides/candidatures
 */
const createCandidatureAide = async (req, res) => {
  try {
    const candidature = await aideService.createCandidatureAide(
      req.user.candidatId,
      req.body.aides_idaide,
      req.files
    );
    return success(res, candidature, 'Candidature soumise avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir les candidatures du candidat connecté
 * GET /api/aides/mes-candidatures
 */
const getMesCandidatures = async (req, res) => {
  try {
    const candidatures = await aideService.getCandidaturesByCandidat(req.user.candidatId);
    return success(res, candidatures, 'Candidatures récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir une candidature par ID
 * GET /api/aides/candidatures/:id
 */
const getCandidatureById = async (req, res) => {
  try {
    const candidature = await aideService.getCandidatureById(req.params.id);
    return success(res, candidature, 'Candidature récupérée avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Évaluer une candidature
 * PUT /api/aides/candidatures/:id/evaluer
 */
const evaluateCandidature = async (req, res) => {
  try {
    const candidature = await aideService.evaluateCandidature(
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
 * Obtenir les candidatures d'une aide
 * GET /api/aides/:aideId/candidatures
 */
const getCandidaturesByAide = async (req, res) => {
  try {
    const candidatures = await aideService.getCandidaturesByAide(req.params.aideId);
    return success(res, candidatures, 'Candidatures récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/aides/export
// Admin / Agents — exporter toutes les aides en CSV
// ─────────────────────────────────────────────────────────────
const exportAides = async (req, res) => {
  try {
    const { Aide, Candidat, Agent } = require('../models');
    const aides = await Aide.findAll({
      where: { del: 0 },
      include: [
        { model: Candidat, as: 'candidatCreateur', attributes: ['nom', 'prenom', 'email'], required: false },
        { model: Agent,    as: 'agentCreateur',    attributes: ['nom', 'prenom'],          required: false },
      ],
      attributes: ['idaides', 'typeAide', 'titre', 'creePar', 'statusAide', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const statusLabels = { ACTIVE: 'Active', FERMEE: 'Fermée', EXPIREE: 'Expirée', ARCHIVEE: 'Archivée' };

    const headers = ['N°', 'Type', 'Titre', 'Créé par', 'Auteur', 'Statut', 'Date création'];
    const rows = aides.map((a, i) => {
      const auteur = a.creePar === 'CANDIDAT'
        ? `${a.candidatCreateur?.prenom || ''} ${a.candidatCreateur?.nom || ''}`.trim()
        : `${a.agentCreateur?.prenom || ''} ${a.agentCreateur?.nom || ''}`.trim();
      return [
        i + 1,
        a.typeAide  || '',
        a.titre     || '',
        a.creePar   || '',
        auteur,
        statusLabels[a.statusAide] || a.statusAide || '',
        fmt(a.createdAt),
      ];
    });

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\r\n');
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="aides_${today}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('[Aide] exportAides:', err.message);
    return require('../utils/response.util').error(res, err.message || 'Erreur export CSV', 500);
  }
};

const exportAidesPDF = async (req, res) => {
  try {
    const { Aide, Candidat, Agent, Direction } = require('../models');
    const { genererRapportPDF, calcParMois, calcParStatut, calcParDirection } = require('../services/pdf.service');

    const aides = await Aide.findAll({
      where: { del: 0 },
      include: [
        { model: Candidat,  as: 'candidatCreateur', attributes: ['nom', 'prenom', 'email'], required: false },
        { model: Agent,     as: 'agentCreateur',    attributes: ['nom', 'prenom'],          required: false },
        { model: Direction, as: 'direction',         attributes: ['nom', 'accronyme'],       required: false },
      ],
      order: [['createdAt', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const total     = aides.length;
    const enAttente = aides.filter(a => a.statusAide === 'EN_ATTENTE').length;
    const validees  = aides.filter(a => a.statusAide === 'VALIDEE').length;
    const rejetees  = aides.filter(a => a.statusAide === 'REJETEE').length;

    const pdf = await genererRapportPDF({
      titre:        'Rapport des Aides Sociales',
      module:       'AIDES',
      statsCards: [
        { label: 'Total aides',  val: total,     color: '#0f172a' },
        { label: 'En attente',   val: enAttente, color: '#f59e0b' },
        { label: 'Validées',     val: validees,  color: '#16a34a' },
        { label: 'Rejetées',     val: rejetees,  color: '#dc2626' },
      ],
      parStatut:    calcParStatut(aides, 'statusAide'),
      parDirection: calcParDirection(aides),
      parMois:      calcParMois(aides, 'createdAt'),
      colonnes: [
        { label: 'N°',       key: 'num',       width: 28 },
        { label: 'Type',     key: 'typeAide',  width: 80 },
        { label: 'Titre',    key: 'titre',     width: 130 },
        { label: 'Auteur',   key: 'auteur',    width: 90 },
        { label: 'Créé par', key: 'creePar',   width: 55 },
        { label: 'Statut',   key: 'statusAide',width: 70 },
        { label: 'Date',     key: 'date',      width: 50 },
      ],
      lignes: aides.map((a, i) => {
        const auteur = a.creePar === 'CANDIDAT'
          ? `${a.candidatCreateur?.prenom || ''} ${a.candidatCreateur?.nom || ''}`.trim()
          : `${a.agentCreateur?.prenom || ''} ${a.agentCreateur?.nom || ''}`.trim();
        return { num: i + 1, typeAide: a.typeAide || '', titre: a.titre || '', auteur, creePar: a.creePar || '', statusAide: a.statusAide, date: fmt(a.createdAt) };
      }),
    });

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport_aides_${today}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    console.error('[Aide] exportAidesPDF:', err.message);
    return require('../utils/response.util').error(res, err.message || 'Erreur export PDF', 500);
  }
};

module.exports = {
  // Aides
  createAideByCandidat,
  createAideByAdmin,
  getAllAides,
  getAidesActivesAdmin,
  getMesAides,
  getAideById,
  updateAide,
  evaluateAide,
  exportAides,
  exportAidesPDF,
  deleteAide,
  getFichierAide,

  // Candidatures
  createCandidatureAide,
  getMesCandidatures,
  getCandidatureById,
  evaluateCandidature,
  getCandidaturesByAide,
};
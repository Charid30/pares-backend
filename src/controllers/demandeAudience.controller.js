// src/controllers/demandeAudience.controller.js
const demandeAudienceService = require('../services/demandeAudience.service');
const auditService = require('../services/audit.service');
const { Agent, Role, Permission } = require('../models');
const { Op } = require('sequelize');

const getUserRoles = (user) =>
  (Array.isArray(user.roles) && user.roles.length) ? user.roles : (user.role ? [user.role] : []);

// Vrai si l'utilisateur voit TOUTES les demandes (ADMIN ou rôle lectureGlobale sur DEMANDE_AUDIENCE)
const hasGlobalReadAccess = async (user) => {
  const roles = getUserRoles(user);
  if (roles.includes('ADMIN')) return true;
  const roleIds = Array.isArray(user.roleIds) ? user.roleIds : (user.roleId ? [user.roleId] : []);
  if (!roleIds.length) return false;
  const count = await Role.count({
    where: { idrole: { [Op.in]: roleIds }, lectureGlobale: true, del: 0 },
    include: [{ model: Permission, as: 'permissions', where: { module: 'DEMANDE_AUDIENCE', action: 'CONSULTER', del: 0 }, required: true }],
  });
  return count > 0;
};

// Retourne la direction de l'agent connecté (null si introuvable)
const resolveAgentDirection = async (agentId) => {
  if (!agentId) return null;
  const agent = await Agent.findOne({ where: { idagents: agentId, del: 0 }, attributes: ['direction_iddirection'] });
  return agent?.direction_iddirection ?? null;
};

// ─────────────────────────────────────────────────────────────
// HELPERS RÉPONSE
// ─────────────────────────────────────────────────────────────
const success = (res, data, message = 'Succès', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const error = (res, message = 'Erreur', statusCode = 400) =>
  res.status(statusCode).json({ success: false, message });

// ─────────────────────────────────────────────────────────────
// POST /api/demandes-audience/candidat
// Candidat — créer une demande
// ─────────────────────────────────────────────────────────────
const createDemande = async (req, res) => {
  try {
    const candidatId = req.user.candidatId;
    const file = req.file || null; // Fourni par multer si mode FICHIER
    const demande = await demandeAudienceService.createDemandeByCandidat(candidatId, req.body, file);
    return success(res, demande, 'Demande d\'audience soumise avec succès', 201);
  } catch (err) {
    console.error('[DemandeAudience] createDemande:', err.message);
    return error(res, err.message, 400);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/demandes-audience/mes-demandes
// Candidat — lister ses propres demandes
// ─────────────────────────────────────────────────────────────
const getMesDemandes = async (req, res) => {
  try {
    const candidatId = req.user.candidatId;
    const result = await demandeAudienceService.getMesDemandesByCandidat(candidatId, req.query);
    return res.status(200).json({
      success: true,
      message: 'Demandes récupérées avec succès',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('[DemandeAudience] getMesDemandes:', err.message);
    return error(res, err.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/demandes-audience/:id/annuler
// Candidat — annuler sa demande (seulement si EN_ATTENTE)
// ─────────────────────────────────────────────────────────────
const annulerDemande = async (req, res) => {
  try {
    const candidatId = req.user.candidatId;
    const demandeId = parseInt(req.params.id);
    const demande = await demandeAudienceService.annulerDemandeByCandidat(candidatId, demandeId);
    return success(res, demande, 'Demande annulée avec succès');
  } catch (err) {
    console.error('[DemandeAudience] annulerDemande:', err.message);
    return error(res, err.message, 400);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/demandes-audience
// Admin / Agents — lister toutes les demandes
// ─────────────────────────────────────────────────────────────
const getAllDemandes = async (req, res) => {
  try {
    const globalAccess = await hasGlobalReadAccess(req.user);
    const directionId = globalAccess ? null : await resolveAgentDirection(req.user.agentId);
    const result = await demandeAudienceService.getAllDemandes(req.query, directionId);
    return res.status(200).json({
      success: true,
      message: 'Demandes récupérées avec succès',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('[DemandeAudience] getAllDemandes:', err.message);
    return error(res, err.message, 500);
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/demandes-audience/:id/statut
// Admin / Agents — changer le statut (ACCEPTE ou REJETE)
// ─────────────────────────────────────────────────────────────
const updateStatut = async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const { status, commentaireAdmin } = req.body;
    if (!status) return error(res, 'Le statut est requis', 400);
    const demande = await demandeAudienceService.updateStatut(demandeId, status, commentaireAdmin);

    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   status === 'ACCEPTE' ? 'AUDIENCE_ACCEPTEE' : 'AUDIENCE_REJETEE',
      module:   'AUDIENCE',
      entityId: demandeId,
      details:  { status, commentaireAdmin: commentaireAdmin || null },
      ip: req.ip,
    });

    // ── Notification in-app au candidat ────────────────────────────────────
    try {
      const { Notification, DemandeAudience, Candidat, User } = require('../models');
      const d = await DemandeAudience.findByPk(demandeId, {
        include: [{ model: Candidat, as: 'candidat', include: [{ model: User, as: 'user' }] }],
      });
      if (d?.candidat?.user) {
        const accepte = status === 'ACCEPTE';
        await Notification.create({
          user_id:   d.candidat.user.idusers,
          type:      accepte ? 'AUDIENCE_ACCEPTEE' : 'AUDIENCE_REJETEE',
          title:     accepte ? 'Audience acceptée' : 'Audience rejetée',
          message:   accepte
            ? 'Votre demande d\'audience a été acceptée.'
            : `Votre demande d\'audience a été rejetée.${commentaireAdmin ? ' Motif : ' + commentaireAdmin : ''}`,
          link:      '/dashboard/candidat/audiences',
          read:      0,
        });
      }
    } catch (notifErr) {
      console.error('[DemandeAudience] Erreur notification:', notifErr.message);
    }

    return success(res, demande, 'Statut mis à jour avec succès');
  } catch (err) {
    console.error('[DemandeAudience] updateStatut:', err.message);
    return error(res, err.message, 400);
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/demandes-audience/:id
// Admin — affecter une direction à une demande
// ─────────────────────────────────────────────────────────────
const updateDemande = async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const demande = await demandeAudienceService.updateDemande(demandeId, req.body);

    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   'AUDIENCE_AFFECTATION',
      module:   'AUDIENCE',
      entityId: demandeId,
      details:  { direction_iddirection: req.body.direction_iddirection ?? null },
      ip: req.ip,
    });

    return success(res, demande, 'Affectation mise à jour avec succès');
  } catch (err) {
    console.error('[DemandeAudience] updateDemande:', err.message);
    return error(res, err.message, 400);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/demandes-audience/:id/fichier
// Admin / Agents — télécharger le fichier joint
// ─────────────────────────────────────────────────────────────
const getFichier = async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const { buffer, filename, size } = await demandeAudienceService.getFichierDemande(demandeId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': size,
    });
    return res.send(buffer);
  } catch (err) {
    console.error('[DemandeAudience] getFichier:', err.message);
    return error(res, err.message, 404);
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/demandes-audience/export
// Admin / Agents — exporter toutes les demandes en CSV
// ─────────────────────────────────────────────────────────────
const exportAudiences = async (req, res) => {
  try {
    const { DemandeAudience, Candidat } = require('../models');

    const demandes = await DemandeAudience.findAll({
      include: [{
        model: Candidat,
        as: 'candidat',
        attributes: ['nom', 'prenom', 'email', 'telephone'],
        required: false,
      }],
      attributes: ['iddemande', 'modeSoumission', 'pourM', 'motif', 'dateAudience', 'status', 'createdDate'],
      order: [['createdDate', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const statusLabels = { EN_ATTENTE: 'En attente', ACCEPTE: 'Accepté', REJETE: 'Rejeté', ANNULE: 'Annulé' };

    const headers = ['N°', 'Nom', 'Prénom', 'Email', 'Téléphone', 'Destinataire', 'Motif', 'Date audience', 'Statut', 'Date soumission'];
    const rows = demandes.map((d, i) => [
      i + 1,
      d.candidat?.nom        || '',
      d.candidat?.prenom     || '',
      d.candidat?.email      || '',
      d.candidat?.telephone  || '',
      d.pourM                || '',
      d.motif ? String(d.motif).substring(0, 150) : '',
      fmt(d.dateAudience),
      statusLabels[d.status] || d.status || '',
      fmt(d.createdDate),
    ]);

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\r\n');
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audiences_${today}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('[DemandeAudience] exportAudiences:', err.message);
    return error(res, err.message || 'Erreur export CSV', 500);
  }
};

const exportAudiencesPDF = async (req, res) => {
  try {
    const { DemandeAudience, Candidat, Direction } = require('../models');
    const { genererRapportPDF, calcParMois, calcParStatut, calcParDirection } = require('../services/pdf.service');

    const demandes = await DemandeAudience.findAll({
      where: { del: 0 },
      include: [
        { model: Candidat,  as: 'candidat',  attributes: ['nom', 'prenom', 'email', 'telephone'], required: false },
        { model: Direction, as: 'direction', attributes: ['nom', 'accronyme'], required: false },
      ],
      order: [['createdDate', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const total     = demandes.length;
    const enAttente = demandes.filter(d => d.status === 'EN_ATTENTE').length;
    const acceptes  = demandes.filter(d => d.status === 'ACCEPTE').length;
    const rejetes   = demandes.filter(d => d.status === 'REJETE').length;

    const pdf = await genererRapportPDF({
      titre:        'Rapport des Demandes d\'Audience',
      module:       'AUDIENCES',
      statsCards: [
        { label: 'Total demandes',  val: total,     color: '#0f172a' },
        { label: 'En attente',      val: enAttente, color: '#f59e0b' },
        { label: 'Acceptées',       val: acceptes,  color: '#16a34a' },
        { label: 'Rejetées',        val: rejetes,   color: '#dc2626' },
      ],
      parStatut:    calcParStatut(demandes, 'status'),
      parDirection: calcParDirection(demandes),
      parMois:      calcParMois(demandes, 'createdDate'),
      colonnes: [
        { label: 'N°',         key: 'num',        width: 28 },
        { label: 'Nom',        key: 'nom',        width: 80 },
        { label: 'Prénom',     key: 'prenom',     width: 80 },
        { label: 'Téléphone',  key: 'telephone',  width: 70 },
        { label: 'Destinat.',  key: 'pourM',      width: 70 },
        { label: 'Date aud.',  key: 'dateAud',    width: 55 },
        { label: 'Statut',     key: 'status',     width: 65 },
        { label: 'Soumission', key: 'soumission', width: 55 },
      ],
      lignes: demandes.map((d, i) => ({
        num:        i + 1,
        nom:        d.candidat?.nom       || '',
        prenom:     d.candidat?.prenom    || '',
        telephone:  d.candidat?.telephone || '',
        pourM:      d.pourM               || '',
        dateAud:    fmt(d.dateAudience),
        status:     d.status,
        soumission: fmt(d.createdDate),
      })),
    });

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport_audiences_${today}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    console.error('[DemandeAudience] exportAudiencesPDF:', err.message);
    return error(res, err.message || 'Erreur export PDF', 500);
  }
};

const transfererDemande = async (req, res) => {
  try {
    const demandeId = parseInt(req.params.id);
    const { direction_iddirection } = req.body;
    if (!direction_iddirection) return error(res, 'La direction cible est requise', 400);
    const demande = await demandeAudienceService.transfererDemande(demandeId, direction_iddirection);
    await auditService.log({
      agentId:  req.user?.agentId,
      agentNom: req.user?.username,
      action:   'AUDIENCE_TRANSFEREE',
      module:   'AUDIENCE',
      entityId: demandeId,
      details:  { direction_iddirection },
      ip: req.ip,
    });
    return success(res, demande, 'Demande transférée avec succès');
  } catch (err) {
    console.error('[DemandeAudience] transfererDemande:', err.message);
    return error(res, err.message, 400);
  }
};

module.exports = {
  createDemande,
  getMesDemandes,
  annulerDemande,
  getAllDemandes,
  updateStatut,
  updateDemande,
  transfererDemande,
  getFichier,
  exportAudiences,
  exportAudiencesPDF,
};

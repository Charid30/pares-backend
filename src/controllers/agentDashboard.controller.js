// src/controllers/agentDashboard.controller.js
// Stats du dashboard pour les agents à rôle personnalisé.
// Retourne uniquement les stats des modules autorisés + la liste des éléments à traiter.
const { Op } = require('sequelize');
const { success, error } = require('../utils/response.util');
const {
  Stage,
  Offre,
  Aide,
  DemandeAudience,
  DemandeModificationStage,
  Candidat,
  Permission,
} = require('../models');

const SYSTEM_AGENT_ROLES = ['ADMIN'];

// ── Historique 7 derniers jours ───────────────────────────────────────────────
/**
 * Compte les enregistrements créés par jour sur les 7 derniers jours.
 * @param {Model} Model  - Modèle Sequelize (Stage, Offre, etc.)
 * @param {boolean} hasDel - true si la table a une colonne "del"
 * @returns {Promise<number[]>} - tableau de 7 entiers [J-6 … J]
 */
const getModuleEvolution = async (Model, hasDel = true) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    const startStr = startDate.toISOString().split('T')[0];

    const tableName = Model.getTableName();
    const delClause = hasDel ? 'AND (del = 0 OR del IS NULL)' : '';

    const rows = await Model.sequelize.query(
      `SELECT DATE(createdDate) AS day, COUNT(*) AS cnt
         FROM \`${tableName}\`
        WHERE createdDate >= :startDate
          ${delClause}
        GROUP BY DATE(createdDate)
        ORDER BY day ASC`,
      {
        replacements: { startDate: startStr },
        type: Model.sequelize.QueryTypes.SELECT,
      },
    );

    // Convertir les lignes en map date → count
    const dateMap = {};
    rows.forEach(r => {
      const key = r.day instanceof Date
        ? r.day.toISOString().split('T')[0]
        : String(r.day);
      dateMap[key] = parseInt(r.cnt, 10) || 0;
    });

    // Construire un tableau de 7 jours consécutifs
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return dateMap[d.toISOString().split('T')[0]] || 0;
    });
  } catch {
    // En cas d'erreur (table sans created_at, colonne manquante…), retourner des 0
    return Array(7).fill(0);
  }
};

const getStats = async (req, res) => {
  try {
    // Filtre "non supprimé" : gère del=0 et del=NULL (anciens comptes)
    const notDeleted = { [Op.or]: [{ del: 0 }, { del: null }] };

    // ── Déterminer les modules accessibles ────────────────────────────────────
    let accessibleModules = [];

    if (SYSTEM_AGENT_ROLES.includes(req.user.role)) {
      accessibleModules = [
        'STAGE', 'SUIVI_STAGE', 'CANDIDATURES',
        'CANDIDATS', 'OFFRE', 'AIDE', 'DEMANDE_AUDIENCE',
      ];
    } else if (req.user.roleId) {
      const perms = await Permission.findAll({
        where: { role_idrole: req.user.roleId, del: 0 },
        attributes: ['module'],
      });
      accessibleModules = [...new Set(perms.map(p => p.module))];
    }

    const stats = {};
    const pendingItems = [];

    // ── Stages ───────────────────────────────────────────────────────────────
    if (accessibleModules.includes('STAGE') || accessibleModules.includes('SUIVI_STAGE')) {
      const [total, enAttente, enCours, termines] = await Promise.all([
        Stage.count({ where: notDeleted }),
        Stage.count({ where: { ...notDeleted, statusStage: 'EN_ATTENTE' } }),
        Stage.count({ where: { ...notDeleted, statusStage: { [Op.in]: ['EN_COURS', 'EN_TRAITEMENT'] } } }),
        Stage.count({ where: { ...notDeleted, statusStage: { [Op.in]: ['TERMINE', 'VALIDE'] } } }),
      ]);
      stats.stages = { total, enAttente, enCours, termines };
      if (enAttente > 0) {
        pendingItems.push({
          module: 'STAGE',
          label: 'Stages en attente',
          count: enAttente,
          route: '/dashboard/agent/stages',
          priority: enAttente > 5 ? 'high' : 'medium',
        });
      }
    }

    // ── Candidatures (offres commerciales) ───────────────────────────────────
    if (accessibleModules.includes('CANDIDATURES')) {
      const [total, enAttente] = await Promise.all([
        Stage.count({ where: notDeleted }),
        Stage.count({ where: { ...notDeleted, statusStage: { [Op.in]: ['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT'] } } }),
      ]);
      stats.candidatures = { total, enAttente };
      if (enAttente > 0) {
        pendingItems.push({
          module: 'CANDIDATURES',
          label: 'Candidatures à examiner',
          count: enAttente,
          route: '/dashboard/agent/candidatures',
          priority: enAttente > 5 ? 'high' : 'medium',
        });
      }
    }

    // ── Candidats ─────────────────────────────────────────────────────────────
    if (accessibleModules.includes('CANDIDATS')) {
      const total = await Candidat.count({ where: notDeleted });
      stats.candidats = { total };
    }

    // ── Offres commerciales ───────────────────────────────────────────────────
    if (accessibleModules.includes('OFFRE')) {
      const [total, enAttente, validees] = await Promise.all([
        Offre.count({ where: notDeleted }),
        Offre.count({ where: { ...notDeleted, statusOffre: { [Op.in]: ['EN_ATTENTE', 'EN_TRAITEMENT'] } } }),
        Offre.count({ where: { ...notDeleted, statusOffre: 'VALIDEE' } }),
      ]);
      stats.offres = { total, enAttente, validees };
      if (enAttente > 0) {
        pendingItems.push({
          module: 'OFFRE',
          label: 'Offres en attente',
          count: enAttente,
          route: '/dashboard/agent/offres',
          priority: 'medium',
        });
      }
    }

    // ── Aides sociales ────────────────────────────────────────────────────────
    if (accessibleModules.includes('AIDE')) {
      const [total, enAttente, validees] = await Promise.all([
        Aide.count({ where: notDeleted }),
        Aide.count({ where: { ...notDeleted, statusAide: { [Op.in]: ['EN_ATTENTE', 'EN_TRAITEMENT'] } } }),
        Aide.count({ where: { ...notDeleted, statusAide: 'VALIDEE' } }),
      ]);
      stats.aides = { total, enAttente, validees };
      if (enAttente > 0) {
        pendingItems.push({
          module: 'AIDE',
          label: 'Aides en attente',
          count: enAttente,
          route: '/dashboard/agent/aides',
          priority: 'medium',
        });
      }
    }

    // ── Demandes d'audience ───────────────────────────────────────────────────
    if (accessibleModules.includes('DEMANDE_AUDIENCE')) {
      const [total, enAttente, acceptees] = await Promise.all([
        DemandeAudience.count({ where: notDeleted }),
        DemandeAudience.count({ where: { ...notDeleted, status: 'EN_ATTENTE' } }),
        DemandeAudience.count({ where: { ...notDeleted, status: 'ACCEPTE' } }),
      ]);
      stats.audiences = { total, enAttente, acceptees };
      if (enAttente > 0) {
        pendingItems.push({
          module: 'DEMANDE_AUDIENCE',
          label: "Audiences en attente",
          count: enAttente,
          route: '/dashboard/agent/audiences',
          priority: 'low',
        });
      }
    }

    // ── Suspensions / Annulations ────────────────────────────────────────────
    if (accessibleModules.includes('SUSPENSION_STAGE')) {
      const [total, enAttente] = await Promise.all([
        DemandeModificationStage.count({ where: notDeleted }),
        DemandeModificationStage.count({ where: { ...notDeleted, status: 'EN_ATTENTE' } }),
      ]);
      stats.suspensions = { total, enAttente };
      if (enAttente > 0) {
        pendingItems.push({
          module: 'SUSPENSION_STAGE',
          label: 'Suspensions / Annulations en attente',
          count: enAttente,
          route: '/dashboard/agent/suspensions',
          priority: 'medium',
        });
      }
    }

    // ── Historique 7 jours par module (en parallèle, silencieux en cas d'erreur) ──
    const evolution = {};
    const evoTasks = [];

    if (accessibleModules.includes('STAGE') || accessibleModules.includes('SUIVI_STAGE')) {
      evoTasks.push(getModuleEvolution(Stage).then(d => { evolution.STAGE = d; }));
    }
    if (accessibleModules.includes('OFFRE')) {
      evoTasks.push(getModuleEvolution(Offre).then(d => { evolution.OFFRE = d; }));
    }
    if (accessibleModules.includes('AIDE')) {
      evoTasks.push(getModuleEvolution(Aide).then(d => { evolution.AIDE = d; }));
    }
    if (accessibleModules.includes('DEMANDE_AUDIENCE')) {
      evoTasks.push(getModuleEvolution(DemandeAudience).then(d => { evolution.DEMANDE_AUDIENCE = d; }));
    }
    if (accessibleModules.includes('CANDIDATS')) {
      evoTasks.push(getModuleEvolution(Candidat, false).then(d => { evolution.CANDIDATS = d; }));
    }
    await Promise.all(evoTasks);

    return success(res, { stats, accessibleModules, pendingItems, evolution }, 'Stats chargées');
  } catch (err) {
    console.error('Erreur agentDashboard:', err.message);
    return error(res, err.message || 'Erreur serveur', 500);
  }
};

module.exports = { getStats };

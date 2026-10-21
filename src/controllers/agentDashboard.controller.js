// src/controllers/agentDashboard.controller.js
// Tableau de bord « poste de travail » des agents.
// Retourne la file de travail (ce que l'agent peut faire maintenant, selon ses permissions)
// et quelques chiffres clés, limités aux directions de l'agent — sauf rôle système
// (ADMIN, AGENT_RH…), qui voit toutes les directions.
const { Op } = require('sequelize');
const { success, error } = require('../utils/response.util');
const { getAgentDirections } = require('../utils/agentDirections.util');
const {
  Stage,
  RenouvellementStage,
  RapportStage,
  DemandeModificationStage,
  Offre,
  Aide,
  DemandeAudience,
  Agent,
  AgentDirection,
  Service,
  Direction,
  Permission,
} = require('../models');

// Mêmes rôles « portée globale » que stage.controller.js (ACTION_SYSTEM_ROLES)
const GLOBAL_ROLES = ['ADMIN', 'AGENT_RH', 'AGENT_FINANCIER', 'AGENT_COMMERCIAL'];
const ADMIN_MODULES = [
  'STAGE', 'RENOUVELLEMENT', 'SUIVI_STAGE', 'SUSPENSION_STAGE', 'CANDIDATURES',
  'CANDIDATS', 'OFFRE', 'AIDE', 'DEMANDE_AUDIENCE',
];
const JOUR_MS = 24 * 60 * 60 * 1000;

const getUserRoles = (user) =>
  (Array.isArray(user.roles) && user.roles.length) ? user.roles : (user.role ? [user.role] : []);
const getUserRoleIds = (user) =>
  (Array.isArray(user.roleIds) && user.roleIds.length) ? user.roleIds : (user.roleId ? [user.roleId] : []);

/** Permissions de l'utilisateur (union de ses rôles) : Set de « MODULE:ACTION ». ADMIN → tout. */
const chargerPermissions = async (user) => {
  if (getUserRoles(user).includes('ADMIN')) return { isAdmin: true, perms: new Set(), modules: ADMIN_MODULES };
  const roleIds = getUserRoleIds(user);
  if (!roleIds.length) return { isAdmin: false, perms: new Set(), modules: [] };
  const rows = await Permission.findAll({
    where: { role_idrole: { [Op.in]: roleIds }, del: 0 },
    attributes: ['module', 'action'],
  });
  return {
    isAdmin: false,
    perms: new Set(rows.map(p => `${p.module}:${p.action}`)),
    modules: [...new Set(rows.map(p => p.module))],
  };
};

/**
 * Directions de l'agent, résolues comme dans chaque écran :
 * - stages (stage.service) : service → directions, sinon direction directe ;
 * - aides / offres / audiences : table agents_directions, sinon colonne historique.
 */
const chargerDirections = async (agentId) => {
  if (!agentId) return { stage: [], autres: [], liste: [] };
  const agent = await Agent.findByPk(agentId, {
    include: [
      { model: Service, as: 'service', include: [{ model: Direction, as: 'directions', through: { attributes: [] } }] },
      { model: Direction, as: 'directionDirecte' },
    ],
  });
  const liste = getAgentDirections(agent);
  const rows = await AgentDirection.findAll({ where: { agent_idagents: agentId }, attributes: ['direction_iddirection'] });
  const autres = rows.length
    ? rows.map(r => r.direction_iddirection)
    : (agent?.direction_iddirection ? [agent.direction_iddirection] : []);
  return { stage: liste.map(d => d.iddirection), autres, liste };
};

/** Filtre direction : null = pas de restriction ; liste vide → aucun résultat. */
const filtreDirection = (ids) => (ids === null
  ? {}
  : { direction_iddirection: ids.length ? { [Op.in]: ids } : { [Op.eq]: -1 } });

/** Priorité selon l'ancienneté du plus vieux dossier en attente. */
const prioriteDepuis = (plusAncien) => {
  if (!plusAncien) return 'medium';
  const jours = Math.floor((Date.now() - new Date(plusAncien).getTime()) / JOUR_MS);
  return jours > 7 ? 'high' : jours > 3 ? 'medium' : 'low';
};

/**
 * Compte un type de tâche : { count, plusAncien }.
 * `include` permet de filtrer par la direction du stage lié (renouvellement, rapport, suspension).
 */
const compter = async (Model, where, include, colonneDate) => {
  const options = include ? { where, include, distinct: true } : { where };
  const count = await Model.count(options);
  if (!count) return { count: 0, plusAncien: null };
  const premier = await Model.findOne({
    where,
    include,
    attributes: [colonneDate],
    order: [[colonneDate, 'ASC']],
  });
  return { count, plusAncien: premier ? premier[colonneDate] : null };
};

const includeStage = (dirStage) => [{
  model: Stage, as: 'stage', attributes: [], required: true,
  where: { del: 0, ...filtreDirection(dirStage) },
}];

/** Construit les données du tableau de bord pour un utilisateur authentifié. */
const construireDashboard = async (user) => {
  const { isAdmin, perms, modules } = await chargerPermissions(user);
  const peut = (module, action) => isAdmin || perms.has(`${module}:${action}`);
  const aModule = (module) => modules.includes(module);

  const porteeGlobale = getUserRoles(user).some(r => GLOBAL_ROLES.includes(r));
  const dirs = await chargerDirections(user.agentId);
  const dirStage = porteeGlobale ? null : dirs.stage;
  const dirAutres = porteeGlobale ? null : dirs.autres;

  const notDeleted = { [Op.or]: [{ del: 0 }, { del: null }] };
  const taches = [];
  const ajouter = async (def, Model, where, include, colonneDate = 'createdDate') => {
    const { count, plusAncien } = await compter(Model, where, include, colonneDate);
    if (count > 0) taches.push({ ...def, count, plusAncien, priority: prioriteDepuis(plusAncien) });
  };

  const moduleStage = aModule('STAGE');
  const stageWhere = { ...notDeleted, ...filtreDirection(dirStage) };
  const renouvInclude = (dir) => [{
    model: Stage, as: 'stageNouveau', attributes: [], required: true,
    where: { del: 0, ...filtreDirection(dir) },
  }];

  // ── Stages et renouvellements (module STAGE) ─────────────────────────────
  if (moduleStage && peut('STAGE', 'APPROUVER')) {
    await ajouter({
      cle: 'STAGES_A_APPROUVER', module: 'STAGE', action: 'APPROUVER',
      label: 'Demandes de stage à approuver', route: '/dashboard/agent/stages',
    }, Stage, { ...stageWhere, stage_parent_idstage: null, statusStage: 'EN_ATTENTE' });
  }
  if (moduleStage && peut('STAGE', 'VALIDER')) {
    await ajouter({
      cle: 'STAGES_A_ACCEPTER', module: 'STAGE', action: 'VALIDER',
      label: 'Stages à accepter (convention à joindre)', route: '/dashboard/agent/stages',
    }, Stage, { ...stageWhere, stage_parent_idstage: null, statusStage: 'PROGRAMMATION_EN_COURS' });
  }
  // ── Renouvellements (module RENOUVELLEMENT) ──────────────────────────────
  const moduleRenouv = aModule('RENOUVELLEMENT');
  if (moduleRenouv && peut('RENOUVELLEMENT', 'APPROUVER')) {
    await ajouter({
      cle: 'RENOUVELLEMENTS_A_APPROUVER', module: 'RENOUVELLEMENT', action: 'APPROUVER',
      label: 'Renouvellements à approuver', route: '/dashboard/agent/renouvellements',
    }, RenouvellementStage,
    { del: 0, statusRenouvellement: { [Op.in]: ['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT'] } },
    renouvInclude(dirStage), 'dateRenouvellement');
  }
  if (moduleRenouv && peut('RENOUVELLEMENT', 'VALIDER')) {
    await ajouter({
      cle: 'RENOUVELLEMENTS_A_ACCEPTER', module: 'RENOUVELLEMENT', action: 'VALIDER',
      label: 'Renouvellements à accepter (convention à joindre)', route: '/dashboard/agent/renouvellements',
    }, RenouvellementStage,
    { del: 0, statusRenouvellement: 'PROGRAMMATION_EN_COURS' },
    renouvInclude(dirStage), 'dateRenouvellement');
  }
  if (moduleStage && peut('STAGE', 'VALIDER')) {
    await ajouter({
      cle: 'RAPPORTS_A_EVALUER', module: 'RAPPORT', action: 'VALIDER',
      label: 'Rapports de stage à évaluer', route: '/dashboard/agent/rapports',
    }, RapportStage,
    { ...notDeleted, statusRapport: { [Op.in]: ['SOUMIS', 'EN_EVALUATION'] } },
    includeStage(dirStage));
  }

  // ── Suspensions / annulations ────────────────────────────────────────────
  if (aModule('SUSPENSION_STAGE') && (peut('SUSPENSION_STAGE', 'VALIDER') || peut('SUSPENSION_STAGE', 'REJETER'))) {
    await ajouter({
      cle: 'SUSPENSIONS_A_TRAITER', module: 'SUSPENSION_STAGE', action: 'VALIDER',
      label: 'Suspensions / annulations à traiter', route: '/dashboard/agent/suspensions',
    }, DemandeModificationStage, { ...notDeleted, status: 'EN_ATTENTE' }, includeStage(dirStage));
  }

  // ── Offres, aides, audiences (accès au module suffit, comme leurs écrans) ─
  if (aModule('OFFRE')) {
    await ajouter({
      cle: 'OFFRES_A_TRAITER', module: 'OFFRE', action: null,
      label: 'Offres commerciales à traiter', route: '/dashboard/agent/offres',
    }, Offre, { ...notDeleted, ...filtreDirection(dirAutres), statusOffre: { [Op.in]: ['EN_ATTENTE', 'EN_TRAITEMENT'] } });
  }
  if (aModule('AIDE')) {
    await ajouter({
      cle: 'AIDES_A_TRAITER', module: 'AIDE', action: null,
      label: 'Aides sociales à traiter', route: '/dashboard/agent/aides',
    }, Aide, { ...notDeleted, ...filtreDirection(dirAutres), statusAide: { [Op.in]: ['EN_ATTENTE', 'EN_TRAITEMENT'] } });
  }
  if (aModule('DEMANDE_AUDIENCE')) {
    await ajouter({
      cle: 'AUDIENCES_A_TRAITER', module: 'DEMANDE_AUDIENCE', action: null,
      label: "Demandes d'audience à traiter", route: '/dashboard/agent/audiences',
    }, DemandeAudience, { ...notDeleted, ...filtreDirection(dirAutres), status: 'EN_ATTENTE' });
  }

  const ordre = { high: 0, medium: 1, low: 2 };
  taches.sort((a, b) => ordre[a.priority] - ordre[b.priority] || b.count - a.count);

  // ── Échéances et chiffres clés (stages de ses directions) ────────────────
  let echeances = [];
  const kpis = {};
  if (moduleStage || aModule('SUIVI_STAGE')) {
    const aujourdHui = new Date();
    aujourdHui.setHours(0, 0, 0, 0);
    const dans7j = new Date(aujourdHui.getTime() + 7 * JOUR_MS);
    const debutMois = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1);
    const racine = { ...stageWhere, stage_parent_idstage: null };

    const [enStage, finSous7j, demandesTotal, demandesMois] = await Promise.all([
      Stage.count({ where: { ...stageWhere, statusStage: 'EN_COURS' } }),
      Stage.count({ where: { ...stageWhere, statusStage: 'EN_COURS', dateFinEffective: { [Op.between]: [aujourdHui, dans7j] } } }),
      Stage.count({ where: racine }),
      Stage.count({ where: { ...racine, createdDate: { [Op.gte]: debutMois } } }),
    ]);
    Object.assign(kpis, { enStage, demandesTotal, demandesMois });
    if (finSous7j > 0) {
      echeances = [{
        cle: 'STAGES_FIN_7J', module: 'SUIVI_STAGE', count: finSous7j,
        label: 'Stages qui se terminent sous 7 jours',
        route: aModule('SUIVI_STAGE') ? '/dashboard/agent/suivi-stages' : '/dashboard/agent/stages',
      }];
    }
  }
  kpis.aTraiter = taches.reduce((s, t) => s + t.count, 0);

  return {
    accessibleModules: modules,
    porteeGlobale,
    directions: dirs.liste.map(d => ({ iddirection: d.iddirection, nom: d.nom, accronyme: d.accronyme })),
    taches,
    echeances,
    kpis,
  };
};

const getStats = async (req, res) => {
  try {
    const data = await construireDashboard(req.user);
    return success(res, data, 'Stats chargées');
  } catch (err) {
    console.error('Erreur agentDashboard:', err.message);
    return error(res, err.message || 'Erreur serveur', 500);
  }
};

module.exports = { getStats, construireDashboard };

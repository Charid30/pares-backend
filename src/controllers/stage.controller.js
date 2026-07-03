// src/controllers/stage.controller.js
const stageService = require('../services/stage.service');
const { updateAllStageStatuses } = require('../jobs/stageStatusJob');
const { success, error } = require('../utils/response.util');
const auditService = require('../services/audit.service');
const { Role, Permission } = require('../models');
const { Op } = require('sequelize');

// Protège contre l'injection CRLF dans le header Content-Disposition
const sanitizeFilename = (name) => (name || 'document.pdf').replace(/[\r\n"]/g, '_');

// Rôles dont la portée d'ACTION (approuver/valider/rejeter/évaluer) ET de lecture
// n'est pas limitée à une direction (administration globale).
const ACTION_SYSTEM_ROLES = ['ADMIN', 'AGENT_RH', 'AGENT_FINANCIER', 'AGENT_COMMERCIAL'];

const getUserRoles = (user) =>
  (Array.isArray(user.roles) && user.roles.length) ? user.roles : (user.role ? [user.role] : []);

const getAgentContext = (user) => {
  const userRoles = getUserRoles(user);
  const hasSystemRole = userRoles.some(r => ACTION_SYSTEM_ROLES.includes(r));
  // Un rôle lectureGlobale (sous-admin) bypass aussi la restriction de direction pour les ACTIONS.
  // Les permissions (VALIDER, REJETER…) restent vérifiées normalement par authorizeAction/authorizeAnyAction.
  const hasLectureGlobaleRole = (Array.isArray(user.roles) ? user.roles : [])
    .some(r => r.lectureGlobale);
  return {
    agentId: user.agentId,
    isSystemRole: hasSystemRole || hasLectureGlobaleRole,
  };
};

/**
 * Un agent voit TOUS les stages (toutes directions) si :
 * - il a un rôle système (ADMIN, AGENT_RH, ...), OU
 * - il a un rôle marqué "lecture globale" qui a la permission Consulter sur le module STAGE.
 * Ce bypass ne s'applique qu'à la LECTURE — jamais aux actions (voir getAgentContext).
 */
const hasGlobalReadAccess = async (user, module) => {
  const userRoles = getUserRoles(user);
  if (userRoles.some(r => ACTION_SYSTEM_ROLES.includes(r))) return true;

  const roleIds = Array.isArray(user.roleIds) ? user.roleIds : (user.roleId ? [user.roleId] : []);
  if (!roleIds.length) return false;

  const count = await Role.count({
    where: { idrole: { [Op.in]: roleIds }, lectureGlobale: true, del: 0 },
    include: [{
      model: Permission,
      as: 'permissions',
      where: { module, action: 'CONSULTER', del: 0 },
      required: true,
    }],
  });
  return count > 0;
};

/**
 * Un agent peut AGIR sur tous les stages (toutes directions) pour une ou plusieurs actions
 * données si un de ses rôles "lecture globale" possède cette permission précise sur le module
 * (ex. Admin_RH avec lectureGlobale + VALIDER sur STAGE). Contrairement à hasGlobalReadAccess,
 * ceci porte sur des actions (pas seulement CONSULTER) — utilisé uniquement par les écrans
 * dédiés "Vue globale" pour ne jamais élargir la portée des rôles d'action classiques.
 */
const hasGlobalActionAccess = async (user, module, actions) => {
  const roleIds = Array.isArray(user.roleIds) ? user.roleIds : (user.roleId ? [user.roleId] : []);
  if (!roleIds.length) return false;

  const count = await Role.count({
    where: { idrole: { [Op.in]: roleIds }, lectureGlobale: true, del: 0 },
    include: [{
      model: Permission,
      as: 'permissions',
      where: { module, action: { [Op.in]: actions }, del: 0 },
      required: true,
    }],
  });
  return count > 0;
};

// =====================================================
// STAGES
// =====================================================

/**
 * Créer une demande de stage
 * POST /api/stages
 */
const createStage = async (req, res) => {
  try {
    const stage = await stageService.createStage(
      req.user.candidatId,
      req.body,
      req.files
    );
    return success(res, stage, 'Demande de stage créée avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir tous les stages (pour agents)
 * GET /api/stages
 */
// Actions de validation de stage pouvant être accordées globalement (toutes directions)
// à un rôle "lecture globale" (ex. Admin_RH), via les écrans dédiés "Vue globale".
// CREER est inclus pour l'écran "Stage Terminé" : joindre l'attestation à un stage
// terminé hors de la direction du sous-admin.
const STAGE_GLOBAL_ACTIONS = ['APPROUVER', 'VALIDER', 'REJETER', 'CREER'];

// Associe chaque action globale à LA SEULE transition de statut qu'elle autorise hors
// direction. Évite qu'une permission VALIDER accordée pour l'écran "Stage Approuvé"
// (joindre la convention = ACCEPTE) ne donne accidentellement accès à d'autres transitions
// gérées par le même endpoint (SUSPENDU, EN_COURS, ANNULE) sur des stages hors direction.
const STAGE_GLOBAL_ACTION_STATUS = { VALIDER: 'ACCEPTE', REJETER: 'REJETE' };

const getAllStages = async (req, res) => {
  try {
    // scope=direction : force le filtrage par direction même si l'agent a un rôle
    // "lecture globale" — utilisé par le menu d'action "Stage [DIRECTION]" pour ne
    // jamais mélanger les demandes hors direction avec les demandes actionnables.
    const forceDirectionScope = req.query.scope === 'direction';
    const isGlobalScope = req.query.scope === 'global';
    const isSystemRole = forceDirectionScope ? false : await hasGlobalReadAccess(req.user, 'STAGE');
    const isActionSystemRole = getAgentContext(req.user).isSystemRole
      || await hasGlobalActionAccess(req.user, 'STAGE', STAGE_GLOBAL_ACTIONS);
    const stages = await stageService.getAllStages(req.query, {
      agentId: req.user.agentId,
      isSystemRole,
      isActionSystemRole,
      // Sur l'écran "Vue globale", peutAgir ne doit refléter QUE l'accès global (sous-admin) —
      // jamais le fait que l'agent possède par ailleurs cette direction via un autre rôle
      // (ex. "Approbateur de stage"), sinon les permissions de ce rôle local "fuiteraient"
      // sur l'écran global au lieu de rester confinées à l'écran "Stage [DIRECTION]".
      ignoreOwnDirection: isGlobalScope,
    });
    return success(res, stages, 'Stages récupérés avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir les statistiques des stages
 * GET /api/stages/stats
 */
const getStagesStats = async (req, res) => {
  try {
    const stats = await stageService.getStagesStats();
    return success(res, stats, 'Statistiques des stages récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getDomainesDistincts = async (req, res) => {
  try {
    const domaines = await stageService.getDomainesDistincts();
    return success(res, domaines, 'Domaines récupérés avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Declencher manuellement la verification des statuts
 * POST /api/stages/check-status
 */
const checkAndUpdateStatuses = async (req, res) => {
  try {
    const result = await updateAllStageStatuses();
    return success(res, result, `Verification terminee: ${result.activated} active(s), ${result.expired} expire(s)`);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir les stages du candidat connecté
 * GET /api/stages/mes-stages
 */
const getMesStages = async (req, res) => {
  try {
    const stages = await stageService.getStagesByCandidat(req.user.candidatId);
    return success(res, stages, 'Vos stages récupérés avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir un stage par ID
 * GET /api/stages/:id
 */
const getStageById = async (req, res) => {
  try {
    const stage = await stageService.getStageById(req.params.id, req.user);
    return success(res, stage, 'Stage récupéré avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Mettre à jour le statut d'un stage (pour agents)
 * PUT /api/stages/:id/statut
 */
const updateStatusStage = async (req, res) => {
  try {
    // req.file contient la convention si uploade
    // req.user.agentId contient l'ID de l'agent connecte
    const agentId = req.user.agentId || null;
    const agentContext = getAgentContext(req.user);
    // Un rôle "lecture globale" avec VALIDER/REJETER (ex. Admin_RH) peut traiter un stage
    // hors de sa direction UNIQUEMENT pour la transition exacte associée à cette permission
    // (ACCEPTE pour VALIDER, REJETE pour REJETER) — c'est-à-dire exactement ce que fait
    // l'écran dédié "Stage Approuvé". Toute autre transition (SUSPENDU, EN_COURS, ANNULE)
    // reste soumise au contrôle de direction normal, même pour ce rôle.
    if (!agentContext.isSystemRole) {
      const requestedStatus = req.body.statusStage;
      const matchingAction = Object.keys(STAGE_GLOBAL_ACTION_STATUS)
        .find(action => STAGE_GLOBAL_ACTION_STATUS[action] === requestedStatus);
      if (matchingAction && await hasGlobalActionAccess(req.user, 'STAGE', [matchingAction])) {
        agentContext.isSystemRole = true;
      }
    }
    const stage = await stageService.updateStatusStage(req.params.id, req.body, req.file, agentId, agentContext);
    // Audit log
    const statusStage = req.body.statusStage;
    const actionMap = {
      ACCEPTE:                'STAGE_ACCEPTE',
      REJETE:                 'STAGE_REJETE',
      EN_COURS_DE_TRAITEMENT: 'STAGE_EN_TRAITEMENT',
    };
    await auditService.log({
      agentId:  req.user.agentId,
      agentNom: req.user.username,
      action:   actionMap[statusStage] || `STAGE_${statusStage}`,
      module:   'STAGE',
      entityId: parseInt(req.params.id),
      details: {
        statusStage,
        motifRefus:          req.body.motifRefus          || null,
        dateDebutEffective:  req.body.dateDebutEffective  || null,
      },
      ip: req.ip,
    });
    return success(res, stage, 'Statut du stage mis à jour avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Fusionner tous les documents d'un dossier de stage en un seul PDF
 * GET /api/stages/:id/documents/print-all
 */
const printAllStageDocuments = async (req, res) => {
  try {
    const mergedBuffer = await stageService.mergeStageDocuments(req.params.id, req.user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="dossier_stage_${req.params.id}.pdf"`);
    res.send(mergedBuffer);
  } catch (err) {
    console.error('[printAllStageDocuments] Erreur:', err.message, err.stack);
    return error(res, err.message, 404);
  }
};

/**
 * Télécharger un document de stage (CV, CNIB, etc.)
 * GET /api/stages/:id/documents/:type
 */
const downloadStageDocument = async (req, res) => {
  try {
    const document = await stageService.downloadStageDocument(
      req.params.id,
      req.params.type,
      req.user
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(document.filename)}"`);
    res.send(document.buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Telecharger la convention de stage
 * GET /api/stages/:id/convention
 */
const downloadConventionStage = async (req, res) => {
  try {
    const document = await stageService.downloadConventionStage(req.params.id, req.user);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(document.filename)}"`);
    res.send(document.buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

// =====================================================
// SUIVI DES STAGES
// =====================================================

/**
 * Récupérer la liste des stages EN_COURS avec durée cumulée (suivi admin)
 * GET /api/stages/suivi
 */
const getStagesSuivi = async (req, res) => {
  try {
    const stages = await stageService.getStagesSuivi(req.query);
    return success(res, stages, 'Suivi des stages récupéré avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// =====================================================
// RENOUVELLEMENTS
// =====================================================

/**
 * Créer une demande de renouvellement
 * POST /api/stages/renouvellements
 */
const createRenouvellement = async (req, res) => {
  try {
    const result = await stageService.createRenouvellement(
      req.user.candidatId,
      req.body,
      req.files
    );
    return success(res, result, 'Demande de renouvellement créée avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir tous les renouvellements (pour agents)
 * GET /api/stages/renouvellements
 */
const getAllRenouvellements = async (req, res) => {
  try {
    const renouvellements = await stageService.getAllRenouvellements(req.query);
    return success(res, renouvellements, 'Renouvellements récupérés avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Évaluer un renouvellement (pour agents)
 * PUT /api/stages/renouvellements/:id/evaluer
 */
const evaluateRenouvellement = async (req, res) => {
  try {
    const renouvellement = await stageService.evaluateRenouvellement(
      req.params.id,
      req.body,
      getAgentContext(req.user)
    );
    const statut = req.body.statut || req.body.statusRenouvellement;
    await auditService.log({
      agentId:  req.user.agentId,
      agentNom: req.user.username,
      action:   statut === 'ACCEPTE' ? 'RENOUVELLEMENT_ACCEPTE' : 'RENOUVELLEMENT_REJETE',
      module:   'STAGE',
      entityId: parseInt(req.params.id),
      details:  { statut, motifRefus: req.body.motifRefus || null },
      ip: req.ip,
    });
    return success(res, renouvellement, 'Renouvellement évalué avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Télécharger la lettre de demande de renouvellement
 * GET /api/stages/renouvellements/:id/lettre
 */
const downloadLettreRenouvellement = async (req, res) => {
  try {
    const document = await stageService.downloadLettreRenouvellement(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(document.filename)}"`);
    res.send(document.buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Télécharger la convention du stage en cours (copiée dans le renouvellement)
 * GET /api/stages/renouvellements/:id/convention
 */
const downloadConventionRenouvellement = async (req, res) => {
  try {
    const document = await stageService.downloadConventionRenouvellement(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(document.filename)}"`);
    res.send(document.buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

// =====================================================
// RAPPORTS
// =====================================================

/**
 * Créer un rapport de stage
 * POST /api/stages/rapports
 */
const createRapport = async (req, res) => {
  try {
    if (!req.file) {
      return error(res, 'Le fichier PDF du rapport est requis', 400);
    }
    
    const rapport = await stageService.createRapport(
      req.user.candidatId,
      req.body,
      req.file
    );
    return success(res, rapport, 'Rapport de stage soumis avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir tous les rapports (pour agents)
 * GET /api/stages/rapports
 */
const getAllRapports = async (req, res) => {
  try {
    const rapports = await stageService.getAllRapports(req.query);
    return success(res, rapports, 'Rapports récupérés avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Obtenir un rapport par ID
 * GET /api/stages/rapports/:id
 */
const getRapportById = async (req, res) => {
  try {
    const rapport = await stageService.getRapportById(req.params.id, req.user);
    return success(res, rapport, 'Rapport récupéré avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Évaluer un rapport (pour agents)
 * PUT /api/stages/rapports/:id/evaluer
 */
const evaluateRapport = async (req, res) => {
  try {
    const agentContext = getAgentContext(req.user);
    // Un rôle "lecture globale" avec VALIDER/REJETER sur STAGE (ex. sous-admin "Stage Terminé")
    // peut évaluer un rapport hors de sa direction, au même titre qu'il peut accepter/rejeter
    // un stage sur l'écran "Stage Approuvé".
    if (!agentContext.isSystemRole && await hasGlobalActionAccess(req.user, 'STAGE', ['VALIDER', 'REJETER'])) {
      agentContext.isSystemRole = true;
    }
    const rapport = await stageService.evaluateRapport(
      req.params.id,
      req.body,
      req.user.username,
      agentContext
    );
    const statutRapport = req.body.statutRapport || req.body.statusRapport;
    await auditService.log({
      agentId:  req.user.agentId,
      agentNom: req.user.username,
      action:   statutRapport === 'VALIDE' ? 'RAPPORT_VALIDE' : 'RAPPORT_REJETE',
      module:   'STAGE',
      entityId: parseInt(req.params.id),
      details:  { statutRapport, motifRefus: req.body.motifRefus || null },
      ip: req.ip,
    });
    return success(res, rapport, 'Rapport évalué avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Télécharger le PDF d'un rapport
 * GET /api/stages/rapports/:id/download
 */
const downloadRapport = async (req, res) => {
  try {
    const document = await stageService.downloadRapport(req.params.id, req.user);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(document.filename)}"`);
    res.send(document.buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

// =====================================================
// DOCUMENTS (Conventions / Attestations)
// =====================================================

/**
 * Créer un document de stage (pour agents)
 * POST /api/stages/documents
 */
const createDocumentStage = async (req, res) => {
  try {
    if (!req.file) {
      return error(res, 'Le fichier PDF est requis', 400);
    }
    
    // Récupérer l'agent ID depuis le user
    const agent = await require('../models').Agent.findOne({
      include: [{
        model: require('../models').User,
        as: 'users',
        where: { idusers: req.user.id },
      }],
    });
    
    if (!agent) {
      return error(res, 'Agent non trouvé', 404);
    }
    
    const document = await stageService.createDocumentStage(
      agent.idagents,
      req.body,
      req.file
    );
    return success(res, document, 'Document créé avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Obtenir un document de stage par ID
 * GET /api/stages/documents/:id
 */
const getDocumentStageById = async (req, res) => {
  try {
    const document = await stageService.getDocumentStageById(req.params.id);
    return success(res, document, 'Document récupéré avec succès');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Télécharger un document de stage
 * GET /api/stages/documents/:id/download
 */
const downloadDocumentStage = async (req, res) => {
  try {
    const document = await stageService.downloadDocumentStage(req.params.id);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(document.filename)}"`);
    res.send(document.buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Exporter les stages en CSV
 * GET /api/stages/export
 */
const exportStages = async (req, res) => {
  try {
    const { Stage, Candidat } = require('../models');
    const { Op } = require('sequelize');

    const where = { del: 0 };
    if (req.query.statusStage) where.statusStage = req.query.statusStage;
    if (req.query.typeStage)   where.typeStage   = req.query.typeStage;

    const stages = await Stage.findAll({
      where,
      include: [{
        model: Candidat,
        as: 'candidat',
        attributes: ['nom', 'prenom', 'email', 'telephone'],
      }],
      attributes: [
        'idstage', 'typeStage', 'typeEtablissement', 'niveau', 'domaineStage',
        'dureeStage', 'dateDebutSouhaitee', 'dateDebutEffective', 'dateFinEffective',
        'statusStage', 'motifRefus', 'estRenouvellement', 'createdDate',
      ],
      order: [['createdDate', 'DESC']],
    });

    // Formater une date ISO en JJ/MM/AAAA
    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';

    const headers = [
      'N°', 'Nom', 'Prénom', 'Email', 'Téléphone',
      'Type stage', 'Établissement', 'Niveau', 'Domaine', 'Durée (mois)',
      'Date soumission', 'Date début souhaitée', 'Date début effective', 'Date fin effective',
      'Statut', 'Motif refus', 'Renouvellement',
    ];

    const rows = stages.map((s, i) => [
      i + 1,
      s.candidat?.nom        || '',
      s.candidat?.prenom     || '',
      s.candidat?.email      || '',
      s.candidat?.telephone  || '',
      s.typeStage            || '',
      s.typeEtablissement    || '',
      s.niveau               || '',
      s.domaineStage         || '',
      s.dureeStage           || '',
      fmt(s.createdDate),
      fmt(s.dateDebutSouhaitee),
      fmt(s.dateDebutEffective),
      fmt(s.dateFinEffective),
      s.statusStage          || '',
      s.motifRefus           || '',
      s.estRenouvellement ? 'Oui' : 'Non',
    ]);

    const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const sep = ';';
    const lines = [
      headers.map(csvEscape).join(sep),
      ...rows.map(r => r.map(csvEscape).join(sep)),
    ];
    const csv = '\uFEFF' + lines.join('\r\n'); // BOM UTF-8 pour Excel FR

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stages_${today}.csv"`);
    return res.send(csv);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const exportStagesPDF = async (req, res) => {
  try {
    const { Stage, Candidat, Direction } = require('../models');
    const { genererRapportPDF, calcParMois, calcParStatut, calcParDirection } = require('../services/pdf.service');

    const stages = await Stage.findAll({
      where: { del: 0 },
      include: [
        { model: Candidat,  as: 'candidat',  attributes: ['nom', 'prenom', 'email', 'telephone'], required: false },
        { model: Direction, as: 'direction', attributes: ['nom', 'accronyme'],                     required: false },
      ],
      order: [['createdDate', 'DESC']],
    });

    const fmt = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '';
    const total      = stages.length;
    const enAttente  = stages.filter(s => s.statusStage === 'EN_ATTENTE').length;
    const valides    = stages.filter(s => ['VALIDE', 'EN_COURS', 'TERMINEE'].includes(s.statusStage)).length;
    const rejetes    = stages.filter(s => s.statusStage === 'REJETE').length;

    const pdf = await genererRapportPDF({
      titre:        'Rapport des Demandes de Stage',
      module:       'STAGES',
      statsCards: [
        { label: 'Total demandes', val: total,     color: '#0f172a' },
        { label: 'En attente',     val: enAttente, color: '#f59e0b' },
        { label: 'Acceptés',       val: valides,   color: '#16a34a' },
        { label: 'Rejetés',        val: rejetes,   color: '#dc2626' },
      ],
      parStatut:    calcParStatut(stages, 'statusStage'),
      parDirection: calcParDirection(stages),
      parMois:      calcParMois(stages, 'createdDate'),
      colonnes: [
        { label: 'N°',         key: 'num',         width: 25 },
        { label: 'Nom',        key: 'nom',         width: 75 },
        { label: 'Prénom',     key: 'prenom',      width: 75 },
        { label: 'Type',       key: 'typeStage',   width: 65 },
        { label: 'Domaine',    key: 'domaine',     width: 80 },
        { label: 'Durée',      key: 'duree',       width: 35 },
        { label: 'Dép. souh.',  key: 'dateDebut',  width: 55 },
        { label: 'Statut',     key: 'statusStage', width: 65 },
        { label: 'Soumission', key: 'soumission',  width: 48 },
      ],
      lignes: stages.map((s, i) => ({
        num:         i + 1,
        nom:         s.candidat?.nom     || '',
        prenom:      s.candidat?.prenom  || '',
        typeStage:   s.typeStage         || '',
        domaine:     s.domaineStage      || '',
        duree:       s.dureeStage ? `${s.dureeStage}m` : '',
        dateDebut:   fmt(s.dateDebutSouhaitee),
        statusStage: s.statusStage,
        soumission:  fmt(s.createdDate),
      })),
    });

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport_stages_${today}.pdf"`);
    return res.send(pdf);
  } catch (err) {
    console.error('[Stage] exportStagesPDF:', err.message);
    return error(res, err.message || 'Erreur export PDF', 500);
  }
};

/**
 * Modifier un stage (dates effectives, commentaire)
 * PUT /api/stages/:id
 */
const updateStage = async (req, res) => {
  try {
    const agentContext = getAgentContext(req.user);
    const stage = await stageService.updateStage(req.params.id, req.body, agentContext);
    return success(res, stage, 'Stage modifié avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Transférer un stage vers une autre direction
 * PUT /api/stages/:id/transferer
 * Requiert permission TRANSFERER sur STAGE + propriété de la direction d'origine
 * (sauf rôle système / lecture-globale avec accès global sur cette action).
 */
const transfererStage = async (req, res) => {
  try {
    const agentContext = getAgentContext(req.user);
    if (!agentContext.isSystemRole && await hasGlobalActionAccess(req.user, 'STAGE', ['TRANSFERER'])) {
      agentContext.isSystemRole = true;
    }
    const stage = await stageService.transfererStage(req.params.id, req.body.direction_iddirection, agentContext);
    return success(res, stage, 'Stage transféré avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Remplacer un document signalé comme non conforme sur une demande rejetée
 * PUT /api/stages/:id/documents/:type
 * @access Private (CANDIDAT — propriétaire du stage)
 */
const remplacerDocumentStage = async (req, res) => {
  try {
    const stage = await stageService.remplacerDocumentStage(
      req.params.id,
      req.params.type,
      req.file,
      req.user.candidatId
    );
    return success(res, stage, 'Document remplacé avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Resoumettre une demande de stage rejetée (après remplacement des documents non conformes)
 * PUT /api/stages/:id/resoumettre
 * @access Private (CANDIDAT — propriétaire du stage)
 */
const resoumettreStage = async (req, res) => {
  try {
    const stage = await stageService.resoumettreStage(req.params.id, req.user.candidatId);
    return success(res, stage, 'Demande resoumise avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Supprimer un stage (soft delete)
 * DELETE /api/stages/:id
 */
const deleteStage = async (req, res) => {
  try {
    const result = await stageService.deleteStage(req.params.id);
    return success(res, result, 'Stage supprimé avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// =====================================================
// APPROBATION DE STAGE
// =====================================================

/**
 * Approuver un stage (EN_ATTENTE → PROGRAMMATION_EN_COURS)
 * PUT /api/stages/:id/approuver
 */
const approuverStage = async (req, res) => {
  try {
    const stage = await stageService.approuverStage(req.params.id, req.user.username, getAgentContext(req.user));
    await auditService.log({
      agentId:  req.user.agentId,
      agentNom: req.user.username,
      action:   'STAGE_APPROUVE',
      module:   'STAGE',
      entityId: parseInt(req.params.id),
      details:  { statusStage: 'PROGRAMMATION_EN_COURS' },
      ip: req.ip,
    });
    return success(res, stage, 'Stage approuvé avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// =====================================================
// AUTORISATION DE RENOUVELLEMENT
// =====================================================

/**
 * Accorder une autorisation de renouvellement pour un stage terminé/expiré
 * PUT /api/stages/:id/autoriser-renouvellement
 */
const autoriserRenouvellement = async (req, res) => {
  try {
    const autorisation = await stageService.autoriserRenouvellementStage(
      req.params.id,
      req.user.agentId
    );
    await auditService.log({
      agentId:  req.user.agentId,
      agentNom: req.user.username,
      action:   'STAGE_RENOUVELLEMENT_AUTORISE',
      module:   'STAGE',
      entityId: parseInt(req.params.id),
      details:  { expiresAt: autorisation.expiresAt },
      ip: req.ip,
    });
    return success(res, autorisation, 'Autorisation de renouvellement accordée (7 jours)');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// =====================================================
// DEMANDES DE MODIFICATION
// =====================================================

/**
 * Créer une demande de modification (candidat)
 * POST /api/stages/:id/demandes-modification
 */
const createDemandeModification = async (req, res) => {
  try {
    const demande = await stageService.createDemandeModification(
      req.user.candidatId,
      req.params.id,
      req.body,
      req.files
    );
    return success(res, demande, 'Demande de modification soumise avec succès', 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Annuler sa propre demande de modification (candidat), tant qu'elle est EN_ATTENTE
 * PUT /api/stages/demandes-modification/:id/annuler
 */
const annulerDemandeModification = async (req, res) => {
  try {
    const demande = await stageService.annulerDemandeModification(
      req.user.candidatId,
      req.params.id
    );
    return success(res, demande, 'Demande de modification annulée avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

/**
 * Télécharger un fichier joint d'une demande de modification
 * (justification ou lettre manuscrite) — factory qui retourne un handler Express.
 * GET /api/stages/demandes-modification/:id/justification | /lettre
 */
const getDemandeModificationFichier = (field) => async (req, res) => {
  try {
    const { buffer, filename, mimetype } = await stageService.getDemandeModificationFichier(
      req.params.id,
      field
    );
    res.set({
      'Content-Type': mimetype || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${filename}"`,
    });
    return res.send(buffer);
  } catch (err) {
    return error(res, err.message, 404);
  }
};

/**
 * Obtenir toutes les demandes de modification (agents)
 * GET /api/stages/demandes-modification
 */
const getAllDemandesModification = async (req, res) => {
  try {
    const demandes = await stageService.getAllDemandesModification(req.query);
    return success(res, demandes, 'Demandes de modification récupérées avec succès');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Évaluer une demande de modification (agents)
 * PUT /api/stages/demandes-modification/:id/evaluer
 */
const evaluerDemandeModification = async (req, res) => {
  try {
    const demande = await stageService.evaluerDemandeModification(
      req.params.id,
      req.body,
      req.user.username,
      getAgentContext(req.user)
    );
    await auditService.log({
      agentId:  req.user.agentId,
      agentNom: req.user.username,
      action:   req.body.status === 'APPROUVEE' ? 'DEMANDE_MODIF_APPROUVEE' : 'DEMANDE_MODIF_REJETEE',
      module:   'SUSPENSION_STAGE',
      entityId: parseInt(req.params.id),
      details:  { status: req.body.status, reponse_drh: req.body.reponse_drh || null },
      ip: req.ip,
    });
    return success(res, demande, 'Demande de modification évaluée avec succès');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

module.exports = {
  // Permissions "lecture globale" (exportées pour les tests unitaires)
  hasGlobalReadAccess,
  hasGlobalActionAccess,

  // Stages
  createStage,
  getAllStages,
  getStagesStats,
  getDomainesDistincts,
  checkAndUpdateStatuses,
  getMesStages,
  getStageById,
  updateStage,
  transfererStage,
  updateStatusStage,
  remplacerDocumentStage,
  resoumettreStage,
  deleteStage,
  printAllStageDocuments,
  downloadStageDocument,
  downloadConventionStage,
  exportStages,
  exportStagesPDF,

  // Suivi
  getStagesSuivi,

  // Renouvellements
  createRenouvellement,
  getAllRenouvellements,
  evaluateRenouvellement,
  downloadLettreRenouvellement,
  downloadConventionRenouvellement,

  // Rapports
  createRapport,
  getAllRapports,
  getRapportById,
  evaluateRapport,
  downloadRapport,

  // Documents
  createDocumentStage,
  getDocumentStageById,
  downloadDocumentStage,

  // Approbation
  approuverStage,

  // Autorisation de renouvellement
  autoriserRenouvellement,

  // Demandes de modification
  createDemandeModification,
  annulerDemandeModification,
  getDemandeModificationFichier,
  getAllDemandesModification,
  evaluerDemandeModification,
};
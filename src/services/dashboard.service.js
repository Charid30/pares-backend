// src/services/dashboard.service.js - Service pour le dashboard admin
const {
  User, Candidat, Stage,
  Offre, CandidatureOffre, Aide, CandidatureAide, Agent, Role,
  DemandeAudience, RenouvellementStage, RapportStage, Direction, AgentDirection, sequelize
} = require('../models');
const { Op } = require('sequelize');

// Une demande est acceptée dès que sa convention est jointe, quelle que soit la suite du stage
const STATUTS_ACCEPTES = ['ACCEPTE', 'EN_COURS', 'SUSPENDU', 'EXPIRE', 'RAPPORT_SOUMIS', 'TERMINE'];
// Demandes qui attendent la décision d'un agent de la direction
const STATUTS_A_EXAMINER = ['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT'];

/**
 * Statistiques principales du dashboard
 */
const getMainStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Candidats
  const totalCandidats = await Candidat.count({ where: { del: 0 } });
  const candidatsThisMonth = await Candidat.count({
    where: { del: 0, createdDate: { [Op.gte]: startOfMonth } }
  });
  const candidatsLastMonth = await Candidat.count({
    where: {
      del: 0,
      createdDate: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth }
    }
  });
  const candidatsChange = candidatsLastMonth > 0
    ? Math.round(((candidatsThisMonth - candidatsLastMonth) / candidatsLastMonth) * 100)
    : candidatsThisMonth > 0 ? 100 : 0;

  // Stages
  const totalStages = await Stage.count({ where: { del: 0, stage_parent_idstage: null } });
  const stagesEnCours = await Stage.count({
    where: { del: 0, statusStage: 'EN_COURS' }
  });
  const stagesThisMonth = await Stage.count({
    where: { del: 0, stage_parent_idstage: null, createdDate: { [Op.gte]: startOfMonth } }
  });
  const stagesLastMonth = await Stage.count({
    where: {
      del: 0,
      stage_parent_idstage: null,
      createdDate: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth }
    }
  });
  const stagesChange = stagesLastMonth > 0
    ? Math.round(((stagesThisMonth - stagesLastMonth) / stagesLastMonth) * 100)
    : stagesThisMonth > 0 ? 100 : 0;

  // Audiences (demandes d'audience)
  const totalAudiences = await DemandeAudience.count({ where: { del: 0 } });
  const audiencesEnAttente = await DemandeAudience.count({
    where: { del: 0, status: 'EN_ATTENTE' }
  });

  // Offres commerciales
  const offresActives = await Offre.count({
    where: { del: 0, statusOffre: 'ACTIVE' }
  });
  const totalOffres = await Offre.count({ where: { del: 0 } });

  return {
    candidats: {
      total: totalCandidats,
      change: candidatsChange,
      changeType: candidatsChange > 0 ? 'increase' : candidatsChange < 0 ? 'decrease' : 'neutral'
    },
    stages: {
      total: totalStages,
      enCours: stagesEnCours,
      change: stagesChange,
      changeType: stagesChange > 0 ? 'increase' : stagesChange < 0 ? 'decrease' : 'neutral'
    },
    audiences: {
      total: totalAudiences,
      enAttente: audiencesEnAttente,
    },
    offres: {
      actives: offresActives,
      total: totalOffres
    }
  };
};

/**
 * Statistiques secondaires
 */
const getSecondaryStats = async () => {
  // Aides sociales — les demandes candidats sont dans la table Aide (creePar='CANDIDAT')
  // CandidatureAide = candidatures aux programmes d'aide créés par l'admin (différent)
  const demandesAidesTotal = await Aide.count({
    where: { del: 0, creePar: 'CANDIDAT' }
  });
  const demandesAidesEnAttente = await Aide.count({
    where: { del: 0, creePar: 'CANDIDAT', statusAide: 'EN_ATTENTE' }
  });

  // Agents (utilisateurs internes — hors candidats)
  const totalAgents = await User.count({
    where: { del: 0 },
    include: [{
      model: Role,
      as: 'role',
      where: { accronyme: { [Op.ne]: 'CANDIDAT' } }
    }]
  });
  const totalAdmins = await User.count({
    where: { del: 0 },
    include: [{
      model: Role,
      as: 'role',
      where: { accronyme: 'ADMIN' }
    }]
  });

  const stagesEnAttenteCount = await Stage.count({
    where: { del: 0, stage_parent_idstage: null, statusStage: 'EN_ATTENTE' }
  });

  // Taux de validation : demandes acceptées / demandes décidées (les demandes en attente ne comptent pas)
  const stagesAcceptes = await Stage.count({
    where: { del: 0, stage_parent_idstage: null, statusStage: { [Op.in]: STATUTS_ACCEPTES } }
  });
  const stagesRejetes = await Stage.count({
    where: { del: 0, stage_parent_idstage: null, statusStage: 'REJETE' }
  });
  const stagesDecides = stagesAcceptes + stagesRejetes;
  const tauxValidation = stagesDecides > 0
    ? Math.round((stagesAcceptes / stagesDecides) * 100)
    : 0;

  // Renouvellements
  const [renouvTotal, renouvEnAttente, renouvEnTraitement, renouvAcceptes, renouvEnCours, renouvExpires, renouvTermines, renouvRejetes] = await Promise.all([
    RenouvellementStage.count({ where: { del: 0 } }),
    RenouvellementStage.count({ where: { del: 0, statusRenouvellement: 'EN_ATTENTE' } }),
    RenouvellementStage.count({ where: { del: 0, statusRenouvellement: 'PROGRAMMATION_EN_COURS' } }),
    RenouvellementStage.count({ where: { del: 0, statusRenouvellement: 'ACCEPTE' } }),
    RenouvellementStage.count({ where: { del: 0, statusRenouvellement: 'EN_COURS' } }),
    RenouvellementStage.count({ where: { del: 0, statusRenouvellement: 'EXPIRE' } }),
    RenouvellementStage.count({ where: { del: 0, statusRenouvellement: { [Op.in]: ['TERMINE', 'RAPPORT_SOUMIS'] } } }),
    RenouvellementStage.count({ where: { del: 0, statusRenouvellement: 'REJETE' } }),
  ]);

  return {
    aidesSociales: {
      active: demandesAidesTotal,
      demandes: demandesAidesEnAttente
    },
    utilisateurs: {
      total: totalAgents,
      admins: totalAdmins
    },
    stagesEnAttente: stagesEnAttenteCount,
    tauxValidation,
    renouvellements: {
      total:       renouvTotal,
      enAttente:   renouvEnAttente,
      enTraitement: renouvEnTraitement,
      acceptes:    renouvAcceptes,
      enCours:     renouvEnCours,
      expires:     renouvExpires,
      termines:    renouvTermines,
      rejetes:     renouvRejetes,
    },
  };
};

/**
 * Activités récentes
 */
const getRecentActivities = async (limit = 10, days = 3) => {
  const activities = [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Derniers candidats inscrits (≤ 3 jours)
  const recentCandidats = await Candidat.findAll({
    where: { del: 0, createdDate: { [Op.gte]: since } },
    order: [['createdDate', 'DESC']],
    limit: 3,
    attributes: ['idcandidats', 'nom', 'prenom', 'email', 'createdDate']
  });

  recentCandidats.forEach(c => {
    activities.push({
      type: 'candidat',
      action: 'Nouvelle inscription',
      description: `${c.prenom} ${c.nom} s'est inscrit sur la plateforme`,
      user: c.email,
      date: c.createdDate,
      status: null
    });
  });

  // Dernières demandes de stage (≤ 3 jours)
  const recentStages = await Stage.findAll({
    where: { del: 0, createdDate: { [Op.gte]: since } },
    order: [['createdDate', 'DESC']],
    limit: 3,
    include: [{
      model: Candidat,
      as: 'candidat',
      attributes: ['nom', 'prenom', 'email']
    }]
  });

  recentStages.forEach(s => {
    activities.push({
      type: 'stage',
      action: 'Demande de stage',
      description: `${s.candidat?.prenom} ${s.candidat?.nom} - ${s.typeStage}`,
      user: s.candidat?.email || 'N/A',
      date: s.createdDate,
      status: s.statusStage
    });
  });

  // Trier par date décroissante et limiter
  activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  return activities.slice(0, limit);
};

/**
 * Éléments en attente de traitement
 */
const getPendingItems = async (limit = 10) => {
  const pendingItems = [];
  // Pour la page "Voir tout", on charge plus par type
  const perType = limit > 20 ? 100 : 5;

  // Stages en attente
  const pendingStages = await Stage.findAll({
    where: { del: 0, statusStage: 'EN_ATTENTE' },
    order: [['createdDate', 'ASC']],
    limit: perType,
    include: [{
      model: Candidat,
      as: 'candidat',
      attributes: ['nom', 'prenom']
    }]
  });

  pendingStages.forEach(s => {
    const daysDiff = Math.floor((new Date() - new Date(s.createdDate)) / (1000 * 60 * 60 * 24));
    pendingItems.push({
      id: s.idstage,
      type: 'stage',
      title: `${s.candidat?.prenom} ${s.candidat?.nom}`,
      subtitle: `Stage ${s.typeStage} - ${s.domaineStage}`,
      date: s.createdDate,
      priority: daysDiff > 7 ? 'high' : daysDiff > 3 ? 'medium' : 'low'
    });
  });

  // Demandes d'aide en attente — les demandes candidats sont dans Aide (creePar='CANDIDAT')
  const pendingAides = await Aide.findAll({
    where: { del: 0, creePar: 'CANDIDAT', statusAide: 'EN_ATTENTE' },
    order: [['createdDate', 'ASC']],
    limit: perType,
    include: [{
      model: Candidat,
      as: 'candidatCreateur',   // alias défini dans models/index.js
      attributes: ['nom', 'prenom']
    }]
  });

  pendingAides.forEach(a => {
    const daysDiff = Math.floor((new Date() - new Date(a.createdDate)) / (1000 * 60 * 60 * 24));
    pendingItems.push({
      id: a.idaide,
      type: 'aide',
      title: `${a.candidatCreateur?.prenom} ${a.candidatCreateur?.nom}`,
      subtitle: a.titre || `Aide ${a.typeAide}`,
      date: a.createdDate,
      priority: daysDiff > 7 ? 'high' : daysDiff > 3 ? 'medium' : 'low'
    });
  });

  // Trier par priorité puis par date
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  pendingItems.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return new Date(a.date) - new Date(b.date);
  });

  return pendingItems.slice(0, limit);
};

/**
 * Dossiers qui attendent une action, tous modules confondus
 */
const getATraiter = async () => {
  const ilYa7Jours = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [stages, conventions, stagesEnRetard, renouvellements, offres, audiences, aides, rapports] = await Promise.all([
    Stage.count({ where: { del: 0, stage_parent_idstage: null, statusStage: { [Op.in]: STATUTS_A_EXAMINER } } }),
    Stage.count({ where: { del: 0, stage_parent_idstage: null, statusStage: 'PROGRAMMATION_EN_COURS' } }),
    Stage.count({
      where: {
        del: 0,
        stage_parent_idstage: null,
        statusStage: { [Op.in]: [...STATUTS_A_EXAMINER, 'PROGRAMMATION_EN_COURS'] },
        createdDate: { [Op.lt]: ilYa7Jours }
      }
    }),
    RenouvellementStage.count({
      where: { del: 0, statusRenouvellement: { [Op.in]: [...STATUTS_A_EXAMINER, 'PROGRAMMATION_EN_COURS'] } }
    }),
    Offre.count({ where: { del: 0, statusOffre: 'EN_ATTENTE' } }),
    DemandeAudience.count({ where: { del: 0, status: 'EN_ATTENTE' } }),
    Aide.count({ where: { del: 0, creePar: 'CANDIDAT', statusAide: 'EN_ATTENTE' } }),
    RapportStage.count({ where: { del: 0, statusRapport: { [Op.in]: ['SOUMIS', 'EN_EVALUATION'] } } }),
  ]);

  return {
    total: stages + conventions + renouvellements + offres + audiences + aides + rapports,
    stages,
    conventions,
    stagesEnRetard,
    renouvellements,
    offres,
    audiences,
    aides,
    rapports,
  };
};

/**
 * Directions qui ont le plus de demandes à examiner, avec leur nombre d'agents
 */
const getStagesParDirection = async (limit = 5) => {
  const lignes = await Stage.findAll({
    attributes: ['direction_iddirection', [sequelize.fn('COUNT', sequelize.col('idstage')), 'nombre']],
    where: {
      del: 0,
      stage_parent_idstage: null,
      statusStage: { [Op.in]: STATUTS_A_EXAMINER },
      direction_iddirection: { [Op.ne]: null }
    },
    group: ['direction_iddirection'],
    order: [[sequelize.literal('nombre'), 'DESC']],
    limit,
    raw: true
  });

  return Promise.all(lignes.map(async (ligne) => {
    const [direction, agents] = await Promise.all([
      Direction.findByPk(ligne.direction_iddirection, { attributes: ['nom', 'accronyme'] }),
      AgentDirection.count({ where: { direction_iddirection: ligne.direction_iddirection } }),
    ]);
    return {
      direction: direction?.accronyme || direction?.nom || 'Direction inconnue',
      nombre: Number(ligne.nombre),
      agents,
    };
  }));
};

/**
 * Stages en cours qui se terminent dans les 7 prochains jours
 */
const getStagesBientotTermines = async () => {
  const aujourdhui = new Date();
  const dansSeptJours = new Date(aujourdhui.getTime() + 7 * 24 * 60 * 60 * 1000);
  return Stage.count({
    where: {
      del: 0,
      statusStage: 'EN_COURS',
      dateFinEffective: {
        [Op.between]: [aujourdhui.toISOString().slice(0, 10), dansSeptJours.toISOString().slice(0, 10)]
      }
    }
  });
};

/**
 * Données du graphique - Candidats inscrits et demandes de stage par mois (6 derniers mois)
 */
const getChartData = async () => {
  const labels = [];
  const candidats = [];
  const stagesSoumis = [];

  const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  const now = new Date();

  // Récupérer les données des 6 derniers mois
  for (let i = 5; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

    labels.push(moisNoms[date.getMonth()]);

    // Candidats inscrits ce mois
    const candidatsCount = await Candidat.count({
      where: {
        del: 0,
        createdDate: {
          [Op.gte]: startOfMonth,
          [Op.lte]: endOfMonth
        }
      }
    });
    candidats.push(candidatsCount);

    // Stages soumis (créés) ce mois
    const stagesSoumisCount = await Stage.count({
      where: {
        del: 0,
        stage_parent_idstage: null,
        createdDate: { [Op.gte]: startOfMonth, [Op.lte]: endOfMonth }
      }
    });
    stagesSoumis.push(stagesSoumisCount);
  }

  return {
    labels,
    candidats,
    stagesSoumis
  };
};

/**
 * Répartition des demandes de stage par statut (toutes les demandes sont comptées)
 */
const getRepartitionStages = async () => {
  const compter = (statuts) => Stage.count({
    where: { del: 0, stage_parent_idstage: null, statusStage: { [Op.in]: statuts } }
  });
  const [enAttente, enTraitement, enProgrammation, acceptes, enCours, finis, rejetes] = await Promise.all([
    compter(['EN_ATTENTE']),
    compter(['EN_COURS_DE_TRAITEMENT']),
    compter(['PROGRAMMATION_EN_COURS']),
    compter(['ACCEPTE']),
    compter(['EN_COURS', 'SUSPENDU']),
    compter(['EXPIRE', 'RAPPORT_SOUMIS', 'TERMINE']),
    compter(['REJETE']),
  ]);
  return {
    labels: ['En attente', 'En traitement', 'En programmation', 'Acceptés', 'En cours', 'Terminés', 'Rejetés'],
    values: [enAttente, enTraitement, enProgrammation, acceptes, enCours, finis, rejetes],
  };
};

/**
 * Audiences breakdown
 */
const getAudiencesStats = async () => {
  const [total, enAttente, acceptees, rejetees] = await Promise.all([
    DemandeAudience.count({ where: { del: 0 } }),
    DemandeAudience.count({ where: { del: 0, status: 'EN_ATTENTE' } }),
    DemandeAudience.count({ where: { del: 0, status: 'ACCEPTE' } }),
    DemandeAudience.count({ where: { del: 0, status: 'REJETE' } }),
  ]);
  return { total, enAttente, acceptees, rejetees };
};

/**
 * Données complètes du dashboard
 */
const getDashboardData = async () => {
  const [
    mainStats, secondaryStats, recentActivities, pendingItems, chartData,
    repartitionStages, audiencesStats, aTraiter, stagesParDirection, stagesBientotTermines
  ] = await Promise.all([
    getMainStats(),
    getSecondaryStats(),
    getRecentActivities(8),
    getPendingItems(8),
    getChartData(),
    getRepartitionStages(),
    getAudiencesStats(),
    getATraiter(),
    getStagesParDirection(),
    getStagesBientotTermines(),
  ]);

  return {
    mainStats,
    secondaryStats,
    recentActivities,
    pendingItems,
    chartData,
    repartitionStages,
    audiencesStats,
    aTraiter,
    stagesParDirection,
    stagesBientotTermines,
  };
};

module.exports = {
  getMainStats,
  getSecondaryStats,
  getRecentActivities,
  getPendingItems,
  getChartData,
  getRepartitionStages,
  getAudiencesStats,
  getATraiter,
  getStagesParDirection,
  getStagesBientotTermines,
  getDashboardData
};

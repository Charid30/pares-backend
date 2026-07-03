// src/services/dashboard.service.js - Service pour le dashboard admin
const {
  User, Candidat, Stage,
  Offre, CandidatureOffre, Aide, CandidatureAide, Agent, Role,
  DemandeAudience, sequelize
} = require('../models');
const { Op } = require('sequelize');

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
  const totalStages = await Stage.count({ where: { del: 0 } });
  const stagesEnCours = await Stage.count({
    where: { del: 0, statusStage: 'EN_COURS' }
  });
  const stagesThisMonth = await Stage.count({
    where: { del: 0, createdDate: { [Op.gte]: startOfMonth } }
  });
  const stagesLastMonth = await Stage.count({
    where: {
      del: 0,
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
    where: { del: 0, statusStage: 'EN_ATTENTE' }
  });

  // Taux de validation : stages traités positivement / total stages
  const totalStagesAll = await Stage.count({ where: { del: 0 } });
  const stagesTraitesPosCount = await Stage.count({
    where: {
      del: 0,
      statusStage: { [Op.in]: ['ACCEPTE', 'EN_COURS', 'TERMINE'] }
    }
  });
  const tauxValidation = totalStagesAll > 0
    ? Math.round((stagesTraitesPosCount / totalStagesAll) * 100)
    : 0;

  return {
    aidesSociales: {
      active: demandesAidesTotal,      // total des demandes candidats
      demandes: demandesAidesEnAttente // celles en attente de traitement
    },
    utilisateurs: {
      total: totalAgents,
      admins: totalAdmins
    },
    stagesEnAttente: stagesEnAttenteCount,
    tauxValidation
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
 * Données du graphique - Candidats inscrits et stages validés par mois (6 derniers mois)
 */
const getChartData = async () => {
  const labels = [];
  const candidats = [];
  const stagesValides = [];
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

    // Stages validés (VALIDE ou TERMINE) ce mois
    const stagesValidesCount = await Stage.count({
      where: {
        del: 0,
        statusStage: { [Op.in]: ['VALIDE', 'TERMINE', 'EN_COURS'] },
        [Op.or]: [
          {
            lastmodifiedDate: {
              [Op.gte]: startOfMonth,
              [Op.lte]: endOfMonth
            }
          },
          {
            createdDate: {
              [Op.gte]: startOfMonth,
              [Op.lte]: endOfMonth
            }
          }
        ]
      }
    });
    stagesValides.push(stagesValidesCount);

    // Stages soumis (créés) ce mois
    const stagesSoumisCount = await Stage.count({
      where: {
        del: 0,
        createdDate: { [Op.gte]: startOfMonth, [Op.lte]: endOfMonth }
      }
    });
    stagesSoumis.push(stagesSoumisCount);
  }

  return {
    labels,
    candidats,
    stagesValides,
    stagesSoumis
  };
};

/**
 * Donut chart — répartition des stages par statut
 */
const getStagesDonut = async () => {
  const [enAttente, enTraitement, acceptes, enCours, termines, rejetes] = await Promise.all([
    Stage.count({ where: { del: 0, statusStage: 'EN_ATTENTE' } }),
    Stage.count({ where: { del: 0, statusStage: { [Op.in]: ['EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS'] } } }),
    Stage.count({ where: { del: 0, statusStage: 'ACCEPTE' } }),
    Stage.count({ where: { del: 0, statusStage: 'EN_COURS' } }),
    Stage.count({ where: { del: 0, statusStage: 'TERMINE' } }),
    Stage.count({ where: { del: 0, statusStage: 'REJETE' } }),
  ]);
  return {
    labels: ['En attente', 'En traitement', 'Acceptés', 'En cours', 'Terminés', 'Rejetés'],
    values: [enAttente, enTraitement, acceptes, enCours, termines, rejetes],
    colors: ['#F59E0B', '#6366F1', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444'],
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
  const [mainStats, secondaryStats, recentActivities, pendingItems, chartData, stagesDonut, audiencesStats] = await Promise.all([
    getMainStats(),
    getSecondaryStats(),
    getRecentActivities(8),
    getPendingItems(8),
    getChartData(),
    getStagesDonut(),
    getAudiencesStats(),
  ]);

  return {
    mainStats,
    secondaryStats,
    recentActivities,
    pendingItems,
    chartData,
    stagesDonut,
    audiencesStats,
  };
};

module.exports = {
  getMainStats,
  getSecondaryStats,
  getRecentActivities,
  getPendingItems,
  getChartData,
  getStagesDonut,
  getAudiencesStats,
  getDashboardData
};

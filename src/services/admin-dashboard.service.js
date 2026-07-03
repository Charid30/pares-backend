// src/services/admin-dashboard.service.js
const { Candidat, Stage, RapportStage, DemandeAudience, Aide, CandidatureOffre, DemandeModificationStage, User, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Récupérer les badges du menu (compteurs d'actions en attente)
 */
const getMenuBadges = async () => {
  // Stages en attente de validation
  const stagesEnAttente = await Stage.count({
    where: {
      del: 0,
      statusStage: 'EN_ATTENTE'
    }
  });

  // Rapports de stage en attente d'évaluation
  const rapportsEnAttente = await RapportStage.count({
    where: {
      del: 0,
      statusRapport: {
        [Op.in]: ['SOUMIS', 'EN_EVALUATION']
      }
    }
  });

  // Stages actuellement EN_COURS (pour le badge "Suivi des stages")
  const stagesEnCours = await Stage.count({
    where: {
      del: 0,
      statusStage: 'EN_COURS'
    }
  });

  // Demandes d'audience en attente
  const audiencesEnAttente = await DemandeAudience.count({
    where: { del: 0, status: 'EN_ATTENTE' }
  });

  // Demandes d'aides sociales en attente (candidats → table Aide, creePar='CANDIDAT')
  const aidesEnAttente = await Aide.count({
    where: { del: 0, creePar: 'CANDIDAT', statusAide: 'EN_ATTENTE' }
  });

  // Offres commerciales soumises par les candidats, en attente de traitement admin
  const { Offre } = require('../models');
  const offresEnAttente = await Offre.count({
    where: { del: 0, statusOffre: 'EN_ATTENTE' }
  });

  // Demandes de modification de stage (suspension / annulation) en attente
  const demandesModifEnAttente = await DemandeModificationStage.count({
    where: { del: 0, status: 'EN_ATTENTE' }
  });

  return {
    stagesEnAttente,
    rapportsEnAttente,
    stagesEnCours,
    audiencesEnAttente,
    aidesEnAttente,
    offresEnAttente,
    demandesModifEnAttente
  };
};

/**
 * Récupérer les statistiques complètes du dashboard
 */
const getDashboardStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // === CANDIDATS ===
  const totalCandidats = await Candidat.count({ where: { del: 0 } });

  const candidatsThisMonth = await Candidat.count({
    where: {
      del: 0,
      createdDate: { [Op.gte]: startOfMonth }
    }
  });

  // Candidats avec au moins un stage
  const candidatsWithStages = await Candidat.count({
    where: { del: 0 },
    include: [{
      model: Stage,
      as: 'stages',
      where: { del: 0 },
      required: true
    }],
    distinct: true
  });

  // === STAGES ===
  const totalStages    = await Stage.count({ where: { del: 0 } });
  const stagesEnAttente = await Stage.count({ where: { del: 0, statusStage: 'EN_ATTENTE' } });
  const stagesEnCours   = await Stage.count({ where: { del: 0, statusStage: 'EN_COURS' } });
  const stagesTermines  = await Stage.count({ where: { del: 0, statusStage: 'TERMINE' } });
  const stagesAcceptes  = await Stage.count({ where: { del: 0, statusStage: 'ACCEPTE' } });
  const stagesRejetes   = await Stage.count({ where: { del: 0, statusStage: 'REJETE' } });
  const stagesTraitement = await Stage.count({ where: { del: 0, statusStage: { [Op.in]: ['EN_COURS_DE_TRAITEMENT', 'PROGRAMMATION_EN_COURS'] } } });

  // === AUDIENCES ===
  const totalAudiences    = await DemandeAudience.count();
  const audiencesEnAttente = await DemandeAudience.count({ where: { status: 'EN_ATTENTE' } });
  const audiencesAcceptees = await DemandeAudience.count({ where: { status: 'ACCEPTE' } });
  const audiencesRejetees  = await DemandeAudience.count({ where: { status: 'REJETE' } });

  // === RAPPORTS ===
  const totalRapports = await RapportStage.count({ where: { del: 0 } });
  const rapportsEnAttente = await RapportStage.count({
    where: {
      del: 0,
      statusRapport: { [Op.in]: ['SOUMIS', 'EN_EVALUATION'] }
    }
  });
  const rapportsValides = await RapportStage.count({
    where: { del: 0, statusRapport: 'VALIDE' }
  });

  // === UTILISATEURS ===
  const totalUtilisateurs = await User.count({ where: { del: 0 } });

  return {
    candidats: {
      total: totalCandidats,
      thisMonth: candidatsThisMonth,
      withStages: candidatsWithStages,
    },
    stages: {
      total:      totalStages,
      enAttente:  stagesEnAttente,
      enCours:    stagesEnCours,
      termines:   stagesTermines,
      // Données pour le graphique donut
      donut: {
        labels: ['En attente', 'En traitement', 'Acceptés', 'En cours', 'Terminés', 'Rejetés'],
        values: [stagesEnAttente, stagesTraitement, stagesAcceptes, stagesEnCours, stagesTermines, stagesRejetes],
        colors: ['#F59E0B', '#6366F1', '#10B981', '#3B82F6', '#8B5CF6', '#EF4444'],
      },
    },
    audiences: {
      total:     totalAudiences,
      enAttente: audiencesEnAttente,
      acceptees: audiencesAcceptees,
      rejetees:  audiencesRejetees,
    },
    rapports: {
      total: totalRapports,
      enAttente: rapportsEnAttente,
      valides: rapportsValides
    },
    utilisateurs: {
      total: totalUtilisateurs
    }
  };
};

module.exports = {
  getMenuBadges,
  getDashboardStats
};

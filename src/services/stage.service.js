// src/services/stage.service.js
const {
  Stage,
  RenouvellementStage,
  RapportStage,
  DocumentStage,
  DemandeModificationStage,
  AutorisationRenouvellementStage,
  Candidat,
  Agent,
  Service,
  Direction,
} = require('../models');
const { Op } = require('sequelize');
const emailService = require('./email.service');
const notifService = require('./notification.service');
const { getAgentDirectionIds } = require('../utils/agentDirections.util');
const fileStorage = require('../utils/fileStorage.util');
const { calculerDateFin, calculerPeutAgir, calculerDureeEtRepos } = require('../utils/stageCalculs.util');

/**
 * Vérifie qu'un agent non-système a le droit d'agir sur une direction donnée.
 * Protège les endpoints d'action (approuver/valider/rejeter/évaluer) contre
 * un agent qui verrait un stage hors de sa direction (ex: via un rôle de
 * lecture globale combiné à un rôle d'action) et tenterait d'agir dessus.
 * @param {{ agentId?: number, isSystemRole?: boolean }|null} agentContext
 * @param {number|null} directionId - direction_iddirection du stage concerné
 */
const assertAgentOwnsDirection = async (agentContext, directionId) => {
  if (!agentContext || agentContext.isSystemRole) return;

  if (!agentContext.agentId) {
    throw new Error('Action non autorisée');
  }

  const agent = await Agent.findByPk(agentContext.agentId, {
    include: [
      { model: Service, as: 'service', include: [{ model: Direction, as: 'directions', through: { attributes: [] } }] },
      { model: Direction, as: 'directionDirecte' },
    ],
  });
  const directionIds = getAgentDirectionIds(agent);

  if (!directionId || !directionIds.includes(directionId)) {
    throw new Error('Action non autorisée : ce stage ne relève pas de votre direction');
  }
};

// =====================================================
// STAGES
// =====================================================

/**
 * Créer une demande de stage
 */
const createStage = async (candidatId, data, files) => {
  // Vérifier que le candidat existe
  const candidat = await Candidat.findOne({
    where: { idcandidats: candidatId, del: 0 },
  });
  
  if (!candidat) {
    throw new Error('Candidat non trouvé');
  }
  
  // ── Validation des documents ──────────────────────────────────────────────
  if (!files.cv)                  throw new Error('Le CV est requis');
  if (!files.cnib)                throw new Error('La CNIB est requise');
  if (!files.casierJudiciaire)    throw new Error('Le casier judiciaire est requis');
  if (!files.lettreMotivation)    throw new Error('La lettre de motivation est requise');
  if (!files.lettreRecommandation) throw new Error('La lettre de recommandation est requise');

  if (data.typeStage === 'PERFECTIONNEMENT' && !files.dernierDiplome) {
    throw new Error('Le dernier diplôme (fichier PDF) est requis pour un stage de perfectionnement');
  }

  // ── Préparer les données du stage ─────────────────────────────────────────
  console.log('[createStage] direction reçue:', data.direction_iddirection, '| service reçu:', data.service_idservice);

  if (!data.direction_iddirection) {
    throw new Error('La direction est requise pour soumettre une demande de stage');
  }
  if (!data.service_idservice) {
    throw new Error('Le service est requis pour soumettre une demande de stage');
  }
  if (!data.domaineStage?.trim()) {
    throw new Error('Le domaine de stage est requis');
  }

  const stageData = {
    candidats_idcandidats: candidatId,
    typeStage: data.typeStage,
    niveau: data.niveau || null,
    domaineStage: data.domaineStage.trim(),
    direction_iddirection: data.direction_iddirection,
    service_idservice: data.service_idservice,
    dureeStage: data.dureeStage,
    dureeStageSouhaitee: data.dureeStage,
    dateDebutSouhaitee: data.dateDebutSouhaitee,
    statusStage: 'EN_ATTENTE',
  };
  
  // Ajouter les fichiers si fournis
  if (files.cv) {
    stageData.cv_path = fileStorage.saveFile(files.cv.buffer, files.cv.originalname, 'stages');
    stageData.cv = null;
    stageData.cv_filename = files.cv.originalname;
    stageData.cv_size = files.cv.size;
  }

  if (files.cnib) {
    stageData.cnib_path = fileStorage.saveFile(files.cnib.buffer, files.cnib.originalname, 'stages');
    stageData.cnib = null;
    stageData.cnib_filename = files.cnib.originalname;
    stageData.cnib_size = files.cnib.size;
  }

  if (files.casierJudiciaire) {
    stageData.casierJudiciaire_path = fileStorage.saveFile(files.casierJudiciaire.buffer, files.casierJudiciaire.originalname, 'stages');
    stageData.casierJudiciaire = null;
    stageData.casierJudiciaire_filename = files.casierJudiciaire.originalname;
    stageData.casierJudiciaire_size = files.casierJudiciaire.size;
  }

  if (files.lettreMotivation) {
    stageData.lettreMotivation_path = fileStorage.saveFile(files.lettreMotivation.buffer, files.lettreMotivation.originalname, 'stages');
    stageData.lettreMotivation = null;
    stageData.lettreMotivation_filename = files.lettreMotivation.originalname;
    stageData.lettreMotivation_size = files.lettreMotivation.size;
  }

  if (files.lettreRecommandation) {
    stageData.lettreRecommandation_path = fileStorage.saveFile(files.lettreRecommandation.buffer, files.lettreRecommandation.originalname, 'stages');
    stageData.lettreRecommandation = null;
    stageData.lettreRecommandation_filename = files.lettreRecommandation.originalname;
    stageData.lettreRecommandation_size = files.lettreRecommandation.size;
  }

  if (files.dernierDiplome) {
    stageData.dernierDiplome_path = fileStorage.saveFile(files.dernierDiplome.buffer, files.dernierDiplome.originalname, 'stages');
    stageData.dernierDiplome = null;
    stageData.dernierDiplome_filename = files.dernierDiplome.originalname;
    stageData.dernierDiplome_size = files.dernierDiplome.size;
  }

  const stage = await Stage.create(stageData);

  // Notifications email — en arrière-plan, ne doit pas faire attendre la réponse HTTP
  (async () => {
    try {
      const frontUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
      // 1. Confirmation au candidat
      await notifService.sendConfirmationSoumission(candidat, 'stage', [
        { label: 'Type', value: data.typeStage === 'SOUTENANCE' ? 'Soutenance' : 'Perfectionnement' },
        { label: 'Domaine', value: data.domaineStage },
        { label: 'Durée', value: `${data.dureeStage} mois` },
        { label: 'Début souhaité', value: new Date(data.dateDebutSouhaitee).toLocaleDateString('fr-FR') },
      ], `${frontUrl}/dashboard/candidat/mes-stages`);
      // 2. Notification aux agents
      await notifService.onNouvelleDemandeStage(candidat, data);
    } catch (e) {
      console.error('❌ Email création stage:', e.message);
    }
  })();

  return stage;
};

/**
 * Obtenir tous les stages (pour agents) avec pagination
 * @param {object} filters - Filtres de recherche
 * @param {object} [agentContext] - Contexte de l'agent { agentId, isSystemRole }
 *   Si isSystemRole=false, seuls les stages de la direction de l'agent sont retournés.
 *   Si absent ou isSystemRole=true, tous les stages sont retournés.
 */
const getAllStages = async (filters = {}, agentContext = null) => {
  const { page = 1, limit = 10, statusStage, typeStage, domaineStage, search } = filters;
  const offset = (page - 1) * limit;

  const where = { del: 0 };

  if (statusStage) {
    // Permet de filtrer sur plusieurs statuts à la fois (ex. "ACCEPTE,EN_COURS")
    // pour les écrans "Vue globale" (ex. onglet "Stage en cours").
    where.statusStage = statusStage.includes(',')
      ? { [Op.in]: statusStage.split(',').map(s => s.trim()).filter(Boolean) }
      : statusStage;
  }

  if (typeStage) {
    where.typeStage = typeStage;
  }

  if (domaineStage) {
    where.domaineStage = { [Op.like]: `%${domaineStage}%` };
  }

  // Directions de l'agent — utilisées pour filtrer la liste (rôle non-système)
  // ET pour indiquer au front, stage par stage, sur lesquels il peut agir
  // (cas d'un rôle "lecture globale" combiné à un rôle d'action limité à sa direction).
  let agentDirectionIds = [];
  if (agentContext && agentContext.agentId) {
    const agent = await Agent.findByPk(agentContext.agentId, {
      include: [
        { model: Service, as: 'service', include: [{ model: Direction, as: 'directions', through: { attributes: [] } }] },
        { model: Direction, as: 'directionDirecte' },
      ],
    });
    agentDirectionIds = getAgentDirectionIds(agent);
  }

  // Filtrage par direction si l'agent n'est pas un rôle système (lecture)
  if (agentContext && !agentContext.isSystemRole && agentContext.agentId) {
    if (agentDirectionIds.length > 0) {
      where.direction_iddirection = { [Op.in]: agentDirectionIds };
    } else {
      // Aucune direction associée au service de l'agent → ne rien afficher
      // (évite d'exposer tous les stages si la configuration est incomplète)
      where.direction_iddirection = { [Op.eq]: -1 };
    }
  }

  // Configuration de la recherche avec inclusion conditionnelle
  const includeConfig = {
    model: Candidat,
    as: 'candidat',
    attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
  };

  // Si recherche, ajouter condition sur le candidat
  if (search) {
    includeConfig.where = {
      [Op.or]: [
        { nom: { [Op.like]: `%${search}%` } },
        { prenom: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ]
    };
  }

  const { count, rows } = await Stage.findAndCountAll({
    where,
    include: [
      includeConfig,
      {
        model: Direction,
        as: 'direction',
        attributes: ['iddirection', 'nom', 'accronyme'],
        required: false,
      },
      {
        model: Service,
        as: 'serviceStage',
        attributes: ['idservice', 'accronyme', 'description'],
        required: false,
      },
      {
        model: RapportStage,
        as: 'rapport',
        required: false,
        attributes: { exclude: ['rapportPdf'] },
      },
      {
        model: DocumentStage,
        as: 'documents',
        where: { del: 0, typeDocument: 'ATTESTATION' },
        required: false,
        attributes: { exclude: ['document'] },
      },
    ],
    // Exclure les colonnes BLOB pour des raisons de performance
    attributes: {
      exclude: [
        'cv', 'cnib', 'casierJudiciaire', 'lettreMotivation',
        'lettreRecommandation', 'dernierDiplome'
      ]
    },
    order: [['createdDate', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset),
    distinct: true
  });

  // peutAgir : indique si l'agent connecté peut effectuer une action (approuver/rejeter/...)
  // sur ce stage précis. Un rôle d'action système (ADMIN, AGENT_RH, ...) ou un rôle "lecture
  // globale" avec permission d'action (ex. Admin_RH) peut toujours agir ; sinon, seulement si
  // le stage appartient à une direction de l'agent.
  // ignoreOwnDirection (écrans "Vue globale") : on ignore volontairement le critère "propre
  // direction" pour ne jamais laisser les permissions d'un AUTRE rôle local de l'agent (ex.
  // "Approbateur de stage" sur sa propre direction) faire apparaître une action sur cet écran
  // dédié au rôle sous-admin — seul l'accès global compte ici.
  const items = rows.map((r) => {
    const json = r.toJSON();
    json.peutAgir = calculerPeutAgir(json.direction_iddirection, { agentContext, agentDirectionIds });
    return json;
  });

  // Statistiques par statut, scopées comme la liste (direction de l'agent le cas échéant)
  // mais SANS le filtre statusStage de l'écran courant — sinon les cartes "Total / En attente /
  // En cours / Terminés" seraient toutes égales sur un écran "Vue globale" filtré sur un seul
  // statut. Indépendant de la pagination (limit/offset), contrairement à un calcul côté front
  // sur la page courante (ancien bug : les compteurs plafonnaient à `limit`).
  const whereStats = { ...where };
  delete whereStats.statusStage;

  // Chaque compteur correspond exactement à une section du menu Vue globale :
  // En attente = EN_ATTENTE, Approuvé = PROGRAMMATION_EN_COURS,
  // En cours = ACCEPTE + EN_COURS, Terminé = RAPPORT_SOUMIS + TERMINE
  const [total, enAttente, accepte, enCours, termine, rejete] = await Promise.all([
    Stage.count({ where: whereStats }),
    Stage.count({ where: { ...whereStats, statusStage: 'EN_ATTENTE' } }),
    Stage.count({ where: { ...whereStats, statusStage: 'PROGRAMMATION_EN_COURS' } }),
    Stage.count({ where: { ...whereStats, statusStage: { [Op.in]: ['ACCEPTE', 'EN_COURS'] } } }),
    Stage.count({ where: { ...whereStats, statusStage: { [Op.in]: ['RAPPORT_SOUMIS', 'TERMINE'] } } }),
    Stage.count({ where: { ...whereStats, statusStage: { [Op.in]: ['REJETE', 'ANNULE', 'SUSPENDU'] } } }),
  ]);

  return {
    items,
    total: count,
    page: parseInt(page),
    totalPages: Math.ceil(count / limit),
    limit: parseInt(limit),
    stats: { total, enAttente, accepte, enCours, termine, rejete },
  };
};

/**
 * Obtenir les domaines distincts présents dans les stages
 */
const getDomainesDistincts = async () => {
  const rows = await Stage.findAll({
    where: { del: 0 },
    attributes: ['domaineStage'],
    group: ['domaineStage'],
    order: [['domaineStage', 'ASC']],
  });
  return rows.map(r => r.domaineStage).filter(Boolean);
};

/**
 * Obtenir les statistiques des stages
 */
const getStagesStats = async () => {
  const total = await Stage.count({ where: { del: 0 } });
  const enAttente = await Stage.count({ where: { del: 0, statusStage: 'EN_ATTENTE' } });
  const enCoursDeTraitement = await Stage.count({ where: { del: 0, statusStage: 'EN_COURS_DE_TRAITEMENT' } });
  const acceptes = await Stage.count({ where: { del: 0, statusStage: 'ACCEPTE' } });
  const enCours = await Stage.count({ where: { del: 0, statusStage: 'EN_COURS' } });
  const termines = await Stage.count({ where: { del: 0, statusStage: 'TERMINE' } });
  const expires = await Stage.count({ where: { del: 0, statusStage: 'EXPIRE' } });
  const rejetes = await Stage.count({ where: { del: 0, statusStage: 'REJETE' } });
  const rapportsSoumis = await Stage.count({ where: { del: 0, statusStage: 'RAPPORT_SOUMIS' } });

  return {
    total,
    enAttente,
    enCoursDeTraitement,
    acceptes,
    enCours,
    termines,
    expires,
    rejetes,
    rapportsSoumis
  };
};

/**
 * Obtenir les stages d'un candidat
 */
const getStagesByCandidat = async (candidatId) => {
  return await Stage.findAll({
    where: { 
      candidats_idcandidats: candidatId,
      del: 0,
    },
    include: [
      {
        model: RapportStage,
        as: 'rapport',
        required: false,
        attributes: { exclude: ['rapportPdf'] },
      },
      {
        model: DocumentStage,
        as: 'documents',
        where: { del: 0 },
        required: false,
        attributes: { exclude: ['document'] },
      },
    ],
    order: [['createdDate', 'DESC']],
  });
};

/**
 * Obtenir un stage par ID
 * @param {number} id
 * @param {object|null} user - req.user (pour vérification IDOR si CANDIDAT)
 */
const getStageById = async (id, user = null) => {
  const stage = await Stage.findOne({
    where: { idstage: id, del: 0 },
    // Exclure les colonnes BLOB, on garde juste les filenames
    attributes: {
      exclude: [
        'cv', 'cnib', 'casierJudiciaire', 'lettreMotivation',
        'lettreRecommandation', 'dernierDiplome'
      ]
    },
    include: [
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
      },
      {
        model: RapportStage,
        as: 'rapport',
        required: false,
        attributes: { exclude: ['rapportPdf'] },
      },
      {
        model: DocumentStage,
        as: 'documents',
        where: { del: 0 },
        required: false,
        attributes: { exclude: ['document'] },
      },
      {
        model: Stage,
        as: 'stageParent',
        required: false,
        attributes: { exclude: ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'] },
      },
      // Pour les renouvellements : inclure la demande de renouvellement associée (stage_nouveau = ce stage)
      {
        model: RenouvellementStage,
        as: 'renouvellementsNouveaux',
        required: false,
        where: { del: 0 },
        // Exclure les BLOBs, garder seulement les métadonnées
        attributes: {
          exclude: ['lettreMotivationRenouvellement', 'conventionStageEnCours']
        },
        limit: 1, // Un seul renouvellement possible par stage
      },
      // Autorisation de renouvellement active (admin → candidat)
      {
        model: AutorisationRenouvellementStage,
        as: 'autorisationsRenouvellement',
        required: false,
        where: {
          del: 0,
          usedAt: null,
          expiresAt: { [Op.gt]: new Date() },
        },
        attributes: ['id', 'expiresAt', 'autorisePar'],
      },
    ],
  });

  if (!stage) {
    throw new Error('Stage non trouvé');
  }

  // IDOR : un candidat ne peut accéder qu'à ses propres stages
  if (user && user.role === 'CANDIDAT' && stage.candidats_idcandidats !== user.candidatId) {
    throw new Error('Stage non trouvé');
  }

  // Extraire le renouvellement si c'est un stage de renouvellement
  const stageData = stage.toJSON();
  if (stageData.estRenouvellement && stageData.renouvellementsNouveaux && stageData.renouvellementsNouveaux.length > 0) {
    stageData.renouvellementInfo = stageData.renouvellementsNouveaux[0];
  } else {
    stageData.renouvellementInfo = null;
  }
  delete stageData.renouvellementsNouveaux;

  return stageData;
};

/**
 * Mettre à jour le statut d'un stage
 * @param {number} id - ID du stage
 * @param {object} data - Donnees de mise a jour (statusStage, dateDebutEffective, motifRefus)
 * @param {object} file - Fichier de convention (optionnel, requis si acceptation)
 * @param {number} agentId - ID de l'agent qui effectue l'action
 */
const updateStatusStage = async (id, data, file = null, agentId = null, agentContext = null) => {
  const stage = await Stage.findOne({
    where: { idstage: id, del: 0 },
    include: [
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'email'],
      },
    ],
  });

  if (!stage) {
    throw new Error('Stage non trouvé');
  }

  await assertAgentOwnsDirection(agentContext, stage.direction_iddirection);

  // Documents non conformes (uniquement pertinent en cas de rejet) — converti en JSON pour stockage
  if (data.statusStage === 'REJETE') {
    const keys = (data.documentsRejetes || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    data.documentsRejetes = keys.length > 0 ? JSON.stringify(keys) : null;
  } else {
    data.documentsRejetes = null;
  }

  // Si on accepte le stage avec une date de debut effective, calculer la date de fin
  if (data.statusStage === 'ACCEPTE' && data.dateDebutEffective) {
    // La durée réellement accordée par l'entreprise peut différer de celle demandée
    // par le candidat à la création du dossier — on met à jour dureeStage en conséquence.
    if (data.dureeAccordee) {
      data.dureeStage = data.dureeAccordee;
    }

    // Règle : date fin = dernier jour inclus (ex: 01/03 + 1 mois = 31/03)
    data.dateFinEffective = calculerDateFin(data.dateDebutEffective, data.dureeStage || stage.dureeStage);

    // Verifier que la convention est fournie lors de l'acceptation
    if (!file) {
      throw new Error('La convention de stage est obligatoire lors de l\'acceptation');
    }

    if (!agentId) {
      throw new Error('L\'ID de l\'agent est requis pour creer la convention');
    }

    // Creer le document de convention dans document_stage
    await DocumentStage.create({
      stage_idstage: id,
      rapport_idrapport: null, // Convention n'est pas liee a un rapport
      agents_idagents: agentId,
      typeDocument: 'CONVENTION',
      document: file.buffer,
      document_filename: file.originalname,
      document_size: file.size,
      dateEmission: data.dateDebutEffective, // Date d'emission = date de debut du stage
      dateExpiration: data.dateFinEffective, // Date d'expiration = date de fin du stage
    });
  }

  // Ajouter la date de modification
  data.lastmodifiedDate = new Date();
  delete data.dureeAccordee; // champ d'entrée uniquement, déjà reporté sur dureeStage

  await stage.update(data);

  // Envoyer l'email de notification au candidat — en arrière-plan
  (async () => {
    try {
      if (data.statusStage === 'ACCEPTE' && stage.candidat) {
        const stageForEmail = {
          typeStage: stage.typeStage,
          domaineStage: stage.domaineStage,
          dureeStage: stage.dureeStage,
          dateDebutEffective: data.dateDebutEffective,
        };
        await emailService.sendStageAccepteEmail(stage.candidat, stageForEmail);
        console.log(`📧 Email d'acceptation envoyé à ${stage.candidat.email}`);
      } else if (data.statusStage === 'REJETE' && stage.candidat) {
        const stageForEmail = {
          typeStage: stage.typeStage,
          domaineStage: stage.domaineStage,
        };
        await emailService.sendStageRefuseEmail(stage.candidat, stageForEmail, data.motifRefus);
        console.log(`📧 Email de refus envoyé à ${stage.candidat.email}`);
      }
    } catch (emailError) {
      console.error('❌ Erreur envoi email notification stage:', emailError);
    }
  })();

  return stage;
};

/**
 * Remplacer un document signalé comme non conforme — soit parce que la demande a été
 * rejetée, soit parce qu'un agent a exigé son remplacement sans rejeter la demande
 * (voir `exigerDocuments`). Le candidat ne peut remplacer que les documents listés
 * dans `documentsRejetes`, quel que soit le statut courant du stage.
 * @param {number} id - ID du stage
 * @param {string} type - Clé du document (cv, cnib, casierJudiciaire, lettreMotivation, lettreRecommandation, dernierDiplome)
 * @param {object} file - Fichier uploadé (multer)
 * @param {number} candidatId - ID du candidat connecté (vérification de propriété)
 */
const remplacerDocumentStage = async (id, type, file, candidatId) => {
  const { DOCUMENT_KEYS } = require('../validators/stage.validator');

  if (!DOCUMENT_KEYS.includes(type)) {
    throw new Error('Type de document invalide');
  }
  if (!file) {
    throw new Error('Le fichier est requis');
  }

  const stage = await Stage.findOne({ where: { idstage: id, del: 0 } });
  if (!stage) throw new Error('Stage non trouvé');
  if (stage.candidats_idcandidats !== candidatId) {
    throw new Error('Action non autorisée');
  }

  const documentsRejetes = stage.documentsRejetes ? JSON.parse(stage.documentsRejetes) : [];
  if (!documentsRejetes.includes(type)) {
    throw new Error('Ce document n\'a pas été signalé comme non conforme');
  }

  const update = {
    [`${type}_path`]: fileStorage.saveFile(file.buffer, file.originalname, 'stages'),
    [type]: null,
    [`${type}_filename`]: file.originalname,
    [`${type}_size`]: file.size,
    lastmodifiedDate: new Date(),
  };

  const documentsRestants = documentsRejetes.filter((k) => k !== type);
  update.documentsRejetes = documentsRestants.length > 0 ? JSON.stringify(documentsRestants) : null;

  await stage.update(update);
  return stage;
};

const DOCUMENT_LABELS = {
  cv: 'CV daté et signé',
  cnib: 'CNIB légalisée',
  casierJudiciaire: 'Casier judiciaire',
  lettreMotivation: 'Lettre de motivation signée',
  lettreRecommandation: 'Lettre de recommandation',
  dernierDiplome: 'Dernier diplôme légalisé',
};

// Statuts sur lesquels il n'est pas pertinent d'exiger un document : REJETE a son
// propre flux (rejet + resoumission), les autres sont des états terminaux.
const STATUTS_NON_EXIGIBLES = ['REJETE', 'ANNULE', 'TERMINE', 'EXPIRE'];

/**
 * Exiger le remplacement d'un ou plusieurs documents sur une demande de stage
 * SANS la rejeter — la demande garde son statut courant et continue de suivre son
 * cours normal ; le candidat est simplement tenu de remplacer les documents visés.
 * @param {number} id - ID du stage
 * @param {string[]} types - Clés des documents à exiger
 * @param {{ agentId?: number, isSystemRole?: boolean }|null} agentContext
 */
const exigerDocuments = async (id, types, agentContext) => {
  const { DOCUMENT_KEYS } = require('../validators/stage.validator');

  if (!Array.isArray(types) || types.length === 0) {
    throw new Error('Veuillez sélectionner au moins un document');
  }
  const invalid = types.filter((t) => !DOCUMENT_KEYS.includes(t));
  if (invalid.length > 0) {
    throw new Error('Type de document invalide');
  }

  const stage = await Stage.findOne({
    where: { idstage: id, del: 0 },
    include: [{ model: Candidat, as: 'candidat', attributes: ['idcandidats', 'nom', 'prenom', 'email'] }],
  });
  if (!stage) throw new Error('Stage non trouvé');

  await assertAgentOwnsDirection(agentContext, stage.direction_iddirection);

  if (STATUTS_NON_EXIGIBLES.includes(stage.statusStage)) {
    throw new Error(`Impossible d'exiger un document sur une demande au statut ${stage.statusStage}`);
  }

  const dejaExiges = stage.documentsRejetes ? JSON.parse(stage.documentsRejetes) : [];
  const fusion = Array.from(new Set([...dejaExiges, ...types]));

  await stage.update({ documentsRejetes: JSON.stringify(fusion), lastmodifiedDate: new Date() });

  if (stage.candidat) {
    const urlSuivi = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/dashboard/candidat/stages?open=${id}`;
    const nouveauxLabels = types.map((t) => DOCUMENT_LABELS[t] || t);
    notifService.sendDocumentARemplacerStage(stage.candidat, stage, nouveauxLabels, urlSuivi)
      .catch((e) => console.error('❌ Erreur notification document à remplacer:', e.message));
  }

  return stage;
};

/**
 * Resoumettre une demande de stage rejetée après remplacement des documents non conformes.
 * Remet le statut à EN_ATTENTE pour qu'un agent la réexamine.
 * @param {number} id - ID du stage
 * @param {number} candidatId - ID du candidat connecté (vérification de propriété)
 */
const resoumettreStage = async (id, candidatId) => {
  const stage = await Stage.findOne({
    where: { idstage: id, del: 0 },
    include: [{ model: Candidat, as: 'candidat', attributes: ['idcandidats', 'nom', 'prenom', 'email'] }],
  });
  if (!stage) throw new Error('Stage non trouvé');
  if (stage.candidats_idcandidats !== candidatId) {
    throw new Error('Action non autorisée');
  }
  if (stage.statusStage !== 'REJETE') {
    throw new Error('Seules les demandes rejetées peuvent être resoumises');
  }

  const documentsRejetes = stage.documentsRejetes ? JSON.parse(stage.documentsRejetes) : [];
  if (documentsRejetes.length > 0) {
    throw new Error('Tous les documents non conformes doivent être remplacés avant de resoumettre');
  }

  await stage.update({
    statusStage: 'EN_ATTENTE',
    motifRefus: null,
    documentsRejetes: null,
    lastmodifiedDate: new Date(),
  });

  return stage;
};

/**
 * Fusionner tous les documents PDF d'un dossier de stage en un seul PDF
 */
const mergeStageDocuments = async (id, user = null) => {
  const stage = await Stage.findOne({ where: { idstage: id, del: 0 } });
  if (!stage) throw new Error('Stage non trouvé');
  if (user && user.role === 'CANDIDAT' && stage.candidats_idcandidats !== user.candidatId) {
    throw new Error('Stage non trouvé');
  }

  const docTypes = ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'];
  const { PDFDocument } = require('pdf-lib');

  const mergedPdf = await PDFDocument.create();

  for (const type of docTypes) {
    const pathField = `${type}_path`;
    if (!stage[type] && !stage[pathField]) continue;
    try {
      const buffer = fileStorage.readFile(stage[pathField], stage[type]);
      // Sauter les buffers vides (fichier absent du disque + pas de BLOB)
      if (!buffer || buffer.length === 0) continue;
      const srcPdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages  = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
      pages.forEach(p => mergedPdf.addPage(p));
    } catch (e) {
      // Si un doc est corrompu ou non-PDF, on l'ignore silencieusement
      console.warn(`[mergeStageDocuments] Impossible de traiter ${type}:`, e.message);
    }
  }

  if (mergedPdf.getPageCount() === 0) {
    throw new Error('Aucun document accessible — les fichiers sont peut-être manquants ou corrompus');
  }

  const pdfBytes = await mergedPdf.save();
  return Buffer.from(pdfBytes);
};

/**
 * Télécharger un document de stage (CV, CNIB, etc.)
 */
const downloadStageDocument = async (id, documentType, user = null) => {
  const stage = await Stage.findOne({
    where: { idstage: id, del: 0 },
  });

  if (!stage) {
    throw new Error('Stage non trouvé');
  }

  // IDOR : un candidat ne peut télécharger que ses propres documents
  if (user && user.role === 'CANDIDAT' && stage.candidats_idcandidats !== user.candidatId) {
    throw new Error('Stage non trouvé');
  }
  
  const validTypes = ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'];
  if (!validTypes.includes(documentType)) {
    throw new Error('Type de document invalide');
  }
  
  const pathField = `${documentType}_path`;
  if (!stage[documentType] && !stage[pathField]) {
    throw new Error('Document non trouvé');
  }

  return {
    buffer: fileStorage.readFile(stage[pathField], stage[documentType]),
    filename: stage[`${documentType}_filename`],
    size: stage[`${documentType}_size`],
  };
};

/**
 * Telecharger la convention de stage (depuis document_stage)
 */
const downloadConventionStage = async (stageId, user = null) => {
  // IDOR : vérifier ownership avant de servir le document
  if (user && user.role === 'CANDIDAT') {
    const stage = await Stage.findOne({ where: { idstage: stageId, del: 0 }, attributes: ['candidats_idcandidats'] });
    if (!stage || stage.candidats_idcandidats !== user.candidatId) {
      throw new Error('Convention de stage non trouvée');
    }
  }

  const convention = await DocumentStage.findOne({
    where: {
      stage_idstage: stageId,
      typeDocument: 'CONVENTION',
      del: 0,
    },
  });

  if (!convention) {
    throw new Error('Convention de stage non trouvée');
  }

  return {
    buffer: fileStorage.readFile(convention.document_path, convention.document),
    filename: convention.document_filename,
    size: convention.document_size,
  };
};

/**
 * Verifier si une convention existe pour un stage
 */
const hasConvention = async (stageId) => {
  const convention = await DocumentStage.findOne({
    where: {
      stage_idstage: stageId,
      typeDocument: 'CONVENTION',
      del: 0,
    },
    attributes: ['iddocument', 'document_filename'],
  });

  return convention ? { exists: true, filename: convention.document_filename } : { exists: false, filename: null };
};

// =====================================================
// RENOUVELLEMENTS
// =====================================================

/**
 * Créer une demande de renouvellement
 */
const createRenouvellement = async (candidatId, data, files) => {
  // Vérifier que le stage actuel existe et appartient au candidat
  const stageActuel = await Stage.findOne({
    where: { 
      idstage: data.stage_actuel_idstage,
      candidats_idcandidats: candidatId,
      statusStage: 'EN_COURS',
      del: 0,
    },
  });
  
  if (!stageActuel) {
    throw new Error('Stage actuel non trouvé ou non éligible au renouvellement');
  }
  
  // Créer le nouveau stage
  const nouveauStage = await Stage.create({
    candidats_idcandidats: candidatId,
    stage_parent_idstage: data.stage_actuel_idstage,
    typeStage: stageActuel.typeStage,
    niveau: stageActuel.niveau,
    domaineStage: stageActuel.domaineStage,
    dureeStage: data.dureeDemandee,
    dureeStageSouhaitee: data.dureeDemandee,
    dateDebutSouhaitee: new Date(),
    statusStage: 'EN_ATTENTE',
    estRenouvellement: 1,
  });
  
  // Créer la demande de renouvellement
  const renouvellementData = {
    stage_actuel_idstage: data.stage_actuel_idstage,
    stage_nouveau_idstage: nouveauStage.idstage,
    dureeDemandee: data.dureeDemandee,
    statusRenouvellement: 'EN_ATTENTE',
  };
  
  if (files.lettreMotivationRenouvellement) {
    renouvellementData.lettreMotivationRenouvellement_path = fileStorage.saveFile(files.lettreMotivationRenouvellement.buffer, files.lettreMotivationRenouvellement.originalname, 'renouvellements');
    renouvellementData.lettreMotivationRenouvellement = null;
    renouvellementData.lettreMotivationRenouvellement_filename = files.lettreMotivationRenouvellement.originalname;
    renouvellementData.lettreMotivationRenouvellement_size = files.lettreMotivationRenouvellement.size;
  }

  if (files.conventionStageEnCours) {
    renouvellementData.conventionStageEnCours_path = fileStorage.saveFile(files.conventionStageEnCours.buffer, files.conventionStageEnCours.originalname, 'renouvellements');
    renouvellementData.conventionStageEnCours = null;
    renouvellementData.conventionStageEnCours_filename = files.conventionStageEnCours.originalname;
    renouvellementData.conventionStageEnCours_size = files.conventionStageEnCours.size;
  }
  
  const renouvellement = await RenouvellementStage.create(renouvellementData);
  
  return {
    renouvellement,
    nouveauStage,
  };
};

/**
 * Obtenir tous les renouvellements
 */
const getAllRenouvellements = async (filters = {}) => {
  const where = { del: 0 };
  
  if (filters.statusRenouvellement) {
    where.statusRenouvellement = filters.statusRenouvellement;
  }
  
  return await RenouvellementStage.findAll({
    where,
    include: [
      {
        model: Stage,
        as: 'stageActuel',
        include: [
          {
            model: Candidat,
            as: 'candidat',
            attributes: ['idcandidats', 'nom', 'prenom', 'email'],
          },
        ],
      },
      {
        model: Stage,
        as: 'stageNouveau',
      },
    ],
    order: [['dateRenouvellement', 'DESC']],
  });
};

/**
 * Évaluer un renouvellement
 * Si ACCEPTE : calcule la date de début effective du nouveau stage (lendemain de la fin du stage actuel)
 *              et la date de fin effective via calculerDateFin.
 */
const evaluateRenouvellement = async (id, data, agentContext = null) => {
  const renouvellement = await RenouvellementStage.findOne({
    where: { idrenouvellement: id, del: 0 },
    include: [
      {
        model: Stage,
        as: 'stageNouveau',
      },
      {
        model: Stage,
        as: 'stageActuel',
        attributes: ['idstage', 'dateFinEffective', 'candidats_idcandidats'],
      },
    ],
  });

  if (!renouvellement) {
    throw new Error('Renouvellement non trouvé');
  }

  await assertAgentOwnsDirection(agentContext, renouvellement.stageNouveau?.direction_iddirection);

  await renouvellement.update(data);

  // Si accepté, mettre à jour le statut du nouveau stage et calculer ses dates effectives
  if (data.statusRenouvellement === 'ACCEPTE') {
    const stageActuelDateFin = renouvellement.stageActuel?.dateFinEffective;

    let dateDebutEffectiveNouveau = null;
    let dateFinEffectiveNouveau = null;

    if (stageActuelDateFin) {
      // Le nouveau stage commence le lendemain de la fin du stage actuel
      const lendemain = new Date(stageActuelDateFin);
      lendemain.setDate(lendemain.getDate() + 1);
      dateDebutEffectiveNouveau = lendemain.toISOString().split('T')[0];

      // Calcul date fin inclusive : début + durée - 1 jour
      dateFinEffectiveNouveau = calculerDateFin(
        dateDebutEffectiveNouveau,
        renouvellement.dureeDemandee
      );
    }

    const updateData = {
      statusStage: 'ACCEPTE',
    };

    if (dateDebutEffectiveNouveau) {
      updateData.dateDebutEffective = dateDebutEffectiveNouveau;
      updateData.dateFinEffective = dateFinEffectiveNouveau;
    }

    await renouvellement.stageNouveau.update(updateData);

  } else if (data.statusRenouvellement === 'REJETE') {
    await renouvellement.stageNouveau.update({
      statusStage: 'REJETE',
      motifRefus: data.motifRefus,
    });
  }

  return renouvellement;
};

// =====================================================
// RAPPORTS
// =====================================================

/**
 * Créer un rapport de stage
 */
const createRapport = async (candidatId, data, file) => {
  // Vérifier que le stage existe, est expiré et appartient au candidat
  const stage = await Stage.findOne({
    where: { 
      idstage: data.stage_idstage,
      candidats_idcandidats: candidatId,
      statusStage: 'EXPIRE',
      del: 0,
    },
  });
  
  if (!stage) {
    throw new Error('Stage non trouvé ou non éligible pour un rapport');
  }
  
  // Vérifier qu'un rapport n'existe pas déjà
  const existingRapport = await RapportStage.findOne({
    where: { stage_idstage: data.stage_idstage, del: 0 },
  });
  
  if (existingRapport) {
    throw new Error('Un rapport existe déjà pour ce stage');
  }
  
  if (!file) {
    throw new Error('Le fichier PDF du rapport est requis');
  }
  
  return await RapportStage.create({
    stage_idstage: data.stage_idstage,
    titreRapport: data.titreRapport,
    natureRapport: data.natureRapport,
    rapportPdf: null,
    rapportPdf_path: fileStorage.saveFile(file.buffer, file.originalname, 'rapports'),
    rapportPdf_filename: file.originalname,
    rapportPdf_size: file.size,
    statusRapport: 'SOUMIS',
    createdBy: candidatId,
  });
};

/**
 * Obtenir tous les rapports (pour agents)
 */
const getAllRapports = async (filters = {}) => {
  const where = { del: 0 };

  if (filters.statusRapport) {
    where.statusRapport = filters.statusRapport;
  }

  return await RapportStage.findAll({
    where,
    // Exclure le BLOB du rapport pour des raisons de performance
    attributes: { exclude: ['rapportPdf'] },
    include: [
      {
        model: Stage,
        as: 'stage',
        attributes: { exclude: ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'] },
        include: [
          {
            model: Candidat,
            as: 'candidat',
            attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
          },
        ],
      },
    ],
    order: [['createdDate', 'DESC']],
  });
};

/**
 * Obtenir un rapport par ID
 */
const getRapportById = async (id, user = null) => {
  const rapport = await RapportStage.findOne({
    where: { idrapport: id, del: 0 },
    include: [
      {
        model: Stage,
        as: 'stage',
        include: [
          {
            model: Candidat,
            as: 'candidat',
          },
        ],
      },
    ],
  });

  if (!rapport) {
    throw new Error('Rapport non trouvé');
  }

  // IDOR : un candidat ne peut voir que ses propres rapports
  if (user && user.role === 'CANDIDAT') {
    const ownerId = rapport.stage?.candidats_idcandidats;
    if (ownerId !== user.candidatId) {
      throw new Error('Rapport non trouvé');
    }
  }

  return rapport;
};

/**
 * Évaluer un rapport
 */
const evaluateRapport = async (id, data, evaluePar, agentContext = null) => {
  const rapport = await RapportStage.findOne({
    where: { idrapport: id, del: 0 },
    include: [
      {
        model: Stage,
        as: 'stage',
        include: [
          {
            model: Candidat,
            as: 'candidat',
            attributes: ['idcandidats', 'nom', 'prenom', 'email'],
          },
        ],
      },
    ],
  });

  if (!rapport) {
    throw new Error('Rapport non trouvé');
  }

  await assertAgentOwnsDirection(agentContext, rapport.stage?.direction_iddirection);

  await rapport.update({
    ...data,
    evaluePar,
    dateEvaluation: new Date(),
  });

  // Si le rapport est validé, mettre à jour le statut du stage en TERMINE
  if (data.statusRapport === 'VALIDE' && rapport.stage) {
    await rapport.stage.update({
      statusStage: 'TERMINE',
      lastmodifiedDate: new Date(),
    });

    // Envoyer email de notification au candidat — en arrière-plan
    if (rapport.stage.candidat) {
      (async () => {
        try {
          const rapportForEmail = {
            titreRapport: rapport.titreRapport,
            natureRapport: rapport.natureRapport,
          };
          await emailService.sendRapportValideEmail(rapport.stage.candidat, rapportForEmail);
          console.log(`📧 Email de validation de rapport envoyé à ${rapport.stage.candidat.email}`);
        } catch (emailError) {
          console.error('❌ Erreur envoi email validation rapport:', emailError);
        }
      })();
    }
  }

  return rapport;
};

/**
 * Télécharger le PDF d'un rapport
 */
const downloadRapport = async (id, user = null) => {
  const rapport = await RapportStage.findOne({
    where: { idrapport: id, del: 0 },
    include: [{ model: Stage, as: 'stage', attributes: ['candidats_idcandidats'] }],
  });

  if (!rapport) {
    throw new Error('Rapport non trouvé');
  }

  // IDOR : un candidat ne peut télécharger que son propre rapport
  if (user && user.role === 'CANDIDAT' && rapport.stage?.candidats_idcandidats !== user.candidatId) {
    throw new Error('Rapport non trouvé');
  }
  
  return {
    buffer: fileStorage.readFile(rapport.rapportPdf_path, rapport.rapportPdf),
    filename: rapport.rapportPdf_filename,
  };
};

// =====================================================
// DOCUMENTS (Conventions / Attestations)
// =====================================================

/**
 * Créer un document de stage (convention ou attestation)
 */
const createDocumentStage = async (agentId, data, file) => {
  if (!file) {
    throw new Error('Le fichier PDF est requis');
  }

  // Vérifier que le stage existe et récupérer le candidat
  const stage = await Stage.findOne({
    where: { idstage: data.stage_idstage, del: 0 },
    include: [
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'email'],
      },
    ],
  });

  if (!stage) {
    throw new Error('Stage non trouvé');
  }

  // Si c'est une attestation, vérifier que le rapport existe et est validé
  if (data.typeDocument === 'ATTESTATION') {
    if (!data.rapport_idrapport) {
      throw new Error('Rapport non trouvé ou non validé');
    }
    const rapport = await RapportStage.findOne({
      where: {
        idrapport: data.rapport_idrapport,
        statusRapport: 'VALIDE',
        del: 0,
      },
    });

    if (!rapport) {
      throw new Error('Rapport non trouvé ou non validé');
    }
  }

  const document = await DocumentStage.create({
    stage_idstage: data.stage_idstage,
    rapport_idrapport: data.rapport_idrapport || null,
    agents_idagents: agentId,
    typeDocument: data.typeDocument,
    document: null,
    document_path: fileStorage.saveFile(file.buffer, file.originalname, 'documents-stage'),
    document_filename: file.originalname,
    document_size: file.size,
    numeroAttestation: data.numeroAttestation || null,
    emetteurNom: data.emetteurNom || null,
    emetteurFonction: data.emetteurFonction || null,
    dateEmission: data.dateEmission,
    dateExpiration: data.dateExpiration || null,
  });

  // Envoyer email de notification si c'est une attestation — en arrière-plan
  if (data.typeDocument === 'ATTESTATION' && stage.candidat) {
    (async () => {
      try {
        const stageForEmail = {
          typeStage: stage.typeStage,
          domaineStage: stage.domaineStage,
          dateDebutEffective: stage.dateDebutEffective,
          dateFinEffective: stage.dateFinEffective,
        };
        await emailService.sendAttestationDisponibleEmail(stage.candidat, stageForEmail);
        console.log(`📧 Email d'attestation disponible envoyé à ${stage.candidat.email}`);
      } catch (emailError) {
        console.error('❌ Erreur envoi email attestation:', emailError);
      }
    })();
  }

  return document;
};

/**
 * Obtenir un document de stage par ID
 */
const getDocumentStageById = async (id) => {
  const document = await DocumentStage.findOne({
    where: { iddocument: id, del: 0 },
    include: [
      {
        model: Stage,
        as: 'stage',
        include: [
          {
            model: Candidat,
            as: 'candidat',
          },
        ],
      },
      {
        model: Agent,
        as: 'agent',
      },
    ],
  });
  
  if (!document) {
    throw new Error('Document non trouvé');
  }
  
  return document;
};

/**
 * Télécharger un document de stage
 */
const downloadDocumentStage = async (id) => {
  const document = await DocumentStage.findOne({
    where: { iddocument: id, del: 0 },
  });
  
  if (!document) {
    throw new Error('Document non trouvé');
  }
  
  return {
    buffer: fileStorage.readFile(document.document_path, document.document),
    filename: document.document_filename,
  };
};

/**
 * Télécharger la lettre de demande de renouvellement (soumise par le candidat)
 * @param {number} renouvellementId - ID dans renouvellement_stage
 */
const downloadLettreRenouvellement = async (renouvellementId) => {
  const renouvellement = await RenouvellementStage.findOne({
    where: { idrenouvellement: renouvellementId, del: 0 },
    attributes: ['idrenouvellement', 'lettreMotivationRenouvellement', 'lettreMotivationRenouvellement_filename', 'lettreMotivationRenouvellement_size'],
  });

  if (!renouvellement) {
    throw new Error('Demande de renouvellement non trouvée');
  }

  if (!renouvellement.lettreMotivationRenouvellement) {
    throw new Error('Aucune lettre de renouvellement disponible pour cette demande');
  }

  return {
    buffer: fileStorage.readFile(renouvellement.lettreMotivationRenouvellement_path, renouvellement.lettreMotivationRenouvellement),
    filename: renouvellement.lettreMotivationRenouvellement_filename || `lettre_renouvellement_${renouvellementId}.pdf`,
  };
};

/**
 * Télécharger la convention du stage en cours copiée lors du renouvellement
 * @param {number} renouvellementId - ID dans renouvellement_stage
 */
const downloadConventionRenouvellement = async (renouvellementId) => {
  const renouvellement = await RenouvellementStage.findOne({
    where: { idrenouvellement: renouvellementId, del: 0 },
    attributes: ['idrenouvellement', 'conventionStageEnCours', 'conventionStageEnCours_filename', 'conventionStageEnCours_size'],
  });

  if (!renouvellement) {
    throw new Error('Demande de renouvellement non trouvée');
  }

  if (!renouvellement.conventionStageEnCours) {
    throw new Error('Aucune convention disponible pour cette demande de renouvellement');
  }

  return {
    buffer: fileStorage.readFile(renouvellement.conventionStageEnCours_path, renouvellement.conventionStageEnCours),
    filename: renouvellement.conventionStageEnCours_filename || `convention_renouvellement_${renouvellementId}.pdf`,
  };
};

// =====================================================
// RÈGLE 6 MOIS CONTINUS
// =====================================================

/**
 * Calcule la durée totale continue d'un candidat en remontant la chaîne de stages.
 * Parcourt : stage actuel → stage parent → grand-parent... jusqu'à la racine.
 * Se base sur dateDebutEffective du premier stage et dateFinEffective du dernier (ou dateFinSouhaitee).
 *
 * @param {number} candidatId
 * @param {number|null} stageParentId - ID du stage parent (null si nouveau stage)
 * @returns {object} { dureeTotaleJours, dureeTotaleMois, dateDebutChaine, dateFinChaine, dateMinRepos }
 */
const getDureeContinueCandidat = async (candidatId, stageParentId = null) => {
  if (!stageParentId) {
    // Vérifier si le candidat vient de terminer une chaîne récemment (pour le repos obligatoire)
    const dernierStageTermine = await Stage.findOne({
      where: {
        candidats_idcandidats: candidatId,
        statusStage: { [Op.in]: ['TERMINE', 'EXPIRE', 'RAPPORT_SOUMIS'] },
        stage_parent_idstage: null, // Stage racine (non-renouvellement ou premier d'une chaîne)
        dateFinEffective: { [Op.not]: null },
        del: 0,
      },
      order: [['dateFinEffective', 'DESC']],
    });

    if (!dernierStageTermine) {
      return { dureeTotaleJours: 0, dureeTotaleMois: 0, dateDebutChaine: null, dateFinChaine: null, dateMinRepos: null };
    }

    // Calculer la durée de toute la chaîne (ce stage + tous ses renouvellements)
    return calculerDureeChaine(candidatId, dernierStageTermine.idstage);
  }

  // Remonter jusqu'au stage racine de la chaîne
  return calculerDureeChaine(candidatId, stageParentId);
};

/**
 * Calcule la durée effective d'une chaîne de stages à partir d'un stage racine.
 * @param {number} candidatId
 * @param {number} stageRacineId
 */
const calculerDureeChaine = async (candidatId, stageRacineId) => {
  // Remonter jusqu'à la racine si stageRacineId est un renouvellement
  let stageRacine = await Stage.findOne({
    where: { idstage: stageRacineId, candidats_idcandidats: candidatId, del: 0 },
    attributes: ['idstage', 'stage_parent_idstage', 'dateDebutEffective', 'dateFinEffective', 'dureeStage'],
  });

  if (!stageRacine) return { dureeTotaleJours: 0, dureeTotaleMois: 0, dateDebutChaine: null, dateFinChaine: null, dateMinRepos: null };

  // Remonter jusqu'à la vraie racine
  while (stageRacine.stage_parent_idstage) {
    const parent = await Stage.findOne({
      where: { idstage: stageRacine.stage_parent_idstage, del: 0 },
      attributes: ['idstage', 'stage_parent_idstage', 'dateDebutEffective', 'dateFinEffective', 'dureeStage'],
    });
    if (!parent) break;
    stageRacine = parent;
  }

  // Date de début de la chaîne = dateDebutEffective du stage racine
  const dateDebutChaine = stageRacine.dateDebutEffective;
  if (!dateDebutChaine) {
    return { dureeTotaleJours: 0, dureeTotaleMois: 0, dateDebutChaine: null, dateFinChaine: null, dateMinRepos: null };
  }

  // Trouver le dernier stage de la chaîne (le plus récent dans la lignée)
  let dernierStage = stageRacine;
  let continuer = true;
  while (continuer) {
    const suivant = await Stage.findOne({
      where: {
        stage_parent_idstage: dernierStage.idstage,
        del: 0,
        statusStage: { [Op.in]: ['EN_ATTENTE', 'EN_COURS_DE_TRAITEMENT', 'ACCEPTE', 'EN_COURS', 'TERMINE', 'EXPIRE', 'RAPPORT_SOUMIS'] },
      },
      attributes: ['idstage', 'stage_parent_idstage', 'dateDebutEffective', 'dateFinEffective', 'dureeStage', 'statusStage'],
      order: [['createdDate', 'DESC']],
    });
    if (suivant) {
      dernierStage = suivant;
    } else {
      continuer = false;
    }
  }

  return calculerDureeEtRepos(dateDebutChaine, dernierStage.dateFinEffective);
};

/**
 * Récupère tous les stages EN_COURS avec leur durée cumulée (pour l'onglet suivi admin)
 */
const getStagesSuivi = async (filters = {}) => {
  const where = {
    statusStage: 'EN_COURS',
    del: 0,
  };

  const candidatWhere = filters.search ? {
    [Op.or]: [
      { nom: { [Op.like]: `%${filters.search}%` } },
      { prenom: { [Op.like]: `%${filters.search}%` } },
      { email: { [Op.like]: `%${filters.search}%` } },
    ],
  } : undefined;

  // Récupérer tous les stages (pour calculer le total avant pagination)
  const stages = await Stage.findAll({
    where,
    attributes: {
      exclude: ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'],
    },
    include: [
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
        where: candidatWhere,
        required: !!candidatWhere,
      },
    ],
    order: [['dateDebutEffective', 'ASC']],
  });

  // Pour chaque stage EN_COURS, calculer la durée cumulée de la chaîne
  const allItems = await Promise.all(stages.map(async (stage) => {
    const stageJson = stage.toJSON();

    // Trouver l'ID de la racine de la chaîne
    const rootId = stageJson.stage_parent_idstage || stageJson.idstage;
    const dureeInfo = await calculerDureeChaine(stageJson.candidats_idcandidats, rootId);

    // Calculer les jours restants du stage actuel
    let joursRestants = null;
    if (stageJson.dateFinEffective) {
      const dateFin = new Date(stageJson.dateFinEffective);
      const aujourd = new Date();
      joursRestants = Math.ceil((dateFin - aujourd) / (1000 * 60 * 60 * 24));
    }

    // Calculer les mois déjà consommés dans la chaîne
    const moisConsommes = dureeInfo.dureeTotaleJours > 0
      ? Math.round((dureeInfo.dureeTotaleJours / 30.44) * 10) / 10
      : 0;

    return {
      idstage: stageJson.idstage,
      candidat: stageJson.candidat,
      typeStage: stageJson.typeStage,
      domaineStage: stageJson.domaineStage,
      dureeStage: stageJson.dureeStage,
      dateDebutEffective: stageJson.dateDebutEffective,
      dateFinEffective: stageJson.dateFinEffective,
      estRenouvellement: stageJson.estRenouvellement,
      stage_parent_idstage: stageJson.stage_parent_idstage,
      // Infos cumul chaîne
      dateDebutChaine: dureeInfo.dateDebutChaine,
      moisConsommes,
      moisRestantsAvantLimit: Math.max(0, Math.round((6 - moisConsommes) * 10) / 10),
      renouvellementPossible: moisConsommes < 6,
      joursRestants,
    };
  }));

  // Pagination
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 10;
  const total = allItems.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const offset = (page - 1) * limit;
  const items = allItems.slice(offset, offset + limit);

  return {
    items,
    total,
    page,
    totalPages,
    limit,
  };
};

/**
 * Modifier les informations d'un stage (dates effectives, commentaire)
 * Requiert permission MODIFIER sur STAGE
 * NB : ne touche jamais à direction_iddirection/service_idservice — voir transfererStage()
 * pour le changement de direction, qui requiert sa propre permission + vérification
 * de propriété de la direction d'origine.
 */
const updateStage = async (stageId, data, agentContext = null) => {
  const stage = await Stage.findOne({ where: { idstage: stageId, del: 0 } });
  if (!stage) throw new Error('Stage non trouvé');

  const updates = {};
  if (data.commentaireAdmin !== undefined)    updates.commentaireAdmin    = data.commentaireAdmin || null;
  if (data.dureeStage !== undefined)          updates.dureeStage          = data.dureeStage;

  // Durée effective à utiliser pour le recalcul de la date de fin : celle qu'on vient
  // de définir si elle est fournie dans cette requête, sinon celle déjà enregistrée.
  const dureeAUtiliser = data.dureeStage !== undefined ? data.dureeStage : stage.dureeStage;

  if (data.dateDebutEffective !== undefined) {
    updates.dateDebutEffective = data.dateDebutEffective || null;
    // Correction de la date de début (et/ou de la durée) : recalculer automatiquement
    // la date de fin, sauf si l'appelant fournit explicitement une nouvelle date de fin.
    if (data.dateFinEffective === undefined && data.dateDebutEffective && dureeAUtiliser) {
      updates.dateFinEffective = calculerDateFin(data.dateDebutEffective, dureeAUtiliser);
    }
  } else if (data.dureeStage !== undefined && data.dateFinEffective === undefined && stage.dateDebutEffective) {
    // Seule la durée change (pas la date de début) : recalculer la date de fin
    // à partir de la date de début déjà enregistrée.
    updates.dateFinEffective = calculerDateFin(stage.dateDebutEffective, data.dureeStage);
  }
  if (data.dateFinEffective !== undefined)    updates.dateFinEffective    = data.dateFinEffective || null;

  // Affectation direction/service — réservée aux rôles système (ADMIN, AGENT_RH...).
  // Un agent disposant simplement de la permission MODIFIER ne doit pas pouvoir
  // déplacer un stage vers une autre direction par ce biais (voir transfererStage
  // pour le flux normal, avec vérification de propriété de la direction d'origine).
  if (data.direction_iddirection !== undefined || data.service_idservice !== undefined) {
    if (!agentContext || !agentContext.isSystemRole) {
      throw new Error('Action non autorisée');
    }
    if (data.direction_iddirection !== undefined) {
      updates.direction_iddirection = data.direction_iddirection || null;
    }
    if (data.service_idservice !== undefined) {
      updates.service_idservice = data.service_idservice || null;
    }
  }

  await stage.update(updates);

  // Si on vient de modifier une date, vérifier immédiatement si le statut doit suivre
  // (ACCEPTE → EN_COURS si la date de début est atteinte, EN_COURS → EXPIRE si la date
  // de fin est dépassée) — sans attendre le prochain passage du cron (toutes les 60 min).
  if (updates.dateDebutEffective !== undefined || updates.dateFinEffective !== undefined) {
    const { activerStagesAcceptes, expirerStagesEnCours } = require('../jobs/stageStatusJob');
    await activerStagesAcceptes();
    await expirerStagesEnCours();
  }

  return stage.reload();
};

// Statuts pour lesquels un transfert de direction n'a plus de sens : la demande a déjà
// été rejetée/annulée, ou le stage a déjà commencé (EN_COURS), s'est terminé (TERMINE)
// ou est suspendu en cours de route (SUSPENDU).
const STATUTS_NON_TRANSFERABLES = ['REJETE', 'EN_COURS', 'TERMINE', 'ANNULE', 'SUSPENDU'];

/**
 * Transférer un stage vers une autre direction.
 * Requiert permission TRANSFERER sur STAGE, et que l'agent possède la direction
 * D'ORIGINE du stage (sauf rôle système/lecture-globale avec accès global — voir
 * agentContext.isSystemRole). Le service rattaché à l'ancienne direction n'a plus
 * de sens dans la nouvelle direction : il est donc réinitialisé.
 * Impossible si le stage est rejeté, annulé, ou a déjà commencé/terminé.
 */
const transfererStage = async (stageId, newDirectionId, agentContext) => {
  const stage = await Stage.findOne({ where: { idstage: stageId, del: 0 } });
  if (!stage) throw new Error('Stage non trouvé');

  await assertAgentOwnsDirection(agentContext, stage.direction_iddirection);

  if (STATUTS_NON_TRANSFERABLES.includes(stage.statusStage)) {
    throw new Error(`Ce stage ne peut pas être transféré (statut actuel : ${stage.statusStage})`);
  }

  if (stage.direction_iddirection === newDirectionId) {
    throw new Error('Ce stage est déjà rattaché à cette direction');
  }

  const directionExists = await Direction.findOne({ where: { iddirection: newDirectionId, del: 0 } });
  if (!directionExists) throw new Error('Direction non trouvée');

  await stage.update({
    direction_iddirection: newDirectionId,
    service_idservice: null,
    lastmodifiedDate: new Date(),
  });
  return stage.reload();
};

/**
 * Supprimer un stage (soft delete : del = 1)
 * Requiert permission SUPPRIMER sur STAGE
 */
const deleteStage = async (stageId) => {
  const stage = await Stage.findOne({ where: { idstage: stageId, del: 0 } });
  if (!stage) throw new Error('Stage non trouvé');
  await stage.update({ del: 1 });
  return { deleted: true };
};

// =====================================================
// APPROBATION DE STAGE
// =====================================================

/**
 * Approuver un stage (passe de EN_ATTENTE à PROGRAMMATION_EN_COURS)
 * @param {number} stageId
 * @param {string} agentUsername
 */
const approuverStage = async (stageId, agentUsername, agentContext = null, dateDebutProposee = null) => {
  const stage = await Stage.findOne({
    where: { idstage: stageId, del: 0 },
    include: [{ model: Direction, as: 'direction', required: false }],
  });

  if (!stage) {
    throw new Error('Stage non trouvé');
  }

  await assertAgentOwnsDirection(agentContext, stage.direction_iddirection);

  if (stage.statusStage !== 'EN_ATTENTE') {
    throw new Error(`Le stage ne peut pas être approuvé (statut actuel : ${stage.statusStage})`);
  }

  await stage.update({
    statusStage: 'PROGRAMMATION_EN_COURS',
    dateDebutProposee: dateDebutProposee || null,
    lastmodifiedDate: new Date(),
  });

  return stage.reload();
};

// =====================================================
// DEMANDES DE MODIFICATION (SUSPENSION / ANNULATION)
// =====================================================

/**
 * Créer une demande de modification de stage (suspension ou annulation)
 * @param {number} candidatId
 * @param {number} stageId
 * @param {object} data - { type, motif }
 */
const createDemandeModification = async (candidatId, stageId, data, files = {}) => {
  // Vérifier que le stage existe et appartient au candidat
  const stage = await Stage.findOne({
    where: { idstage: stageId, candidats_idcandidats: candidatId, del: 0 },
  });

  if (!stage) {
    throw new Error('Stage non trouvé ou ne vous appartient pas');
  }

  // Vérifier le statut selon le type de demande
  if (data.type === 'SUSPENSION') {
    if (stage.statusStage !== 'EN_COURS') {
      throw new Error('Une demande de suspension n\'est possible que pour un stage EN_COURS');
    }
  } else if (data.type === 'ANNULATION') {
    if (!['EN_COURS', 'SUSPENDU'].includes(stage.statusStage)) {
      throw new Error('Une demande d\'annulation n\'est possible que pour un stage EN_COURS ou SUSPENDU');
    }
  }

  // Date de début requise
  if (!data.dateDebut) {
    throw new Error('La date de début est requise');
  }

  // Fichier requis : demande manuscrite
  const lettreManuscriteFile = files?.lettreManuscrite?.[0];
  if (!lettreManuscriteFile) throw new Error('La demande manuscrite est requise');

  // Vérifier qu'il n'y a pas déjà une demande EN_ATTENTE pour ce stage
  const existingDemande = await DemandeModificationStage.findOne({
    where: { stage_idstage: stageId, status: 'EN_ATTENTE', del: 0 },
  });

  if (existingDemande) {
    throw new Error('Une demande de modification est déjà en attente pour ce stage');
  }

  // Sauvegarder le fichier sur disque
  const lettreManuscritePath = fileStorage.saveFile(
    lettreManuscriteFile.buffer, lettreManuscriteFile.originalname, 'stages/modifications'
  );

  const demande = await DemandeModificationStage.create({
    stage_idstage: stageId,
    candidat_id: candidatId,
    type: data.type,
    motif: data.motif,
    dateDebut: data.dateDebut,
    lettreManuscrite_filename: lettreManuscriteFile.originalname,
    lettreManuscrite_path: lettreManuscritePath,
    status: 'EN_ATTENTE',
  });

  return demande;
};

/**
 * Annuler (retirer) sa propre demande de modification, tant qu'elle n'a pas
 * encore été traitée par un agent.
 * @param {number} candidatId
 * @param {number} demandeId
 */
const annulerDemandeModification = async (candidatId, demandeId) => {
  const demande = await DemandeModificationStage.findOne({
    where: { id: demandeId, del: 0 },
  });

  if (!demande) throw new Error('Demande de modification non trouvée');
  if (demande.candidat_id !== candidatId) throw new Error('Action non autorisée');
  if (demande.status !== 'EN_ATTENTE') {
    throw new Error('Seules les demandes en attente peuvent être annulées');
  }

  await demande.update({ del: 1 });

  return demande;
};

/**
 * Lire un fichier joint d'une demande de modification (justification ou lettreManuscrite)
 * @param {number} demandeId
 * @param {'justification'|'lettreManuscrite'} field
 * @returns {{ buffer: Buffer, filename: string, mimetype: string }}
 */
const getDemandeModificationFichier = async (demandeId, field) => {
  const demande = await DemandeModificationStage.findOne({
    where: { id: demandeId, del: 0 },
  });
  if (!demande) throw new Error('Demande de modification non trouvée');

  const relPath  = demande[`${field}_path`];
  const filename = demande[`${field}_filename`];
  if (!relPath) throw new Error('Aucun fichier joint pour ce type');

  const buffer = fileStorage.readFile(relPath, null);
  if (!buffer || buffer.length === 0) throw new Error('Fichier introuvable sur le serveur');

  // Déduire le type MIME depuis l'extension
  const ext = (filename || relPath).split('.').pop().toLowerCase();
  const mimeMap = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mimetype = mimeMap[ext] || 'application/octet-stream';

  return { buffer, filename: filename || `fichier.${ext}`, mimetype };
};

/**
 * Obtenir toutes les demandes de modification avec filtres
 * @param {object} filters - { status }
 */
const getAllDemandesModification = async (filters = {}) => {
  const where = { del: 0 };

  if (filters.status) {
    where.status = filters.status;
  }

  return await DemandeModificationStage.findAll({
    where,
    attributes: { exclude: ['justification_path', 'lettreManuscrite_path'] },
    include: [
      {
        model: Stage,
        as: 'stage',
        attributes: { exclude: ['cv', 'cnib', 'casierJudiciaire', 'lettreMotivation', 'lettreRecommandation', 'dernierDiplome'] },
        include: [
          {
            model: Direction,
            as: 'direction',
            attributes: ['iddirection', 'nom', 'accronyme'],
            required: false,
          },
        ],
      },
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
      },
    ],
    order: [['createdDate', 'DESC']],
  });
};

/**
 * Évaluer une demande de modification (approuver ou rejeter)
 * @param {number} demandeId
 * @param {object} data - { status, reponse_drh }
 * @param {string} agentUsername
 */
const evaluerDemandeModification = async (demandeId, data, agentUsername, agentContext = null) => {
  const demande = await DemandeModificationStage.findOne({
    where: { id: demandeId, del: 0 },
    include: [{ model: Stage, as: 'stage' }],
  });

  if (!demande) {
    throw new Error('Demande de modification non trouvée');
  }

  await assertAgentOwnsDirection(agentContext, demande.stage?.direction_iddirection);

  if (demande.status !== 'EN_ATTENTE') {
    throw new Error(`La demande a déjà été traitée (statut : ${demande.status})`);
  }

  await demande.update({
    status: data.status,
    reponse_drh: data.reponse_drh || null,
    processedDate: new Date(),
    processedBy: agentUsername,
  });

  // Si approuvée, mettre à jour le statut du stage
  if (data.status === 'APPROUVEE' && demande.stage) {
    if (demande.type === 'SUSPENSION') {
      await demande.stage.update({
        statusStage: 'SUSPENDU',
        lastmodifiedDate: new Date(),
      });
    } else if (demande.type === 'ANNULATION') {
      await demande.stage.update({
        statusStage: 'ANNULE',
        lastmodifiedDate: new Date(),
      });
    }
  }

  return demande.reload();
};

// =====================================================
// AUTORISATION DE RENOUVELLEMENT (ADMIN → CANDIDAT)
// =====================================================

/**
 * L'administrateur accorde une fenêtre de 7 jours au candidat pour soumettre
 * une demande de renouvellement sur un stage TERMINE ou EXPIRE.
 * Une nouvelle autorisation remplace toute autorisation précédente (active ou non).
 */
const autoriserRenouvellementStage = async (stageId, agentId) => {
  const inapp = require('./inapp.service');

  const stage = await Stage.findOne({
    where: { idstage: stageId, del: 0 },
    include: [{ model: Candidat, as: 'candidat', attributes: ['idcandidats', 'nom', 'prenom'] }],
  });

  if (!stage) throw new Error('Stage non trouvé');

  if (!['TERMINE', 'EXPIRE'].includes(stage.statusStage)) {
    throw new Error('L\'autorisation de renouvellement n\'est possible que pour un stage terminé ou expiré');
  }

  // Marquer toute autorisation précédente comme supprimée (del=1) avant d'en créer une nouvelle
  await AutorisationRenouvellementStage.update(
    { del: 1 },
    { where: { stage_idstage: stageId, del: 0 } }
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const autorisation = await AutorisationRenouvellementStage.create({
    stage_idstage: stageId,
    autorisePar: agentId,
    expiresAt,
    usedAt: null,
    del: 0,
  });

  // Notifier le candidat
  const candidatId = stage.candidat?.idcandidats;
  if (candidatId) {
    const expireStr = expiresAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    await inapp.push({
      recipientType: 'CANDIDAT',
      recipientId: candidatId,
      type: 'STAGE',
      titre: 'Renouvellement autorisé',
      message: `Un administrateur vous a accordé l'autorisation de demander le renouvellement de votre stage. Cette autorisation expire le ${expireStr}.`,
      link: '/candidat/stages',
    });
  }

  return autorisation;
};

/**
 * Récupère l'autorisation active (non expirée, non utilisée, non supprimée) pour un stage.
 * Retourne null si aucune n'existe.
 */
const getAutorisationActive = async (stageId) => {
  return AutorisationRenouvellementStage.findOne({
    where: {
      stage_idstage: stageId,
      del: 0,
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
};

module.exports = {
  // Utilitaires (exporté pour réutilisation)
  calculerDateFin,
  calculerPeutAgir,
  calculerDureeEtRepos,
  getDureeContinueCandidat,
  getStagesSuivi,

  // Stages
  createStage,
  getAllStages,
  getStagesStats,
  getDomainesDistincts,
  getStagesByCandidat,
  getStageById,
  updateStage,
  transfererStage,
  updateStatusStage,
  remplacerDocumentStage,
  exigerDocuments,
  resoumettreStage,
  deleteStage,
  mergeStageDocuments,
  downloadStageDocument,
  downloadConventionStage,
  hasConvention,

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

  // Approbation de stage
  approuverStage,

  // Demandes de modification
  createDemandeModification,
  annulerDemandeModification,
  getDemandeModificationFichier,
  getAllDemandesModification,
  evaluerDemandeModification,

  // Autorisation de renouvellement
  autoriserRenouvellementStage,
  getAutorisationActive,
};
// src/services/user.service.js - Service de gestion des utilisateurs et agents
const { User, Agent, Role, Service, Direction, UserAgent, UserRole, sequelize } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const notifService = require('./notification.service');

/**
 * Normalise l'entrée de rôles en provenance du frontend.
 * Accepte soit `roleIds` (tableau, nouveau contrat), soit `role_idrole` (legacy).
 * Retourne { principal, additional[] } ou null si rien fourni.
 * Le 1er id du tableau devient le rôle PRINCIPAL (users.role_idrole),
 * les suivants deviennent les rôles ADDITIONNELS (users_roles).
 */
const normalizeRoleInput = (data) => {
  let ids = [];
  if (Array.isArray(data.roleIds)) {
    ids = data.roleIds;
  } else if (data.role_idrole != null) {
    ids = [data.role_idrole];
  }
  // Nettoyer : entiers valides, dédupliqués, en préservant l'ordre
  const seen = new Set();
  ids = ids
    .map(v => parseInt(v, 10))
    .filter(v => Number.isInteger(v) && v > 0 && !seen.has(v) && seen.add(v));

  if (ids.length === 0) return null;
  return { principal: ids[0], additional: ids.slice(1), all: ids };
};

/**
 * Récupérer tous les rôles
 */
const getAllRoles = async () => {
  return await Role.findAll({
    where: { del: 0 },
    attributes: ['idrole', 'accronyme', 'description'],
  });
};

/**
 * Récupérer tous les services
 */
const getAllServices = async () => {
  return await Service.findAll({
    where: { del: 0 },
    attributes: ['idservice', 'accronyme', 'description'],
  });
};

/**
 * Récupérer toutes les directions (pour le rattachement direct d'un agent sans service)
 */
const getAllDirections = async () => {
  return await Direction.findAll({
    where: { del: 0 },
    attributes: ['iddirection', 'nom', 'accronyme'],
  });
};

/**
 * Récupérer tous les agents avec leurs utilisateurs
 */
const getAllAgents = async (filters = {}) => {
  const { search, role, service, direction, page = 1, limit = 10 } = filters;

  const whereClause = { del: 0 };
  const userWhereClause = { del: 0 };

  // Filtre de recherche
  if (search) {
    whereClause[Op.or] = [
      { nom: { [Op.like]: `%${search}%` } },
      { prenom: { [Op.like]: `%${search}%` } },
      { matricule: { [Op.like]: `%${search}%` } },
    ];
  }

  // Filtre par service
  if (service) {
    whereClause.service_idservice = service;
  }

  // Filtre par direction (rattachement direct, sans service)
  if (direction) {
    whereClause.direction_iddirection = direction;
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await Agent.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Service,
        as: 'service',
        attributes: ['idservice', 'accronyme', 'description'],
      },
      {
        model: Direction,
        as: 'directionDirecte',
        attributes: ['iddirection', 'nom', 'accronyme'],
      },
      {
        model: User,
        as: 'users',
        where: role ? { role_idrole: role } : userWhereClause,
        required: !!role,
        attributes: ['idusers', 'username', 'role_idrole'],
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['idrole', 'accronyme', 'description'],
          },
          {
            model: Role,
            as: 'additionalRoles',
            attributes: ['idrole', 'accronyme', 'description'],
            through: { attributes: [] },
          },
        ],
      },
    ],
    offset,
    limit: parseInt(limit),
    distinct: true,
    order: [['createdDate', 'DESC']],
  });

  return {
    items: rows,
    total: count,
    page: parseInt(page),
    pageSize: parseInt(limit),
    totalPages: Math.ceil(count / limit),
  };
};

/**
 * Récupérer un agent par ID
 */
const getAgentById = async (id) => {
  const agent = await Agent.findOne({
    where: { idagents: id, del: 0 },
    include: [
      {
        model: Service,
        as: 'service',
        attributes: ['idservice', 'accronyme', 'description'],
      },
      {
        model: Direction,
        as: 'directionDirecte',
        attributes: ['iddirection', 'nom', 'accronyme'],
      },
      {
        model: User,
        as: 'users',
        where: { del: 0 },
        required: false,
        attributes: ['idusers', 'username', 'role_idrole'],
        include: [
          {
            model: Role,
            as: 'role',
            attributes: ['idrole', 'accronyme', 'description'],
          },
          {
            model: Role,
            as: 'additionalRoles',
            attributes: ['idrole', 'accronyme', 'description'],
            through: { attributes: [] },
          },
        ],
      },
    ],
  });

  if (!agent) {
    throw new Error('Agent non trouvé');
  }

  return agent;
};

/**
 * Créer un nouvel agent avec son compte utilisateur
 */
const createAgent = async (data, createdBy) => {
  const {
    nom, prenom, matricule, email,
    service_idservice, direction_iddirection, username, password
  } = data;

  // Rôles : principal + additionnels
  const rolesInput = normalizeRoleInput(data);
  if (!rolesInput) {
    throw new Error('Au moins un rôle est requis');
  }

  const transaction = await sequelize.transaction();

  try {
    // Vérifier si le matricule existe déjà
    const existingMatricule = await Agent.findOne({
      where: { matricule, del: 0 }
    });
    if (existingMatricule) {
      throw new Error('Ce matricule est déjà utilisé');
    }

    // Vérifier si l'email existe déjà
    const existingEmail = await Agent.findOne({
      where: { email, del: 0 }
    });
    if (existingEmail) {
      throw new Error('Cette adresse email est déjà utilisée par un autre agent');
    }

    // Vérifier si le username existe déjà
    const existingUsername = await User.findOne({
      where: { username, del: 0 }
    });
    if (existingUsername) {
      throw new Error('Ce nom d\'utilisateur est déjà utilisé');
    }

    // Rattachement : soit un service, soit une direction (jamais les deux)
    if (service_idservice && direction_iddirection) {
      throw new Error('Choisissez soit un service, soit une direction, pas les deux');
    }
    if (!service_idservice && !direction_iddirection) {
      throw new Error('Un service ou une direction doit être renseigné');
    }
    if (service_idservice) {
      const serviceExists = await Service.findOne({
        where: { idservice: service_idservice, del: 0 }
      });
      if (!serviceExists) {
        throw new Error('Service non trouvé');
      }
    } else {
      const directionExists = await Direction.findOne({
        where: { iddirection: direction_iddirection, del: 0 }
      });
      if (!directionExists) {
        throw new Error('Direction non trouvée');
      }
    }

    // Vérifier que TOUS les rôles fournis existent
    const rolesCount = await Role.count({
      where: { idrole: { [Op.in]: rolesInput.all }, del: 0 }
    });
    if (rolesCount !== rolesInput.all.length) {
      throw new Error('Un ou plusieurs rôles sont introuvables');
    }

    // Créer l'agent
    const agent = await Agent.create({
      nom,
      prenom,
      matricule,
      email,
      service_idservice: service_idservice || null,
      direction_iddirection: direction_iddirection || null,
      createdBy,
      createdDate: new Date(),
    }, { transaction });

    // Créer l'utilisateur avec son rôle PRINCIPAL
    const user = await User.create({
      username,
      password, // Sera hashé par le hook beforeCreate
      role_idrole: rolesInput.principal,
    }, { transaction });

    // Enregistrer les rôles ADDITIONNELS dans users_roles
    if (rolesInput.additional.length > 0) {
      await UserRole.bulkCreate(
        rolesInput.additional.map(rid => ({
          users_idusers: user.idusers,
          role_idrole: rid,
        })),
        { transaction }
      );
    }

    // Lier l'agent à l'utilisateur
    await UserAgent.create({
      users_idusers: user.idusers,
      agents_idagents: agent.idagents,
    }, { transaction });

    await transaction.commit();

    // Initialiser les prefs de notification email pour ce nouvel agent
    notifService.initAgentNotificationPrefs(agent.idagents).catch(() => {});

    // Retourner l'agent avec ses relations
    return await getAgentById(agent.idagents);

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Mettre à jour un agent
 */
const updateAgent = async (id, data, modifiedBy) => {
  const {
    nom, prenom, matricule, email,
    service_idservice, direction_iddirection
  } = data;

  // Rôles (optionnels en update) : si fournis, on remplace l'ensemble
  const rolesInput = normalizeRoleInput(data);

  const transaction = await sequelize.transaction();

  try {
    const agent = await Agent.findOne({
      where: { idagents: id, del: 0 },
      include: [{
        model: User,
        as: 'users',
        where: { del: 0 },
        required: false,
      }],
    });

    if (!agent) {
      throw new Error('Agent non trouvé');
    }

    // Vérifier unicité du matricule si modifié
    if (matricule && matricule !== agent.matricule) {
      const existingMatricule = await Agent.findOne({
        where: { matricule, del: 0, idagents: { [Op.ne]: id } }
      });
      if (existingMatricule) {
        throw new Error('Ce matricule est déjà utilisé');
      }
    }

    // Vérifier unicité de l'email si modifié
    if (email && email !== agent.email) {
      const existingEmail = await Agent.findOne({
        where: { email, del: 0, idagents: { [Op.ne]: id } }
      });
      if (existingEmail) {
        throw new Error('Cette adresse email est déjà utilisée par un autre agent');
      }
    }

    // Rattachement : si l'un des deux champs est fourni, il remplace le rattachement
    // existant en entier (un agent ne peut être lié qu'à un service OU une direction).
    let nextServiceId = agent.service_idservice;
    let nextDirectionId = agent.direction_iddirection;
    if (service_idservice !== undefined || direction_iddirection !== undefined) {
      if (service_idservice && direction_iddirection) {
        throw new Error('Choisissez soit un service, soit une direction, pas les deux');
      }
      if (service_idservice) {
        const serviceExists = await Service.findOne({ where: { idservice: service_idservice, del: 0 } });
        if (!serviceExists) throw new Error('Service non trouvé');
        nextServiceId = service_idservice;
        nextDirectionId = null;
      } else if (direction_iddirection) {
        const directionExists = await Direction.findOne({ where: { iddirection: direction_iddirection, del: 0 } });
        if (!directionExists) throw new Error('Direction non trouvée');
        nextDirectionId = direction_iddirection;
        nextServiceId = null;
      } else {
        throw new Error('Un service ou une direction doit être renseigné');
      }
    }

    // Mettre à jour l'agent
    await agent.update({
      nom: nom || agent.nom,
      prenom: prenom || agent.prenom,
      matricule: matricule || agent.matricule,
      email: email || agent.email,
      service_idservice: nextServiceId,
      direction_iddirection: nextDirectionId,
      lastModifiedBy: modifiedBy,
      lastModifiedDate: new Date(),
    }, { transaction });

    // Mettre à jour les rôles de l'utilisateur si spécifiés
    if (rolesInput && agent.users && agent.users.length > 0) {
      // Vérifier que tous les rôles existent
      const rolesCount = await Role.count({
        where: { idrole: { [Op.in]: rolesInput.all }, del: 0 }
      });
      if (rolesCount !== rolesInput.all.length) {
        throw new Error('Un ou plusieurs rôles sont introuvables');
      }

      const user = agent.users[0];

      // Rôle principal
      await user.update({ role_idrole: rolesInput.principal }, { transaction });

      // Remplacer l'ensemble des rôles additionnels
      await UserRole.destroy({ where: { users_idusers: user.idusers }, transaction });
      if (rolesInput.additional.length > 0) {
        await UserRole.bulkCreate(
          rolesInput.additional.map(rid => ({
            users_idusers: user.idusers,
            role_idrole: rid,
          })),
          { transaction }
        );
      }
    }

    await transaction.commit();

    return await getAgentById(id);

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Supprimer un agent (soft delete)
 */
const deleteAgent = async (id, deletedBy) => {
  const transaction = await sequelize.transaction();

  try {
    const agent = await Agent.findOne({
      where: { idagents: id, del: 0 },
      include: [{
        model: User,
        as: 'users',
        where: { del: 0 },
        required: false,
      }],
    });

    if (!agent) {
      throw new Error('Agent non trouvé');
    }

    // Soft delete de l'agent
    await agent.update({
      del: 1,
      deletedBy,
      deletedDate: new Date(),
    }, { transaction });

    // Soft delete des utilisateurs liés
    if (agent.users && agent.users.length > 0) {
      for (const user of agent.users) {
        await user.update({ del: 1 }, { transaction });
      }
    }

    await transaction.commit();

    return { message: 'Agent supprimé avec succès' };

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Changer le mot de passe d'un agent
 */
const changeAgentPassword = async (agentId, newPassword) => {
  const agent = await Agent.findOne({
    where: { idagents: agentId, del: 0 },
    include: [{
      model: User,
      as: 'users',
      where: { del: 0 },
      required: true,
    }],
  });

  if (!agent || !agent.users || agent.users.length === 0) {
    throw new Error('Agent ou utilisateur non trouvé');
  }

  const user = agent.users[0];
  await user.update({ password: newPassword });

  return { message: 'Mot de passe modifié avec succès' };
};

/**
 * Statistiques des utilisateurs
 * Rôles dynamiques — on ne compte plus par rôle fixe, on compte par type global
 */
const getUserStats = async () => {
  const [
    totalUsers,
    totalAgents,
    admins,
  ] = await Promise.all([
    User.count({ where: { del: 0 } }),
    Agent.count({ where: { del: 0 } }),
    User.count({
      where: { del: 0 },
      include: [{
        model: Role,
        as: 'role',
        where: { accronyme: 'ADMIN' },
      }],
    }),
  ]);

  return {
    totalUsers,
    totalAgents,
    admins,
  };
};

/**
 * Récupère les événements récents selon les modules accessibles du rôle
 * Utilisé pour le centre de notifications de l'agent layout
 */
const getRecentEvents = async (roleId, roleName) => {
  const {
    Stage,
    CandidatureOffre, CandidatureAide, DemandeAudience,
    Candidat, Agent: AgentModel, Permission, Offre, Aide,
  } = require('../models');

  const LIMIT = 6;

  // Déterminer les modules accessibles
  let modules = [];
  const SYSTEM_ROLES = ['ADMIN'];
  if (SYSTEM_ROLES.includes(roleName)) {
    modules = ['CANDIDATURES', 'STAGE', 'OFFRE', 'AIDE', 'DEMANDE_AUDIENCE', 'CANDIDATS', 'AGENTS'];
  } else if (roleId) {
    const perms = await Permission.findAll({
      where: { role_idrole: roleId, del: 0 },
      attributes: ['module'],
    });
    modules = [...new Set(perms.map(p => p.module))];
  }

  // Fenêtre temporelle : 3 derniers jours uniquement
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // Requêtes par module (chacune isolée dans un try/catch)
  const queryMap = {
    CANDIDATURES: async () => {
      const items = await Stage.findAll({
        where: { del: 0, createdDate: { [Op.gte]: threeDaysAgo } }, order: [['createdDate', 'DESC']], limit: LIMIT,
        attributes: ['idstage', 'domaineStage', 'statusStage', 'createdDate'],
        include: [{ model: Candidat, as: 'candidat', attributes: ['nom', 'prenom'] }],
      });
      return items.map(i => {
        const nom = i.candidat ? `${i.candidat.prenom || ''} ${i.candidat.nom || ''}`.trim() : null;
        return {
          type: 'CANDIDATURES', label: 'Demande de stage',
          title: nom || `Stage #${i.idstage}`, status: i.statusStage,
          date: i.createdDate, id: i.idstage,
        };
      });
    },
    STAGE: async () => {
      const items = await Stage.findAll({
        where: { del: 0, createdDate: { [Op.gte]: threeDaysAgo } }, order: [['createdDate', 'DESC']], limit: LIMIT,
        attributes: ['idstage', 'domaineStage', 'statusStage', 'createdDate', 'typeStage'],
        include: [{ model: Candidat, as: 'candidat', attributes: ['nom', 'prenom'] }],
      });
      return items.map(i => {
        const nom = i.candidat ? `${i.candidat.prenom || ''} ${i.candidat.nom || ''}`.trim() : null;
        const domaine = i.domaineStage ? ` – ${i.domaineStage}` : '';
        return {
          type: 'STAGE', label: 'Demande de stage',
          title: nom ? `${nom}${domaine}` : `Stage #${i.idstage}`,
          status: i.statusStage, date: i.createdDate, id: i.idstage,
        };
      });
    },
    SUIVI_STAGE: async () => {
      const items = await Stage.findAll({
        where: { del: 0, statusStage: ['EN_COURS', 'RAPPORT_SOUMIS'], lastmodifiedDate: { [Op.gte]: threeDaysAgo } },
        order: [['lastmodifiedDate', 'DESC']], limit: LIMIT,
        attributes: ['idstage', 'domaineStage', 'statusStage', 'lastmodifiedDate'],
        include: [{ model: Candidat, as: 'candidat', attributes: ['nom', 'prenom'] }],
      });
      return items.map(i => {
        const nom = i.candidat ? `${i.candidat.prenom || ''} ${i.candidat.nom || ''}`.trim() : null;
        const domaine = i.domaineStage ? ` – ${i.domaineStage}` : '';
        return {
          type: 'SUIVI_STAGE', label: 'Suivi de stage',
          title: nom ? `${nom}${domaine}` : `Stage #${i.idstage}`,
          status: i.statusStage, date: i.lastmodifiedDate, id: i.idstage,
        };
      });
    },
    OFFRE: async () => {
      const items = await CandidatureOffre.findAll({
        where: { del: 0, dateCandidature: { [Op.gte]: threeDaysAgo } }, order: [['dateCandidature', 'DESC']], limit: LIMIT,
        attributes: ['idcandidature', 'statusCandidature', 'dateCandidature'],
        include: [
          { model: Candidat, as: 'candidat', attributes: ['nom', 'prenom'] },
          { model: Offre,    as: 'offre',    attributes: ['titre'] },
        ],
      });
      return items.map(i => {
        const nom = i.candidat ? `${i.candidat.prenom || ''} ${i.candidat.nom || ''}`.trim() : null;
        const offre = i.offre?.titre ? ` – ${i.offre.titre}` : '';
        return {
          type: 'OFFRE', label: 'Candidature offre',
          title: nom ? `${nom}${offre}` : `Candidature offre #${i.idcandidature}`,
          status: i.statusCandidature, date: i.dateCandidature, id: i.idcandidature,
        };
      });
    },
    AIDE: async () => {
      const items = await CandidatureAide.findAll({
        where: { del: 0, dateCandidature: { [Op.gte]: threeDaysAgo } }, order: [['dateCandidature', 'DESC']], limit: LIMIT,
        attributes: ['idcandidature', 'statusCandidature', 'dateCandidature'],
        include: [
          { model: Candidat, as: 'candidat', attributes: ['nom', 'prenom'] },
          { model: Aide,     as: 'aide',     attributes: ['titre'] },
        ],
      });
      return items.map(i => {
        const nom = i.candidat ? `${i.candidat.prenom || ''} ${i.candidat.nom || ''}`.trim() : null;
        const aide = i.aide?.titre ? ` – ${i.aide.titre}` : '';
        return {
          type: 'AIDE', label: "Demande d'aide",
          title: nom ? `${nom}${aide}` : `Demande aide #${i.idcandidature}`,
          status: i.statusCandidature, date: i.dateCandidature, id: i.idcandidature,
        };
      });
    },
    DEMANDE_AUDIENCE: async () => {
      const items = await DemandeAudience.findAll({
        where: { del: 0, createdDate: { [Op.gte]: threeDaysAgo } }, order: [['createdDate', 'DESC']], limit: LIMIT,
        attributes: ['iddemande', 'status', 'createdDate', 'motif'],
        include: [{ model: Candidat, as: 'candidat', attributes: ['nom', 'prenom'] }],
      });
      return items.map(i => {
        const nom = i.candidat ? `${i.candidat.prenom || ''} ${i.candidat.nom || ''}`.trim() : null;
        const motif = i.motif ? ` – ${i.motif.length > 35 ? i.motif.substring(0, 35) + '…' : i.motif}` : '';
        return {
          type: 'DEMANDE_AUDIENCE', label: "Demande d'audience",
          title: nom ? `${nom}${motif}` : `Audience #${i.iddemande}`,
          status: i.status, date: i.createdDate, id: i.iddemande,
        };
      });
    },
    CANDIDATS: async () => {
      const items = await Candidat.findAll({
        where: { del: 0, createdDate: { [Op.gte]: threeDaysAgo } }, order: [['createdDate', 'DESC']], limit: LIMIT,
        attributes: ['idcandidats', 'nom', 'prenom', 'createdDate'],
      });
      return items.map(i => ({
        type: 'CANDIDATS', label: 'Nouveau candidat',
        title: `${i.prenom || ''} ${i.nom || ''}`.trim() || `Candidat #${i.idcandidats}`,
        status: 'INSCRIT', date: i.createdDate, id: i.idcandidats,
      }));
    },
    AGENTS: async () => {
      const items = await AgentModel.findAll({
        where: { del: 0, createdDate: { [Op.gte]: threeDaysAgo } }, order: [['createdDate', 'DESC']], limit: LIMIT,
        attributes: ['idagents', 'nom', 'prenom', 'createdDate'],
      });
      return items.map(i => ({
        type: 'AGENTS', label: 'Agent',
        title: `${i.prenom || ''} ${i.nom || ''}`.trim() || `Agent #${i.idagents}`,
        status: 'ACTIF', date: i.createdDate, id: i.idagents,
      }));
    },
  };

  // Exécuter toutes les requêtes en parallèle (fail-safe)
  const results = await Promise.all(
    modules
      .filter(m => queryMap[m])
      .map(m => queryMap[m]().catch(err => {
        console.error(`❌ getRecentEvents [${m}]:`, err.message);
        return [];
      }))
  );

  return results
    .flat()
    .filter(e => e.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20);
};

module.exports = {
  getAllDirections,
  getAllRoles,
  getAllServices,
  getAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  changeAgentPassword,
  getUserStats,
  getRecentEvents,
};

// src/services/auth.service.js
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Candidat, Role, Agent, UserAgent, Permission, PasswordResetToken, Service, Direction } = require('../models');
const { generateToken } = require('../utils/jwt.util');
const { sendPasswordResetEmail } = require('./email.service');
const { getAgentDirections } = require('../utils/agentDirections.util');

/**
 * Calcule l'ensemble effectif des rôles d'un utilisateur :
 * rôle principal (user.role) + rôles additionnels (user.additionalRoles).
 * Retourne les acronymes, les ids, et le détail dédupliqués.
 * @param {object} user - instance User avec includes `role` et `additionalRoles`
 */
const computeEffectiveRoles = (user) => {
  const list = [];
  if (user.role) list.push(user.role);
  if (Array.isArray(user.additionalRoles)) list.push(...user.additionalRoles);

  const byId = new Map();
  for (const r of list) {
    if (r && r.idrole != null && !byId.has(r.idrole)) {
      byId.set(r.idrole, {
        idrole: r.idrole,
        accronyme: r.accronyme,
        description: r.description,
        lectureGlobale: !!r.lectureGlobale,
      });
    }
  }

  const rolesDetails = [...byId.values()];
  return {
    roleIds: rolesDetails.map(r => r.idrole),
    roles: rolesDetails.map(r => r.accronyme),
    rolesDetails,
  };
};

/**
 * Modules pour lesquels l'utilisateur a un accès "lecture globale" (sous-admin) :
 * modules où au moins un de ses rôles lectureGlobale=true a la permission CONSULTER.
 * Reflète exactement hasGlobalReadAccess() côté stage.controller.js, pour que le front
 * puisse distinguer un menu "vue globale" lecture seule d'un menu d'action par direction.
 */
const computeLectureGlobaleModules = async (rolesDetails) => {
  const lectureGlobaleRoleIds = rolesDetails.filter(r => r.lectureGlobale).map(r => r.idrole);
  if (lectureGlobaleRoleIds.length === 0) return [];
  const perms = await Permission.findAll({
    where: { role_idrole: { [Op.in]: lectureGlobaleRoleIds }, action: 'CONSULTER', del: 0 },
    attributes: ['module'],
  });
  return [...new Set(perms.map(p => p.module))];
};

/**
 * Permissions d'action accordées UNIQUEMENT via un rôle lectureGlobale (sous-admin).
 * Utilisé côté front pour restreindre les boutons d'action sur les écrans "Vue globale" :
 * seules les permissions du rôle lectureGlobale s'appliquent là, jamais celles du rôle
 * d'action classique (ex. APPROUVER du rôle Approbateur de stage reste confiné à "Stage DSI").
 */
const computeGlobalActionPermissions = async (rolesDetails) => {
  const lectureGlobaleRoleIds = rolesDetails.filter(r => r.lectureGlobale).map(r => r.idrole);
  if (lectureGlobaleRoleIds.length === 0) return [];
  const perms = await Permission.findAll({
    where: { role_idrole: { [Op.in]: lectureGlobaleRoleIds }, del: 0 },
    attributes: ['module', 'action'],
  });
  const seen = new Set();
  const result = [];
  for (const p of perms) {
    const key = `${p.module}:${p.action}`;
    if (!seen.has(key)) { seen.add(key); result.push({ module: p.module, action: p.action }); }
  }
  return result;
};

/**
 * Service d'inscription (register)
 */
const register = async (data) => {
  const { username, password, nom, prenom, genre, email, telephone, nip, ifu, recipisse } = data;

  // Le rôle CANDIDAT est toujours forcé pour l'inscription publique (idrole = 6)
  const CANDIDAT_ROLE_ID = 6;

  // Vérifier si le username existe déjà
  const existingUser = await User.findOne({ where: { username } });
  if (existingUser) {
    throw new Error('Ce nom d\'utilisateur existe déjà');
  }

  // Vérifier si l'email existe déjà
  const existingEmail = await Candidat.findOne({ where: { email } });
  if (existingEmail) {
    throw new Error('Un compte existe déjà avec cette adresse email.');
  }

  // Vérifier si le téléphone existe déjà
  const existingTelephone = await Candidat.findOne({ where: { telephone } });
  if (existingTelephone) {
    throw new Error('Un compte existe déjà avec ce numéro de téléphone.');
  }

  // Vérifier si le NIP existe déjà
  const existingNip = await Candidat.findOne({ where: { nip } });
  if (existingNip) {
    throw new Error('Un compte existe déjà avec ce numéro NIP.');
  }

  // Vérifier si l'IFU existe déjà (seulement si fourni)
  if (ifu) {
    const existingIfu = await Candidat.findOne({ where: { ifu } });
    if (existingIfu) {
      throw new Error('Un compte existe déjà avec ce numéro IFU.');
    }
  }

  // Vérifier si le récépissé existe déjà (seulement si fourni)
  if (recipisse) {
    const existingRecipisse = await Candidat.findOne({ where: { recipisse } });
    if (existingRecipisse) {
      throw new Error('Un compte existe déjà avec ce numéro de récépissé.');
    }
  }

  // Créer l'utilisateur avec le rôle CANDIDAT forcé
  const user = await User.create({
    username,
    password, // Le password sera hashé automatiquement par le hook beforeCreate
    role_idrole: CANDIDAT_ROLE_ID,
  });

  // Créer le profil candidat
  const candidat = await Candidat.create({
    users_idusers: user.idusers,
    nom,
    prenom,
    genre: genre || null,
    email,
    telephone,
    nip,
    ifu: ifu || null,
    recipisse: recipisse || null,
  });

  // Récupérer le rôle
  const role = await Role.findByPk(CANDIDAT_ROLE_ID);

  // Générer le token JWT
  const token = generateToken({
    id: user.idusers,
    username: user.username,
    role: role.accronyme,
    candidatId: candidat.idcandidats,
  });

  return {
    user: {
      idusers: user.idusers,
      username: user.username,
      role: role.accronyme,
    },
    candidat: {
      idcandidats: candidat.idcandidats,
      nom: candidat.nom,
      prenom: candidat.prenom,
      email: candidat.email,
      telephone: candidat.telephone,
    },
    token,
  };
};

/**
 * Service de connexion (login)
 * Supporte à la fois les candidats et les agents (admin, agent_rh, etc.)
 */
const login = async (identifier, password, rememberMe = false) => {
  const includeConfig = [
    {
      model: Role,
      as: 'role',
      attributes: ['idrole', 'accronyme', 'description', 'lectureGlobale'],
    },
    {
      model: Role,
      as: 'additionalRoles',
      attributes: ['idrole', 'accronyme', 'description', 'lectureGlobale'],
      through: { attributes: [] },
    },
    {
      model: Candidat,
      as: 'candidat',
      attributes: ['idcandidats', 'nom', 'prenom', 'email', 'telephone'],
    },
    {
      model: Agent,
      as: 'agents',
      attributes: ['idagents', 'nom', 'prenom', 'matricule', 'email'],
      through: { attributes: [] },
      include: [
        {
          model: Service,
          as: 'service',
          attributes: ['idservice', 'accronyme', 'description'],
          include: [{
            model: Direction,
            as: 'directions',
            attributes: ['iddirection', 'nom', 'accronyme'],
            through: { attributes: [] },
          }],
        },
        {
          model: Direction,
          as: 'directionDirecte',
          attributes: ['iddirection', 'nom', 'accronyme'],
        },
      ],
    },
  ];

  // Filtre "non supprimé" : accepte del=0 ET del=NULL (anciens comptes)
  const notDeleted = { [Op.or]: [{ del: 0 }, { del: null }] };

  // 1. Chercher par username (insensible à la casse)
  let user = await User.findOne({
    where: { username: { [Op.like]: identifier }, ...notDeleted },
    include: includeConfig,
  });

  // 2. Si non trouvé et que l'identifiant ressemble à un email, chercher via email
  if (!user && identifier.includes('@')) {
    // Tenter via email candidat
    const candidat = await Candidat.findOne({
      where: { email: identifier, ...notDeleted },
      attributes: ['idcandidats', 'users_idusers'],
    });
    if (candidat && candidat.users_idusers) {
      user = await User.findOne({ where: { idusers: candidat.users_idusers, ...notDeleted }, include: includeConfig });
    }

    // Tenter via email agent
    if (!user) {
      const agent = await Agent.findOne({ where: { email: identifier, ...notDeleted } });
      if (agent) {
        const userAgent = await UserAgent.findOne({ where: { agents_idagents: agent.idagents } });
        if (userAgent) {
          user = await User.findOne({ where: { idusers: userAgent.users_idusers, ...notDeleted }, include: includeConfig });
        }
      }
    }
  }

  if (!user) {
    throw new Error('Identifiant ou mot de passe incorrect');
  }

  // Vérifier le mot de passe
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Nom d\'utilisateur ou mot de passe incorrect');
  }

  // Déterminer si c'est un candidat ou un agent
  const isAgent = user.agents && user.agents.length > 0;
  const agent = isAgent ? user.agents[0] : null;

  // Calculer l'ensemble effectif des rôles : principal + additionnels
  const effective = computeEffectiveRoles(user);

  // Récupérer les permissions de TOUS les rôles (union, dédupliquée)
  const permissions = await Permission.findAll({
    where: { role_idrole: { [Op.in]: effective.roleIds }, del: 0 },
    attributes: ['module', 'action'],
  });
  const seen = new Set();
  const permissionList = [];
  for (const p of permissions) {
    const key = `${p.module}:${p.action}`;
    if (!seen.has(key)) { seen.add(key); permissionList.push({ module: p.module, action: p.action }); }
  }
  const lectureGlobaleModules = await computeLectureGlobaleModules(effective.rolesDetails);
  const globalActionPermissions = await computeGlobalActionPermissions(effective.rolesDetails);

  // Générer le token JWT — durée selon "se souvenir de moi"
  const tokenExpiry = rememberMe ? '24h' : (require('../config/env').JWT_EXPIRES_IN || '8h');
  const token = generateToken({
    id: user.idusers,
    username: user.username,
    role: user.role.accronyme,       // rôle principal (rétro-compat)
    roleId: user.role.idrole,        // id principal (rétro-compat)
    roles: effective.roles,          // tous les acronymes (principal + additionnels)
    roleIds: effective.roleIds,      // tous les ids
    candidatId: user.candidat ? user.candidat.idcandidats : null,
    agentId: agent ? agent.idagents : null,
  }, tokenExpiry);

  return {
    user: {
      idusers: user.idusers,
      username: user.username,
      email: user.candidat ? user.candidat.email : (agent ? agent.email : null),
      nom:    agent ? agent.nom    : (user.candidat ? user.candidat.nom    : null),
      prenom: agent ? agent.prenom : (user.candidat ? user.candidat.prenom : null),
      matricule: agent ? agent.matricule : null,
      role: user.role.accronyme,
      roleId: user.role.idrole,
      roleDescription: user.role.description,
      roles: effective.rolesDetails,  // [{ idrole, accronyme, description, lectureGlobale }]
      permissions: permissionList,
      lectureGlobaleModules,
      globalActionPermissions,
      directions: getAgentDirections(agent),
    },
    candidat: user.candidat,
    agent: agent,
    token,
  };
};

/**
 * Service pour obtenir le profil utilisateur
 * Inclut à la fois les candidats et les agents
 */
const getProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: { exclude: ['password'] },
    include: [
      {
        model: Role,
        as: 'role',
        attributes: ['idrole', 'accronyme', 'description', 'lectureGlobale'],
      },
      {
        model: Role,
        as: 'additionalRoles',
        attributes: ['idrole', 'accronyme', 'description', 'lectureGlobale'],
        through: { attributes: [] },
      },
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'genre', 'email', 'telephone', 'nip', 'ifu', 'recipisse'],
      },
      {
        model: Agent,
        as: 'agents',
        attributes: ['idagents', 'nom', 'prenom', 'matricule'],
        through: { attributes: [] },
        include: [
          {
            model: Service,
            as: 'service',
            attributes: ['idservice', 'accronyme', 'description'],
            include: [{
              model: Direction,
              as: 'directions',
              attributes: ['iddirection', 'nom', 'accronyme'],
              through: { attributes: [] },
            }],
          },
          {
            model: Direction,
            as: 'directionDirecte',
            attributes: ['iddirection', 'nom', 'accronyme'],
          },
        ],
      },
    ],
  });

  if (!user) {
    throw new Error('Utilisateur non trouvé');
  }

  // Permissions fraîches : union de tous les rôles (principal + additionnels)
  const effective = computeEffectiveRoles(user);
  let permissions = [];
  if (effective.roleIds.length > 0) {
    const perms = await Permission.findAll({
      where: { role_idrole: { [Op.in]: effective.roleIds }, del: 0 },
      attributes: ['module', 'action'],
    });
    const seen = new Set();
    for (const p of perms) {
      const key = `${p.module}:${p.action}`;
      if (!seen.has(key)) { seen.add(key); permissions.push({ module: p.module, action: p.action }); }
    }
  }

  const agent = user.agents && user.agents.length > 0 ? user.agents[0] : null;
  const lectureGlobaleModules = await computeLectureGlobaleModules(effective.rolesDetails);

  return {
    ...user.toJSON(),
    roles: effective.rolesDetails,
    permissions,
    lectureGlobaleModules,
    directions: getAgentDirections(agent),
  };
};

/**
 * Recherche un utilisateur (candidat ou agent) par son adresse email
 * @private
 */
const findUserByEmail = async (email) => {
  const notDeleted = { [Op.or]: [{ del: 0 }, { del: null }] };

  // 1. Chercher dans la table candidats
  const candidat = await Candidat.findOne({ where: { email, ...notDeleted } });
  if (candidat) {
    const user = await User.findOne({ where: { idusers: candidat.users_idusers, ...notDeleted } });
    if (user) return user;
  }

  // 2. Chercher dans la table agents
  const agent = await Agent.findOne({ where: { email, ...notDeleted } });
  if (agent) {
    const userAgent = await UserAgent.findOne({ where: { agents_idagents: agent.idagents } });
    if (userAgent) {
      const user = await User.findOne({ where: { idusers: userAgent.users_idusers, ...notDeleted } });
      if (user) return user;
    }
  }

  return null;
};

/**
 * Demande de réinitialisation de mot de passe
 * Génère un token sécurisé, l'enregistre en base et envoie un email avec le lien
 * POST /auth/forgot-password
 */
const forgotPassword = async (email) => {
  const user = await findUserByEmail(email);

  if (!user) {
    return { sent: false, notFound: true };
  }

  // Vérifier le cooldown : 180s minimum entre deux demandes
  const COOLDOWN_MS = 240 * 1000;
  const existingToken = await PasswordResetToken.findOne({
    where: { user_id: user.idusers, used: 0 },
    order: [['expires_at', 'DESC']],
  });
  if (existingToken) {
    // expires_at = created_at + 1h → on retrouve created_at
    const createdAt  = new Date(existingToken.expires_at.getTime() - 3600 * 1000);
    const elapsed    = Date.now() - createdAt.getTime();
    if (elapsed < COOLDOWN_MS) {
      const waitSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return { sent: true, cooldown: true, waitSeconds };
    }
  }

  // Supprimer les anciens tokens de cet utilisateur
  await PasswordResetToken.destroy({ where: { user_id: user.idusers } });

  // Générer un token sécurisé de 64 caractères hex
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

  await PasswordResetToken.create({
    user_id: user.idusers,
    token,
    expires_at: expiresAt,
    used: 0,
  });

  // Récupérer le nom de l'utilisateur pour l'email
  const candidat = await Candidat.findOne({ where: { users_idusers: user.idusers, del: 0 } });
  const Agent = require('../models').Agent;
  const UserAgent = require('../models').UserAgent;
  let prenom = 'Utilisateur';
  if (candidat) {
    prenom = candidat.prenom;
  } else {
    const ua = await UserAgent.findOne({ where: { users_idusers: user.idusers } });
    if (ua) {
      const agent = await Agent.findByPk(ua.agents_idagents);
      if (agent) prenom = agent.prenom;
    }
  }

  // Envoyer l'email en arrière-plan — on ne bloque PAS la réponse HTTP
  // Le token est déjà en base : l'utilisateur reçoit sa réponse immédiatement
  const frontendUrl = process.env.FRONTEND_URL || 'https://portail.sonabhy.bf';
  const resetLink = `${frontendUrl}/auth/forgot-password?token=${token}`;
  sendPasswordResetEmail({ prenom, email, resetLink }).catch(emailErr => {
    console.error('❌ Erreur envoi email reset:', emailErr.message);
  });

  return { sent: true };
};

/**
 * Réinitialiser le mot de passe via token (lien email)
 * POST /auth/reset-password
 */
const resetPassword = async (token, newPassword) => {
  const resetToken = await PasswordResetToken.findOne({
    where: { token, used: 0 },
  });

  if (!resetToken) {
    throw new Error('Lien de réinitialisation invalide ou déjà utilisé');
  }

  if (new Date() > resetToken.expires_at) {
    await resetToken.destroy();
    throw new Error('Lien de réinitialisation expiré. Veuillez faire une nouvelle demande');
  }

  const user = await User.findByPk(resetToken.user_id);
  if (!user) {
    throw new Error('Utilisateur introuvable');
  }

  // Mettre à jour le mot de passe (le hook beforeUpdate hash automatiquement)
  user.password = newPassword;
  await user.save();

  // Invalider le token
  await resetToken.destroy();

  return { reset: true };
};

module.exports = {
  register,
  login,
  getProfile,
  forgotPassword,
  resetPassword,
};
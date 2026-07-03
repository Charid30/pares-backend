// src/services/admin-candidat.service.js - Service Admin pour gestion des candidats
const { Candidat, User, Stage, Role, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Créer un nouveau candidat (compte utilisateur + profil candidat)
 */
const createCandidat = async ({ nom, prenom, email, telephone, username }) => {
  // Vérifier l'unicité de l'email
  const existingEmail = await Candidat.findOne({ where: { email, del: 0 } });
  if (existingEmail) throw new Error('Cet email est déjà utilisé par un autre candidat');

  // Générer le nom d'utilisateur si non fourni
  const finalUsername = (username && username.trim())
    ? username.trim()
    : `${prenom.toLowerCase().replace(/\s/g, '')}.${nom.toLowerCase().replace(/\s/g, '')}`;

  // Vérifier l'unicité du nom d'utilisateur
  const existingUser = await User.findOne({ where: { username: finalUsername, del: 0 } });
  if (existingUser) throw new Error(`Le nom d'utilisateur '${finalUsername}' est déjà pris`);

  // Trouver le rôle CANDIDAT
  const candidatRole = await Role.findOne({ where: { accronyme: 'CANDIDAT', del: 0 } });
  if (!candidatRole) throw new Error('Rôle CANDIDAT non trouvé dans le système');

  // Mot de passe temporaire (le candidat devra le changer)
  const tempPassword = `PARES@${new Date().getFullYear()}`;

  // Créer l'utilisateur (le hook beforeCreate hashera le mot de passe)
  const user = await User.create({
    username: finalUsername,
    password: tempPassword,
    role_idrole: candidatRole.idrole
  });

  // Créer le profil candidat
  const candidat = await Candidat.create({
    nom,
    prenom,
    email,
    telephone,
    users_idusers: user.idusers
  });

  return {
    ...candidat.toJSON(),
    user: { idusers: user.idusers, username: user.username },
    tempPassword // Retourner le mot de passe temp pour que l'agent puisse le communiquer
  };
};

/**
 * Récupérer la liste des candidats avec filtres et pagination
 */
const getCandidats = async ({ page = 1, limit = 10, search = '', sortBy = 'createdDate', sortOrder = 'DESC' }) => {
  const offset = (page - 1) * limit;

  const whereClause = { del: 0 };

  if (search) {
    whereClause[Op.or] = [
      { nom: { [Op.like]: `%${search}%` } },
      { prenom: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
      { telephone: { [Op.like]: `%${search}%` } }
    ];
  }

  const { count, rows } = await Candidat.findAndCountAll({
    where: whereClause,
    include: [{
      model: User,
      as: 'user',
      attributes: ['idusers', 'username', 'del'],
      required: false
    }],
    order: [[sortBy, sortOrder]],
    limit: parseInt(limit),
    offset: parseInt(offset),
    distinct: true
  });

  // Ajouter les statistiques pour chaque candidat
  const candidatsWithStats = await Promise.all(rows.map(async (candidat) => {
    const candidatJSON = candidat.toJSON();

    // Compter les demandes de stage
    const stagesCount = await Stage.count({
      where: { candidats_idcandidats: candidat.idcandidats, del: 0 }
    });

    return {
      ...candidatJSON,
      stagesCount
    };
  }));

  return {
    items: candidatsWithStats,
    total: count,
    page: parseInt(page),
    totalPages: Math.ceil(count / limit),
    limit: parseInt(limit)
  };
};

/**
 * Récupérer un candidat par ID avec ses détails complets
 */
const getCandidatById = async (id) => {
  console.log('Service getCandidatById - ID reçu:', id, 'Type:', typeof id);

  try {
    const candidat = await Candidat.findOne({
      where: { idcandidats: id, del: 0 },
      include: [{
        model: User,
        as: 'user',
        attributes: ['idusers', 'username'],
        required: false
      }]
    });

    console.log('Candidat trouvé:', candidat ? 'Oui' : 'Non');

    if (!candidat) {
      throw new Error('Candidat non trouvé');
    }

    const candidatJSON = candidat.toJSON();

    // Récupérer les stages du candidat
    let stages = [];
    try {
      stages = await Stage.findAll({
        where: { candidats_idcandidats: id, del: 0 },
        order: [['createdDate', 'DESC']],
        limit: 5
      });
      console.log('Stages trouvés:', stages.length);
    } catch (stageErr) {
      console.error('Erreur lors de la récupération des stages:', stageErr.message);
    }

    // Statistiques avec gestion d'erreurs
    let stats = {
      totalStages: 0,
      stagesEnCours: 0,
      stagesTermines: 0,
    };

    try {
      stats.totalStages = await Stage.count({ where: { candidats_idcandidats: id, del: 0 } }) || 0;
      stats.stagesEnCours = await Stage.count({ where: { candidats_idcandidats: id, del: 0, statusStage: 'EN_COURS' } }) || 0;
      stats.stagesTermines = await Stage.count({ where: { candidats_idcandidats: id, del: 0, statusStage: 'TERMINE' } }) || 0;
    } catch (statsErr) {
      console.error('Erreur lors du calcul des statistiques:', statsErr.message);
    }

    console.log('Retour du candidat avec stats:', stats);

    return {
      ...candidatJSON,
      stages,
      stats
    };
  } catch (err) {
    console.error('Erreur globale getCandidatById:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
};

/**
 * Mettre à jour un candidat
 */
const updateCandidat = async (id, data) => {
  const candidat = await Candidat.findOne({
    where: { idcandidats: id, del: 0 }
  });

  if (!candidat) {
    throw new Error('Candidat non trouvé');
  }

  // Vérifier si l'email est déjà utilisé par un autre candidat
  if (data.email && data.email !== candidat.email) {
    const existingEmail = await Candidat.findOne({
      where: { email: data.email, del: 0, idcandidats: { [Op.ne]: id } }
    });
    if (existingEmail) {
      throw new Error('Cet email est déjà utilisé par un autre candidat');
    }
  }

  // Champs modifiables
  const allowedFields = ['nom', 'prenom', 'email', 'telephone'];
  const updateData = {};

  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  });

  updateData.lastmodifiedDate = new Date();

  await candidat.update(updateData);

  return candidat;
};

/**
 * Supprimer un candidat (soft delete)
 */
const deleteCandidat = async (id) => {
  const candidat = await Candidat.findOne({
    where: { idcandidats: id, del: 0 }
  });

  if (!candidat) {
    throw new Error('Candidat non trouvé');
  }

  // Soft delete du candidat
  await candidat.update({
    del: 1,
    deletedDate: new Date()
  });

  // Soft delete de l'utilisateur associé
  if (candidat.users_idusers) {
    await User.update(
      { del: 1, deletedDate: new Date() },
      { where: { idusers: candidat.users_idusers } }
    );
  }

  return { message: 'Candidat supprimé avec succès' };
};

/**
 * Statistiques des candidats pour l'admin
 */
const getCandidatsStats = async () => {
  const total = await Candidat.count({ where: { del: 0 } });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const thisMonth = await Candidat.count({
    where: { del: 0, createdDate: { [Op.gte]: startOfMonth } }
  });

  const lastMonth = await Candidat.count({
    where: {
      del: 0,
      createdDate: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth }
    }
  });

  // Candidats avec au moins un stage
  const withStages = await Candidat.count({
    where: { del: 0 },
    include: [{
      model: Stage,
      as: 'stages',
      where: { del: 0 },
      required: true
    }],
    distinct: true
  });

  return {
    total,
    thisMonth,
    lastMonth,
    change: lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : (thisMonth > 0 ? 100 : 0),
    withStages,
  };
};

/**
 * Réinitialiser le mot de passe d'un candidat (action admin)
 */
const resetCandidatPassword = async (id, newPassword) => {
  const candidat = await Candidat.findOne({
    where: { idcandidats: id, del: 0 },
    include: [{ model: User, as: 'user', required: true }]
  });

  if (!candidat) throw new Error('Candidat non trouvé');
  if (!candidat.user) throw new Error('Compte utilisateur introuvable pour ce candidat');

  // Le hook beforeUpdate de User hache automatiquement le mot de passe
  candidat.user.password = newPassword;
  await candidat.user.save();

  return { message: 'Mot de passe réinitialisé avec succès', username: candidat.user.username };
};

module.exports = {
  createCandidat,
  getCandidats,
  getCandidatById,
  updateCandidat,
  deleteCandidat,
  getCandidatsStats,
  resetCandidatPassword
};

// src/services/settings.service.js
const { AppSettings, User, Agent, Direction } = require('../models');

// Valeurs par défaut si aucun enregistrement n'existe encore
const DEFAULT_SETTINGS = {
  general: {
    nomOrganisation: "Société Nationale Burkinabè d'Hydrocarbures",
    sigle: 'SONABHY',
    emailContact: 'contact@sonabhy.bf',
    telephone: '+226 25 30 65 00',
    adresse: '01 BP 439 Ouagadougou 01, Burkina Faso',
    siteWeb: 'https://www.sonabhy.bf',
    boitePostale: 'BP 439 Ouagadougou 01',
  },
  email: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFromName: 'SONABHY Portail',
    notifyStageStatus: true,
    notifyNewCampagne: true,
    notifyAttestation: true,
    notifyRapportValide: true,
  },
  stages: {
    dureeMinimale: 1,
    dureeMaximale: 6,
    maxRenouvellements: 1,
    delaiTraitement: 7,
    typesStage: ['Stage de soutenance', 'Stage de perfectionnement'],
    domainesStage: [
      'Direction Générale',
      'Direction des Ressources Humaines',
      'Direction Financière et Comptable',
      'Direction Commerciale',
      'Direction des Opérations',
      "Direction des Systèmes d'Information",
      'Direction Juridique',
      "Direction de l'Audit Interne",
      'Direction de la Communication',
    ],
  },
  securite: {
    dureeSession: 24,
    maxTentativesConnexion: 10,
    longueurMinMotDePasse: 8,
    dureeBlocage: 15,
  },
  routage: {
    agentDefautAudience: null,
    agentDefautOffre: null,
  },
};

/**
 * Récupérer les paramètres (ou les valeurs par défaut)
 */
const getSettings = async () => {
  const row = await AppSettings.findOne({ order: [['id', 'DESC']] });
  if (!row) return DEFAULT_SETTINGS;
  // Fusionner avec les défauts pour les nouvelles clés éventuelles
  return {
    general:     { ...DEFAULT_SETTINGS.general,     ...(row.settings.general     || {}) },
    email:       { ...DEFAULT_SETTINGS.email,       ...(row.settings.email       || {}) },
    stages:      { ...DEFAULT_SETTINGS.stages,      ...(row.settings.stages      || {}) },
    securite:    { ...DEFAULT_SETTINGS.securite,    ...(row.settings.securite    || {}) },
    routage:     { ...DEFAULT_SETTINGS.routage,     ...(row.settings.routage     || {}) },
  };
};

/**
 * Sauvegarder les paramètres (upsert : 1 seule ligne)
 */
const saveSettings = async (settings, updatedBy) => {
  const row = await AppSettings.findOne({ order: [['id', 'DESC']] });

  // Si le mot de passe SMTP est vide, conserver l'actuel en base
  if (settings.email && settings.email.smtpPass === '') {
    const existingPass = row?.settings?.email?.smtpPass || process.env.SMTP_PASS || '';
    settings.email.smtpPass = existingPass;
  }

  if (row) {
    await row.update({ settings, updatedBy });
    return row;
  }
  return await AppSettings.create({ settings, updatedBy });
};

/**
 * Changer le mot de passe de l'utilisateur connecté
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findByPk(userId);
  if (!user) throw new Error('Utilisateur introuvable');

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw new Error('Mot de passe actuel incorrect');

  user.password = newPassword; // hashé par le hook beforeUpdate
  await user.save();
  return true;
};

/**
 * Lister les agents actifs (pour le select de routage)
 */
const getAgentsForRoutage = async () => {
  return Agent.findAll({
    where: { del: 0 },
    attributes: ['idagents', 'nom', 'prenom', 'matricule', 'direction_iddirection'],
    include: [{ model: Direction, as: 'directionDirecte', attributes: ['iddirection', 'nom', 'accronyme'], required: false }],
    order: [['nom', 'ASC'], ['prenom', 'ASC']],
  });
};

/**
 * Résoudre la direction d'un agent par défaut (pour l'auto-affectation)
 */
const resolveDefaultAgentDirection = async (agentId) => {
  if (!agentId) return null;
  const agent = await Agent.findOne({ where: { idagents: agentId, del: 0 }, attributes: ['direction_iddirection'] });
  return agent?.direction_iddirection ?? null;
};

module.exports = { getSettings, saveSettings, changePassword, getAgentsForRoutage, resolveDefaultAgentDirection };

// src/services/demandeAudience.service.js
const fileStorage = require('../utils/fileStorage.util');
const { DemandeAudience, Candidat, Direction } = require('../models');
const notifService = require('./notification.service');
const settingsService = require('./settings.service');

// ─────────────────────────────────────────────────────────────
// CRÉER UNE DEMANDE D'AUDIENCE (par un candidat)
// ─────────────────────────────────────────────────────────────
const createDemandeByCandidat = async (candidatId, data, file) => {
  const modeSoumission = data.modeSoumission;

  // Validation selon le mode
  if (modeSoumission === 'FICHIER') {
    if (!file) {
      throw new Error('Le fichier PDF est requis pour le mode "Joindre un fichier"');
    }
    if (!data.dateAudience || !data.heureAudience) {
      throw new Error('La date et l\'heure sont requises');
    }
  } else if (modeSoumission === 'FORMULAIRE') {
    if (!data.pourM || !data.dateAudience || !data.heureAudience) {
      throw new Error('Le destinataire, la date et l\'heure sont requis');
    }
  } else {
    throw new Error('Mode de soumission invalide (FICHIER ou FORMULAIRE)');
  }

  const demandeData = {
    candidats_idcandidats: candidatId,
    modeSoumission,
    dateAudience: data.dateAudience,
    heureAudience: data.heureAudience,
    status: 'EN_ATTENTE',
  };

  // Données spécifiques au mode FICHIER
  if (modeSoumission === 'FICHIER' && file) {
    demandeData.fichier_path = fileStorage.saveFile(file.buffer, file.originalname, 'audiences');
    demandeData.fichier = null;
    demandeData.fichier_filename = file.originalname;
    demandeData.fichier_size = file.size;
  }

  // Données spécifiques au mode FORMULAIRE
  if (modeSoumission === 'FORMULAIRE') {
    demandeData.pourM = data.pourM;
    demandeData.pendant = data.pendant || null;
    demandeData.contact = data.contact || null;
    demandeData.actionCochee = data.actionCochee || null;
    demandeData.motif = data.motif || null;
  }

  // Auto-affecter la direction de l'agent par défaut si configuré
  try {
    const settings = await settingsService.getSettings();
    const dirId = await settingsService.resolveDefaultAgentDirection(settings.routage?.agentDefautAudience);
    if (dirId) demandeData.direction_iddirection = dirId;
  } catch (e) {
    console.error('⚠️ Routage audience: impossible de résoudre l\'agent par défaut:', e.message);
  }

  const demande = await DemandeAudience.create(demandeData);

  // Notifications email — en arrière-plan
  (async () => {
    try {
      const candidat = await Candidat.findOne({ where: { idcandidats: candidatId, del: 0 } });
      if (candidat) {
        const frontUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        await notifService.sendConfirmationSoumission(candidat, 'audience', [
          { label: 'Mode', value: modeSoumission === 'FICHIER' ? 'Fichier joint' : 'Formulaire' },
          { label: 'Date souhaitée', value: new Date(data.dateAudience).toLocaleDateString('fr-FR') },
          { label: 'Heure', value: data.heureAudience },
        ], `${frontUrl}/dashboard/candidat/mes-audiences`);
        await notifService.onNouvelleDemandeAudience(candidat, { modeSoumission, dateAudience: data.dateAudience, heureAudience: data.heureAudience });
      }
    } catch (e) {
      console.error('❌ Email création audience:', e.message);
    }
  })();

  // Retourner sans le blob fichier
  const result = demande.toJSON();
  delete result.fichier;
  return result;
};

// ─────────────────────────────────────────────────────────────
// LISTER LES DEMANDES D'UN CANDIDAT (paginé)
// ─────────────────────────────────────────────────────────────
const getMesDemandesByCandidat = async (candidatId, options = {}) => {
  const page = Math.max(1, parseInt(options.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit) || 10));
  const offset = (page - 1) * limit;

  const { count, rows } = await DemandeAudience.findAndCountAll({
    where: {
      candidats_idcandidats: candidatId,
      del: 0,
    },
    order: [['createdDate', 'DESC']],
    limit,
    offset,
    attributes: { exclude: ['fichier'] }, // Ne pas retourner le blob
  });

  return {
    data: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      hasNext: page < Math.ceil(count / limit),
      hasPrev: page > 1,
    },
  };
};

// ─────────────────────────────────────────────────────────────
// ANNULER UNE DEMANDE (par le candidat, seulement si EN_ATTENTE)
// ─────────────────────────────────────────────────────────────
const annulerDemandeByCandidat = async (candidatId, demandeId) => {
  const demande = await DemandeAudience.findOne({
    where: { iddemande: demandeId, candidats_idcandidats: candidatId, del: 0 },
  });

  if (!demande) {
    throw new Error('Demande introuvable');
  }
  if (demande.status === 'ACCEPTE') {
    throw new Error('Impossible d\'annuler une demande déjà acceptée');
  }
  if (demande.status === 'ANNULE') {
    throw new Error('Cette demande est déjà annulée');
  }

  demande.status = 'ANNULE';
  demande.lastModifiedDate = new Date();
  await demande.save();

  const result = demande.toJSON();
  delete result.fichier;
  return result;
};

// ─────────────────────────────────────────────────────────────
// LISTER TOUTES LES DEMANDES (admin / agents)
// ─────────────────────────────────────────────────────────────
const getAllDemandes = async (options = {}, directionId = null) => {
  const page = Math.max(1, parseInt(options.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(options.limit) || 10));
  const offset = (page - 1) * limit;

  const where = { del: 0 };
  if (options.status) where.status = options.status;
  // Si un filtre de direction est fourni, restreindre à cette direction
  if (directionId) where.direction_iddirection = directionId;

  const { count, rows } = await DemandeAudience.findAndCountAll({
    where,
    include: [
      {
        model: Candidat,
        as: 'candidat',
        attributes: ['idcandidats', 'nom', 'prenom', 'telephone', 'email'],
      },
      {
        model: Direction,
        as: 'direction',
        attributes: ['iddirection', 'nom', 'accronyme'],
        required: false,
      },
    ],
    order: [['createdDate', 'DESC']],
    limit,
    offset,
    attributes: { exclude: ['fichier'] },
  });

  return {
    data: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      hasNext: page < Math.ceil(count / limit),
      hasPrev: page > 1,
    },
  };
};

// ─────────────────────────────────────────────────────────────
// CHANGER LE STATUT (admin / agents)
// ─────────────────────────────────────────────────────────────
const updateStatut = async (demandeId, status, commentaireAdmin = null) => {
  const STATUTS_VALIDES = ['EN_ATTENTE', 'ACCEPTE', 'REJETE'];
  if (!STATUTS_VALIDES.includes(status)) {
    throw new Error('Statut invalide. Valeurs acceptées : EN_ATTENTE, ACCEPTE, REJETE');
  }

  const demande = await DemandeAudience.findOne({
    where: { iddemande: demandeId, del: 0 },
  });

  if (!demande) throw new Error('Demande introuvable');
  if (demande.status === 'ANNULE') {
    throw new Error('Impossible de modifier une demande annulée par le candidat');
  }

  demande.status = status;
  demande.commentaireAdmin = commentaireAdmin;
  demande.lastModifiedDate = new Date();
  await demande.save();

  // Notification au candidat — en arrière-plan
  (async () => {
    try {
      const candidat = await Candidat.findOne({ where: { idcandidats: demande.candidats_idcandidats, del: 0 } });
      if (candidat && (status === 'ACCEPTE' || status === 'REJETE')) {
        const frontUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
        await notifService.sendDecisionEmail(
          candidat, 'audience', status,
          [
            { label: 'Date audience', value: new Date(demande.dateAudience).toLocaleDateString('fr-FR') },
            { label: 'Heure', value: demande.heureAudience },
          ],
          `${frontUrl}/dashboard/candidat/mes-audiences`,
          commentaireAdmin || null
        );
      }
    } catch (e) {
      console.error('❌ Email décision audience:', e.message);
    }
  })();

  const result = demande.toJSON();
  delete result.fichier;
  return result;
};

// ─────────────────────────────────────────────────────────────
// AFFECTER UNE DIRECTION À UNE DEMANDE (admin)
// ─────────────────────────────────────────────────────────────
const updateDemande = async (demandeId, data) => {
  const demande = await DemandeAudience.findOne({ where: { iddemande: demandeId, del: 0 } });
  if (!demande) throw new Error('Demande introuvable');

  const updates = {};
  if (data.direction_iddirection !== undefined) {
    updates.direction_iddirection = data.direction_iddirection || null;
  }

  if (Object.keys(updates).length === 0) throw new Error('Aucune donnée à mettre à jour');

  updates.lastModifiedDate = new Date();
  await demande.update(updates);

  return demande.reload({
    include: [
      { model: Candidat, as: 'candidat', attributes: ['idcandidats', 'nom', 'prenom', 'telephone', 'email'] },
      { model: Direction, as: 'direction', attributes: ['iddirection', 'nom', 'accronyme'], required: false },
    ],
    attributes: { exclude: ['fichier'] },
  });
};

// ─────────────────────────────────────────────────────────────
// RÉCUPÉRER LE FICHIER D'UNE DEMANDE (mode FICHIER)
// ─────────────────────────────────────────────────────────────
const getFichierDemande = async (demandeId) => {
  const demande = await DemandeAudience.findOne({
    where: { iddemande: demandeId, del: 0 },
    attributes: ['iddemande', 'modeSoumission', 'fichier', 'fichier_path', 'fichier_filename', 'fichier_size'],
  });

  if (!demande) throw new Error('Demande introuvable');
  if (demande.modeSoumission !== 'FICHIER' || (!demande.fichier && !demande.fichier_path)) {
    throw new Error('Aucun fichier attaché à cette demande');
  }

  const buffer = fileStorage.readFile(demande.fichier_path, demande.fichier);
  return { buffer, filename: demande.fichier_filename, size: demande.fichier_size };
};

// ─────────────────────────────────────────────────────────────
// TRANSFÉRER UNE DEMANDE VERS UNE AUTRE DIRECTION
// ─────────────────────────────────────────────────────────────
const transfererDemande = async (demandeId, newDirectionId) => {
  const demande = await DemandeAudience.findOne({ where: { iddemande: demandeId, del: 0 } });
  if (!demande) throw new Error('Demande introuvable');

  if (demande.status === 'REJETE' || demande.status === 'ANNULE') {
    throw new Error(`Cette demande ne peut pas être transférée (statut : ${demande.status})`);
  }

  if (demande.direction_iddirection === newDirectionId) {
    throw new Error('Cette demande est déjà affectée à cette direction');
  }

  const direction = await Direction.findOne({ where: { iddirection: newDirectionId, del: 0 } });
  if (!direction) throw new Error('Direction non trouvée');

  await demande.update({ direction_iddirection: newDirectionId, lastModifiedDate: new Date() });
  return demande.reload({
    include: [
      { model: Candidat, as: 'candidat', attributes: ['idcandidats', 'nom', 'prenom', 'telephone', 'email'] },
      { model: Direction, as: 'direction', attributes: ['iddirection', 'nom', 'accronyme'], required: false },
    ],
    attributes: { exclude: ['fichier'] },
  });
};

module.exports = {
  createDemandeByCandidat,
  getMesDemandesByCandidat,
  annulerDemandeByCandidat,
  getAllDemandes,
  updateStatut,
  updateDemande,
  transfererDemande,
  getFichierDemande,
};

// src/services/diffusion.service.js
// Notifications envoyées volontairement par l'admin (2026-11-07) : aux candidats, aux agents (tous ou ceux de
// certaines directions) ou à tout le monde. Chaque destinataire reçoit une notification dans la cloche
// (type ANNONCE) et un push sur ses appareils abonnés. Historique : table notification_diffusion.
const { Op } = require('sequelize');
const {
  Agent, Candidat, Direction, Notification, NotificationDiffusion, Service, User,
} = require('../models');
const pushService = require('./push.service');
const { getAgentDirectionIds } = require('../utils/agentDirections.util');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:4200';
const CIBLES = ['CANDIDATS', 'AGENTS', 'TOUS'];
const TYPE_NOTIFICATION = 'ANNONCE';
// Le clic sur la notification ouvre l'espace du destinataire
const LIEN = { CANDIDAT: `${FRONTEND}/dashboard/candidat`, AGENT: `${FRONTEND}/dashboard/agent` };

/** Candidats dont le compte existe encore (candidat et utilisateur non supprimés). */
const candidatsActifs = async () => {
  const rows = await Candidat.findAll({
    where: { del: 0 },
    attributes: ['idcandidats'],
    include: [{ model: User, as: 'user', attributes: [], where: { del: 0 }, required: true }],
  });
  return rows.map(c => ({ recipientType: 'CANDIDAT', recipientId: c.idcandidats }));
};

/** Agents actifs, éventuellement limités aux directions choisies (rattachement par service ou direct). */
const agentsActifs = async (directionIds = []) => {
  const rows = await Agent.findAll({
    where: { del: 0, actif: 1 },
    attributes: ['idagents'],
    include: [
      { model: Service, as: 'service', include: [{ model: Direction, as: 'directions', through: { attributes: [] } }] },
      { model: Direction, as: 'directionDirecte' },
    ],
  });
  const filtre = directionIds.length
    ? rows.filter(a => getAgentDirectionIds(a).some(id => directionIds.includes(id)))
    : rows;
  return filtre.map(a => ({ recipientType: 'AGENT', recipientId: a.idagents }));
};

/** Contrôle des données d'envoi ; renvoie les valeurs nettoyées. */
const verifier = ({ cible, directions = [], titre = '', message = '' } = {}, { contenu = true } = {}) => {
  if (!CIBLES.includes(cible)) throw new Error('Destinataires invalides : choisissez candidats, agents ou tout le monde.');
  const directionIds = [...new Set((directions || []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
  if (directionIds.length && cible === 'CANDIDATS') throw new Error('Le choix des directions ne concerne que les agents.');
  const t = String(titre || '').trim();
  const m = String(message || '').trim();
  if (contenu) {
    if (!t) throw new Error('Le titre est obligatoire.');
    if (t.length > 100) throw new Error('Le titre ne doit pas dépasser 100 caractères.');
    if (!m) throw new Error('Le message est obligatoire.');
    if (m.length > 500) throw new Error('Le message ne doit pas dépasser 500 caractères.');
  }
  return { cible, directionIds, titre: t, message: m };
};

/** Destinataires d'un envoi. */
const destinatairesDe = async ({ cible, directionIds }) => {
  const liste = [];
  if (cible !== 'AGENTS') liste.push(...await candidatsActifs());
  if (cible !== 'CANDIDATS') liste.push(...await agentsActifs(directionIds));
  return liste;
};

/** Combien de personnes et d'appareils un envoi toucherait (affiché avant la confirmation). */
const apercu = async (donnees) => {
  const { cible, directionIds } = verifier(donnees, { contenu: false });
  const destinataires = await destinatairesDe({ cible, directionIds });
  const abonnements = await pushService.abonnementsDe(destinataires);
  return {
    candidats: destinataires.filter(d => d.recipientType === 'CANDIDAT').length,
    agents: destinataires.filter(d => d.recipientType === 'AGENT').length,
    appareils: abonnements.length,
    pushActif: pushService.isConfigured,
  };
};

/**
 * Envoyer : notifications cloche créées tout de suite (en une fois), push envoyés en arrière-plan ;
 * le bilan des push est écrit dans l'historique à la fin.
 * @param {{ cible, directions, titre, message }} donnees
 * @param {{ agentId?: number|null, nom: string }} auteur
 * @returns {Promise<{ diffusion: object, terminePush: Promise<void> }>}
 */
const envoyer = async (donnees, auteur) => {
  const { cible, directionIds, titre, message } = verifier(donnees);
  const destinataires = await destinatairesDe({ cible, directionIds });
  if (!destinataires.length) throw new Error('Aucun destinataire ne correspond à ce choix.');

  for (let i = 0; i < destinataires.length; i += 500) {
    await Notification.bulkCreate(destinataires.slice(i, i + 500).map(d => ({
      recipient_type: d.recipientType,
      recipient_id: d.recipientId,
      type: TYPE_NOTIFICATION,
      titre,
      message,
      link: LIEN[d.recipientType],
      read: 0,
    })));
  }

  const abonnements = await pushService.abonnementsDe(destinataires);
  const diffusion = await NotificationDiffusion.create({
    titre,
    message,
    cible,
    directions: directionIds.length ? JSON.stringify(directionIds) : null,
    nbDestinataires: destinataires.length,
    nbAppareils: abonnements.length,
    envoyeParId: auteur?.agentId ?? null,
    envoyePar: auteur?.nom || 'Administrateur',
  });

  // Push en arrière-plan : la réponse à l'admin n'attend pas les centaines d'envois
  const terminePush = (async () => {
    try {
      const bilan = await pushService.envoyerPushEnMasse(abonnements, sub => ({
        title: titre, body: message, link: LIEN[sub.recipient_type] || FRONTEND,
      }));
      await diffusion.update({ nbPushReussis: bilan.reussis, nbPushEchecs: bilan.echecs });
    } catch (e) {
      console.error('[Diffusion] Envoi des push :', e.message);
    }
  })();

  return { diffusion, terminePush };
};

/** Historique des envois (les plus récents d'abord), avec le nom des directions ciblées. */
const historique = async ({ limit = 50 } = {}) => {
  const rows = await NotificationDiffusion.findAll({ order: [['createdDate', 'DESC'], ['id', 'DESC']], limit });
  const ids = [...new Set(rows.flatMap(r => (r.directions ? JSON.parse(r.directions) : [])))];
  const directions = ids.length
    ? await Direction.findAll({ where: { iddirection: { [Op.in]: ids } }, attributes: ['iddirection', 'nom', 'accronyme'] })
    : [];
  const nomDe = new Map(directions.map(d => [d.iddirection, d.accronyme || d.nom]));
  return rows.map(r => ({
    ...r.toJSON(),
    directions: r.directions ? JSON.parse(r.directions).map(id => ({ iddirection: id, nom: nomDe.get(id) || `#${id}` })) : [],
  }));
};

module.exports = { apercu, envoyer, historique, CIBLES };

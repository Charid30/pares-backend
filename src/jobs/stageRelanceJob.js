// src/jobs/stageRelanceJob.js
// Relance des agents : demandes de stage restées plus de 7 jours à la même étape.
//  - « En traitement »            → agents ayant STAGE/APPROUVER (dans leurs directions) ;
//  - « En cours de programmation » → agents ayant STAGE/VALIDER (RH : rôle à lecture globale = toutes directions).
// Une relance par agent et par semaine au plus (e-mail + notification in-app, qui déclenche le push).
const { Op } = require('sequelize');
const {
  Stage, Candidat, Agent, User, Role, Permission, Service, Direction, Notification, AgentNotificationPref,
} = require('../models');
const emailService = require('../services/email.service');
const inapp = require('../services/inapp.service');
const { getAgentDirectionIds } = require('../utils/agentDirections.util');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:4200';
const JOUR_MS = 24 * 60 * 60 * 1000;
const DELAI_RELANCE_JOURS = 7;       // dossier bloqué depuis 7 jours à la même étape
const INTERVALLE_RELANCE_JOURS = 7;  // au plus une relance par agent et par semaine
const TYPE_NOTIF = 'RELANCE_STAGE';

// Étapes relancées et permission de l'agent qui doit agir
const ETAPES = [
  { statut: 'EN_COURS_DE_TRAITEMENT', action: 'APPROUVER', libelle: 'à approuver' },
  { statut: 'PROGRAMMATION_EN_COURS', action: 'VALIDER',   libelle: 'en attente de la convention' },
];

/** Par rôle : actions STAGE et lecture globale. */
const chargerRoles = async () => {
  const [roles, permissions] = await Promise.all([
    Role.findAll({ where: { del: 0 }, attributes: ['idrole', 'accronyme', 'lectureGlobale'] }),
    Permission.findAll({ where: { module: 'STAGE', del: 0 }, attributes: ['role_idrole', 'action'] }),
  ]);
  const parRole = new Map(roles.map(r => [r.idrole, { accronyme: r.accronyme, global: !!r.lectureGlobale, actions: new Set() }]));
  for (const p of permissions) parRole.get(p.role_idrole)?.actions.add(p.action);
  return parRole;
};

/** Rôles de l'agent (rôle principal + rôles additionnels de ses comptes). */
const rolesDeAgent = (agent) => {
  const ids = new Set();
  for (const u of agent.users || []) {
    if (u.role_idrole) ids.add(u.role_idrole);
    for (const r of u.additionalRoles || []) ids.add(r.idrole);
  }
  return [...ids];
};

const ligneDossier = (s) => `<tr>
  <td style="padding:6px 8px; border-bottom:1px solid #eee;">${s.candidat ? `${s.candidat.prenom} ${s.candidat.nom}` : '—'}</td>
  <td style="padding:6px 8px; border-bottom:1px solid #eee;">${s.domaineStage || '—'}</td>
  <td style="padding:6px 8px; border-bottom:1px solid #eee;">${Math.floor((Date.now() - new Date(s.lastmodifiedDate)) / JOUR_MS)} j</td>
</tr>`;

const tableau = (titre, dossiers) => `
  <p class="message" style="margin-top:16px;"><strong>${dossiers.length} demande(s) ${titre}</strong></p>
  <table style="width:100%; border-collapse:collapse; margin:8px 0; font-size:13px;">
    <thead>
      <tr style="background:#fef2f2;">
        <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e8c9c9;">Candidat</th>
        <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e8c9c9;">Domaine</th>
        <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e8c9c9;">Sans action depuis</th>
      </tr>
    </thead>
    <tbody>${dossiers.map(ligneDossier).join('')}</tbody>
  </table>`;

const runStageRelanceJob = async () => {
  try {
    const limite = new Date(Date.now() - DELAI_RELANCE_JOURS * JOUR_MS);
    const dossiers = await Stage.findAll({
      attributes: ['idstage', 'statusStage', 'direction_iddirection', 'domaineStage', 'lastmodifiedDate'],
      where: {
        statusStage: { [Op.in]: ETAPES.map(e => e.statut) },
        stage_parent_idstage: null,
        del: 0,
        lastmodifiedDate: { [Op.lte]: limite },
      },
      include: [{ model: Candidat, as: 'candidat', attributes: ['nom', 'prenom'] }],
      order: [['lastmodifiedDate', 'ASC']],
    });
    if (dossiers.length === 0) return 0;

    const roles = await chargerRoles();
    const agents = await Agent.findAll({
      where: { del: 0, actif: 1 },
      attributes: ['idagents', 'email', 'nom', 'prenom'],
      include: [
        {
          model: User, as: 'users', attributes: ['idusers', 'role_idrole'], through: { attributes: [] },
          include: [{ model: Role, as: 'additionalRoles', attributes: ['idrole'], through: { attributes: [] } }],
        },
        { model: Service, as: 'service', include: [{ model: Direction, as: 'directions', through: { attributes: [] } }] },
        { model: Direction, as: 'directionDirecte' },
      ],
    });

    // Agents ayant désactivé les notifications STAGE, et agents déjà relancés cette semaine
    const [desactives, dejaRelances] = await Promise.all([
      AgentNotificationPref.findAll({ where: { notificationType: 'STAGE', enabled: 0 }, attributes: ['agent_idagents'] }),
      Notification.findAll({
        where: {
          recipient_type: 'AGENT',
          type: TYPE_NOTIF,
          createdAt: { [Op.gt]: new Date(Date.now() - INTERVALLE_RELANCE_JOURS * JOUR_MS) },
        },
        attributes: ['recipient_id'],
      }),
    ]);
    const exclus = new Set([
      ...desactives.map(p => p.agent_idagents),
      ...dejaRelances.map(n => n.recipient_id),
    ]);

    let relances = 0;
    for (const agent of agents) {
      if (exclus.has(agent.idagents) || !agent.email) continue;
      const rolesAgent = rolesDeAgent(agent).map(id => roles.get(id)).filter(Boolean);
      // L'administration voit tout depuis ses écrans : pas de relance
      if (rolesAgent.some(r => r.accronyme === 'ADMIN')) continue;
      const directions = getAgentDirectionIds(agent);

      const sections = [];
      let total = 0;
      for (const etape of ETAPES) {
        const avecAction = rolesAgent.filter(r => r.actions.has(etape.action));
        if (!avecAction.length) continue;
        const global = avecAction.some(r => r.global);
        const aTraiter = dossiers.filter(s => s.statusStage === etape.statut
          && (global || directions.includes(s.direction_iddirection)));
        if (!aTraiter.length) continue;
        sections.push(tableau(etape.libelle, aTraiter));
        total += aTraiter.length;
      }
      if (!total) continue;

      const lien = `${FRONTEND}/dashboard/agent/stages`;
      try {
        const html = emailService.buildBaseTemplate(`
          <p class="greeting">Bonjour ${agent.prenom || ''} ${agent.nom || ''},</p>
          <p class="message">Les demandes de stage suivantes attendent votre action depuis plus de ${DELAI_RELANCE_JOURS} jours.</p>
          ${sections.join('')}
          <div style="text-align:center;"><a href="${lien}" class="button">Traiter les demandes</a></div>
        `, 'Rappel — Demandes de stage en attente');
        await emailService.sendEmail({
          to: agent.email,
          subject: `[RAPPEL] ${total} demande(s) de stage en attente de votre action`,
          html,
        });
      } catch (e) {
        console.error(`[RELANCE STAGE] E-mail ${agent.email}:`, e.message);
      }
      // In-app + push (inapp.push déclenche le push navigateur) ; sert aussi de trace « relancé »
      await inapp.push({
        recipientType: 'AGENT',
        recipientId: agent.idagents,
        type: TYPE_NOTIF,
        titre: 'Rappel — Demandes de stage en attente',
        message: `${total} demande(s) de stage attendent votre action depuis plus de ${DELAI_RELANCE_JOURS} jours.`,
        link: lien,
      });
      relances++;
    }

    if (relances) console.log(`[RELANCE STAGE] ${relances} agent(s) relancé(s)`);
    return relances;
  } catch (err) {
    console.error('[RELANCE STAGE] Erreur:', err.message);
    return 0;
  }
};

module.exports = { runStageRelanceJob, DELAI_RELANCE_JOURS };

// src/jobs/aideReminderJob.js
// Rappel hebdomadaire : signale aux agents les aides validées sans date de traitement.
const { Aide, Agent, User, Role, AgentNotificationPref } = require('../models');
const emailService = require('../services/email.service');
const pushService  = require('../services/push.service');
const inapp        = require('../services/inapp.service');

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:4200';

const runAideReminderJob = async () => {
  try {
    const aidesSansDate = await Aide.findAll({
      where: { statusAide: 'VALIDEE', dateTraitement: null, del: 0 },
      attributes: ['idaide', 'titre', 'typeAide', 'createdDate'],
    });

    if (aidesSansDate.length === 0) return;

    console.log(`[RAPPEL AIDE] ${aidesSansDate.length} aide(s) validée(s) sans date de traitement`);

    // Récupérer les agents ayant les notifications AIDE activées
    const prefs = await AgentNotificationPref.findAll({
      where: { notificationType: 'AIDE', enabled: 1 },
      include: [{
        model: Agent,
        as: 'agent',
        where: { del: 0 },
        attributes: ['idagents', 'email', 'nom', 'prenom'],
        required: true,
      }],
    });

    const rows = aidesSansDate
      .map(a => `<tr>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${a.titre}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${a.typeAide}</td>
        <td style="padding:6px 8px; border-bottom:1px solid #eee;">${new Date(a.createdDate).toLocaleDateString('fr-FR')}</td>
      </tr>`)
      .join('');

    const html = emailService.buildBaseTemplate(`
      <p class="greeting">Rappel — Aides validées sans date de traitement</p>
      <p class="message">
        Les <strong>${aidesSansDate.length} aide(s)</strong> suivante(s) ont été validées mais n'ont pas encore de date de traitement fixée.
      </p>
      <table style="width:100%; border-collapse:collapse; margin:12px 0; font-size:13px;">
        <thead>
          <tr style="background:#fef2f2;">
            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e8c9c9;">Titre</th>
            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e8c9c9;">Type</th>
            <th style="padding:6px 8px; text-align:left; border-bottom:2px solid #e8c9c9;">Date soumission</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="text-align:center;">
        <a href="${FRONTEND}/dashboard/agent/aides" class="button">Fixer les dates</a>
      </div>
    `, 'Rappel — Aides sans date de traitement');

    for (const pref of prefs) {
      try {
        await emailService.sendEmail({
          to: pref.agent.email,
          subject: `[RAPPEL] ${aidesSansDate.length} aide(s) validée(s) sans date de traitement`,
          html,
        });

        await inapp.push({
          recipientType: 'AGENT',
          recipientId: pref.agent.idagents,
          type: 'RAPPEL_AIDE_SANS_DATE',
          titre: 'Rappel — Aides sans date',
          message: `${aidesSansDate.length} aide(s) validée(s) attendent une date de traitement.`,
          link: `${FRONTEND}/dashboard/agent/aides`,
        });

        await pushService.sendPushToUser({
          recipientType: 'AGENT',
          recipientId: pref.agent.idagents,
          titre: 'Rappel — Aides sans date',
          message: `${aidesSansDate.length} aide(s) validée(s) n'ont pas encore de date de traitement.`,
          link: `${FRONTEND}/dashboard/agent/aides`,
        });
      } catch (e) {
        console.error(`[RAPPEL AIDE] Erreur agent ${pref.agent.email}:`, e.message);
      }
    }

    console.log(`[RAPPEL AIDE] Rappels envoyés à ${prefs.length} agent(s)`);
  } catch (err) {
    console.error('[RAPPEL AIDE] Erreur:', err.message);
  }
};

module.exports = { runAideReminderJob };

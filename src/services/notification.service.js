// src/services/notification.service.js
// Service centralisé : notifications email + in-app (agents + candidats)
const { AgentNotificationPref, Agent, Candidat } = require('../models');
const emailService = require('./email.service');
const inapp = require('./inapp.service');

// =====================================================
// NOTIFIER LES AGENTS (email + in-app)
// =====================================================

/**
 * Notifier tous les agents qui ont activé un type de notification
 * @param {string} notificationType - STAGE | RECRUTEMENT | OFFRE | AIDE | AUDIENCE
 * @param {string} subject - Sujet de l'email
 * @param {string} html - Contenu HTML de l'email
 * @param {object} inappPayload - { type, titre, message, link } pour la notif in-app
 */
const notifyAgents = async (notificationType, subject, html, inappPayload = null) => {
  try {
    const prefs = await AgentNotificationPref.findAll({
      where: { notificationType, enabled: 1 },
      include: [{
        model: Agent,
        as: 'agent',
        where: { del: 0 },
        attributes: ['idagents', 'email', 'nom', 'prenom'],
        required: true,
      }],
    });

    for (const pref of prefs) {
      // Email
      try {
        await emailService.sendEmail({ to: pref.agent.email, subject, html });
        console.log(`📧 Notif agent [${notificationType}] → ${pref.agent.email}`);
      } catch (e) {
        console.error(`❌ Email agent ${pref.agent.email} échoué:`, e.message);
      }
      // In-app
      if (inappPayload) {
        await inapp.push({
          recipientType: 'AGENT',
          recipientId: pref.agent.idagents,
          ...inappPayload,
        });
      }
    }
  } catch (err) {
    console.error('❌ Erreur notifyAgents:', err.message);
  }
};

// =====================================================
// TEMPLATES AGENTS — Nouvelle demande reçue
// =====================================================

const buildAgentNotifHtml = (module, titre, lignesInfo) => {
  const rows = lignesInfo.map(l => `<p><strong>${l.label} :</strong> ${l.value}</p>`).join('');
  return emailService.buildBaseTemplate(`
    <p class="greeting">Nouvelle demande reçue</p>
    <p class="message">
      Une nouvelle demande de <strong>${module}</strong> a été soumise sur la plateforme PARES et nécessite votre traitement.
    </p>
    <div class="info-box">
      <p><strong>Module :</strong> ${module}</p>
      ${rows}
    </div>
    <div style="text-align:center;">
      <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/dashboard/agent" class="button">
        Traiter la demande
      </a>
    </div>
  `, `Nouvelle demande — ${module}`);
};

// =====================================================
// TEMPLATES CANDIDATS — Confirmation soumission
// =====================================================

const sendConfirmationSoumission = async (candidat, module, lignesInfo, urlSuivi) => {
  const rows = lignesInfo.map(l => `<p><strong>${l.label} :</strong> ${l.value}</p>`).join('');
  const html = emailService.buildBaseTemplate(`
    <p class="greeting">Bonjour ${candidat.prenom} ${candidat.nom},</p>
    <p class="message">
      Votre demande de <strong>${module}</strong> a bien été reçue et est en attente de traitement.
    </p>
    <span class="status-badge status-warning">⏳ En attente de traitement</span>
    <div class="info-box">
      ${rows}
    </div>
    <p class="message">
      Vous recevrez une notification par email dès qu'une décision sera prise sur votre demande.
    </p>
    <div style="text-align:center;">
      <a href="${urlSuivi}" class="button">Suivre ma demande</a>
    </div>
  `, `Demande ${module} reçue`);

  // Email
  await emailService.sendEmail({
    to: candidat.email,
    subject: `Votre demande de ${module} a bien été reçue`,
    html,
  });

  // In-app
  if (candidat.idcandidats) {
    await inapp.push({
      recipientType: 'CANDIDAT',
      recipientId: candidat.idcandidats,
      type: `SOUMISSION_${module.toUpperCase().replace(/ /g, '_')}`,
      titre: `Demande de ${module} reçue`,
      message: `Votre demande de ${module} a bien été reçue et est en attente de traitement.`,
      link: urlSuivi,
    });
  }
};

// =====================================================
// TEMPLATES CANDIDATS — Décision (accepté / refusé)
// =====================================================

const sendDecisionEmail = async (candidat, module, decision, lignesInfo, urlSuivi, motif = null) => {
  const accepte = decision === 'ACCEPTE' || decision === 'ACCEPTEE' || decision === 'VALIDEE';
  const badge = accepte
    ? '<span class="status-badge status-success">✓ Demande Acceptée</span>'
    : '<span class="status-badge status-error">✗ Demande Refusée</span>';
  const rows = lignesInfo.map(l => `<p><strong>${l.label} :</strong> ${l.value}</p>`).join('');
  const motifHtml = (!accepte && motif) ? `<p><strong>Motif :</strong> ${motif}</p>` : '';

  const html = emailService.buildBaseTemplate(`
    <p class="greeting">Bonjour ${candidat.prenom} ${candidat.nom},</p>
    <p class="message">
      ${accepte
        ? `Nous avons le plaisir de vous informer que votre demande de <strong>${module}</strong> a été <strong>acceptée</strong>.`
        : `Nous avons le regret de vous informer que votre demande de <strong>${module}</strong> n'a pas pu être acceptée.`
      }
    </p>
    ${badge}
    <div class="info-box">
      ${rows}
      ${motifHtml}
    </div>
    ${accepte ? '' : '<p class="message">Nous vous encourageons à nous contacter pour plus d\'informations.</p>'}
    <div style="text-align:center;">
      <a href="${urlSuivi}" class="button">Voir ma demande</a>
    </div>
  `, `Réponse demande ${module}`);

  // Email
  await emailService.sendEmail({
    to: candidat.email,
    subject: accepte ? `Votre demande de ${module} a été acceptée` : `Réponse à votre demande de ${module}`,
    html,
  });

  // In-app
  if (candidat.idcandidats) {
    const suffix = accepte ? 'ACCEPTE' : 'REJETE';
    await inapp.push({
      recipientType: 'CANDIDAT',
      recipientId: candidat.idcandidats,
      type: `${module.toUpperCase().replace(/ /g, '_')}_${suffix}`,
      titre: accepte ? `Demande de ${module} acceptée ✓` : `Demande de ${module} refusée`,
      message: accepte
        ? `Votre demande de ${module} a été acceptée.`
        : `Votre demande de ${module} n'a pas pu être acceptée.${motif ? ` Motif : ${motif}` : ''}`,
      link: urlSuivi,
    });
  }
};

// =====================================================
// FONCTIONS MÉTIER PAR MODULE
// =====================================================

const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:4200';

const onNouvelleDemandeStage = async (candidat, stage) => {
  const lignesInfo = [
    { label: 'Candidat', value: `${candidat.prenom} ${candidat.nom}` },
    { label: 'Type', value: stage.typeStage === 'SOUTENANCE' ? 'Soutenance' : 'Perfectionnement' },
    { label: 'Domaine', value: stage.domaineStage },
    { label: 'Durée', value: `${stage.dureeStage} mois` },
    { label: 'Début souhaité', value: new Date(stage.dateDebutSouhaitee).toLocaleDateString('fr-FR') },
  ];
  const html = buildAgentNotifHtml('Stage', 'Nouvelle demande de stage', lignesInfo);
  const id = stage.idstage || '';
  await notifyAgents('STAGE', 'Nouvelle demande de stage soumise', html, {
    type: 'NOUVEAU_STAGE',
    titre: 'Nouvelle demande de stage',
    message: `${candidat.prenom} ${candidat.nom} a soumis une demande de stage (${stage.domaineStage}).`,
    link: `${FRONTEND}/dashboard/agent/stages${id ? `?open=${id}` : ''}`,
  });
};

const onNouvelleDemandeOffre = async (candidat, offre) => {
  const lignesInfo = [
    { label: 'Candidat', value: `${candidat.prenom} ${candidat.nom}` },
    { label: 'Type', value: offre.typeOffre },
    { label: 'Titre', value: offre.titre },
  ];
  const html = buildAgentNotifHtml('Offre', 'Nouvelle demande d\'offre', lignesInfo);
  const id = offre.idoffres || '';
  await notifyAgents('OFFRE', 'Nouvelle demande d\'offre soumise', html, {
    type: 'NOUVELLE_OFFRE_SOUMISE',
    titre: 'Nouvelle demande d\'offre',
    message: `${candidat.prenom} ${candidat.nom} a soumis une demande d'offre : « ${offre.titre} ».`,
    link: `${FRONTEND}/dashboard/agent/offres${id ? `?open=${id}` : ''}`,
  });
};

const onNouvelleDemandeAide = async (candidat, aide) => {
  const lignesInfo = [
    { label: 'Candidat', value: `${candidat.prenom} ${candidat.nom}` },
    { label: 'Type', value: aide.typeAide },
    { label: 'Titre', value: aide.titre },
  ];
  const html = buildAgentNotifHtml('Aide', 'Nouvelle demande d\'aide', lignesInfo);
  const id = aide.idaides || '';
  await notifyAgents('AIDE', 'Nouvelle demande d\'aide soumise', html, {
    type: 'NOUVELLE_AIDE',
    titre: 'Nouvelle demande d\'aide',
    message: `${candidat.prenom} ${candidat.nom} a soumis une demande d'aide : « ${aide.titre} ».`,
    link: `${FRONTEND}/dashboard/agent/aides${id ? `?open=${id}` : ''}`,
  });
};

const onNouvelleDemandeAudience = async (candidat, demande) => {
  const lignesInfo = [
    { label: 'Candidat', value: `${candidat.prenom} ${candidat.nom}` },
    { label: 'Mode', value: demande.modeSoumission === 'FICHIER' ? 'Fichier joint' : 'Formulaire' },
    { label: 'Date audience', value: new Date(demande.dateAudience).toLocaleDateString('fr-FR') },
    { label: 'Heure', value: demande.heureAudience },
  ];
  const html = buildAgentNotifHtml('Audience', 'Nouvelle demande d\'audience', lignesInfo);
  const id = demande.iddemande || '';
  await notifyAgents('AUDIENCE', 'Nouvelle demande d\'audience soumise', html, {
    type: 'NOUVELLE_AUDIENCE',
    titre: 'Nouvelle demande d\'audience',
    message: `${candidat.prenom} ${candidat.nom} a demandé une audience pour le ${new Date(demande.dateAudience).toLocaleDateString('fr-FR')}.`,
    link: `${FRONTEND}/dashboard/agent/audiences${id ? `?open=${id}` : ''}`,
  });
};

// =====================================================
// INITIALISER LES PREFS D'UN NOUVEL AGENT
// =====================================================

const TYPES = ['STAGE', 'OFFRE', 'AIDE', 'AUDIENCE'];

const initAgentNotificationPrefs = async (agentId) => {
  try {
    for (const type of TYPES) {
      await AgentNotificationPref.findOrCreate({
        where: { agent_idagents: agentId, notificationType: type },
        defaults: { enabled: 1 },
      });
    }
  } catch (err) {
    console.error('❌ Erreur init prefs notif agent:', err.message);
  }
};

// =====================================================
// BROADCAST — Candidats (nouvelle campagne / nouvelle offre)
// =====================================================

const broadcastCandidats = async (subject, html) => {
  try {
    const candidats = await Candidat.findAll({
      where: { del: 0 },
      attributes: ['idcandidats', 'email', 'nom', 'prenom'],
    });
    for (const c of candidats) {
      try {
        await emailService.sendEmail({ to: c.email, subject, html });
      } catch (e) {
        console.error(`❌ Broadcast ${c.email}:`, e.message);
      }
    }
    console.log(`📧 Broadcast envoyé à ${candidats.length} candidats`);
  } catch (err) {
    console.error('❌ Erreur broadcast candidats:', err.message);
  }
};

/**
 * Broadcast in-app + email pour nouvelle campagne/offre ouverte
 * @param {string} subject - sujet email
 * @param {string} html - contenu email
 * @param {object} inappPayload - { type, titre, message, link }
 */
const broadcastCandidatsWithInApp = async (subject, html, inappPayload) => {
  try {
    const candidats = await Candidat.findAll({
      where: { del: 0 },
      attributes: ['idcandidats', 'email', 'nom', 'prenom'],
    });
    for (const c of candidats) {
      try {
        await emailService.sendEmail({ to: c.email, subject, html });
      } catch (e) {
        console.error(`❌ Broadcast email ${c.email}:`, e.message);
      }
      if (inappPayload) {
        await inapp.push({
          recipientType: 'CANDIDAT',
          recipientId: c.idcandidats,
          ...inappPayload,
        });
      }
    }
    console.log(`📧📲 Broadcast envoyé à ${candidats.length} candidats`);
  } catch (err) {
    console.error('❌ Erreur broadcastCandidatsWithInApp:', err.message);
  }
};

module.exports = {
  notifyAgents,
  initAgentNotificationPrefs,
  sendConfirmationSoumission,
  sendDecisionEmail,
  onNouvelleDemandeStage,
  onNouvelleDemandeOffre,
  onNouvelleDemandeAide,
  onNouvelleDemandeAudience,
  broadcastCandidats,
  broadcastCandidatsWithInApp,
};

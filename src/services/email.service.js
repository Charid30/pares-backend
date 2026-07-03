// src/services/email.service.js - Service d'envoi d'emails avec Nodemailer
const nodemailer = require('nodemailer');
const dns        = require('dns');

/**
 * Charger la config SMTP depuis la BD (avec fallback sur les variables d'environnement)
 */
const loadSmtpConfig = async () => {
  try {
    // Import dynamique pour éviter les dépendances circulaires au démarrage
    const settingsService = require('./settings.service');
    const settings = await settingsService.getSettings();
    const email = settings.email || {};

    return {
      host:     (email.smtpHost     || process.env.SMTP_HOST      || '').trim(),
      port:     parseInt(email.smtpPort || process.env.SMTP_PORT) || 587,
      secure:   email.smtpSecure  !== undefined ? email.smtpSecure : (process.env.SMTP_SECURE === 'true'),
      user:     (email.smtpUser     || process.env.SMTP_USER       || '').trim(),
      pass:     (email.smtpPass     || process.env.SMTP_PASS       || '').trim(),
      fromName: (email.smtpFromName || process.env.SMTP_FROM_NAME  || 'PORTAIL SONABHY').trim(),
    };
  } catch {
    // Fallback env uniquement si la BD est inaccessible
    return {
      host:     (process.env.SMTP_HOST      || '').trim(),
      port:     parseInt(process.env.SMTP_PORT) || 587,
      secure:   process.env.SMTP_SECURE === 'true',
      user:     (process.env.SMTP_USER      || '').trim(),
      pass:     (process.env.SMTP_PASS      || '').trim(),
      fromName: (process.env.SMTP_FROM_NAME || 'PORTAIL SONABHY').trim(),
    };
  }
};

/**
 * Template de base HTML pour tous les emails
 */
const getBaseTemplate = (content, title = 'PORTAIL - SONABHY') => {
  const year = new Date().getFullYear();
  return `
<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style>
    /* Reset */
    * { box-sizing: border-box; }
    body, html { margin: 0; padding: 0; width: 100% !important; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
      background-color: #f0f4f8;
      color: #1f2937;
      -webkit-font-smoothing: antialiased;
    }

    /* Wrapper */
    .wrapper {
      width: 100%;
      padding: 40px 16px;
      background-color: #f0f4f8;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }

    /* Header */
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      padding: 0;
    }
    .header-top {
      padding: 28px 36px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .header-logo {
      display: inline-block;
    }
    .header-logo-text {
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .header-logo-dot {
      color: #f59e0b;
    }
    .header-tagline {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 2px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .header-banner {
      background: linear-gradient(135deg, #d97706 0%, #f59e0b 50%, #d97706 100%);
      padding: 20px 36px;
    }
    .header-banner-table {
      width: 100%;
      border-collapse: collapse;
    }
    .header-banner-icon {
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.2);
      border-radius: 50%;
      text-align: center;
      line-height: 36px;
      font-size: 16px;
      display: inline-block;
      vertical-align: middle;
    }
    .header-banner-title {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
    }
    .header-banner-sub {
      font-size: 12px;
      color: rgba(255,255,255,0.85);
      margin: 2px 0 0;
    }

    /* Content */
    .content {
      padding: 36px 36px 28px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 16px;
      line-height: 1.3;
    }
    .message {
      font-size: 14px;
      line-height: 1.7;
      color: #4b5563;
      margin: 0 0 16px;
    }
    .message strong {
      color: #1f2937;
    }

    /* Badge statut */
    .badge-wrap {
      margin: 20px 0;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 18px;
      border-radius: 100px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.2px;
    }
    .status-success { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .status-warning { background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .status-error   { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
    .status-info    { background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }

    /* Info box */
    .info-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px 24px;
      margin: 20px 0;
      position: relative;
      overflow: hidden;
    }
    .info-box::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, #f59e0b, #d97706);
      border-radius: 4px 0 0 4px;
    }
    .info-box-title {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin: 0 0 12px 0;
    }
    .info-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 13.5px;
      color: #374151;
    }
    .info-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .info-row strong {
      color: #1e293b;
      font-weight: 600;
      min-width: 120px;
      flex-shrink: 0;
    }

    /* Bouton */
    .btn-wrap {
      text-align: center;
      margin: 28px 0 8px;
    }
    .button {
      display: inline-block;
      padding: 14px 36px;
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.3px;
      box-shadow: 0 4px 12px rgba(217,119,6,0.35);
    }

    /* Divider */
    .divider {
      height: 1px;
      background: #f1f5f9;
      margin: 24px 0;
      border: none;
    }

    /* Alerte sécurité */
    .security-note {
      background: #f8fafc;
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
      margin: 20px 0 0;
    }

    /* Footer */
    .footer {
      background: #0f172a;
      padding: 28px 36px;
    }
    .footer-logo {
      font-size: 14px;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 4px;
    }
    .footer-logo span { color: #f59e0b; }
    .footer-sub {
      font-size: 11px;
      color: #64748b;
      margin: 0 0 20px;
    }
    .footer-divider {
      height: 1px;
      background: rgba(255,255,255,0.07);
      margin: 0 0 16px;
    }
    .footer-links {
      margin: 0 0 16px;
    }
    .footer-links a {
      display: inline-block;
      color: #94a3b8;
      text-decoration: none;
      font-size: 12px;
      margin-right: 16px;
    }
    .footer-links a:hover { color: #f59e0b; }
    .footer-copy {
      font-size: 11px;
      color: #475569;
      margin: 0;
      line-height: 1.6;
    }
    .footer-copy a { color: #f59e0b; text-decoration: none; }

    /* Responsive */
    @media only screen and (max-width: 600px) {
      .wrapper { padding: 16px 8px; }
      .content { padding: 24px 20px 20px; }
      .header-top { padding: 20px 20px 16px; }
      .header-banner { padding: 16px 20px; }
      .footer { padding: 24px 20px; }
      .info-row { flex-direction: column; gap: 2px; }
      .info-row strong { min-width: unset; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- ── Header ─────────────────────────────────────────────────── -->
      <div class="header">
        <div class="header-top">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding-right:14px; vertical-align:middle;">
                <img src="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/assets/images/logo-sonabhy.png"
                     alt="SONABHY" width="48" height="48"
                     style="display:block; border-radius:10px; border:0;">
              </td>
              <td style="vertical-align:middle;">
                <div class="header-logo-text">PORTAIL SONABHY<span class="header-logo-dot">.</span></div>
                <div class="header-tagline">Plateforme SONABHY &bull; Espace Candidats</div>
              </td>
            </tr>
          </table>
        </div>
        <div class="header-banner">
          <table class="header-banner-table" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width:48px; vertical-align:middle; padding-right:12px;">
                <div class="header-banner-icon">✉</div>
              </td>
              <td style="vertical-align:middle;">
                <p class="header-banner-title">${title}</p>
                <p class="header-banner-sub">Société Nationale Burkinabè d'Hydrocarbures</p>
              </td>
            </tr>
          </table>
        </div>
      </div>

      <!-- ── Contenu ────────────────────────────────────────────────── -->
      <div class="content">
        ${content}
      </div>

      <!-- ── Footer ────────────────────────────────────────────────── -->
      <div class="footer">
        <p class="footer-logo">PORTAIL SONABHY<span>.</span></p>
        <p class="footer-sub">Portail d'Accompagnement et de Recherche de Stage SONABHY</p>
        <div class="footer-divider"></div>
        <div class="footer-links">
          <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}">Accéder à la plateforme</a>
          <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/auth/login">Se connecter</a>
        </div>
        <p class="footer-copy">
          Cet email a été envoyé automatiquement — merci de ne pas y répondre.<br>
          &copy; ${year} <a href="#">SONABHY</a> — Société Nationale Burkinabè d'Hydrocarbures. Tous droits réservés.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
  `;
};

// Cache du transporter pour éviter une nouvelle auth SMTP à chaque email
let _transporterCache = null;
let _transporterCfgKey = '';

const getTransporter = async () => {
  const cfg = await loadSmtpConfig();

  if (!cfg.host || !cfg.user || !cfg.pass) return { transporter: null, cfg };

  // Clé unique représentant la config courante
  const cfgKey = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}`;

  // Réutiliser le transporter existant si la config n'a pas changé
  if (_transporterCache && _transporterCfgKey === cfgKey) {
    return { transporter: _transporterCache, cfg };
  }

  // Fermer l'ancien transporter proprement avant d'en créer un nouveau
  if (_transporterCache) {
    try { _transporterCache.close(); } catch (_) {}
  }

  _transporterCache = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    pool: true,        // réutilise les connexions SMTP ouvertes (1 seule auth)
    maxConnections: 2, // 2 connexions parallèles max (réduit la pression sur Gmail)
    rateDelta: 5000,   // fenêtre de 5 secondes
    rateLimit: 5,      // max 5 messages par fenêtre de 5 s → 1 msg/s → 60/min (très prudent)

    // ── Forcer IPv4 — double protection ────────────────────────────────
    // 1) family:4 → indication générale nodemailer
    family: 4,
    // 2) lookup override → force le résolveur DNS à ne retourner QUE
    //    des adresses A (IPv4), même si des enregistrements AAAA existent.
    //    Corrige ENETUNREACH sur les serveurs sans route IPv6.
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback);
    },

    // ── Timeouts courts ─────────────────────────────────────────────────
    // Évite les attentes de 60-70 s quand Gmail est inaccessible.
    // Sans ces valeurs, un échec de connexion bloque l'appelant 70 s.
    connectionTimeout: 10_000, // 10 s pour établir la connexion TCP
    greetingTimeout:   10_000, // 10 s pour recevoir le banner SMTP
    socketTimeout:     30_000, // 30 s d'inactivité max sur le socket

    tls: { rejectUnauthorized: process.env.NODE_ENV !== 'development' }
  });

  _transporterCfgKey = cfgKey;
  return { transporter: _transporterCache, cfg };
};

// ── Limites d'envoi Gmail ───────────────────────────────────────────────────
// Règle des 3 plafonds pour rester invisible aux filtres anti-spam de Gmail :
//   1. Journalier  : 350/jour   (Gmail autorise 500 — marge de 150)
//   2. Horaire     : 40/heure   (évite les pics suspects sur une courte période)
//   3. Cadence     : 5/5s       (configuré dans le transporter nodemailer)
const DAILY_LIMIT  = 350;  // était 450 → marge de sécurité renforcée
const HOURLY_LIMIT = 40;   // nouveau : max 40 emails par heure glissante

const _dailyCounter  = { date: null, count: 0 };
const _hourlyLog     = [];  // tableau des timestamps des envois de l'heure écoulée
const _getTodayStr   = () => new Date().toISOString().slice(0, 10);

// Compte les emails envoyés dans la dernière heure glissante
const _getHourlyCount = () => {
  const oneHourAgo = Date.now() - 3600 * 1000;
  // Purger les entrées > 1h (évite une fuite mémoire sur un serveur qui tourne longtemps)
  while (_hourlyLog.length > 0 && _hourlyLog[0] < oneHourAgo) _hourlyLog.shift();
  return _hourlyLog.length;
};

// Enregistre un envoi dans le log horaire
const _recordHourlySend = () => _hourlyLog.push(Date.now());

// Initialise le compteur depuis la BD (résistant aux redémarrages)
const _initDailyCounter = async () => {
  const today = _getTodayStr();
  if (_dailyCounter.date === today) return; // déjà à jour
  try {
    const { EmailQueue } = require('../models');
    const count = await EmailQueue.count({ where: { queued_date: today, status: 'SENT' } });
    _dailyCounter.date  = today;
    _dailyCounter.count = count;
  } catch {
    _dailyCounter.date  = today;
    _dailyCounter.count = 0;
  }
};

// Envoie directement (sans vérification de limite — usage interne)
const _sendNow = async ({ to, subject, html, text }) => {
  const { transporter, cfg } = await getTransporter();
  const mailOptions = {
    from: `"${cfg.fromName}" <${cfg.user || 'noreply@sonabhy.bf'}>`,
    to,
    subject: `PORTAIL SONABHY ${subject}`,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  };
  if (!transporter) {
    console.log('\n========== EMAIL (Mode Dev) ==========');
    console.log(`📧 À: ${to} | Sujet: ${subject}`);
    console.log('=======================================\n');
    return { success: true, messageId: 'dev-mode', preview: null };
  }
  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, preview: nodemailer.getTestMessageUrl(info) || null };
  } catch (err) {
    // Credentials invalides (535) → invalider le cache pour forcer une reconnexion
    // après correction du mot de passe dans les paramètres
    if (err.responseCode === 535 || err.code === 'EAUTH') {
      console.error('❌ SMTP credentials invalides — cache transporter invalidé');
      try { _transporterCache.close(); } catch (_) {}
      _transporterCache   = null;
      _transporterCfgKey  = '';
    }
    throw err;
  }
};

/**
 * Envoyer un email avec contrôle de la limite journalière.
 * Si la limite de 450/jour est atteinte, l'email est mis en file d'attente
 * et sera envoyé automatiquement le lendemain.
 *
 * @param {boolean} [priority=false] - Si true, l'email est envoyé immédiatement
 *   même si la limite journalière est atteinte (réservé aux emails critiques :
 *   réinitialisation de mot de passe, etc.)
 */
const sendEmail = async ({ to, subject, html, text, priority = false }) => {
  try {
    await _initDailyCounter();

    // Limite atteinte ET email non-prioritaire → mise en file d'attente
    if (_dailyCounter.count >= DAILY_LIMIT && !priority) {
      try {
        const { EmailQueue } = require('../models');
        await EmailQueue.create({
          to_email:     to,
          subject:      subject.substring(0, 490),
          html,
          text_content: text || null,
          queued_date:  _getTodayStr(),
          status:       'PENDING',
        });
        console.log(`📬 Email mis en file d'attente [${_dailyCounter.count}/${DAILY_LIMIT}/jour] → ${to}`);
      } catch (qErr) {
        console.error('❌ Impossible de mettre en file d\'attente:', qErr.message);
      }
      return { success: true, messageId: 'queued', queued: true };
    }

    // Envoi immédiat
    const result = await _sendNow({ to, subject, html, text });

    if (result.messageId !== 'dev-mode') {
      _dailyCounter.count++;
      _recordHourlySend(); // comptabiliser aussi les envois directs dans la fenêtre horaire
      // Enregistrement non-bloquant pour le décompte (résistance aux redémarrages)
      setImmediate(async () => {
        try {
          const { EmailQueue } = require('../models');
          await EmailQueue.create({
            to_email:    to,
            subject:     subject.substring(0, 490),
            html:        null, // inutile de conserver le HTML des emails déjà envoyés
            queued_date: _getTodayStr(),
            status:      'SENT',
            processed_at: new Date(),
          });
        } catch { /* non-critique */ }
      });
      console.log(`✅ Email envoyé à ${to} [${_dailyCounter.count}/${DAILY_LIMIT}]`);
    }

    return result;
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    throw error;
  }
};

/**
 * Traiter la file d'attente des emails.
 * Appelé par le job toutes les 5 minutes.
 * Envoie les emails PENDING de la veille si la capacité du jour le permet.
 */
// Pause utilitaire pour espacer les lots d'emails
const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Délai aléatoire entre MIN et MAX ms — évite un rythme mécanique détectable par Gmail
const _jitterDelay = (minMs, maxMs) =>
  _sleep(Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs);

// Paramètres d'envoi en masse — ajuster ici si besoin
const QUEUE_BATCH_SIZE      = 5;            // emails par lot
const QUEUE_BATCH_DELAY_MIN = 5000;         // pause min entre lots (5 s)
const QUEUE_BATCH_DELAY_MAX = 9000;         // pause max entre lots (9 s) — jitter aléatoire

const processEmailQueue = async () => {
  const { EmailQueue } = require('../models');
  const { Op } = require('sequelize');
  const today = _getTodayStr();

  const pending = await EmailQueue.findAll({
    where: { status: 'PENDING', queued_date: { [Op.lt]: today } },
    order: [['createdAt', 'ASC']],
  });

  if (pending.length === 0) return { sent: 0, failed: 0, remaining: 0 };

  // Recalculer le compteur pour le nouveau jour
  await _initDailyCounter();
  const dailyCapacity  = DAILY_LIMIT - _dailyCounter.count;
  const hourlyCapacity = HOURLY_LIMIT - _getHourlyCount();

  // Respecter le plafond le plus restrictif des deux
  const capacity = Math.min(dailyCapacity, hourlyCapacity);

  if (dailyCapacity <= 0) {
    console.log(`[EMAIL QUEUE] ⛔ Limite journalière atteinte (${_dailyCounter.count}/${DAILY_LIMIT}) — reprise demain`);
    return { sent: 0, failed: 0, remaining: pending.length };
  }
  if (hourlyCapacity <= 0) {
    console.log(`[EMAIL QUEUE] ⏳ Limite horaire atteinte (${_getHourlyCount()}/${HOURLY_LIMIT}) — reprise dans quelques minutes`);
    return { sent: 0, failed: 0, remaining: pending.length };
  }

  const toProcess = pending.slice(0, capacity);
  let sent = 0, failed = 0;

  // Envoi par lots avec pause aléatoire (jitter) entre chaque lot
  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i];

    // Vérifier la limite horaire AVANT chaque email (elle peut changer en cours de lot)
    if (_getHourlyCount() >= HOURLY_LIMIT) {
      console.log(`[EMAIL QUEUE] ⏳ Limite horaire atteinte en cours de lot — pause jusqu'au prochain tick`);
      break;
    }

    try {
      await _sendNow({
        to:      entry.to_email,
        subject: entry.subject,
        html:    entry.html,
        text:    entry.text_content,
      });

      _dailyCounter.count++;
      _recordHourlySend();
      entry.status       = 'SENT';
      entry.processed_at = new Date();
      entry.html         = null; // libérer l'espace
      entry.attempts     = (entry.attempts || 0) + 1;
      await entry.save();
      sent++;
    } catch (err) {
      entry.attempts      = (entry.attempts || 0) + 1;
      entry.error_message = String(err.message).substring(0, 500);
      if (entry.attempts >= 3) entry.status = 'FAILED';
      await entry.save();
      failed++;
    }

    // Pause aléatoire (jitter) après chaque lot de QUEUE_BATCH_SIZE
    const isEndOfBatch = (i + 1) % QUEUE_BATCH_SIZE === 0;
    const isLastEmail  = i === toProcess.length - 1;
    if (isEndOfBatch && !isLastEmail) {
      const delay = Math.floor(Math.random() * (QUEUE_BATCH_DELAY_MAX - QUEUE_BATCH_DELAY_MIN + 1)) + QUEUE_BATCH_DELAY_MIN;
      console.log(`[EMAIL QUEUE] Lot de ${QUEUE_BATCH_SIZE} envoyé — pause ${(delay / 1000).toFixed(1)}s...`);
      await _sleep(delay);
    }
  }

  // Nettoyage des entrées anciennes (> 30 jours) — non-bloquant
  EmailQueue.destroy({
    where: {
      status:    { [Op.in]: ['SENT', 'FAILED'] },
      createdAt: { [Op.lt]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  }).catch(() => {});

  const remaining = pending.length - toProcess.length;
  console.log(`[EMAIL QUEUE] ${sent} envoyé(s), ${failed} échec(s), ${remaining} encore en attente`);
  return { sent, failed, remaining };
};

// =====================================================
// TEMPLATES D'EMAILS SPÉCIFIQUES
// =====================================================

/**
 * Email de confirmation d'inscription
 */
const sendWelcomeEmail = async (candidat) => {
  const content = `
    <p class="greeting">Bienvenue, ${candidat.prenom} ${candidat.nom} !</p>
    <p class="message">
      Votre compte sur la plateforme <strong>PORTAIL SONABHY</strong> a été créé avec succès. Vous pouvez dès maintenant accéder à tous nos services en ligne.
    </p>
    <div class="info-box">
      <p class="info-box-title">Ce que vous pouvez faire</p>
      <div class="info-row"><strong>🎯 Recrutements</strong><span>Postuler aux campagnes ouvertes</span></div>
      <div class="info-row"><strong>📚 Stages</strong><span>Soumettre et suivre vos demandes</span></div>
      <div class="info-row"><strong>💼 Offres</strong><span>Consulter les offres commerciales</span></div>
      <div class="info-row"><strong>📋 Aides</strong><span>Demander une aide sociale</span></div>
    </div>
    <div class="btn-wrap">
      <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/auth/login" class="button">
        Accéder à mon espace →
      </a>
    </div>
  `;

  return sendEmail({
    to: candidat.email,
    subject: 'Bienvenue sur PORTAIL SONABHY',
    html: getBaseTemplate(content, 'Bienvenue sur PORTAIL SONABHY')
  });
};

/**
 * Email de notification de demande de stage acceptée
 */
const sendStageAccepteEmail = async (candidat, stage) => {
  const content = `
    <p class="greeting">Bonjour ${candidat.prenom} ${candidat.nom},</p>
    <p class="message">Nous avons le plaisir de vous informer que votre demande de stage a été <strong>acceptée</strong>.</p>
    <div class="badge-wrap"><span class="status-badge status-success">✓ Demande acceptée</span></div>
    <div class="info-box">
      <p class="info-box-title">Détails de votre stage</p>
      <div class="info-row"><strong>Type</strong><span>${stage.typeStage === 'SOUTENANCE' ? 'Stage de soutenance' : 'Stage de perfectionnement'}</span></div>
      <div class="info-row"><strong>Domaine</strong><span>${stage.domaineStage}</span></div>
      <div class="info-row"><strong>Durée</strong><span>${stage.dureeStage} mois</span></div>
      <div class="info-row"><strong>Date de début</strong><span>${new Date(stage.dateDebutEffective).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
    </div>
    <p class="message">Connectez-vous à votre espace pour télécharger votre convention de stage et consulter les prochaines étapes.</p>
    <div class="btn-wrap">
      <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/dashboard/candidat/mes-stages" class="button">
        Voir ma demande →
      </a>
    </div>
  `;

  return sendEmail({
    to: candidat.email,
    subject: 'Votre demande de stage a été acceptée',
    html: getBaseTemplate(content, 'Demande de stage acceptée')
  });
};

/**
 * Email de notification de demande de stage refusée
 */
const sendStageRefuseEmail = async (candidat, stage, motifRefus) => {
  const content = `
    <p class="greeting">Bonjour ${candidat.prenom} ${candidat.nom},</p>
    <p class="message">Nous avons le regret de vous informer que votre demande de stage n'a pas pu être acceptée.</p>
    <div class="badge-wrap"><span class="status-badge status-error">✗ Demande non retenue</span></div>
    <div class="info-box">
      <p class="info-box-title">Détails de la demande</p>
      <div class="info-row"><strong>Type</strong><span>${stage.typeStage === 'SOUTENANCE' ? 'Stage de soutenance' : 'Stage de perfectionnement'}</span></div>
      <div class="info-row"><strong>Domaine</strong><span>${stage.domaineStage}</span></div>
      ${motifRefus ? `<div class="info-row"><strong>Motif</strong><span>${motifRefus}</span></div>` : ''}
    </div>
    <p class="message">Nous vous remercions pour l'intérêt que vous portez à la SONABHY et vous encourageons à consulter nos prochaines opportunités.</p>
    <div class="btn-wrap">
      <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/dashboard/candidat" class="button">
        Retour à mon espace →
      </a>
    </div>
  `;

  return sendEmail({
    to: candidat.email,
    subject: 'Réponse à votre demande de stage',
    html: getBaseTemplate(content, 'Réponse demande de stage')
  });
};

/**
 * Email de notification d'attestation de stage disponible
 */
const sendAttestationDisponibleEmail = async (candidat, stage) => {
  const content = `
    <p class="greeting">Bonjour ${candidat.prenom} ${candidat.nom},</p>
    <p class="message">Votre <strong>attestation de stage</strong> est désormais disponible au téléchargement depuis votre espace personnel.</p>
    <div class="badge-wrap"><span class="status-badge status-success">📜 Attestation disponible</span></div>
    <div class="info-box">
      <p class="info-box-title">Récapitulatif du stage</p>
      <div class="info-row"><strong>Type</strong><span>${stage.typeStage === 'SOUTENANCE' ? 'Stage de soutenance' : 'Stage de perfectionnement'}</span></div>
      <div class="info-row"><strong>Domaine</strong><span>${stage.domaineStage}</span></div>
      <div class="info-row"><strong>Période</strong><span>${new Date(stage.dateDebutEffective).toLocaleDateString('fr-FR')} – ${new Date(stage.dateFinEffective).toLocaleDateString('fr-FR')}</span></div>
    </div>
    <div class="btn-wrap">
      <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/dashboard/candidat/documents" class="button">
        Télécharger mon attestation →
      </a>
    </div>
    <p class="message" style="margin-top:20px;">Nous vous remercions pour votre stage au sein de la SONABHY et vous souhaitons une excellente continuation dans votre parcours professionnel.</p>
  `;

  return sendEmail({
    to: candidat.email,
    subject: 'Votre attestation de stage est disponible',
    html: getBaseTemplate(content, 'Attestation de stage disponible')
  });
};

/**
 * Email de confirmation de soumission de demande de stage
 */
const sendDemandeStageRecueEmail = async (candidat, stage) => {
  const content = `
    <p class="greeting">Bonjour ${candidat.prenom} ${candidat.nom},</p>
    <p class="message">Nous accusons bonne réception de votre demande de stage. Notre équipe l'examinera dans les meilleurs délais.</p>
    <div class="badge-wrap"><span class="status-badge status-warning">⏳ En attente de traitement</span></div>
    <div class="info-box">
      <p class="info-box-title">Récapitulatif de votre demande</p>
      <div class="info-row"><strong>Type</strong><span>${stage.typeStage === 'SOUTENANCE' ? 'Stage de soutenance' : 'Stage de perfectionnement'}</span></div>
      <div class="info-row"><strong>Domaine souhaité</strong><span>${stage.domaineStage}</span></div>
      <div class="info-row"><strong>Durée</strong><span>${stage.dureeStage} mois</span></div>
      <div class="info-row"><strong>Début souhaité</strong><span>${new Date(stage.dateDebutSouhaitee).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
    </div>
    <p class="message">Vous recevrez une notification par email dès qu'une décision sera prise concernant votre demande.</p>
    <div class="btn-wrap">
      <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/dashboard/candidat/mes-stages" class="button">
        Suivre ma demande →
      </a>
    </div>
  `;

  return sendEmail({
    to: candidat.email,
    subject: 'Votre demande de stage a bien été reçue',
    html: getBaseTemplate(content, 'Demande de stage reçue')
  });
};

/**
 * Email de notification de rapport de stage validé
 */
const sendRapportValideEmail = async (candidat, rapport) => {
  const content = `
    <p class="greeting">Bonjour ${candidat.prenom} ${candidat.nom},</p>
    <p class="message">Votre rapport de stage a été <strong>validé</strong> par notre équipe.</p>
    <div class="badge-wrap"><span class="status-badge status-success">✓ Rapport validé</span></div>
    <div class="info-box">
      <p class="info-box-title">Détails du rapport</p>
      <div class="info-row"><strong>Titre</strong><span>${rapport.titreRapport}</span></div>
      <div class="info-row"><strong>Nature</strong><span>${rapport.natureRapport}</span></div>
    </div>
    <p class="message">Votre attestation de stage sera bientôt disponible. Vous recevrez un email dès qu'elle sera prête au téléchargement.</p>
    <div class="btn-wrap">
      <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/dashboard/candidat/documents" class="button">
        Accéder à mes documents →
      </a>
    </div>
  `;

  return sendEmail({
    to: candidat.email,
    subject: 'Votre rapport de stage a été validé',
    html: getBaseTemplate(content, 'Rapport de stage validé')
  });
};

/**
 * Email de réinitialisation de mot de passe
 */
const sendPasswordResetEmail = async ({ prenom, email, resetLink }) => {
  const content = `
    <p class="greeting">Bonjour ${prenom},</p>
    <p class="message">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour en définir un nouveau. Ce lien est valable <strong>1 heure</strong>.</p>
    <div class="btn-wrap">
      <a href="${resetLink}" class="button">
        Réinitialiser mon mot de passe →
      </a>
    </div>
    <div class="security-note">
      🔒 Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe restera inchangé.
    </div>
  `;

  return sendEmail({
    to: email,
    subject: 'Réinitialisation de votre mot de passe',
    html: getBaseTemplate(content, 'Réinitialisation de mot de passe'),
    priority: true, // toujours envoyé immédiatement, jamais mis en file
  });
};

/**
 * Email de diffusion groupée (annonce mise à jour, actualité, etc.)
 */
const sendBroadcastEmail = async ({ to, prenom, sujet, message }) => {
  const content = `
    <p class="greeting">Bonjour ${prenom || 'cher utilisateur'},</p>
    <p class="message">${message.replace(/\n/g, '<br>')}</p>
    <hr class="divider">
    <div class="btn-wrap">
      <a href="${process.env.FRONTEND_URL || 'https://portail.sonabhy.bf'}/auth/login" class="button">
        Accéder à la plateforme →
      </a>
    </div>
    <div class="security-note">
      Vous recevez cet email car vous êtes inscrit sur le Portail SONABHY.
    </div>
  `;
  return sendEmail({
    to,
    subject: sujet,
    html: getBaseTemplate(content, sujet),
  });
};

module.exports = {
  sendEmail,
  processEmailQueue,
  buildBaseTemplate: getBaseTemplate,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendStageAccepteEmail,
  sendStageRefuseEmail,
  sendAttestationDisponibleEmail,
  sendDemandeStageRecueEmail,
  sendRapportValideEmail,
  sendBroadcastEmail,
};

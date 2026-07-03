// server.js

// ── Forcer IPv4 pour toutes les connexions sortantes (SMTP, etc.) ──────────────
// Corrige "connect ENETUNREACH <adresse IPv6>:587" sur les hôtes sans route IPv6 :
// le résolveur DNS renverra désormais les adresses IPv4 (A) en premier.
try { require('dns').setDefaultResultOrder('ipv4first'); } catch (_) {}

const app = require('./src/app');
const env = require('./src/config/env');
const { testConnection } = require('./src/config/database');
const db = require('./src/models');
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { startAllJobs } = require('./src/jobs');
const emailService = require('./src/services/email.service');
const logger = require('./src/config/logger');

// Filet de sécurité : avant ces ajouts, une exception non interceptée ou une
// promesse rejetée sans .catch() ne laissait aucune trace exploitable (juste
// la sortie console par défaut de Node, perdue au redémarrage du process).
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException — arrêt du process', { stack: err.stack, message: err.message });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', {
    stack: reason instanceof Error ? reason.stack : undefined,
    message: reason instanceof Error ? reason.message : String(reason),
  });
});

const PORT = env.PORT;

// Fonction pour obtenir l'adresse IP locale
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Ignorer les adresses IPv6 et les adresses de loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

const startServer = async () => {
  try {
    // Tester la connexion à la base de données
    await testConnection();

    // ← AJOUTER CES LIGNES
    // Synchroniser les modèles (optionnel en dev)
    // await db.sequelize.sync({ alter: true }); // Mettre à jour la structure
    console.log('✅ Tous les modèles sont chargés et synchronisés !');

    // Demarrer les taches planifiees (cron jobs)
    startAllJobs();

    // Initialiser le service email au démarrage
    console.log('📧 Initialisation du service email...');
    console.log('📧 Variables SMTP:', {
      SMTP_HOST: process.env.SMTP_HOST || 'NON DÉFINI',
      SMTP_PORT: process.env.SMTP_PORT || 'NON DÉFINI',
      SMTP_USER: process.env.SMTP_USER || 'NON DÉFINI',
      SMTP_PASS: process.env.SMTP_PASS ? '***DÉFINI***' : 'NON DÉFINI',
    });

    // ─── HTTPS en production, HTTP en développement ───────────────────────────
    const sslKeyPath  = process.env.SSL_KEY_PATH;
    const sslCertPath = process.env.SSL_CERT_PATH;
    const useHttps = env.NODE_ENV === 'production' && sslKeyPath && sslCertPath
      && fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath);

    const serverCallback = () => {
      const protocol = useHttps ? 'https' : 'http';
      console.log('=================================');
      console.log(`🚀 Serveur ${env.APP_NAME} démarré`);
      console.log(`📍 URL locale: ${protocol}://localhost:${PORT}`);
      console.log(`📍 URL réseau: ${protocol}://${getLocalIP()}:${PORT}`);
      console.log(`🌍 Environnement: ${env.NODE_ENV}`);
      console.log(`🔌 Port: ${PORT}`);
      console.log(`🔒 HTTPS: ${useHttps ? 'actif' : 'inactif (HTTP — ajouter SSL_KEY_PATH et SSL_CERT_PATH en production)'}`);
      console.log(`⏰ Jobs planifiés: actifs`);
      console.log(`📧 Email SMTP: ${process.env.SMTP_HOST ? 'configuré' : 'mode console'}`);
      console.log('=================================');
    };

    if (useHttps) {
      const sslOptions = {
        key:  fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath),
      };
      https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', serverCallback);
    } else {
      http.createServer(app).listen(PORT, '0.0.0.0', serverCallback);
    }
  } catch (error) {
    console.error('❌ Erreur au démarrage:', error.message);
    logger.error('Erreur au démarrage du serveur', { stack: error.stack, message: error.message });
    process.exit(1);
  }
};

startServer();